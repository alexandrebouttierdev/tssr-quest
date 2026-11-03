import { fileSize } from './node-size';
import { isInside } from './path';
import type { Disk, Machine } from './types';

/**
 * Système de fichiers monté qui porte un chemin (le point de montage le plus précis).
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu normalisé.
 * @returns Le disque, ou `undefined` si aucun montage ne couvre le chemin.
 */
export function diskForPath(machine: Machine, path: string): Disk | undefined {
  let best: Disk | undefined;
  for (const disk of machine.disks) {
    if (isInside(path, disk.mount) && (!best || disk.mount.length > best.mount.length)) {
      best = disk;
    }
  }
  return best;
}

/**
 * Octets occupés sur un disque : la part non modélisée plus la taille de chaque
 * fichier simulé dont le chemin relève de ce montage.
 *
 * @param machine - Machine simulée.
 * @param disk - Disque de `machine.disks`.
 * @returns Le nombre d'octets utilisés.
 */
export function diskUsage(machine: Machine, disk: Disk): number {
  let used = disk.baseUsed;
  for (const [path, node] of Object.entries(machine.fs)) {
    if (node.type === 'file' && diskForPath(machine, path) === disk) used += fileSize(node);
  }
  return used;
}

/**
 * Octets libres sur le disque qui porte un chemin.
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu normalisé.
 * @returns Les octets libres (infini si aucun disque n'est modélisé pour ce chemin).
 */
export function freeBytes(machine: Machine, path: string): number {
  const disk = diskForPath(machine, path);
  if (!disk) return Number.POSITIVE_INFINITY;
  return Math.max(0, disk.size - diskUsage(machine, disk));
}

/**
 * Pourcentage d'occupation arrondi au supérieur, comme la colonne « Uti% » de `df`.
 *
 * @param machine - Machine simulée.
 * @param disk - Disque de `machine.disks`.
 * @returns Un entier de 0 à 100.
 */
export function diskUsagePercent(machine: Machine, disk: Disk): number {
  if (disk.size === 0) return 0;
  return Math.min(100, Math.ceil((diskUsage(machine, disk) / disk.size) * 100));
}
