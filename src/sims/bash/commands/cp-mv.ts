import type { Errno } from '@sims/shared/errors';
import { childrenOf, removePath, setNode, statPath, writeFile } from '@sims/shared/fs';
import { basename, dirname, isInside, joinPath } from '@sims/shared/path';
import { canAccess, canDeleteEntry } from '@sims/shared/permissions';
import { userGroups } from '@sims/shared/permissions';
import type { FsNode, Machine } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { parseOptions } from '../options';
import { fsError, missingOperand } from './helpers';

/** Résultat d'une copie élémentaire. */
type CopyResult =
  { ok: true; machine: Machine } | { ok: false; error: Errno; path: string; action: string };

/**
 * Copie un nœud (et son contenu pour un dossier) vers une destination absolue.
 * Le propriétaire devient le compte qui copie, sauf avec `preserve` (cp -p / -a).
 */
function copyNode(
  env: CommandEnv,
  machine: Machine,
  from: string,
  to: string,
  node: FsNode,
  preserve: boolean,
  now: number,
): CopyResult {
  const owner = preserve ? node.owner : env.user;
  const group = preserve ? node.group : (userGroups(machine, env.user)[0] ?? env.user);
  if (node.type === 'symlink') {
    return {
      ok: true,
      machine: setNode(machine, to, { ...node, owner, group, mtime: preserve ? node.mtime : now }),
    };
  }
  if (node.type === 'file') {
    if (!canAccess(machine, env.user, node, 'read'))
      return { ok: false, error: 'EACCES', path: from, action: "impossible d'ouvrir" };
    const written = writeFile(machine, to, env.user, node.content, { now });
    if (!written.ok)
      return {
        ok: false,
        error: written.error,
        path: to,
        action: 'impossible de créer le fichier standard',
      };
    const created = written.value.fs[to];
    if (!created || created.type !== 'file') return { ok: true, machine: written.value };
    // La copie garde la taille déclarée (un gros fichier reste gros) et le mode d'origine (umask appliqué).
    const copied: FsNode = {
      ...created,
      ...(node.size !== undefined ? { size: node.size } : {}),
      mode: preserve ? node.mode : node.mode & 0o777 & ~0o022,
      ...(preserve ? { owner, group, mtime: node.mtime } : {}),
    };
    return { ok: true, machine: setNode(written.value, to, copied) };
  }
  if (!canAccess(machine, env.user, node, 'read'))
    return { ok: false, error: 'EACCES', path: from, action: "impossible d'accéder à" };
  const parent = statPath(machine, dirname(to), env.user);
  if (!parent.ok)
    return {
      ok: false,
      error: parent.error,
      path: to,
      action: 'impossible de créer le répertoire',
    };
  if (!canAccess(machine, env.user, parent.value.node, 'write'))
    return { ok: false, error: 'EACCES', path: to, action: 'impossible de créer le répertoire' };
  let current =
    machine.fs[to]?.type === 'dir'
      ? machine
      : setNode(machine, to, {
          type: 'dir',
          owner,
          group,
          mode: preserve ? node.mode : 0o755,
          mtime: now,
        });
  for (const child of childrenOf(machine.fs, from)) {
    const result = copyNode(
      env,
      current,
      child.path,
      joinPath(to, child.name),
      child.node,
      preserve,
      now,
    );
    if (!result.ok) return result;
    current = result.machine;
  }
  return { ok: true, machine: current };
}

/** Destination finale : dans le dossier cible s'il existe, sinon le chemin lui-même. */
function targetPath(machine: Machine, env: CommandEnv, source: string, dest: string): string {
  const destPath = env.resolve(dest);
  const found = statPath(machine, destPath, env.user);
  return found.ok && found.value.node.type === 'dir'
    ? joinPath(found.value.path, basename(env.resolve(source)))
    : destPath;
}

/** Copie ou déplacement commun à cp et mv. */
function transfer(args: readonly string[], env: CommandEnv, move: boolean): CommandOutcome {
  const name = move ? 'mv' : 'cp';
  const parsed = parseOptions(args, {
    name,
    short: move ? 'fivnu' : 'rRapfivnu',
    long: {
      recursive: 'r',
      archive: 'a',
      force: 'f',
      interactive: 'i',
      verbose: 'v',
      'no-clobber': 'n',
      update: 'u',
    },
  });
  if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
  const { flags, operands } = parsed;
  if (operands.length === 0)
    return { stderr: missingOperand(name, 'opérande de fichier manquant'), exitCode: 1 };
  if (operands.length === 1) {
    return {
      stderr: `${name}: opérande de fichier cible manquant après '${operands[0] ?? ''}'\nSaisissez « ${name} --help » pour plus d'informations.\n`,
      exitCode: 1,
    };
  }
  const dest = operands.at(-1) ?? '';
  const sources = operands.slice(0, -1);
  const destFound = statPath(env.machine, env.resolve(dest), env.user);
  if (sources.length > 1 && !(destFound.ok && destFound.value.node.type === 'dir')) {
    return { stderr: `${name}: la cible '${dest}' n'est pas un répertoire\n`, exitCode: 1 };
  }
  const recursive = flags.has('r') || flags.has('R') || flags.has('a');
  const now = env.ctx.now.getTime();
  let machine = env.machine;
  let stdout = '';
  let stderr = '';
  for (const source of sources) {
    const from = env.resolve(source);
    const found = statPath(machine, from, env.user, { follow: move });
    if (!found.ok) {
      stderr += fsError(name, "impossible d'évaluer", source, found.error);
      continue;
    }
    const to = targetPath(machine, env, source, dest);
    if (to === found.value.path && found.value.node.type !== 'dir') {
      const shownTarget =
        machine.fs[env.resolve(dest)]?.type === 'dir'
          ? `${dest.replace(/\/$/, '')}/${basename(from)}`
          : dest;
      stderr += `${name}: '${source}' et '${shownTarget}' identifient le même fichier\n`;
      continue;
    }
    if (
      to === found.value.path ||
      (found.value.node.type === 'dir' && isInside(to, found.value.path))
    ) {
      stderr += `${name}: impossible de ${move ? 'déplacer' : 'copier'} un répertoire, '${source}', vers lui-même, '${dest}'\n`;
      continue;
    }
    if (flags.has('n') && machine.fs[to]) continue;
    if (!move && found.value.node.type === 'dir' && !recursive) {
      stderr += `cp: -r non spécifié ; omission du répertoire '${source}'\n`;
      continue;
    }
    if (move) {
      const parent = statPath(machine, dirname(found.value.path), env.user);
      if (!parent.ok || !canDeleteEntry(machine, env.user, parent.value.node, found.value.node)) {
        stderr += `mv: impossible de déplacer '${source}' vers '${dest}': ${parent.ok ? 'Permission non accordée' : 'Aucun fichier ou dossier de ce type'}\n`;
        continue;
      }
    }
    if (machine.fs[to]?.type === 'dir' && found.value.node.type !== 'dir') {
      stderr += `${name}: impossible d'écraser le répertoire '${dest}' par un non-répertoire\n`;
      continue;
    }
    const copied = copyNode(
      env,
      machine,
      found.value.path,
      to,
      found.value.node,
      move || flags.has('p') || flags.has('a'),
      now,
    );
    if (!copied.ok) {
      stderr +=
        move && copied.error === 'EACCES'
          ? `mv: impossible de déplacer '${source}' vers '${dest}': Permission non accordée\n`
          : fsError(name, copied.action, copied.path === to ? dest : source, copied.error);
      continue;
    }
    machine = copied.machine;
    if (move) {
      // Un déplacement garde le propriétaire et la date : ce n'est qu'un changement de nom.
      const removed = removePath(machine, found.value.path, 'root', { recursive: true });
      if (removed.ok) machine = removed.value;
    }
    if (flags.has('v'))
      stdout += move ? `renommé '${source}' -> '${dest}'\n` : `'${source}' -> '${dest}'\n`;
  }
  return { machine, stdout, stderr, exitCode: stderr ? 1 : 0 };
}

/** Commande `cp` : copie des fichiers et des répertoires. */
export const cp: BashCommand = {
  name: 'cp',
  summary: 'copie des fichiers et des répertoires',
  manual: `NOM
       cp - copier des fichiers et des répertoires

SYNOPSIS
       cp [OPTION]... SOURCE... DESTINATION

DESCRIPTION
       Copie SOURCE vers DESTINATION, ou plusieurs sources dans un répertoire.

       -r, -R  copier les répertoires et leur contenu
       -a      archive : récursif, en gardant droits, propriétaires et dates
       -p      garder droits, propriétaire et dates
       -n      ne pas écraser un fichier existant
       -v      afficher chaque copie

EXEMPLES
       cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak   sauvegarde avant modification
       cp -r projet/ /srv/sauvegardes/`,
  run: (args, env) => transfer(args, env, false),
};

/** Commande `mv` : déplace ou renomme. */
export const mv: BashCommand = {
  name: 'mv',
  summary: 'déplace ou renomme des fichiers',
  manual: `NOM
       mv - déplacer ou renommer des fichiers

SYNOPSIS
       mv [OPTION]... SOURCE... DESTINATION

DESCRIPTION
       Renomme SOURCE en DESTINATION, ou déplace des fichiers dans un
       répertoire. Il faut le droit d'écriture sur le dossier de départ et sur
       celui d'arrivée.

       -n     ne pas écraser un fichier existant
       -v     afficher chaque déplacement

EXEMPLES
       mv rapport.txt rapport-2026.txt
       mv *.log archives/`,
  run: (args, env) => transfer(args, env, true),
};
