/**
 * Opérations sur le stockage partagées par les commandes (`mkfs.ext4`, `pvcreate`) et
 * par les confirmations qu'elles posent (« Proceed anyway? », « Wipe it? »).
 */
import {
  canonicalPath,
  findDevice,
  lvmUuid,
  stableUuid,
  storageOf,
  withStorage,
} from '@sims/shared/storage';
import type { Machine } from '@sims/shared/types';

/** Version d'e2fsprogs de Debian 12. */
export const MKE2FS_BANNER = 'mke2fs 1.47.0 (5-Feb-2023)\n';

/** Copies de secours du superbloc, selon la taille du système (en blocs de 4 Kio). */
const SUPERBLOCK_BACKUPS = [
  32768, 98304, 163840, 229376, 294912, 819200, 884736, 1605632, 2654208, 4096000, 7962624,
  11239424, 20480000, 23887872,
];

/** Blocs du journal ext4 selon le nombre de blocs (règle de mke2fs). */
function journalBlocks(blocks: number): number {
  if (blocks < 32768) return 1024;
  if (blocks < 262144) return 4096;
  if (blocks < 524288) return 8192;
  if (blocks < 4194304) return 16384;
  return 32768;
}

/**
 * Crée un système de fichiers ext4 sur un périphérique et produit la sortie de mke2fs.
 *
 * @param machine - Machine simulée.
 * @param path - Périphérique (`/dev/sdb1`, `/dev/vg/lv`).
 * @param label - Étiquette (`-L`), facultative.
 * @param counter - Numéro de création (pour un UUID différent à chaque formatage).
 * @returns La machine et le texte affiché (sans la ligne de version).
 */
export function makeExt4(
  machine: Machine,
  path: string,
  label: string | null,
  counter: number,
): { machine: Machine; text: string } {
  const device = findDevice(machine, path);
  const canonical = canonicalPath(machine, path);
  const size = device?.size ?? 0;
  const blocks = Math.floor(size / 4096);
  const inodes = Math.floor(size / 16384);
  const uuid = stableUuid(`${machine.hostname}:${canonical}:ext4:${counter}`);
  const backups = SUPERBLOCK_BACKUPS.filter((b) => b < blocks);
  const storage = storageOf(machine);
  const next = withStorage(machine, {
    ...storage,
    signatures: {
      ...storage.signatures,
      [canonical]: { type: 'ext4', uuid, size: blocks * 4096, ...(label ? { label } : {}) },
    },
    pvs: storage.pvs.filter((pv) => pv !== canonical),
  });
  const text =
    `Discarding device blocks: done                            \n` +
    `Creating filesystem with ${blocks} 4k blocks and ${inodes} inodes\n` +
    `Filesystem UUID: ${uuid}\n` +
    (backups.length > 0
      ? `Superblock backups stored on blocks: \n\t${backups.join(', ')}\n\n`
      : '\n') +
    'Allocating group tables: done                            \n' +
    'Writing inode tables: done                            \n' +
    `Creating journal (${journalBlocks(blocks)} blocks): done\n` +
    'Writing superblocks and filesystem accounting information: done\n\n';
  return { machine: next, text };
}

/**
 * Initialise un volume physique LVM (la signature précédente est effacée).
 *
 * @param machine - Machine simulée.
 * @param path - Périphérique.
 * @returns La machine et le message de pvcreate.
 */
export function createPv(machine: Machine, path: string): { machine: Machine; text: string } {
  const canonical = canonicalPath(machine, path);
  const device = findDevice(machine, path);
  const storage = storageOf(machine);
  const next = withStorage(machine, {
    ...storage,
    signatures: {
      ...storage.signatures,
      [canonical]: {
        type: 'LVM2_member',
        uuid: lvmUuid(`${machine.hostname}:${canonical}:pv`),
        size: device?.size ?? 0,
      },
    },
    pvs: [...storage.pvs.filter((pv) => pv !== canonical), canonical],
  });
  return { machine: next, text: `  Physical volume "${canonical}" successfully created.\n` };
}
