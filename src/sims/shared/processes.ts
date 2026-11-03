import { appendLogs } from './journal';
import type { Machine, Process } from './types';

/** Mémoire vive totale simulée (Kio) : 2 Go. */
export const TOTAL_MEMORY_KIB = 2_008_256;

/** Signaux reconnus : numéro et nom. */
export const SIGNALS: Readonly<Record<string, number>> = {
  HUP: 1,
  INT: 2,
  QUIT: 3,
  ILL: 4,
  TRAP: 5,
  ABRT: 6,
  BUS: 7,
  FPE: 8,
  KILL: 9,
  USR1: 10,
  SEGV: 11,
  USR2: 12,
  PIPE: 13,
  ALRM: 14,
  TERM: 15,
  STKFLT: 16,
  CHLD: 17,
  CONT: 18,
  STOP: 19,
  TSTP: 20,
  TTIN: 21,
  TTOU: 22,
  URG: 23,
  XCPU: 24,
  XFSZ: 25,
  VTALRM: 26,
  PROF: 27,
  WINCH: 28,
  IO: 29,
  PWR: 30,
  SYS: 31,
};

/**
 * Lit un signal (`9`, `KILL`, `SIGKILL`).
 *
 * @param text - Signal tel que tapé, sans tiret.
 * @returns Le numéro, ou `null` s'il est inconnu.
 */
export function parseSignal(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text) >= 0 && Number(text) <= 31 ? Number(text) : null;
  const name = text.toUpperCase().replace(/^SIG/, '');
  return SIGNALS[name] ?? null;
}

/** Résultat de l'envoi d'un signal. */
export type SignalResult = { ok: true; machine: Machine } | { ok: false; error: 'ESRCH' | 'EPERM' };

/**
 * Envoie un signal à un processus : TERM, INT, HUP et KILL l'arrêtent (sauf le PID 1),
 * STOP le suspend, CONT le relance. Tuer le processus principal d'un service arrête
 * le service, comme systemd le constate.
 *
 * @param machine - Machine simulée.
 * @param pid - Processus visé.
 * @param signal - Numéro du signal.
 * @param user - Compte qui envoie le signal.
 * @param now - Horodatage (ms).
 * @returns La nouvelle machine, ou ESRCH (inexistant), EPERM (pas le propriétaire).
 */
export function signalProcess(
  machine: Machine,
  pid: number,
  signal: number,
  user: string,
  now: number,
): SignalResult {
  const process = machine.processes.find((p) => p.pid === pid);
  if (!process) return { ok: false, error: 'ESRCH' };
  if (user !== 'root' && process.user !== user) return { ok: false, error: 'EPERM' };
  if (signal === 0 || pid === 1) return { ok: true, machine };
  if (signal === SIGNALS['STOP'] || signal === SIGNALS['TSTP'])
    return { ok: true, machine: setStat(machine, pid, 'T') };
  if (signal === SIGNALS['CONT']) return { ok: true, machine: setStat(machine, pid, 'S') };
  if (
    ![SIGNALS['TERM'], SIGNALS['KILL'], SIGNALS['INT'], SIGNALS['HUP'], SIGNALS['QUIT']].includes(
      signal,
    )
  )
    return { ok: true, machine };
  const service = Object.values(machine.services).find(
    (s) =>
      s.mainPid !== null &&
      (s.mainPid === pid || machine.processes.some((p) => p.pid === pid && p.ppid === s.mainPid)),
  );
  if (service && service.mainPid === pid && signal !== SIGNALS['HUP']) {
    const pids = new Set(
      machine.processes.filter((p) => p.pid === pid || p.ppid === pid).map((p) => p.pid),
    );
    const killed = signal === SIGNALS['KILL'];
    const unit = `${service.name}.service`;
    const stopped: Machine = {
      ...machine,
      processes: machine.processes.filter((p) => !pids.has(p.pid)),
      services: {
        ...machine.services,
        [service.name]: {
          ...service,
          state: killed ? 'failed' : 'inactive',
          mainPid: null,
          since: now,
        },
      },
    };
    return {
      ok: true,
      machine: appendLogs(stopped, service.name, [
        {
          time: now,
          ident: 'systemd',
          pid: 1,
          message: `${unit}: Main process exited, code=killed, status=${signal}/${Object.keys(SIGNALS).find((k) => SIGNALS[k] === signal) ?? signal}`,
        },
        ...(killed
          ? [
              {
                time: now,
                ident: 'systemd',
                pid: 1,
                message: `${unit}: Failed with result 'signal'.`,
              },
            ]
          : [
              {
                time: now,
                ident: 'systemd',
                pid: 1,
                message: `${unit}: Deactivated successfully.`,
              },
            ]),
      ]),
    };
  }
  if (signal === SIGNALS['HUP'] && service) return { ok: true, machine };
  const sessionJobs = machine.session.jobs?.filter((j) => j.pid !== pid);
  return {
    ok: true,
    machine: {
      ...machine,
      processes: machine.processes.filter((p) => p.pid !== pid),
      session: sessionJobs ? { ...machine.session, jobs: sessionJobs } : machine.session,
    },
  };
}

/** Change l'état (colonne STAT) d'un processus. */
function setStat(machine: Machine, pid: number, stat: string): Machine {
  return {
    ...machine,
    processes: machine.processes.map((p): Process => (p.pid === pid ? { ...p, stat } : p)),
  };
}

/**
 * Nom court d'un processus (colonne CMD de `ps`) : nom du programme sans chemin.
 *
 * @param process - Processus.
 * @returns Par exemple `apache2`, `bash`, `sshd`.
 */
export function shortName(process: Process): string {
  const first = process.command.replace(/^-/, '').split(' ')[0] ?? '';
  if (first.endsWith(':')) return first.slice(0, -1);
  return first.slice(first.lastIndexOf('/') + 1) || process.command;
}

/**
 * Temps CPU cumulé (secondes) d'un processus, d'après son pourcentage et sa durée de vie.
 *
 * @param process - Processus.
 * @param now - Date courante (ms).
 * @returns Les secondes de CPU consommées.
 */
export function cpuSeconds(process: Process, now: number): number {
  return Math.floor(((now - process.start) / 1000) * (process.cpu / 100));
}
