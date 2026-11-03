import { strerror } from '@sims/shared/errors';
import { childrenOf, fileSize, listDir, statPath } from '@sims/shared/fs';
import { formatHumanSize } from '@sims/shared/size';
import { formatLsDate } from '@sims/shared/time-format';
import type { FsNode, Machine } from '@sims/shared/types';
import type { BashCommand, CommandEnv } from '../command';
import { alignTable, compareNames, formatColumns, modeString } from '../format';
import { parseOptions } from '../options';

/** Entrée à afficher par `ls`. */
interface Entry {
  readonly name: string;
  readonly path: string;
  readonly node: FsNode;
}

/** Nombre de liens physiques affiché (2 + sous-dossiers pour un dossier). */
function linkCount(machine: Machine, entry: Entry): number {
  if (entry.node.type !== 'dir') return 1;
  return 2 + childrenOf(machine.fs, entry.path).filter((c) => c.node.type === 'dir').length;
}

/** Blocs occupés en Kio (allocation par blocs de 4 Kio). */
function blocksKiB(node: FsNode): number {
  if (node.type === 'symlink') return 0;
  return Math.ceil(fileSize(node) / 4096) * 4;
}

/** Trie les entrées selon les options. */
function sortEntries(entries: Entry[], flags: ReadonlySet<string>): Entry[] {
  const sorted = [...entries].sort((a, b) => {
    if (flags.has('t')) return b.node.mtime - a.node.mtime || compareNames(a.name, b.name);
    if (flags.has('S')) return fileSize(b.node) - fileSize(a.node) || compareNames(a.name, b.name);
    return compareNames(a.name, b.name);
  });
  return flags.has('r') ? sorted.reverse() : sorted;
}

/** Affichage long (`-l`). */
function longFormat(
  env: CommandEnv,
  entries: readonly Entry[],
  human: boolean,
  withTotal: boolean,
): string {
  const now = env.ctx.now.getTime();
  const rows = entries.map((e) => [
    modeString(e.node),
    String(linkCount(env.machine, e)),
    e.node.owner,
    e.node.group,
    human ? formatHumanSize(fileSize(e.node)) : String(fileSize(e.node)),
    formatLsDate(e.node.mtime, now),
    e.node.type === 'symlink' ? `${e.name} -> ${e.node.target}` : e.name,
  ]);
  const lines = alignTable(rows, ['l', 'r', 'l', 'l', 'r', 'l', 'l']);
  const totalKiB = entries.reduce((sum, e) => sum + blocksKiB(e.node), 0);
  const total = human ? formatHumanSize(totalKiB * 1024) : String(totalKiB);
  return (withTotal ? `total ${total}\n` : '') + (lines.length ? `${lines.join('\n')}\n` : '');
}

/** Affichage d'une liste d'entrées selon le mode. */
function render(
  env: CommandEnv,
  entries: readonly Entry[],
  flags: ReadonlySet<string>,
  withTotal: boolean,
): string {
  if (flags.has('l')) return longFormat(env, entries, flags.has('h'), withTotal);
  const names = entries.map((e) => e.name);
  if (flags.has('1') || !env.isTerminal) return names.map((n) => `${n}\n`).join('');
  return formatColumns(names);
}

/** Commande `ls` : liste le contenu d'un répertoire. */
export const ls: BashCommand = {
  name: 'ls',
  summary: "liste le contenu d'un répertoire",
  manual: `NOM
       ls - lister le contenu d'un répertoire

SYNOPSIS
       ls [OPTION]... [FICHIER]...

DESCRIPTION
       Affiche les fichiers du répertoire courant, ou des chemins indiqués.

       -a     afficher aussi les fichiers cachés (dont le nom commence par .)
       -A     comme -a, sans . et ..
       -l     format long : droits, propriétaire, groupe, taille, date
       -h     tailles lisibles (K, M, G) avec -l
       -d     afficher le dossier lui-même, pas son contenu
       -t     trier par date de modification, le plus récent d'abord
       -S     trier par taille, le plus gros d'abord
       -r     inverser l'ordre de tri
       -1     un nom par ligne

EXEMPLES
       ls -lh /var/log      tailles des journaux, lisibles
       ls -la ~             tout le dossier personnel, fichiers cachés compris`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'ls',
      short: 'laAhdtSr1',
      long: { all: 'a', 'almost-all': 'A', 'human-readable': 'h', directory: 'd', reverse: 'r' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 2 };
    const { flags } = parsed;
    const operands = parsed.operands.length ? parsed.operands : ['.'];
    let stderr = '';
    let exitCode = 0;
    const files: Entry[] = [];
    const dirs: Entry[] = [];
    for (const operand of operands) {
      const path = env.resolve(operand);
      const found = statPath(env.machine, path, env.user);
      if (!found.ok) {
        stderr += `ls: impossible d'accéder à '${operand}': ${strerror(found.error)}\n`;
        exitCode = 2;
        continue;
      }
      const entry = { name: operand, path: found.value.path, node: found.value.node };
      if (found.value.node.type === 'dir' && !flags.has('d')) dirs.push(entry);
      else files.push(entry);
    }
    const blocks: string[] = [];
    if (files.length) blocks.push(render(env, sortEntries(files, flags), flags, false));
    const showHeaders = operands.length > 1;
    for (const dir of sortEntries(dirs, flags)) {
      const listing = listDir(env.machine, dir.path, env.user);
      if (!listing.ok) {
        stderr += `ls: impossible d'ouvrir le répertoire '${dir.name}': ${strerror(listing.error)}\n`;
        exitCode = 2;
        continue;
      }
      let entries: Entry[] = listing.value.filter(
        (e) => flags.has('a') || flags.has('A') || !e.name.startsWith('.'),
      );
      entries = sortEntries(entries, flags);
      if (flags.has('a')) {
        const parentPath =
          dir.path === '/' ? '/' : dir.path.slice(0, dir.path.lastIndexOf('/')) || '/';
        const parent = env.machine.fs[parentPath] ?? dir.node;
        const dots: Entry[] = [
          { name: '.', path: dir.path, node: dir.node },
          { name: '..', path: parentPath, node: parent },
        ];
        entries = flags.has('r') ? [...entries, ...dots.reverse()] : [...dots, ...entries];
      }
      const body = render(env, entries, flags, true);
      blocks.push(showHeaders ? `${dir.name}:\n${body}` : body);
    }
    return { stdout: blocks.join('\n'), stderr, exitCode };
  },
};
