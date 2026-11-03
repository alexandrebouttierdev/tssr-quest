import { freeBytes } from './disks';
import { appendLogs } from './journal';
import { SERVICE_CATALOG, type ServiceDefinition } from './service-catalog';
import type { LogLine, Machine, Process, ServiceFailure } from './types';

/** Résultat d'une action sur un service. */
export interface ServiceActionResult {
  readonly machine: Machine;
  /** Vrai si le service est dans l'état demandé à la fin de l'action. */
  readonly ok: boolean;
}

/** Espace libre minimal pour qu'un service puisse démarrer (100 Mio). */
const MIN_FREE_BYTES = 100 * 1024 * 1024;

/**
 * Cherche si une cause de panne s'applique encore à l'état courant.
 *
 * @returns La panne active, ou `null` si plus rien n'empêche le démarrage.
 */
function activeFailure(
  machine: Machine,
  name: string,
  def: ServiceDefinition,
): ServiceFailure | null {
  const failure = machine.services[name]?.failure;
  if (failure?.kind === 'no-space-left' && freeBytes(machine, failure.path) < MIN_FREE_BYTES) {
    return failure;
  }
  for (const port of def.ports) {
    const holder = Object.values(machine.services).find(
      (s) => s.name !== name && s.state === 'active' && s.ports.includes(port),
    );
    if (holder) return { kind: 'port-in-use', port };
  }
  return null;
}

/** Ligne de journal émise par systemd (PID 1). */
function systemdLine(time: number, message: string): LogLine {
  return { time, ident: 'systemd', pid: 1, message };
}

/**
 * Journal produit par un démarrage raté, au format de systemd 252 (Debian 12).
 *
 * @param def - Service concerné.
 * @param failure - Cause de la panne.
 * @param time - Horodatage (ms).
 * @param pid - PID du programme de démarrage.
 * @returns Les lignes, dans l'ordre d'écriture.
 */
export function failureLogLines(
  def: ServiceDefinition,
  failure: ServiceFailure,
  time: number,
  pid: number,
): LogLine[] {
  const unit = `${def.name}.service`;
  const messages =
    failure.kind === 'no-space-left' ? def.noSpaceMessages : def.portInUseMessages(failure.port);
  return [
    systemdLine(time, `Starting ${unit} - ${def.description}...`),
    ...messages.map((message) => ({ time, ident: def.ident, pid, message })),
    ...(def.name === 'apache2'
      ? [
          { time, ident: def.ident, pid: pid - 3, message: "Action 'start' failed." },
          {
            time,
            ident: def.ident,
            pid: pid - 3,
            message: 'The Apache error log may have more information.',
          },
        ]
      : []),
    systemdLine(time, `${unit}: Control process exited, code=exited, status=1/FAILURE`),
    systemdLine(time, `${unit}: Failed with result 'exit-code'.`),
    systemdLine(time, `Failed to start ${unit} - ${def.description}.`),
  ];
}

/**
 * Journal d'un démarrage réussi.
 *
 * @param def - Service concerné.
 * @param time - Horodatage (ms).
 * @returns Les lignes « Starting » puis « Started ».
 */
export function startLogLines(def: ServiceDefinition, time: number): LogLine[] {
  const unit = `${def.name}.service`;
  return [
    systemdLine(time, `Starting ${unit} - ${def.description}...`),
    systemdLine(time, `Started ${unit} - ${def.description}.`),
  ];
}

/**
 * Processus lancés par un service, à partir d'un PID principal.
 *
 * @param def - Service concerné.
 * @param mainPid - PID du processus principal.
 * @param time - Date de lancement (ms).
 * @returns Les processus, le principal en premier.
 */
export function serviceProcesses(def: ServiceDefinition, mainPid: number, time: number): Process[] {
  return def.processes.map((p, index) => ({
    pid: mainPid + index,
    ppid: index === 0 ? 1 : mainPid,
    user: p.user,
    command: p.command,
    cpu: 0,
    rss: p.rss,
    vsz: p.vsz,
    tty: '?',
    stat: index === 0 ? 'Ss' : 'S',
    start: time,
  }));
}

/**
 * Démarre un service. Si une cause de panne s'applique encore (disque plein, port
 * pris), le service passe en échec et le journal explique pourquoi.
 *
 * @param machine - Machine simulée.
 * @param name - Nom du service (sans `.service`).
 * @param now - Horodatage (ms).
 * @returns La nouvelle machine et la réussite du démarrage.
 */
export function startService(machine: Machine, name: string, now: number): ServiceActionResult {
  const service = machine.services[name];
  const def = SERVICE_CATALOG[name];
  if (!service || !def) return { machine, ok: false };
  if (service.state === 'active') return { machine, ok: true };
  const failure = activeFailure(machine, name, def);
  const pid = machine.nextPid;
  if (failure) {
    const failed: Machine = {
      ...machine,
      nextPid: pid + 4,
      services: {
        ...machine.services,
        [name]: { ...service, state: 'failed', failure, mainPid: null, since: now },
      },
    };
    return {
      machine: appendLogs(failed, name, failureLogLines(def, failure, now, pid + 3)),
      ok: false,
    };
  }
  const mainPid = pid + 3;
  const started: Machine = {
    ...machine,
    nextPid: mainPid + def.processes.length,
    processes: [...machine.processes, ...serviceProcesses(def, mainPid, now)],
    services: {
      ...machine.services,
      [name]: { ...service, state: 'active', failure: null, mainPid, since: now },
    },
  };
  return { machine: appendLogs(started, name, startLogLines(def, now)), ok: true };
}

/**
 * Arrête un service et ses processus.
 *
 * @param machine - Machine simulée.
 * @param name - Nom du service.
 * @param now - Horodatage (ms).
 * @returns La nouvelle machine.
 */
export function stopService(machine: Machine, name: string, now: number): ServiceActionResult {
  const service = machine.services[name];
  const def = SERVICE_CATALOG[name];
  if (!service || !def) return { machine, ok: false };
  if (service.state !== 'active') {
    return {
      machine: {
        ...machine,
        services: { ...machine.services, [name]: { ...service, state: 'inactive', since: now } },
      },
      ok: true,
    };
  }
  const pids = new Set(def.processes.map((_, i) => (service.mainPid ?? -1) + i));
  const unit = `${name}.service`;
  const stopped: Machine = {
    ...machine,
    processes: machine.processes.filter((p) => !pids.has(p.pid)),
    services: {
      ...machine.services,
      [name]: { ...service, state: 'inactive', mainPid: null, since: now },
    },
  };
  return {
    machine: appendLogs(stopped, name, [
      systemdLine(now, `Stopping ${unit} - ${def.description}...`),
      systemdLine(now, `${unit}: Deactivated successfully.`),
      systemdLine(now, `Stopped ${unit} - ${def.description}.`),
    ]),
    ok: true,
  };
}

/**
 * Redémarre un service (arrêt puis démarrage).
 *
 * @param machine - Machine simulée.
 * @param name - Nom du service.
 * @param now - Horodatage (ms).
 * @returns La nouvelle machine et la réussite du démarrage.
 */
export function restartService(machine: Machine, name: string, now: number): ServiceActionResult {
  const stopped = stopService(machine, name, now);
  if (!stopped.ok) return stopped;
  return startService(stopped.machine, name, now);
}
