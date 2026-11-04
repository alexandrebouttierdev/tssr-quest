import { writeFile } from '@sims/shared/fs';
import { loadText, memoryStats, uptimeParts, uptimeText } from '@sims/shared/system';
import {
  cpuSeconds,
  parseSignal,
  shortName,
  signalProcess,
  SIGNALS,
  TOTAL_MEMORY_KIB,
} from '@sims/shared/processes';
import { frenchMonth, parisParts } from '@sims/shared/time-format';
import type { Job, Machine, Process } from '@sims/shared/types';
import { strerror } from '@sims/shared/errors';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { alignTable } from '../format';

/** Durée au format `mm:ss` ou `hh:mm:ss` des colonnes TIME de ps. */
function clock(seconds: number, withHours: boolean): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return withHours ? `${p(h)}:${p(m)}:${p(s)}` : `${h * 60 + m}:${p(s)}`;
}

/** Colonne START de ps : l'heure si c'est aujourd'hui, sinon mois et jour. */
function startColumn(start: number, now: number): string {
  const a = parisParts(start);
  const b = parisParts(now);
  if (a.year === b.year && a.month === b.month && a.day === b.day)
    return `${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}`;
  return `${frenchMonth(a.month)}${String(a.day).padStart(2, '0')}`;
}

/** Processus visibles de la session (comme `ps` sans option : même terminal). */
function sessionProcesses(machine: Machine, user: string, now: number, line: string): Process[] {
  const own = machine.processes.filter((p) => p.tty === 'pts/0' && p.user === user);
  return [...own, ...pipelineProcesses(machine, user, now, line)];
}

/**
 * Processus de la ligne en cours : `ps` lui-même et les autres commandes du tube, qui
 * tournent en même temps. C'est pourquoi `ps aux | grep boucle` affiche aussi la ligne
 * du `grep`, comme sur un vrai système.
 *
 * @param machine - Machine simulée.
 * @param user - Compte qui lance la ligne.
 * @param now - Horodatage (ms).
 * @param line - Ligne de commande complète.
 * @returns Un processus par commande du tube.
 */
function pipelineProcesses(machine: Machine, user: string, now: number, line: string): Process[] {
  const segments = splitPipeline(line);
  const commands = segments.length > 0 ? segments : ['ps'];
  return commands.map((command, index) => ({
    pid: machine.nextPid + index,
    ppid: 1187,
    user,
    command,
    cpu: 0,
    rss: command.startsWith('ps') ? 3_840 : 2_304,
    vsz: command.startsWith('ps') ? 11_076 : 6_332,
    tty: 'pts/0',
    stat: command.startsWith('ps') ? 'R+' : 'S+',
    start: now,
  }));
}

/** Découpe une ligne en commandes d'un tube (hors guillemets), sans les guillemets. */
function splitPipeline(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '|') {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts
    .map((p) =>
      p
        .replace(/^\s*sudo\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((p) => p.length > 0 && !p.includes('&&') && !p.includes(';'));
}

/** Commande `ps` : instantané des processus. */
export const ps: BashCommand = {
  name: 'ps',
  summary: 'affiche les processus en cours',
  manual: `NOM
       ps - afficher les processus

SYNOPSIS
       ps [aux] [-ef] [-u UTILISATEUR] [-p PID] [--sort=-%cpu]

DESCRIPTION
       Sans option : les processus du terminal courant.

       aux         tous les processus, avec propriétaire, %CPU, %MEM, état
       -ef         tous les processus, avec le PID du parent (PPID)
       -u NOM      les processus d'un compte
       -p PID      un processus précis
       --sort=-%cpu  trier par consommation CPU décroissante (-%mem : mémoire)

EXEMPLES
       ps aux --sort=-%cpu | head -n 5     les processus les plus gourmands
       ps -ef | grep apache2`,
  run(args, env) {
    const now = env.ctx.now.getTime();
    const machine = env.machine;
    const sort = args.find((a) => a.startsWith('--sort='))?.slice(7);
    const words = args.filter((a) => !a.startsWith('--'));
    const flagText = words.filter((w) => !/^\d+$/.test(w) && !machine.users[w]).join('');
    const userIndex = words.indexOf('-u');
    const pidIndex = words.indexOf('-p');
    const all = /a/.test(flagText) && /x/.test(flagText);
    const full = words.includes('-ef') || (words.includes('-e') && words.includes('-f'));
    let list =
      all || full || words.includes('-e') || words.includes('-A')
        ? [...machine.processes, ...pipelineProcesses(machine, env.user, now, env.line)]
        : sessionProcesses(machine, env.user, now, env.line);
    if (userIndex >= 0) {
      const user = words[userIndex + 1] ?? '';
      if (!machine.users[user])
        return {
          stderr: `error: user name does not exist\n\nUsage:\n ps [options]\n`,
          exitCode: 1,
        };
      list = machine.processes.filter((p) => p.user === user);
    }
    if (pidIndex >= 0)
      list = machine.processes.filter((p) => String(p.pid) === words[pidIndex + 1]);
    if (sort) {
      const key = sort.replace(/^[-+]/, '');
      const value = (p: Process) =>
        key === '%cpu' ? p.cpu : key === '%mem' || key === 'rss' ? p.rss : p.pid;
      list.sort((a, b) => (sort.startsWith('-') ? value(b) - value(a) : value(a) - value(b)));
    }
    if (all) {
      const rows = [
        ['USER', 'PID', '%CPU', '%MEM', 'VSZ', 'RSS', 'TTY', 'STAT', 'START', 'TIME', 'COMMAND'],
        ...list.map((p) => [
          p.user.length > 8 ? `${p.user.slice(0, 7)}+` : p.user,
          String(p.pid),
          p.cpu.toFixed(1),
          ((p.rss / TOTAL_MEMORY_KIB) * 100).toFixed(1),
          String(p.vsz),
          String(p.rss),
          p.tty,
          p.stat,
          startColumn(p.start, now),
          clock(cpuSeconds(p, now), false),
          p.command,
        ]),
      ];
      return {
        stdout: `${alignTable(rows, ['l', 'r', 'r', 'r', 'r', 'r', 'l', 'l', 'l', 'r', 'l']).join('\n')}\n`,
        exitCode: 0,
      };
    }
    if (full) {
      const rows = [
        ['UID', 'PID', 'PPID', 'C', 'STIME', 'TTY', 'TIME', 'CMD'],
        ...list.map((p) => [
          p.user,
          String(p.pid),
          String(p.ppid),
          String(Math.round(p.cpu)),
          startColumn(p.start, now),
          p.tty,
          clock(cpuSeconds(p, now), true),
          p.command,
        ]),
      ];
      return {
        stdout: `${alignTable(rows, ['l', 'r', 'r', 'r', 'l', 'l', 'r', 'l']).join('\n')}\n`,
        exitCode: 0,
      };
    }
    const lines = [
      '    PID TTY          TIME CMD',
      ...list.map(
        (p) =>
          `${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} ${clock(cpuSeconds(p, now), true)} ${shortName(p)}`,
      ),
    ];
    return { stdout: `${lines.join('\n')}\n`, exitCode: list.length ? 0 : 1, ok: true };
  },
};

/** Nombre au format français à une décimale (top, free). */
function fr(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

/** Commande `top` : instantané de l'activité du système. */
export const top: BashCommand = {
  name: 'top',
  summary: "affiche l'activité du système (processeur, mémoire, processus)",
  manual: `NOM
       top - afficher les processus et la charge du système

SYNOPSIS
       top

DESCRIPTION
       Sur un vrai serveur, top se met à jour toutes les 3 secondes (q pour
       quitter, M pour trier par mémoire, P par processeur). Dans le terminal du
       jeu, il affiche un instantané trié par %CPU.

       En tête : charge moyenne (load average) sur 1, 5 et 15 minutes, tâches,
       répartition du processeur (id = inactif, wa = attente disque), mémoire.`,
  run(_args, env) {
    const now = env.ctx.now.getTime();
    const machine = env.machine;
    const p = parisParts(now);
    const mem = memoryStats(machine);
    const used = mem.used / 1024;
    const total = mem.total / 1024;
    const cpuBusy = Math.min(100, machine.processes.reduce((sum, proc) => sum + proc.cpu, 0) + 1.6);
    const header = [
      `top - ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')} ${uptimeText(uptimeParts(machine, now))},  1 user,  load average: ${loadText(machine)}`,
      `Tâches: ${String(machine.processes.length + 1).padStart(3)} total,   1 en cours, ${String(machine.processes.length).padStart(3)} en veille,   0 arrêté,   0 zombie`,
      `%Cpu(s): ${fr(cpuBusy * 0.8).padStart(4)} ut, ${fr(cpuBusy * 0.2).padStart(4)} sy,  0,0 ni, ${fr(100 - cpuBusy).padStart(4)} id,  0,0 wa,  0,0 hi,  0,0 si,  0,0 st`,
      `MiB Mem : ${fr(total).padStart(8)} total, ${fr(mem.free / 1024).padStart(8)} libr, ${fr(used).padStart(8)} util, ${fr(mem.buffCache / 1024).padStart(8)} tamp/cache`,
      `MiB Éch : ${fr(mem.swapTotal / 1024).padStart(8)} total, ${fr((mem.swapTotal - mem.swapUsed) / 1024).padStart(8)} libr, ${fr(mem.swapUsed / 1024).padStart(8)} util. ${fr(mem.available / 1024).padStart(8)} dispo Mem`,
      '',
    ];
    const sorted = [...machine.processes]
      .sort((a, b) => b.cpu - a.cpu || a.pid - b.pid)
      .slice(0, 15);
    const rows = [
      ['PID', 'UTIL.', 'PR', 'NI', 'VIRT', 'RES', 'SHR', 'S', '%CPU', '%MEM', 'TEMPS+', 'COM.'],
      ...sorted.map((proc) => {
        const seconds = cpuSeconds(proc, now);
        return [
          String(proc.pid),
          proc.user.slice(0, 8),
          String(20 + (proc.nice ?? 0)),
          String(proc.nice ?? 0),
          String(proc.vsz),
          String(proc.rss),
          String(Math.round(proc.rss * 0.6)),
          proc.stat.startsWith('R') || proc.cpu > 10 ? 'R' : (proc.stat[0] ?? 'S'),
          fr(proc.cpu),
          fr((proc.rss / TOTAL_MEMORY_KIB) * 100),
          `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.00`,
          shortName(proc),
        ];
      }),
    ];
    return {
      stdout: `${[...header, ...alignTable(rows, ['r', 'l', 'r', 'r', 'r', 'r', 'r', 'l', 'r', 'r', 'r', 'l'])].join('\n')}\n`,
      exitCode: 0,
    };
  },
};

/** Liste `kill -l` des signaux. */
function signalList(): string {
  const entries = Object.entries(SIGNALS).sort((a, b) => a[1] - b[1]);
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += 5) {
    lines.push(
      entries
        .slice(i, i + 5)
        .map(([name, n]) => `${String(n).padStart(2)}) SIG${name}`)
        .join('\t'),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Tâche désignée par `%n` (ou la dernière). */
function findJob(jobs: readonly Job[], spec: string | undefined): Job | undefined {
  if (spec === undefined || spec === '%%' || spec === '%+') return jobs.at(-1);
  return jobs.find((j) => `%${j.id}` === spec);
}

/** Commande interne `kill` : envoie un signal à des processus. */
export const kill: BashCommand = {
  name: 'kill',
  // Primitive de bash, mais /usr/bin/kill existe aussi : « sudo kill » fonctionne.
  summary: "envoie un signal à un processus (pour l'arrêter)",
  manual: `NOM
       kill - envoyer un signal à un processus

SYNOPSIS
       kill [-SIGNAL] PID...      kill %TÂCHE      kill -l

DESCRIPTION
       Par défaut, envoie SIGTERM (15) : le programme est prié de s'arrêter
       proprement. SIGKILL (9) l'arrête de force, sans lui laisser le temps de
       sauvegarder : à n'utiliser qu'en dernier recours.
       On ne peut signaler que ses propres processus (root : tous).

EXEMPLES
       kill 2345
       kill -9 2345
       kill %1                  la tâche de fond n° 1`,
  run(args, env) {
    if (args[0] === '-l' || args[0] === '-L') return { stdout: signalList(), exitCode: 0 };
    let signal = SIGNALS['TERM'] ?? 15;
    let targets = args;
    const first = args[0];
    if (first !== undefined && first.startsWith('-') && first !== '-') {
      const parsed = first === '-s' ? parseSignal(args[1] ?? '') : parseSignal(first.slice(1));
      if (parsed === null)
        return {
          stderr: `bash: kill: ${first.slice(1)} : spécification de signal non valable\n`,
          exitCode: 1,
        };
      signal = parsed;
      targets = first === '-s' ? args.slice(2) : args.slice(1);
    }
    if (targets.length === 0) {
      return {
        stderr:
          'kill : utilisation : kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... ou kill -l [sigspec]\n',
        exitCode: 2,
      };
    }
    let machine = env.machine;
    let stderr = '';
    const now = env.ctx.now.getTime();
    for (const target of targets) {
      let pid: number;
      if (target.startsWith('%')) {
        const job = findJob(machine.session.jobs ?? [], target);
        if (!job) {
          stderr += `bash: kill: ${target} : tâche inexistante\n`;
          continue;
        }
        pid = job.pid;
      } else if (/^\d+$/.test(target)) pid = Number(target);
      else {
        stderr += `bash: kill: ${target} : les arguments doivent être des identifiants de processus ou de tâches\n`;
        continue;
      }
      const result = signalProcess(machine, pid, signal, env.user, now);
      if (!result.ok) {
        stderr += `bash: kill: (${pid}) - ${strerror(result.error === 'EPERM' ? 'EPERM' : 'ESRCH')}\n`;
        continue;
      }
      machine = result.machine;
    }
    return { machine, stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Commande `killall` : signale tous les processus d'un nom. */
export const killall: BashCommand = {
  name: 'killall',
  summary: 'arrête les processus par leur nom',
  manual: `NOM
       killall - arrêter des processus par leur nom

SYNOPSIS
       killall [-SIGNAL] NOM...

EXEMPLES
       sudo killall -9 yes`,
  run(args, env) {
    let signal = SIGNALS['TERM'] ?? 15;
    let names = args;
    const first = args[0];
    if (first?.startsWith('-')) {
      const parsed = parseSignal(first.slice(1));
      if (parsed === null)
        return {
          stderr: `${first.slice(1)}: signal inconnu ; « killall -l » liste les signaux.\n`,
          exitCode: 1,
        };
      signal = parsed;
      names = args.slice(1);
    }
    if (names.length === 0)
      return { stderr: 'Utilisation : killall [OPTION]... [--] NOM...\n', exitCode: 1 };
    let machine = env.machine;
    let stderr = '';
    for (const name of names) {
      const matches = machine.processes.filter((p) => shortName(p) === name);
      if (matches.length === 0) {
        stderr += `${name}: aucun processus trouvé\n`;
        continue;
      }
      for (const process of matches) {
        const result = signalProcess(machine, process.pid, signal, env.user, env.ctx.now.getTime());
        if (result.ok) machine = result.machine;
        else stderr += `${name}(${process.pid}): Opération non permise\n`;
      }
    }
    return { machine, stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Commande interne `jobs` : tâches de fond de la session. */
export const jobs: BashCommand = {
  name: 'jobs',
  builtin: true,
  summary: 'liste les tâches en arrière-plan',
  manual: `NOM
       jobs - lister les tâches de fond

SYNOPSIS
       jobs [-l]

DESCRIPTION
       Une commande suivie de & tourne en arrière-plan : le shell rend la main
       tout de suite. jobs les liste ; fg %N en ramène une au premier plan.`,
  run(args, env) {
    const list = env.machine.session.jobs ?? [];
    const long = args.includes('-l');
    const lines = list.map((job, i) => {
      const marker = i === list.length - 1 ? '+' : i === list.length - 2 ? '-' : ' ';
      return `[${job.id}]${marker}  ${long ? `${job.pid} ` : ''}${"En cours d'exécution".padEnd(24)}${job.command}`;
    });
    return { stdout: lines.length ? `${lines.join('\n')}\n` : '', exitCode: 0 };
  },
};

/** Ramène (fg) ou relance (bg) une tâche. */
function jobControl(name: 'fg' | 'bg', args: readonly string[], env: CommandEnv): CommandOutcome {
  const list = env.machine.session.jobs ?? [];
  const job = findJob(list, args[0]);
  if (!job)
    return { stderr: `bash: ${name}: ${args[0] ?? 'courant'} : tâche inexistante\n`, exitCode: 1 };
  if (name === 'bg')
    return {
      stderr: `bash: bg: la tâche ${job.id} est déjà en arrière-plan\n`,
      exitCode: 0,
      ok: true,
    };
  // Au premier plan, la tâche se termine (ou est interrompue) avant de rendre la main.
  const machine: Machine = {
    ...env.machine,
    processes: env.machine.processes.filter((p) => p.pid !== job.pid),
    session: { ...env.machine.session, jobs: list.filter((j) => j.id !== job.id) },
  };
  return {
    stdout: `${job.command.replace(/ &$/, '')}\n${job.endsAt === null ? '^C\n' : ''}`,
    exitCode: job.endsAt === null ? 130 : 0,
    ok: true,
    machine,
  };
}

/** Commande interne `fg` : ramène une tâche au premier plan. */
export const fg: BashCommand = {
  name: 'fg',
  builtin: true,
  summary: 'ramène une tâche au premier plan',
  manual: `NOM
       fg - ramener une tâche au premier plan

SYNOPSIS
       fg [%TÂCHE]

DESCRIPTION
       Dans le jeu, la tâche se termine aussitôt (une tâche sans fin, comme
       tail -f, est interrompue comme par Ctrl+C).`,
  run: (args, env) => jobControl('fg', args, env),
};

/** Commande interne `bg` : relance une tâche en arrière-plan. */
export const bg: BashCommand = {
  name: 'bg',
  builtin: true,
  summary: 'relance une tâche suspendue en arrière-plan',
  manual: `NOM
       bg - relancer une tâche suspendue en arrière-plan

SYNOPSIS
       bg [%TÂCHE]`,
  run: (args, env) => jobControl('bg', args, env),
};

/** Commande `nohup` : lance une commande insensible à la déconnexion. */
export const nohup: BashCommand = {
  name: 'nohup',
  summary: 'lance une commande qui survit à la déconnexion',
  manual: `NOM
       nohup - lancer une commande insensible à la déconnexion

SYNOPSIS
       nohup COMMANDE [ARGUMENTS] &

DESCRIPTION
       La commande continue même après la fermeture de la session SSH. Sa
       sortie est ajoutée au fichier nohup.out du dossier courant.`,
  run(args, env) {
    if (args.length === 0)
      return {
        stderr: "nohup: opérande manquant\nSaisissez « nohup --help » pour plus d'informations.\n",
        exitCode: 125,
      };
    const result = env.runAs(env.user, args);
    const written = writeFile(
      result.machine ?? env.machine,
      env.resolve('nohup.out'),
      env.user,
      result.stdout ?? '',
      { append: true, now: env.ctx.now.getTime() },
    );
    return {
      ...result,
      stdout: '',
      stderr: `nohup: les entrées sont ignorées et la sortie est ajoutée à 'nohup.out'\n${result.stderr ?? ''}`,
      ...(written.ok ? { machine: written.value } : {}),
    };
  },
};
