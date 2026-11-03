import { freeBytes } from './disks';
import { fileSize } from './node-size';
import type { Errno } from './errors';
import { basename, dirname, isInside, joinPath, normalizePath } from './path';
import { canAccess, canDeleteEntry, STICKY_BIT, userGroups } from './permissions';
import type { DirNode, FileNode, FileSystem, FsNode, Machine } from './types';

/**
 * Résultat d'une opération sur le système de fichiers : la valeur, ou un code errno
 * accompagné du chemin fautif (tel que la commande devra l'afficher).
 */
export type FsResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: Errno; readonly path: string };

export { fileSize } from './node-size';

/** Nœud trouvé et son chemin canonique (liens résolus). */
export interface ResolvedNode {
  readonly path: string;
  readonly node: FsNode;
}

/** Entrée d'un dossier. */
export interface DirEntry {
  readonly name: string;
  readonly path: string;
  readonly node: FsNode;
}

/** Nombre maximal de liens suivis avant ELOOP (comme le noyau Linux). */
const MAX_SYMLINKS = 40;

/** Masque de création par défaut (umask 022). */
const DEFAULT_UMASK = 0o022;

/** Bit setgid : les créations héritent du groupe du dossier. */
const SETGID_BIT = 0o2000;

/** Construit un échec. */
function fail<T>(error: Errno, path: string): FsResult<T> {
  return { ok: false, error, path };
}

/** Construit un succès. */
function ok<T>(value: T): FsResult<T> {
  return { ok: true, value };
}

/**
 * Résout un chemin absolu en suivant les liens symboliques et en vérifiant le droit
 * de traversée (x) de chaque dossier intermédiaire.
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu (il est normalisé).
 * @param user - Compte qui accède.
 * @param options - `follow: false` pour ne pas suivre le dernier lien (comme `lstat`).
 * @returns Le nœud et son chemin canonique, ou ENOENT, ENOTDIR, EACCES, ELOOP.
 */
export function statPath(
  machine: Machine,
  path: string,
  user: string,
  options: { follow?: boolean } = {},
): FsResult<ResolvedNode> {
  return resolveFrom(machine, normalizePath(path), user, options.follow ?? true, 0, path);
}

/** Résolution récursive (une récursion par lien suivi). */
function resolveFrom(
  machine: Machine,
  path: string,
  user: string,
  follow: boolean,
  depth: number,
  reported: string,
): FsResult<ResolvedNode> {
  const root = machine.fs['/'];
  if (!root) return fail('ENOENT', reported);
  const parts = path.split('/').filter(Boolean);
  let current = '/';
  let node: FsNode = root;
  for (let i = 0; i < parts.length; i++) {
    if (node.type !== 'dir') return fail('ENOTDIR', reported);
    if (!canAccess(machine, user, node, 'exec')) return fail('EACCES', reported);
    const next = joinPath(current, parts[i] ?? '');
    const child = machine.fs[next];
    if (!child) return fail('ENOENT', reported);
    const isLast = i === parts.length - 1;
    if (child.type === 'symlink' && (!isLast || follow)) {
      if (depth >= MAX_SYMLINKS) return fail('ELOOP', reported);
      const target = child.target.startsWith('/')
        ? child.target
        : `${dirname(next)}/${child.target}`;
      const rest = parts.slice(i + 1).join('/');
      return resolveFrom(
        machine,
        normalizePath(rest ? `${target}/${rest}` : target),
        user,
        follow,
        depth + 1,
        reported,
      );
    }
    current = next;
    node = child;
  }
  return ok({ path: current, node });
}

/**
 * Enfants directs d'un dossier, triés par nom (sans contrôle de droits).
 *
 * @param fs - Système de fichiers.
 * @param dir - Dossier absolu normalisé.
 * @returns Les entrées du dossier.
 */
export function childrenOf(fs: FileSystem, dir: string): DirEntry[] {
  const entries: DirEntry[] = [];
  for (const [path, node] of Object.entries(fs)) {
    if (path !== '/' && dirname(path) === dir) entries.push({ name: basename(path), path, node });
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Lit un fichier texte.
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu.
 * @param user - Compte qui lit.
 * @returns Le contenu, ou ENOENT, EACCES, EISDIR…
 */
export function readFile(machine: Machine, path: string, user: string): FsResult<string> {
  const found = statPath(machine, path, user);
  if (!found.ok) return found;
  const { node } = found.value;
  if (node.type === 'dir') return fail('EISDIR', path);
  if (node.type !== 'file') return fail('EINVAL', path);
  if (!canAccess(machine, user, node, 'read')) return fail('EACCES', path);
  return ok(node.content);
}

/**
 * Liste un dossier (droit r nécessaire).
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu du dossier.
 * @param user - Compte qui liste.
 * @returns Les entrées triées, ou ENOENT, ENOTDIR, EACCES.
 */
export function listDir(machine: Machine, path: string, user: string): FsResult<DirEntry[]> {
  const found = statPath(machine, path, user);
  if (!found.ok) return found;
  if (found.value.node.type !== 'dir') return fail('ENOTDIR', path);
  if (!canAccess(machine, user, found.value.node, 'read')) return fail('EACCES', path);
  return ok(childrenOf(machine.fs, found.value.path));
}

/**
 * Remplace (ou crée) un nœud sans aucun contrôle : réservé aux fabriques, aux
 * commandes qui ont déjà vérifié les droits, et aux tests.
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu normalisé.
 * @param node - Nouveau nœud.
 * @returns Une nouvelle machine.
 */
export function setNode(machine: Machine, path: string, node: FsNode): Machine {
  return { ...machine, fs: { ...machine.fs, [path]: node } };
}

/** Groupe et bits hérités d'un dossier parent setgid. */
function inheritedGroup(machine: Machine, user: string, parent: FsNode): string {
  if ((parent.mode & SETGID_BIT) !== 0) return parent.group;
  return userGroups(machine, user)[0] ?? user;
}

/**
 * Écrit un fichier (comme une redirection `>` ou `>>`), en le créant au besoin avec
 * les droits par défaut (0644, groupe principal ou groupe du dossier setgid).
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu.
 * @param user - Compte qui écrit.
 * @param content - Texte écrit.
 * @param options - `append` pour ajouter à la fin ; `now` pour la date de modification.
 * @returns La nouvelle machine, ou EACCES, ENOENT, EISDIR, ENOSPC…
 */
export function writeFile(
  machine: Machine,
  path: string,
  user: string,
  content: string,
  options: { append?: boolean; now: number },
): FsResult<Machine> {
  // /dev/null avale tout ce qu'on y écrit.
  if (normalizePath(path) === '/dev/null') return ok(machine);
  const added = new TextEncoder().encode(content).length;
  const found = statPath(machine, path, user);
  if (found.ok) {
    const { node, path: canonical } = found.value;
    if (node.type === 'dir') return fail('EISDIR', path);
    if (node.type !== 'file') return fail('EINVAL', path);
    if (!canAccess(machine, user, node, 'write')) return fail('EACCES', path);
    const previous = fileSize(node);
    const nextSize = options.append ? previous + added : added;
    if (nextSize - previous > freeBytes(machine, canonical)) return fail('ENOSPC', path);
    const updated: FileNode = options.append
      ? {
          ...node,
          content: node.content + content,
          ...(node.size !== undefined ? { size: node.size + added } : {}),
          mtime: options.now,
        }
      : {
          type: 'file',
          owner: node.owner,
          group: node.group,
          mode: node.mode,
          mtime: options.now,
          content,
        };
    return ok(setNode(machine, canonical, updated));
  }
  if (found.error !== 'ENOENT') return found;
  const parentPath = dirname(normalizePath(path));
  const parent = statPath(machine, parentPath, user);
  if (!parent.ok) return fail(parent.error, path);
  if (parent.value.node.type !== 'dir') return fail('ENOTDIR', path);
  const parentNode = parent.value.node;
  if (
    !canAccess(machine, user, parentNode, 'write') ||
    !canAccess(machine, user, parentNode, 'exec')
  ) {
    return fail('EACCES', path);
  }
  const target = joinPath(parent.value.path, basename(normalizePath(path)));
  if (added > freeBytes(machine, target)) return fail('ENOSPC', path);
  return ok(
    setNode(machine, target, {
      type: 'file',
      owner: user,
      group: inheritedGroup(machine, user, parentNode),
      mode: 0o666 & ~(machine.session.umask ?? DEFAULT_UMASK),
      mtime: options.now,
      content,
    }),
  );
}

/**
 * Crée un dossier (comme `mkdir`, ou `mkdir -p` avec `parents`).
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu du dossier.
 * @param user - Compte qui crée.
 * @param options - `parents` pour créer les intermédiaires ; `now` pour la date.
 * @returns La nouvelle machine, ou EEXIST, ENOENT, EACCES, ENOTDIR.
 */
export function makeDir(
  machine: Machine,
  path: string,
  user: string,
  options: { parents?: boolean; now: number },
): FsResult<Machine> {
  const target = normalizePath(path);
  const existing = statPath(machine, target, user);
  if (existing.ok) {
    if (options.parents && existing.value.node.type === 'dir') return ok(machine);
    return fail('EEXIST', path);
  }
  if (existing.error !== 'ENOENT') return existing;
  let current = machine;
  const parentPath = dirname(target);
  let parent = statPath(current, parentPath, user);
  if (!parent.ok) {
    if (parent.error !== 'ENOENT' || !options.parents) return fail(parent.error, path);
    const created = makeDir(current, parentPath, user, options);
    if (!created.ok) return created;
    current = created.value;
    parent = statPath(current, parentPath, user);
    if (!parent.ok) return fail(parent.error, path);
  }
  const parentNode = parent.value.node;
  if (parentNode.type !== 'dir') return fail('ENOTDIR', path);
  if (
    !canAccess(current, user, parentNode, 'write') ||
    !canAccess(current, user, parentNode, 'exec')
  ) {
    return fail('EACCES', path);
  }
  const dir: DirNode = {
    type: 'dir',
    owner: user,
    group: inheritedGroup(current, user, parentNode),
    // Un dossier créé dans un dossier setgid hérite aussi du bit setgid.
    mode: (0o777 & ~(current.session.umask ?? DEFAULT_UMASK)) | (parentNode.mode & SETGID_BIT),
    mtime: options.now,
  };
  return ok(setNode(current, joinPath(parent.value.path, basename(target)), dir));
}

/**
 * Supprime un fichier, un lien, ou un dossier (vide avec `emptyDirOnly`, avec tout
 * son contenu avec `recursive`). Le lien est supprimé, pas sa cible.
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu.
 * @param user - Compte qui supprime.
 * @param options - `recursive` (rm -r) ou `emptyDirOnly` (rmdir).
 * @returns La nouvelle machine, ou ENOENT, EACCES, EPERM (sticky bit), EISDIR, ENOTEMPTY.
 */
export function removePath(
  machine: Machine,
  path: string,
  user: string,
  options: { recursive?: boolean; emptyDirOnly?: boolean },
): FsResult<Machine> {
  const target = normalizePath(path);
  if (target === '/') return fail('EPERM', path);
  const found = statPath(machine, target, user, { follow: false });
  if (!found.ok) return found;
  const canonical = found.value.path;
  const parent = statPath(machine, dirname(canonical), user);
  if (!parent.ok) return fail(parent.error, path);
  const { node } = found.value;
  if (!canDeleteEntry(machine, user, parent.value.node, node)) {
    const blockedBySticky =
      (parent.value.node.mode & STICKY_BIT) !== 0 &&
      canAccess(machine, user, parent.value.node, 'write');
    return fail(blockedBySticky ? 'EPERM' : 'EACCES', path);
  }
  const descendants = Object.keys(machine.fs).filter(
    (p) => p !== canonical && isInside(p, canonical),
  );
  if (node.type === 'dir') {
    if (options.emptyDirOnly) {
      if (descendants.length > 0) return fail('ENOTEMPTY', path);
    } else if (!options.recursive) {
      return fail('EISDIR', path);
    } else {
      // Pour vider un dossier, il faut pouvoir le lire, l'écrire et le traverser,
      // ainsi que chacun de ses sous-dossiers non vides.
      for (const dirPath of [canonical, ...descendants]) {
        const dirNode = machine.fs[dirPath];
        if (dirNode?.type !== 'dir') continue;
        const hasChildren = descendants.some((p) => dirname(p) === dirPath);
        if (!hasChildren) continue;
        const allowed = (['read', 'write', 'exec'] as const).every((m) =>
          canAccess(machine, user, dirNode, m),
        );
        if (!allowed) return fail('EACCES', dirPath === canonical ? path : dirPath);
      }
    }
  }
  const fs: Record<string, FsNode> = { ...machine.fs };
  delete fs[canonical];
  for (const p of descendants) delete fs[p];
  return ok({ ...machine, fs });
}
