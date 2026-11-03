import { strerror } from '@sims/shared/errors';
import { childrenOf, fileSize, removePath, statPath } from '@sims/shared/fs';
import { canAccess } from '@sims/shared/permissions';
import type { FsNode, Machine } from '@sims/shared/types';
import type { BashCommand, CommandOutcome } from '../command';
import { globToRegExp } from '../glob';

/** Test d'un prédicat sur une entrée trouvée. */
type Predicate = (entry: { path: string; name: string; node: FsNode; depth: number }) => boolean;

/** Taille de find -size (+10M, -1k, 4096c). */
function sizePredicate(spec: string): Predicate | null {
  const m = /^([+-]?)(\d+)([ckMG]?)$/.exec(spec);
  if (!m) return null;
  const units: Record<string, number> = { '': 512, c: 1, k: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  const unit = units[m[3] ?? ''] ?? 512;
  const n = Number(m[2]);
  return ({ node }) => {
    if (node.type !== 'file') return false;
    // find arrondit la taille au nombre d'unités supérieur avant de comparer.
    const size = Math.ceil(fileSize(node) / unit);
    return m[1] === '+' ? size > n : m[1] === '-' ? size < n : size === n;
  };
}

/** Commande `find` : recherche des fichiers selon des critères. */
export const find: BashCommand = {
  name: 'find',
  summary: 'recherche des fichiers dans une arborescence',
  manual: `NOM
       find - rechercher des fichiers

SYNOPSIS
       find [CHEMIN]... [CRITÈRE]... [ACTION]

DESCRIPTION
       Parcourt les dossiers et affiche les fichiers qui remplissent TOUS les
       critères.

CRITÈRES
       -name MOTIF      nom (jokers * ? entre guillemets : -name "*.log")
       -iname MOTIF     idem, sans tenir compte de la casse
       -type f|d|l      fichier, dossier, lien
       -size +100M      plus de 100 Mo (k, M, G ; - pour « moins de »)
       -user NOM        appartenant au compte NOM
       -group NOM       appartenant au groupe NOM
       -perm 644        droits exacts (-perm -4000 : au moins ces bits)
       -mtime -7        modifié il y a moins de 7 jours
       -maxdepth N      ne pas descendre au-delà de N niveaux

ACTIONS
       -print (par défaut), -delete, -exec COMMANDE {} \\;

EXEMPLES
       find /var/log -name "*.log" -size +100M
       sudo find / -type f -perm -4000        programmes setuid
       find /home -user julie`,
  run(args, env) {
    const paths: string[] = [];
    let i = 0;
    while (
      i < args.length &&
      !(args[i] ?? '').startsWith('-') &&
      args[i] !== '!' &&
      args[i] !== '('
    )
      paths.push(args[i++] ?? '');
    if (paths.length === 0) paths.push('.');
    const predicates: Predicate[] = [];
    let maxDepth = Number.POSITIVE_INFINITY;
    let minDepth = 0;
    let action: 'print' | 'delete' | { exec: string[] } = 'print';
    const now = env.ctx.now.getTime();
    for (; i < args.length; i++) {
      const option = args[i] ?? '';
      const value = args[i + 1];
      const needValue = (): string | null => (value === undefined ? null : (i++, value));
      const missing = (): CommandOutcome => ({
        stderr: `find: argument manquant pour « ${option} »\n`,
        exitCode: 1,
      });
      switch (option) {
        case '-name':
        case '-iname': {
          const v = needValue();
          if (v === null) return missing();
          const re = globToRegExp(v);
          const ci = new RegExp(re.source, 'i');
          predicates.push(({ name }) => (option === '-iname' ? ci : re).test(name));
          break;
        }
        case '-type': {
          const v = needValue();
          if (v === null) return missing();
          const map: Record<string, FsNode['type']> = { f: 'file', d: 'dir', l: 'symlink' };
          const type = map[v];
          if (!type) return { stderr: `find: Type inconnu dans -type : ${v}\n`, exitCode: 1 };
          predicates.push(({ node }) => node.type === type);
          break;
        }
        case '-size': {
          const v = needValue();
          if (v === null) return missing();
          const p = sizePredicate(v);
          if (!p) return { stderr: `find: Taille invalide « ${v} » pour -size\n`, exitCode: 1 };
          predicates.push(p);
          break;
        }
        case '-user':
        case '-group': {
          const v = needValue();
          if (v === null) return missing();
          predicates.push(({ node }) => (option === '-user' ? node.owner : node.group) === v);
          break;
        }
        case '-perm': {
          const v = needValue();
          if (v === null) return missing();
          const atLeast = v.startsWith('-');
          const mode = parseInt(v.replace(/^[-/]/, ''), 8);
          if (Number.isNaN(mode))
            return { stderr: `find: mode non valable « ${v} »\n`, exitCode: 1 };
          predicates.push(({ node }) =>
            atLeast ? (node.mode & mode) === mode : (node.mode & 0o7777) === mode,
          );
          break;
        }
        case '-mtime': {
          const v = needValue();
          if (v === null) return missing();
          const days = Number(v.replace(/^[+-]/, ''));
          predicates.push(({ node }) => {
            const age = Math.floor((now - node.mtime) / 86_400_000);
            return v.startsWith('+') ? age > days : v.startsWith('-') ? age < days : age === days;
          });
          break;
        }
        case '-maxdepth':
        case '-mindepth': {
          const v = needValue();
          if (v === null || !/^\d+$/.test(v)) return missing();
          if (option === '-maxdepth') maxDepth = Number(v);
          else minDepth = Number(v);
          break;
        }
        case '-print':
          break;
        case '-delete':
          action = 'delete';
          break;
        case '-exec': {
          const end = args.indexOf(';', i + 1);
          if (end < 0) return { stderr: 'find: argument manquant pour « -exec »\n', exitCode: 1 };
          action = { exec: args.slice(i + 1, end) };
          i = end;
          break;
        }
        default:
          return { stderr: `find: prédicat inconnu « ${option} »\n`, exitCode: 1 };
      }
    }

    let stdout = '';
    let stderr = '';
    const found: string[] = [];
    const walk = (machine: Machine, path: string, shown: string, node: FsNode, depth: number) => {
      const entry = { path, name: shown.split('/').filter(Boolean).pop() ?? shown, node, depth };
      if (depth >= minDepth && predicates.every((p) => p(entry))) found.push(shown);
      if (node.type !== 'dir' || depth >= maxDepth) return;
      if (
        !canAccess(machine, env.user, node, 'read') ||
        !canAccess(machine, env.user, node, 'exec')
      ) {
        stderr += `find: '${shown}': ${strerror('EACCES')}\n`;
        return;
      }
      for (const child of childrenOf(machine.fs, path)) {
        walk(
          machine,
          child.path,
          shown.endsWith('/') ? shown + child.name : `${shown}/${child.name}`,
          child.node,
          depth + 1,
        );
      }
    };
    for (const p of paths) {
      const start = statPath(env.machine, env.resolve(p), env.user);
      if (!start.ok) {
        stderr += `find: '${p}': ${strerror(start.error)}\n`;
        continue;
      }
      walk(env.machine, start.value.path, p, start.value.node, 0);
    }
    let machine = env.machine;
    if (action === 'print') stdout = found.map((f) => `${f}\n`).join('');
    else if (action === 'delete') {
      for (const f of [...found].reverse()) {
        const removed = removePath(machine, env.resolve(f), env.user, { emptyDirOnly: true });
        if (removed.ok) machine = removed.value;
        else stderr += `find: impossible de supprimer '${f}': ${strerror(removed.error)}\n`;
      }
    } else {
      const template = action.exec;
      for (const f of found) {
        const result = env.runAs(
          env.user,
          template.map((a) => a.replaceAll('{}', f)),
        );
        stdout += result.stdout ?? '';
        stderr += result.stderr ?? '';
        if (result.machine) machine = result.machine;
      }
    }
    return { machine, stdout, stderr, exitCode: stderr ? 1 : 0, ok: true };
  },
};
