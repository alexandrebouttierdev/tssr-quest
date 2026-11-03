import { loadText, memoryStats, uptimeParts, uptimeText } from '@sims/shared/system';
import { parisParts } from '@sims/shared/time-format';
import type { Machine, Process } from '@sims/shared/types';
import type { BashCommand } from '../command';

// --- free ------------------------------------------------------------------------------

/**
 * Taille lisible à la manière de `free -h` (procps-ng) : unités binaires Ki, Mi, Gi,
 * une décimale sous 10, virgule décimale française.
 *
 * @param kib - Taille en Kio.
 * @returns Par exemple `1,9Gi`, `412Mi`, `0B`.
 */
export function freeHuman(kib: number): string {
  if (kib <= 0) return '0B';
  const units = ['Ki', 'Mi', 'Gi', 'Ti'];
  let value = kib;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  const text = value < 10 ? value.toFixed(1).replace('.', ',') : String(Math.round(value));
  return `${text}${units[index] ?? ''}`;
}

/** Commande `free` : utilisation de la mémoire vive et de l'échange. */
export const free: BashCommand = {
  name: 'free',
  summary: 'affiche la mémoire vive et la mémoire d’échange utilisées',
  package: 'procps',
  manual: `NOM
       free - afficher la quantité de mémoire libre et utilisée

SYNOPSIS
       free [-h | -m | -g]

DESCRIPTION
       « disponible » est la colonne à lire : la mémoire qu'un programme peut
       obtenir sans faire appel à l'échange (le cache disque se libère au besoin).
       Une mémoire d'échange (swap) qui se remplit signale un manque de mémoire.

       -h   tailles lisibles (Ki, Mi, Gi)     -m   en Mio     -g   en Gio`,
  run(args, env) {
    let format: (kib: number) => string = (kib) => String(Math.round(kib));
    for (const arg of args) {
      if (arg === '-h' || arg === '--human') format = freeHuman;
      else if (arg === '-m' || arg === '--mebi') format = (kib) => String(Math.round(kib / 1024));
      else if (arg === '-g' || arg === '--gibi')
        format = (kib) => String(Math.round(kib / 1048576));
      else if (arg === '-k' || arg === '--kibi') continue;
      else return { stderr: `free: option invalide -- '${arg.replace(/^-+/, '')}'\n`, exitCode: 1 };
    }
    const m = memoryStats(env.machine);
    const col = (v: number) => ` ${format(v).padStart(11)}`;
    const header = `${' '.repeat(8)}${[
      'total',
      'utilisé',
      'libre',
      'partagé',
      'tamp/cache',
      'disponible',
    ]
      .map((h) => ` ${h.padStart(11)}`)
      .join('')}`;
    return {
      stdout:
        `${header}\n` +
        `${'Mem:'.padEnd(8)}${[m.total, m.used, m.free, m.shared, m.buffCache, m.available].map(col).join('')}\n` +
        `${'Échange:'.padEnd(8)}${[m.swapTotal, m.swapUsed, m.swapTotal - m.swapUsed].map(col).join('')}\n`,
      exitCode: 0,
    };
  },
};

// --- uptime ----------------------------------------------------------------------------

/** Commande `uptime` : heure, durée de fonctionnement, sessions, charge. */
export const uptime: BashCommand = {
  name: 'uptime',
  summary: 'depuis combien de temps la machine tourne, et sa charge',
  package: 'procps',
  manual: `NOM
       uptime - durée de fonctionnement et charge du système

SYNOPSIS
       uptime [-p | -s]

DESCRIPTION
       Affiche l'heure, la durée depuis le démarrage, le nombre de sessions et la
       charge moyenne sur 1, 5 et 15 minutes (load average). Une charge durablement
       supérieure au nombre de processeurs signale une machine surchargée.

       -p   durée seule, en clair       -s   date et heure du démarrage`,
  run(args, env) {
    const now = env.ctx.now.getTime();
    const machine = env.machine;
    const parts = uptimeParts(machine, now);
    if (args.includes('-s')) {
      const b = parisParts(machine.bootTime);
      const p = (n: number) => String(n).padStart(2, '0');
      return {
        stdout: `${b.year}-${p(b.month)}-${p(b.day)} ${p(b.hour)}:${p(b.minute)}:${p(b.second)}\n`,
        exitCode: 0,
      };
    }
    if (args.includes('-p')) {
      const chunks = [
        parts.days > 0 ? `${parts.days} day${parts.days > 1 ? 's' : ''}` : '',
        parts.hours > 0 ? `${parts.hours} hour${parts.hours > 1 ? 's' : ''}` : '',
        `${parts.minutes} minute${parts.minutes > 1 ? 's' : ''}`,
      ].filter(Boolean);
      return { stdout: `up ${chunks.join(', ')}\n`, exitCode: 0 };
    }
    const unknown = args.find((a) => a.startsWith('-'));
    if (unknown)
      return { stderr: `uptime: option invalide -- '${unknown.slice(1)}'\n`, exitCode: 1 };
    const p = parisParts(now);
    const time = [p.hour, p.minute, p.second].map((n) => String(n).padStart(2, '0')).join(':');
    return {
      stdout: ` ${time} ${uptimeText(parts)},  1 user,  load average: ${loadText(machine)}\n`,
      exitCode: 0,
    };
  },
};

// --- nice et renice ------------------------------------------------------------------

/** Remplace un processus. */
function withProcess(machine: Machine, pid: number, change: Partial<Process>): Machine {
  return {
    ...machine,
    processes: machine.processes.map((p) => (p.pid === pid ? { ...p, ...change } : p)),
  };
}

/** Indicateur d'état selon la gentillesse (N : basse priorité, < : haute priorité). */
function statWithNice(stat: string, nice: number): string {
  const base = stat.replace(/[N<]/g, '');
  return nice > 0
    ? `${base.slice(0, 1)}N${base.slice(1)}`
    : nice < 0
      ? `${base.slice(0, 1)}<${base.slice(1)}`
      : base;
}

/** Commande `nice` : lance une commande avec une priorité modifiée. */
export const nice: BashCommand = {
  name: 'nice',
  summary: 'lance une commande avec une priorité plus basse (ou plus haute en root)',
  package: 'coreutils',
  manual: `NOM
       nice - lancer une commande avec une priorité modifiée

SYNOPSIS
       nice [-n AJUSTEMENT] COMMANDE [ARGUMENT]...

DESCRIPTION
       La gentillesse va de -20 (prioritaire) à 19 (passe après les autres) ;
       10 par défaut. Seul root peut donner une valeur négative. Sans commande,
       affiche la gentillesse courante. Pour un processus déjà lancé : renice.

EXEMPLES
       nice -n 15 tar czf sauvegarde.tar.gz /srv/partage &`,
  run(args, env) {
    let adjustment = 10;
    let rest = [...args];
    if (rest[0] === '-n') {
      adjustment = Number(rest[1]);
      rest = rest.slice(2);
    } else if (/^-n-?\d+$/.test(rest[0] ?? '')) {
      adjustment = Number((rest[0] ?? '').slice(2));
      rest = rest.slice(1);
    } else if (/^-\d+$/.test(rest[0] ?? '')) {
      adjustment = Number((rest[0] ?? '').slice(1));
      rest = rest.slice(1);
    }
    if (!Number.isInteger(adjustment))
      return {
        stderr: `nice: ajustement de priorité invalide: « ${args[1] ?? ''} »\n`,
        exitCode: 125,
      };
    if (rest.length === 0) return { stdout: '0\n', exitCode: 0 };
    // Sans les droits root, une priorité plus haute est refusée mais la commande tourne.
    const warning =
      adjustment < 0 && env.user !== 'root'
        ? 'nice: impossible de définir la priorité: Permission non accordée\n'
        : '';
    const outcome = env.runAs(env.user, rest);
    return { ...outcome, stderr: warning + (outcome.stderr ?? '') };
  },
};

/** Commande `renice` : change la priorité de processus en cours. */
export const renice: BashCommand = {
  name: 'renice',
  summary: "change la priorité d'un processus déjà lancé",
  package: 'util-linux',
  manual: `NOM
       renice - modifier la priorité de processus en cours

SYNOPSIS
       renice [-n] PRIORITÉ [-p] PID...      renice [-n] PRIORITÉ -u UTILISATEUR

DESCRIPTION
       Fixe la gentillesse (de -20 à 19) des processus donnés. Un utilisateur
       peut seulement baisser la priorité de ses propres processus ; remonter
       une priorité demande les droits root.

EXEMPLES
       sudo renice -n 10 -p 4321     faire passer un traitement lourd après les autres`,
  run(args, env) {
    const words = args.filter((a) => a !== '-n');
    const priority = Number(words[0]);
    if (words.length === 0 || !Number.isInteger(priority))
      return {
        stderr: `renice: invalid priority '${words[0] ?? ''}'\nTry 'renice --help' for more information.\n`,
        exitCode: 1,
      };
    const value = Math.max(-20, Math.min(19, priority));
    let machine = env.machine;
    let stdout = '';
    let stderr = '';
    let mode: 'p' | 'u' = 'p';
    for (const word of words.slice(1)) {
      if (word === '-p') {
        mode = 'p';
        continue;
      }
      if (word === '-u') {
        mode = 'u';
        continue;
      }
      const account = mode === 'u' ? machine.users[word] : undefined;
      if (mode === 'u' && !account) {
        stderr += `renice: unknown user ${word}\n`;
        continue;
      }
      const targets =
        mode === 'u'
          ? machine.processes.filter((p) => p.user === word)
          : machine.processes.filter((p) => String(p.pid) === word);
      // renice affiche l'UID numérique, comme le fait util-linux.
      const label = mode === 'u' ? `${account?.uid ?? word} (user ID)` : `${word} (process ID)`;
      if (targets.length === 0) {
        stderr += `renice: failed to get priority for ${label}: Aucun processus de ce type\n`;
        continue;
      }
      for (const target of targets) {
        const old = target.nice ?? 0;
        const own = target.user === env.user;
        if (env.user !== 'root' && (!own || value < old)) {
          stderr += `renice: failed to set priority for ${mode === 'u' ? label : `${target.pid} (process ID)`}: Permission non accordée\n`;
          continue;
        }
        machine = withProcess(machine, target.pid, {
          nice: value,
          stat: statWithNice(target.stat, value),
        });
        if (mode === 'p')
          stdout += `${target.pid} (process ID) old priority ${old}, new priority ${value}\n`;
      }
      if (mode === 'u' && !stderr)
        stdout += `${label} old priority ${targets[0]?.nice ?? 0}, new priority ${value}\n`;
    }
    return { machine, stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};
