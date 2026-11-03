import { strerror } from '@sims/shared/errors';
import { fileSize, statPath } from '@sims/shared/fs';
import { userGroups } from '@sims/shared/permissions';
import { frenchMonth, parisParts } from '@sims/shared/time-format';
import type { BashCommand, CommandEnv } from '../command';
import { modeString } from '../format';
import { USR_BIN, USR_SBIN } from '@sims/shared/debian-files';

/** Jours de la semaine en français (glibc fr_FR). */
const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;
/** Mois complets en français. */
const FR_MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/** Complète à deux chiffres. */
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Formate une date selon un format `date +…` (sous-ensemble courant). */
export function formatDate(ms: number, format: string): string {
  const p = parisParts(ms);
  const offset = p.zone === 'CEST' ? '+0200' : '+0100';
  const start = Date.UTC(p.year, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(p.year, p.month - 1, p.day) - start) / 86_400_000) + 1;
  const map: Record<string, string> = {
    Y: String(p.year),
    m: pad(p.month),
    d: pad(p.day),
    e: String(p.day).padStart(2),
    H: pad(p.hour),
    M: pad(p.minute),
    S: pad(p.second),
    F: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    T: `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`,
    R: `${pad(p.hour)}:${pad(p.minute)}`,
    A: FR_DAYS[p.weekday] ?? '',
    a: `${(FR_DAYS[p.weekday] ?? '').slice(0, 3)}.`,
    B: FR_MONTHS_LONG[p.month - 1] ?? '',
    b: frenchMonth(p.month),
    j: pad(dayOfYear, 3),
    s: String(Math.floor(ms / 1000)),
    Z: p.zone,
    z: offset,
    u: String(p.weekday === 0 ? 7 : p.weekday),
    n: '\n',
    t: '\t',
    '%': '%',
  };
  return format.replace(/%(.)/g, (m, c: string) => map[c] ?? m);
}

/** Commande `date` : date et heure. */
export const date: BashCommand = {
  name: 'date',
  summary: "affiche la date et l'heure",
  manual: `NOM
       date - afficher la date et l'heure

SYNOPSIS
       date [+FORMAT]

DESCRIPTION
       Sans argument, affiche la date complète. Avec +FORMAT :
       %Y année  %m mois  %d jour  %H heure  %M minute  %S seconde
       %F date ISO (2026-11-03)  %T heure (09:26:00)  %A jour de la semaine

EXEMPLES
       date +%F                      pour nommer une sauvegarde : backup-$(date +%F).tar.gz`,
  run(args, env) {
    const format = args.find((a) => a.startsWith('+'));
    const ms = env.ctx.now.getTime();
    if (format) return { stdout: `${formatDate(ms, format.slice(1))}\n`, exitCode: 0 };
    if (args.length > 0 && !args.includes('-R'))
      return { stderr: `date: date incorrecte « ${args[0] ?? ''} »\n`, exitCode: 1 };
    const p = parisParts(ms);
    const offset = p.zone === 'CEST' ? '+0200' : '+0100';
    // Format par défaut de coreutils en fr_FR.
    return {
      stdout: `${formatDate(ms, '%A %-d %B %Y, %T').replace('%-d', String(p.day))} (UTC${offset})\n`,
      exitCode: 0,
    };
  },
};

/** Commande `uname` : informations sur le noyau. */
export const uname: BashCommand = {
  name: 'uname',
  summary: 'affiche les informations du noyau',
  manual: `NOM
       uname - afficher les informations sur le système

SYNOPSIS
       uname [-a] [-s] [-n] [-r] [-m] [-o]

DESCRIPTION
       -a  tout   -s  noyau   -n  nom de la machine   -r  version du noyau
       -m  architecture   -o  système d'exploitation`,
  run(args, env) {
    const all = {
      s: 'Linux',
      n: env.machine.hostname,
      r: '6.1.0-26-amd64',
      v: '#1 SMP PREEMPT_DYNAMIC Debian 6.1.112-1 (2024-09-30)',
      m: 'x86_64',
      o: 'GNU/Linux',
    } as const;
    const letters = args.flatMap((a) => (a.startsWith('-') ? [...a.slice(1)] : []));
    const bad = letters.find((l) => !'asnrvmo'.includes(l));
    if (bad)
      return {
        stderr: `uname: option invalide -- '${bad}'\nSaisissez « uname --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    const keys = letters.includes('a')
      ? (['s', 'n', 'r', 'v', 'm', 'o'] as const)
      : letters.length
        ? (['s', 'n', 'r', 'v', 'm', 'o'] as const).filter((k) => letters.includes(k))
        : (['s'] as const);
    return { stdout: `${keys.map((k) => all[k]).join(' ')}\n`, exitCode: 0 };
  },
};

/** Ligne « uid=… gid=… groupes=… » d'un compte. */
function idLine(env: CommandEnv, user: string): string {
  const account = env.machine.users[user];
  const gid = (name: string) => env.machine.groups[name]?.gid ?? 0;
  const groups = userGroups(env.machine, user).sort((a, b) =>
    a === account?.group ? -1 : b === account?.group ? 1 : gid(a) - gid(b),
  );
  return `uid=${account?.uid ?? 0}(${user}) gid=${gid(account?.group ?? user)}(${account?.group ?? user}) groupes=${groups.map((g) => `${gid(g)}(${g})`).join(',')}`;
}

/** Commande `id` : identité et groupes d'un compte. */
export const id: BashCommand = {
  name: 'id',
  summary: "affiche l'UID, le GID et les groupes d'un compte",
  manual: `NOM
       id - afficher les identifiants d'un utilisateur

SYNOPSIS
       id [-u] [-g] [-G] [-n] [UTILISATEUR]

DESCRIPTION
       Affiche l'UID, le groupe principal et tous les groupes du compte.
       Les droits d'un compte dépendent de ses groupes : c'est la commande à
       lancer pour comprendre un « Permission non accordée ».`,
  run(args, env) {
    const user = args.find((a) => !a.startsWith('-')) ?? env.user;
    const account = env.machine.users[user];
    if (!account) return { stderr: `id: '${user}' : utilisateur inexistant\n`, exitCode: 1 };
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const names = flags.includes('n');
    if (flags.includes('u')) return { stdout: `${names ? user : account.uid}\n`, exitCode: 0 };
    if (flags.includes('G')) {
      const groups = userGroups(env.machine, user);
      return {
        stdout: `${groups.map((g) => (names ? g : String(env.machine.groups[g]?.gid ?? 0))).join(' ')}\n`,
        exitCode: 0,
      };
    }
    if (flags.includes('g'))
      return {
        stdout: `${names ? account.group : (env.machine.groups[account.group]?.gid ?? 0)}\n`,
        exitCode: 0,
      };
    return { stdout: `${idLine(env, user)}\n`, exitCode: 0 };
  },
};

/** Commande `groups` : groupes d'un compte. */
export const groups: BashCommand = {
  name: 'groups',
  summary: "affiche les groupes d'un compte",
  manual: `NOM
       groups - afficher les groupes d'un utilisateur

SYNOPSIS
       groups [UTILISATEUR]...`,
  run(args, env) {
    if (args.length === 0)
      return { stdout: `${userGroups(env.machine, env.user).join(' ')}\n`, exitCode: 0 };
    let stdout = '';
    let stderr = '';
    for (const user of args) {
      if (!env.machine.users[user]) stderr += `groups: '${user}' : utilisateur inexistant\n`;
      else stdout += `${user} : ${userGroups(env.machine, user).join(' ')}\n`;
    }
    return { stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Commande `who` : sessions ouvertes. */
export const who: BashCommand = {
  name: 'who',
  summary: 'affiche les utilisateurs connectés',
  manual: `NOM
       who - afficher les utilisateurs connectés

SYNOPSIS
       who`,
  run(_args, env) {
    const login = formatDate(env.ctx.now.getTime() - 25 * 60_000, '%F %R');
    return {
      stdout: `${env.machine.session.user.padEnd(8)} pts/0        ${login} (192.168.10.23)\n`,
      exitCode: 0,
    };
  },
};

/** Commande `which` : chemin d'un programme dans le PATH. */
export const which: BashCommand = {
  name: 'which',
  summary: "affiche le chemin d'un programme",
  manual: `NOM
       which - trouver le chemin d'une commande

SYNOPSIS
       which COMMANDE...

DESCRIPTION
       Cherche COMMANDE dans les dossiers de la variable PATH et affiche le
       premier exécutable trouvé. Rien n'est affiché (code 1) s'il n'existe
       pas : c'est souvent le signe d'un paquet non installé.`,
  run(args, env) {
    const dirs = (env.env['PATH'] ?? '/usr/bin:/bin').split(':');
    let stdout = '';
    let missing = false;
    for (const name of args.filter((a) => !a.startsWith('-'))) {
      const hit = dirs
        .map((d) => `${d}/${name}`)
        .find((p) => {
          const found = statPath(env.machine, p, env.user);
          return (
            found.ok && found.value.node.type === 'file' && (found.value.node.mode & 0o111) !== 0
          );
        });
      if (hit) stdout += `${hit}\n`;
      else missing = true;
    }
    return { stdout, exitCode: missing ? 1 : 0, ok: true };
  },
};

/** Commande interne `type` : nature d'une commande. */
export const type: BashCommand = {
  name: 'type',
  builtin: true,
  summary: 'indique si une commande est interne, un alias ou un programme',
  manual: `NOM
       type - indiquer la nature d'une commande

SYNOPSIS
       type COMMANDE...

DESCRIPTION
       Indique si COMMANDE est une primitive du shell (cd), un alias (ll) ou
       un programme (et son chemin).`,
  run(args, env) {
    const aliases: Record<string, string> = { ls: 'ls --color=auto', ll: 'ls -l' };
    let stdout = '';
    let stderr = '';
    for (const name of args) {
      if (aliases[name]) stdout += `${name} est un alias vers « ${aliases[name]} »\n`;
      else if (env.commands[name]?.builtin) stdout += `${name} est une primitive du shell\n`;
      else if ((USR_BIN as readonly string[]).includes(name))
        stdout += `${name} est /usr/bin/${name}\n`;
      else if ((USR_SBIN as readonly string[]).includes(name))
        stdout += `${name} est /usr/sbin/${name}\n`;
      else stderr += `bash: type: ${name} : non trouvé\n`;
    }
    return { stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Nature d'un fichier selon son contenu (comme `file` 5.44). */
export function describeFile(path: string, content: string, mode: number, size: number): string {
  if (path.startsWith('/usr/bin/') || path.startsWith('/usr/sbin/')) {
    return 'ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 3.2.0, stripped';
  }
  if (content.startsWith('TSSR-GZIP')) return 'gzip compressed data, from Unix';
  if (content.startsWith('TSSR-TAR')) return 'POSIX tar archive (GNU)';
  if (content.startsWith('TSSR-ZIP'))
    return 'Zip archive data, at least v2.0 to extract, compression method=deflate';
  if (size === 0) return 'empty';
  if (content === '') return 'data';
  const exec = (mode & 0o111) !== 0 ? ' executable' : '';
  if (content.startsWith('#!/bin/bash')) return `Bourne-Again shell script, ASCII text${exec}`;
  if (content.startsWith('#!/bin/sh')) return `POSIX shell script, ASCII text${exec}`;
  // Tout caractère hors de l'ASCII imprimable (et des blancs) signale de l'UTF-8.
  if (/[^ -~\t\n\r]/.test(content)) return 'Unicode text, UTF-8 text';
  return 'ASCII text';
}

/** Commande `file` : nature du contenu d'un fichier. */
export const file: BashCommand = {
  name: 'file',
  summary: "devine la nature d'un fichier",
  manual: `NOM
       file - déterminer le type d'un fichier

SYNOPSIS
       file FICHIER...

DESCRIPTION
       Examine le CONTENU du fichier (pas son extension) : texte, script,
       archive, exécutable, dossier…`,
  run(args, env) {
    let stdout = '';
    for (const operand of args.filter((a) => !a.startsWith('-'))) {
      const found = statPath(env.machine, env.resolve(operand), env.user, { follow: false });
      if (!found.ok) {
        stdout += `${operand}: cannot open \`${operand}' (No such file or directory)\n`;
        continue;
      }
      const { node } = found.value;
      const what =
        node.type === 'dir'
          ? 'directory'
          : node.type === 'symlink'
            ? `symbolic link to ${node.target}`
            : describeFile(found.value.path, node.content, node.mode, fileSize(node));
      stdout += `${operand}: ${what}\n`;
    }
    return { stdout, exitCode: 0 };
  },
};

/** Commande `stat` : métadonnées d'un fichier. */
export const stat: BashCommand = {
  name: 'stat',
  summary: "affiche les métadonnées d'un fichier",
  manual: `NOM
       stat - afficher l'état d'un fichier

SYNOPSIS
       stat [-c FORMAT] FICHIER...

DESCRIPTION
       Taille, droits (octal et symbolique), propriétaire, dates.
       -c '%a %U %G %n' : droits octaux, propriétaire, groupe, nom.`,
  run(args, env) {
    const formatIndex = args.indexOf('-c');
    const format = formatIndex >= 0 ? args[formatIndex + 1] : undefined;
    const operands = args.filter(
      (a, i) => !a.startsWith('-') && !(formatIndex >= 0 && i === formatIndex + 1),
    );
    let stdout = '';
    let stderr = '';
    for (const operand of operands) {
      const found = statPath(env.machine, env.resolve(operand), env.user, { follow: false });
      if (!found.ok) {
        stderr += `stat: impossible d'évaluer '${operand}': ${strerror(found.error)}\n`;
        continue;
      }
      const { node } = found.value;
      const octal = (node.mode & 0o7777).toString(8).padStart(4, '0');
      const uid = env.machine.users[node.owner]?.uid ?? 0;
      const gid = env.machine.groups[node.group]?.gid ?? 0;
      const size = fileSize(node);
      if (format !== undefined) {
        const map: Record<string, string> = {
          a: octal.replace(/^0(?=\d{3})/, ''),
          A: modeString(node),
          U: node.owner,
          G: node.group,
          u: String(uid),
          g: String(gid),
          s: String(size),
          n: operand,
          F:
            node.type === 'dir'
              ? 'répertoire'
              : node.type === 'symlink'
                ? 'lien symbolique'
                : 'fichier',
        };
        stdout += `${format.replace(/%(.)/g, (m, c: string) => map[c] ?? m)}\n`;
        continue;
      }
      const when = `${formatDate(node.mtime, '%F %T')}.000000000 ${formatDate(node.mtime, '%z')}`;
      const kind =
        node.type === 'dir'
          ? 'répertoire'
          : node.type === 'symlink'
            ? 'lien symbolique'
            : size === 0
              ? 'fichier vide'
              : 'fichier';
      const name = node.type === 'symlink' ? `${operand} -> ${node.target}` : operand;
      stdout += `  Fichier : ${name}
   Taille : ${String(size).padEnd(10)}\tBlocs : ${String(Math.ceil(size / 4096) * 8).padEnd(10)} Blocs d'E/S : 4096   ${kind}
Périphérique : 8/1\tInœud : ${String(1000 + (Object.keys(env.machine.fs).indexOf(found.value.path) + 1)).padEnd(11)} Liens : ${node.type === 'dir' ? 2 : 1}
Accès : (${octal}/${modeString(node)})  UID : (${String(uid).padStart(5)}/${node.owner.padStart(8)})   GID : (${String(gid).padStart(5)}/${node.group.padStart(8)})
 Accès : ${when}
Modif. : ${when}
Changt : ${when}
  Créé : ${when}
`;
    }
    return { stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Ligne de whatis/apropos : `nom (1)  - résumé`. */
function whatisLine(name: string, summary: string): string {
  return `${`${name} (1)`.padEnd(20)} - ${summary}`;
}

/** Commande `whatis` : résumé d'une commande. */
export const whatis: BashCommand = {
  name: 'whatis',
  summary: "affiche le résumé d'une commande",
  manual: `NOM
       whatis - afficher la description courte d'une commande

SYNOPSIS
       whatis COMMANDE...`,
  run(args, env) {
    let stdout = '';
    let stderr = '';
    for (const name of args) {
      const command = Object.hasOwn(env.commands, name) ? env.commands[name] : undefined;
      if (command) stdout += `${whatisLine(name, command.summary)}\n`;
      else stderr += `${name}: rien d'approprié.\n`;
    }
    return { stdout, stderr, exitCode: stderr ? 16 : 0 };
  },
};

/** Commande `apropos` : cherche un mot dans les résumés. */
export const apropos: BashCommand = {
  name: 'apropos',
  summary: 'cherche une commande par mot-clé',
  manual: `NOM
       apropos - chercher une commande par mot-clé

SYNOPSIS
       apropos MOT

DESCRIPTION
       Cherche MOT dans le nom et la description courte de chaque commande.
       Utile quand on sait ce qu'on veut faire mais pas le nom de la commande.

EXEMPLES
       apropos fichier
       apropos disque`,
  run(args, env) {
    const word = args.find((a) => !a.startsWith('-'));
    if (!word) return { stderr: 'apropos quoi ?\n', exitCode: 1 };
    const lower = word.toLowerCase();
    const hits = Object.entries(env.commands)
      .filter(
        ([name, c]) =>
          /^[a-z]/.test(name) && (name.includes(lower) || c.summary.toLowerCase().includes(lower)),
      )
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, c]) => whatisLine(name, c.summary));
    if (hits.length === 0) return { stderr: `${word}: rien d'approprié.\n`, exitCode: 16 };
    return { stdout: `${hits.join('\n')}\n`, exitCode: 0 };
  },
};

/** Commande interne `history` : lignes déjà tapées. */
export const history: BashCommand = {
  name: 'history',
  builtin: true,
  summary: 'affiche les commandes déjà tapées',
  manual: `NOM
       history - afficher l'historique des commandes

SYNOPSIS
       history [N]

DESCRIPTION
       Affiche les commandes tapées, numérotées. Rappel rapide : flèche haut,
       ou !N pour relancer la commande numéro N (sur un vrai bash).`,
  run(args, env) {
    const lines: string[] = [];
    for (const record of env.machine.history)
      if (lines.at(-1) !== record.line) lines.push(record.line);
    // La ligne en cours fait déjà partie de l'historique, comme dans bash.
    if (env.line && lines.at(-1) !== env.line) lines.push(env.line);
    const limit = args[0] !== undefined && /^\d+$/.test(args[0]) ? Number(args[0]) : lines.length;
    const shown = lines.slice(-limit);
    const start = lines.length - shown.length;
    return {
      stdout: shown.map((l, i) => `${String(start + i + 1).padStart(5)}  ${l}\n`).join(''),
      exitCode: 0,
    };
  },
};

/** Commande `nano` : non simulée, redirige vers vim. */
export const nano: BashCommand = {
  name: 'nano',
  summary: 'éditeur de texte simple (non simulé : utiliser vim)',
  manual: `NOM
       nano - éditeur de texte simple

DESCRIPTION
       nano n'est pas simulé dans TSSR Quest : utilise vim, l'éditeur présent
       sur tous les serveurs (voir « man vim »).`,
  run: () => ({
    stderr: "nano n'est pas disponible dans cette simulation : utilise vim (« vim fichier »).\n",
    exitCode: 127,
  }),
};
