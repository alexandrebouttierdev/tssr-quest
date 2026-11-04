/**
 * Stockage d'une machine : disques et tables de partitions (MBR), systèmes de fichiers
 * et signatures (ext4, swap, LVM), volumes LVM. Les systèmes montés restent dans
 * `machine.disks` (ce que voit `df`) ; ce module fait le lien entre les deux.
 *
 * Unités : secteurs de 512 octets, extents LVM de 4 Mio, blocs ext4 de 4 Kio.
 */
import { seedFromString } from '@core/random/rng';
import type { Disk, Machine } from './types';

/** Taille d'un secteur. */
export const SECTOR = 512;
/** Taille d'un extent LVM. */
export const EXTENT = 4 * 1024 * 1024;
/** Premier secteur utilisable d'un disque (alignement sur 1 Mio). */
export const FIRST_SECTOR = 2048;

/** Partition d'une table MBR. */
export interface Partition {
  readonly number: number;
  /** Premier et dernier secteur (inclus). */
  readonly start: number;
  readonly end: number;
  /** Identifiant de type MBR en hexadécimal (`83` Linux, `8e` LVM, `82` swap, `5` étendue). */
  readonly type: string;
  readonly boot?: boolean;
}

/** Disque physique (ou virtuel) de la machine. */
export interface BlockDisk {
  /** Nom du noyau (`sda`, `sdb`). */
  readonly name: string;
  readonly size: number;
  /** Table de partitions MBR, ou `null` pour un disque vierge. */
  readonly label: 'dos' | null;
  readonly diskId: string;
  readonly partitions: readonly Partition[];
}

/** Signature trouvée sur un périphérique (système de fichiers, swap, volume physique). */
export interface Signature {
  readonly type: 'ext4' | 'swap' | 'LVM2_member';
  readonly uuid: string;
  readonly label?: string;
  /** Taille du système de fichiers (octets) : elle peut rester sous celle du volume. */
  readonly size: number;
}

/** Groupe de volumes LVM. */
export interface VolumeGroup {
  readonly name: string;
  /** Volumes physiques (chemins `/dev/sdb1`). */
  readonly pvs: readonly string[];
}

/** Volume logique LVM. */
export interface LogicalVolume {
  readonly name: string;
  readonly vg: string;
  readonly extents: number;
}

/** Stockage complet. */
export interface Storage {
  readonly disks: readonly BlockDisk[];
  /** Signatures par périphérique (`/dev/sdb1`, `/dev/mapper/vg-lv`). */
  readonly signatures: Readonly<Record<string, Signature>>;
  /** Volumes physiques initialisés (`pvcreate`). */
  readonly pvs: readonly string[];
  readonly vgs: readonly VolumeGroup[];
  readonly lvs: readonly LogicalVolume[];
}

/** Stockage vide. */
export const EMPTY_STORAGE: Storage = { disks: [], signatures: {}, pvs: [], vgs: [], lvs: [] };

/** Stockage de la machine (vide si elle n'en décrit pas). */
export function storageOf(machine: Machine): Storage {
  return machine.storage ?? EMPTY_STORAGE;
}

/** Remplace le stockage de la machine. */
export function withStorage(machine: Machine, storage: Storage): Machine {
  return { ...machine, storage };
}

/** UUID stable (format 8-4-4-4-12), dérivé d'une graine texte. */
export function stableUuid(seed: string): string {
  const hex = [0, 1, 2, 3]
    .map((i) => seedFromString(`${seed}:${i}`).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** UUID au format de LVM (6-4-4-4-4-4-6, alphanumérique). */
export function lvmUuid(seed: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++)
    text += alphabet.charAt(seedFromString(`${seed}:${i}`) % alphabet.length);
  return [6, 4, 4, 4, 4, 4, 6]
    .reduce<{ parts: string[]; pos: number }>(
      (acc, len) => ({
        parts: [...acc.parts, text.slice(acc.pos, acc.pos + len)],
        pos: acc.pos + len,
      }),
      { parts: [], pos: 0 },
    )
    .parts.join('-');
}

/** Chemin d'une partition (`/dev/sdb1`). */
export function partitionPath(disk: string, number: number): string {
  return `/dev/${disk}${number}`;
}

/** Chemin d'un volume logique sous /dev/mapper (les tirets du nom sont doublés). */
export function mapperPath(vg: string, lv: string): string {
  return `/dev/mapper/${vg.replace(/-/g, '--')}-${lv.replace(/-/g, '--')}`;
}

/** Périphérique de bloc vu par les commandes. */
export type BlockDevice =
  | {
      readonly kind: 'disk';
      readonly path: string;
      readonly disk: BlockDisk;
      readonly size: number;
    }
  | {
      readonly kind: 'part';
      readonly path: string;
      readonly disk: BlockDisk;
      readonly partition: Partition;
      readonly size: number;
    }
  | {
      readonly kind: 'lv';
      readonly path: string;
      readonly lv: LogicalVolume;
      readonly size: number;
    };

/** Taille d'une partition (octets). */
export function partitionSize(p: Partition): number {
  return (p.end - p.start + 1) * SECTOR;
}

/**
 * Retrouve un périphérique par son chemin : disque, partition, volume logique
 * (`/dev/vg/lv` ou `/dev/mapper/vg-lv`).
 *
 * @param machine - Machine simulée.
 * @param path - Chemin du périphérique.
 * @returns Le périphérique, ou `null`.
 */
export function findDevice(machine: Machine, path: string): BlockDevice | null {
  const storage = storageOf(machine);
  for (const disk of storage.disks) {
    if (path === `/dev/${disk.name}`) return { kind: 'disk', path, disk, size: disk.size };
    for (const partition of disk.partitions) {
      if (path === partitionPath(disk.name, partition.number))
        return { kind: 'part', path, disk, partition, size: partitionSize(partition) };
    }
  }
  for (const lv of storage.lvs) {
    if (path === `/dev/${lv.vg}/${lv.name}` || path === mapperPath(lv.vg, lv.name))
      return { kind: 'lv', path: mapperPath(lv.vg, lv.name), lv, size: lv.extents * EXTENT };
  }
  return null;
}

/** Chemin canonique d'un périphérique (les volumes logiques passent par /dev/mapper). */
export function canonicalPath(machine: Machine, path: string): string {
  return findDevice(machine, path)?.path ?? path;
}

/** Nombre d'extents d'un volume physique (1 Mio réservé aux métadonnées). */
export function pvExtents(machine: Machine, pv: string): number {
  const device = findDevice(machine, pv);
  return device ? Math.floor((device.size - 1024 * 1024) / EXTENT) : 0;
}

/** Extents total et libres d'un groupe de volumes. */
export function vgExtents(machine: Machine, vg: VolumeGroup): { total: number; free: number } {
  const total = vg.pvs.reduce((sum, pv) => sum + pvExtents(machine, pv), 0);
  const used = storageOf(machine)
    .lvs.filter((lv) => lv.vg === vg.name)
    .reduce((sum, lv) => sum + lv.extents, 0);
  return { total, free: total - used };
}

/** Groupe de volumes d'un volume physique. */
export function vgOfPv(machine: Machine, pv: string): VolumeGroup | undefined {
  return storageOf(machine).vgs.find((vg) => vg.pvs.includes(pv));
}

/** Montage d'un périphérique, s'il est monté. */
export function mountOf(machine: Machine, path: string): Disk | undefined {
  const canonical = canonicalPath(machine, path);
  return machine.disks.find((d) => d.device === canonical);
}

/**
 * Taille au format d'util-linux (`lsblk`) : base 1024, une décimale au besoin,
 * virgule décimale française.
 *
 * @param bytes - Taille.
 * @returns Par exemple `20G`, `975M`, `9,5G`, `1K`.
 */
export function humanBlockSize(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text}${units[index] ?? ''}`;
}

/**
 * Taille au format de fdisk (« 10 GiB », « 500 MiB »).
 *
 * @param bytes - Taille.
 * @returns La taille avec une unité binaire à trois lettres.
 */
export function humanFdiskSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[index] ?? ''}`;
}

/**
 * Taille au format de LVM (`pvs`, `vgs`, `lvs`) : gibioctets à deux décimales, « < »
 * quand la valeur affichée est arrondie au-dessus de la valeur réelle.
 *
 * @param bytes - Taille.
 * @returns Par exemple `<10,00g` ou `5,00g`.
 */
export function lvmSize(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  if (gib < 1) {
    const mib = bytes / 1024 ** 2;
    const shown = Math.round(mib * 100) / 100;
    return `${shown > mib + 1e-9 ? '<' : ''}${shown.toFixed(2).replace('.', ',')}m`;
  }
  const shown = Math.round(gib * 100) / 100;
  return `${shown > gib + 1e-9 ? '<' : ''}${shown.toFixed(2).replace('.', ',')}g`;
}

/**
 * Lit une taille saisie (`5G`, `500M`, `+2G`, `1024`) en octets.
 *
 * @param text - Taille avec unité facultative (K, M, G, T ; « iB » accepté).
 * @param defaultUnit - Unité sans suffixe (secteurs pour fdisk : 512 ; Mio pour LVM).
 * @returns Les octets, ou `null`.
 */
export function parseUnitSize(text: string, defaultUnit: number): number | null {
  const match = /^(\d+(?:[.,]\d+)?)([KMGTP])?(?:i?B)?$/i.exec(text);
  if (!match) return null;
  const value = Number((match[1] ?? '').replace(',', '.'));
  const unit = (match[2] ?? '').toUpperCase();
  const factor = unit ? 1024 ** ('KMGTP'.indexOf(unit) + 1) : defaultUnit;
  return Math.round(value * factor);
}

/** Libellé d'un type de partition MBR (tel que fdisk l'affiche). */
export function partitionTypeName(type: string): string {
  const names: Record<string, string> = {
    '83': 'Linux',
    '8e': 'Linux LVM',
    '82': 'Linux swap / Solaris',
    '5': 'Extended',
    '7': 'HPFS/NTFS/exFAT',
    b: 'W95 FAT32',
    c: 'W95 FAT32 (LBA)',
    fd: 'Linux raid autodetect',
  };
  return names[type] ?? 'Unknown';
}

/**
 * Stockage initial d'un serveur Debian installé en partitionnement guidé : un disque
 * `sda` (racine, partition étendue, swap, partitions des montages de la mission),
 * plus des disques vierges ajoutés par la mission.
 *
 * @param hostname - Nom de la machine (graine des identifiants).
 * @param mounted - Systèmes de fichiers réels montés (ceux de `df`).
 * @param extraDisks - Disques supplémentaires vierges (`sdb`, 10 Gio…).
 * @param uuidOf - UUID d'un périphérique, identique à celui de /etc/fstab.
 * @returns Le stockage.
 */
export function initialStorage(
  hostname: string,
  mounted: readonly Disk[],
  extraDisks: readonly { readonly name: string; readonly size: number }[],
  uuidOf: (device: string) => string,
): Storage {
  const sectors = (bytes: number) => Math.ceil(bytes / SECTOR);
  const partitions: Partition[] = [];
  const signatures: Record<string, Signature> = {};
  let cursor = FIRST_SECTOR;
  const onSda = mounted.filter((d) => /^\/dev\/sda\d+$/.test(d.device));
  for (const disk of onSda) {
    const number = Number(disk.device.slice('/dev/sda'.length));
    const end = cursor + sectors(disk.size) - 1;
    partitions.push({
      number,
      start: cursor,
      end,
      type: '83',
      ...(number === 1 ? { boot: true } : {}),
    });
    signatures[disk.device] = { type: 'ext4', uuid: uuidOf(disk.device), size: disk.size };
    cursor = end + 1;
  }
  // Swap de l'installation guidée, dans une partition étendue.
  const swapSize = 975 * 1024 * 1024;
  const extendedStart = cursor + 2046;
  partitions.push({
    number: 2,
    start: extendedStart,
    end: extendedStart + sectors(swapSize) + 1,
    type: '5',
  });
  partitions.push({
    number: 5,
    start: extendedStart + 2,
    end: extendedStart + 1 + sectors(swapSize),
    type: '82',
  });
  signatures['/dev/sda5'] = { type: 'swap', uuid: stableUuid(`${hostname}:swap`), size: swapSize };
  const sdaEnd = extendedStart + sectors(swapSize) + 2;
  const disks: BlockDisk[] = [
    {
      name: 'sda',
      size: Math.ceil((sdaEnd + 1) / 2048) * 2048 * SECTOR,
      label: 'dos',
      diskId: `0x${seedFromString(`${hostname}:sda`).toString(16).padStart(8, '0')}`,
      partitions: partitions.sort((a, b) => a.number - b.number),
    },
    ...extraDisks.map((d) => ({
      name: d.name,
      size: d.size,
      label: null,
      diskId: `0x${seedFromString(`${hostname}:${d.name}`).toString(16).padStart(8, '0')}`,
      partitions: [],
    })),
  ];
  return { disks, signatures, pvs: [], vgs: [], lvs: [] };
}
