import type { FsNode, Machine } from './types';

/** Type d'accès demandé sur un nœud. */
export type AccessMode = 'read' | 'write' | 'exec';

/** Bits de droits pour chaque type d'accès (sur le triplet « autres »). */
const ACCESS_BITS: Record<AccessMode, number> = { read: 0o4, write: 0o2, exec: 0o1 };

/** Bit sticky : seul le propriétaire peut supprimer ses fichiers dans le dossier. */
export const STICKY_BIT = 0o1000;

/**
 * Groupes effectifs d'un compte : groupe principal puis groupes secondaires (par GID).
 *
 * @param machine - Machine simulée.
 * @param user - Nom du compte.
 * @returns Les noms de groupes (vide si le compte n'existe pas).
 */
export function userGroups(machine: Machine, user: string): string[] {
  const account = machine.users[user];
  if (!account) return [];
  const secondary = Object.values(machine.groups)
    .filter((g) => g.members.includes(user) && g.name !== account.group)
    .sort((a, b) => a.gid - b.gid)
    .map((g) => g.name);
  return [account.group, ...secondary];
}

/**
 * Vérifie un accès selon les règles POSIX : un seul triplet s'applique
 * (propriétaire, sinon groupe, sinon autres). Root lit et écrit tout, et n'exécute
 * un fichier que si au moins un bit x est posé.
 *
 * @param machine - Machine simulée (pour les groupes du compte).
 * @param user - Compte qui demande l'accès.
 * @param node - Nœud visé (déjà résolu, pas un lien).
 * @param mode - Lecture, écriture ou exécution/traversée.
 * @returns Vrai si l'accès est accordé.
 */
export function canAccess(machine: Machine, user: string, node: FsNode, mode: AccessMode): boolean {
  if (user === 'root') {
    if (mode !== 'exec' || node.type === 'dir') return true;
    return (node.mode & 0o111) !== 0;
  }
  const bit = ACCESS_BITS[mode];
  if (node.owner === user) return (node.mode & (bit << 6)) !== 0;
  if (userGroups(machine, user).includes(node.group)) return (node.mode & (bit << 3)) !== 0;
  return (node.mode & bit) !== 0;
}

/**
 * Vérifie qu'un compte peut supprimer (ou renommer) une entrée d'un dossier :
 * il faut w et x sur le dossier, et, si le dossier a le sticky bit (comme /tmp),
 * être propriétaire du fichier ou du dossier, ou root.
 *
 * @param machine - Machine simulée.
 * @param user - Compte qui supprime.
 * @param parent - Dossier qui contient l'entrée.
 * @param entry - Entrée à supprimer.
 * @returns Vrai si la suppression est permise.
 */
export function canDeleteEntry(
  machine: Machine,
  user: string,
  parent: FsNode,
  entry: FsNode,
): boolean {
  if (!canAccess(machine, user, parent, 'write') || !canAccess(machine, user, parent, 'exec')) {
    return false;
  }
  if ((parent.mode & STICKY_BIT) === 0 || user === 'root') return true;
  return entry.owner === user || parent.owner === user;
}
