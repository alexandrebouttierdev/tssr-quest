import type { FsNode } from './types';

/**
 * Taille d'un nœud en octets, telle qu'affichée par `ls -l`.
 *
 * @param node - Nœud du système de fichiers.
 * @returns La taille déclarée, sinon celle du contenu en UTF-8 (4096 pour un dossier).
 */
export function fileSize(node: FsNode): number {
  if (node.type === 'dir') return 4096;
  if (node.type === 'symlink') return new TextEncoder().encode(node.target).length;
  return node.size ?? new TextEncoder().encode(node.content).length;
}
