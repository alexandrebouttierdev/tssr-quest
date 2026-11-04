/**
 * Session interactive de `fdisk` (util-linux 2.38) sur une table MBR : la table est
 * modifiée en mémoire, puis écrite sur le disque par `w` ou abandonnée par `q`.
 * Chaque question passe par une question en attente du shell (`session.pending`).
 */
import { z } from 'zod';
import { seedFromString } from '@core/random/rng';
import {
  FIRST_SECTOR,
  humanBlockSize,
  humanFdiskSize,
  mountOf,
  parseUnitSize,
  partitionPath,
  partitionTypeName,
  SECTOR,
  storageOf,
  withStorage,
  type BlockDisk,
  type Partition,
} from '@sims/shared/storage';
import type { Machine } from '@sims/shared/types';

/** Table en cours d'édition. */
export interface FdiskSession {
  readonly disk: string;
  readonly diskId: string;
  readonly partitions: readonly Partition[];
}

/** Étape de la conversation. */
export type FdiskStep =
  'command' | 'n-type' | 'n-number' | 'n-first' | 'n-last' | 't-number' | 't-code' | 'd-number';

/** État complet, sérialisé dans la question en attente. */
export interface FdiskState {
  readonly session: FdiskSession;
  readonly step: FdiskStep;
  /** Valeurs déjà saisies pour `n` ou `t`. */
  readonly kind?: 'p' | 'e';
  readonly number?: number;
  readonly first?: number;
}

/** Schéma de relecture de l'état (frontière : données de la question en attente). */
const stateSchema = z.object({
  session: z.object({
    disk: z.string(),
    diskId: z.string(),
    partitions: z.array(
      z.object({
        number: z.number(),
        start: z.number(),
        end: z.number(),
        type: z.string(),
        boot: z.boolean().optional(),
      }),
    ),
  }),
  step: z.enum([
    'command',
    'n-type',
    'n-number',
    'n-first',
    'n-last',
    't-number',
    't-code',
    'd-number',
  ]),
  kind: z.enum(['p', 'e']).optional(),
  number: z.number().optional(),
  first: z.number().optional(),
});

/** Encode l'état pour la question en attente. */
export function encodeFdisk(state: FdiskState): string {
  return JSON.stringify(state);
}

/** Relit l'état de la question en attente. */
export function decodeFdisk(text: string): FdiskState | null {
  try {
    const parsed = stateSchema.safeParse(JSON.parse(text) as unknown);
    if (!parsed.success) return null;
    const { session, step, kind, number, first } = parsed.data;
    return {
      session: {
        disk: session.disk,
        diskId: session.diskId,
        partitions: session.partitions.map((p) => ({
          number: p.number,
          start: p.start,
          end: p.end,
          type: p.type,
          ...(p.boot ? { boot: true } : {}),
        })),
      },
      step,
      ...(kind ? { kind } : {}),
      ...(number !== undefined ? { number } : {}),
      ...(first !== undefined ? { first } : {}),
    };
  } catch {
    return null;
  }
}

/** Invite de chaque étape. */
export function fdiskPrompt(state: FdiskState, machine: Machine): string {
  const disk = diskOf(machine, state.session.disk);
  switch (state.step) {
    case 'command':
      return 'Command (m for help): ';
    case 'n-type':
      return 'Select (default p): ';
    case 'n-number': {
      const free = freeNumbers(state.session);
      return `Partition number (${free[0] ?? 1}-${free.at(-1) ?? 4}, default ${free[0] ?? 1}): `;
    }
    case 'n-first': {
      const gap = firstGap(state.session, disk);
      return `First sector (${gap?.start ?? FIRST_SECTOR}-${lastSector(disk)}, default ${gap?.start ?? FIRST_SECTOR}): `;
    }
    case 'n-last': {
      const end = gapEnd(state.session, disk, state.first ?? FIRST_SECTOR);
      return `Last sector, +/-sectors or +/-size{K,M,G,T,P} (${state.first ?? FIRST_SECTOR}-${end}, default ${end}): `;
    }
    case 't-number':
    case 'd-number': {
      const numbers = state.session.partitions.map((p) => p.number);
      return `Partition number (${numbers.join(',')}, default ${numbers.at(-1) ?? 1}): `;
    }
    case 't-code':
      return 'Hex code or alias (type L to list all): ';
  }
}

/** Disque de la machine (un disque vide factice s'il n'existe pas). */
function diskOf(machine: Machine, name: string): BlockDisk {
  return (
    storageOf(machine).disks.find((d) => d.name === name) ?? {
      name,
      size: 0,
      label: null,
      diskId: '0x0',
      partitions: [],
    }
  );
}

/** Dernier secteur du disque. */
function lastSector(disk: BlockDisk): number {
  return Math.floor(disk.size / SECTOR) - 1;
}

/** Numéros de partition primaire libres. */
function freeNumbers(session: FdiskSession): number[] {
  return [1, 2, 3, 4].filter((n) => !session.partitions.some((p) => p.number === n));
}

/** Plages libres (hors partitions primaires et étendues). */
function gaps(session: FdiskSession, disk: BlockDisk): { start: number; end: number }[] {
  const used = session.partitions.filter((p) => p.number <= 4).sort((a, b) => a.start - b.start);
  const result: { start: number; end: number }[] = [];
  let cursor = FIRST_SECTOR;
  for (const p of used) {
    if (p.start > cursor) result.push({ start: cursor, end: p.start - 1 });
    cursor = Math.max(cursor, p.end + 1);
  }
  // Alignement sur 1 Mio, comme fdisk.
  cursor = Math.ceil(cursor / 2048) * 2048;
  if (cursor <= lastSector(disk)) result.push({ start: cursor, end: lastSector(disk) });
  return result.filter((g) => g.end - g.start >= 2047);
}

/** Première plage libre. */
function firstGap(
  session: FdiskSession,
  disk: BlockDisk,
): { start: number; end: number } | undefined {
  return gaps(session, disk)[0];
}

/** Fin de la plage libre qui contient un secteur. */
function gapEnd(session: FdiskSession, disk: BlockDisk, sector: number): number {
  return (
    gaps(session, disk).find((g) => sector >= g.start && sector <= g.end)?.end ?? lastSector(disk)
  );
}

/**
 * Description d'un disque (en-tête de `fdisk -l` et de la commande `p`).
 *
 * @param path - Chemin du disque.
 * @param size - Taille (octets).
 * @param model - Modèle affiché, ou `null` pour un volume logique.
 * @returns Les lignes d'en-tête.
 */
export function diskHeader(path: string, size: number, model: string | null): string {
  return (
    `Disk ${path}: ${humanFdiskSize(size)}, ${size} bytes, ${Math.floor(size / SECTOR)} sectors\n` +
    (model ? `Disk model: ${model}\n` : '') +
    'Units: sectors of 1 * 512 = 512 bytes\n' +
    'Sector size (logical/physical): 512 bytes / 512 bytes\n' +
    'I/O size (minimum/optimal): 512 bytes / 512 bytes\n'
  );
}

/**
 * Table de partitions d'un disque, au format de `fdisk -l`.
 *
 * @param disk - Nom du disque.
 * @param diskId - Identifiant MBR.
 * @param partitions - Partitions.
 * @returns Les lignes « Disklabel type » et le tableau.
 */
export function partitionTable(
  disk: string,
  diskId: string,
  partitions: readonly Partition[],
): string {
  const text = `Disklabel type: dos\nDisk identifier: ${diskId}\n`;
  if (partitions.length === 0) return text;
  const rows = [...partitions]
    .sort((a, b) => a.number - b.number)
    .map((p) => [
      partitionPath(disk, p.number),
      p.boot ? '*' : '',
      String(p.start),
      String(p.end),
      String(p.end - p.start + 1),
      humanBlockSize((p.end - p.start + 1) * SECTOR),
      p.type,
      partitionTypeName(p.type),
    ]);
  const header = ['Device', 'Boot', 'Start', 'End', 'Sectors', 'Size', 'Id', 'Type'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) =>
    cells
      .map((cell, i) =>
        i === 0 || i === 1 || i === 7 ? cell.padEnd(widths[i] ?? 0) : cell.padStart(widths[i] ?? 0),
      )
      .join(' ')
      .trimEnd();
  return `${text}\n${[header, ...rows].map(line).join('\n')}\n`;
}

/** Aide de la commande `m`. */
const HELP = `
Help:

  DOS (MBR)
   a   toggle a bootable flag
   b   edit nested BSD disklabel
   c   toggle the dos compatibility flag

  Generic
   d   delete a partition
   F   list free unpartitioned space
   l   list known partition types
   n   add a new partition
   p   print the partition table
   t   change a partition type
   v   verify the partition table
   i   print information about a partition

  Misc
   m   print this menu
   u   change display/entry units
   x   extra functionality (experts only)

  Script
   I   load disk layout from sfdisk script file
   O   dump disk layout to sfdisk script file

  Save & Exit
   w   write table to disk and exit
   q   quit without saving changes

  Create a new label
   g   create a new empty GPT partition table
   G   create a new empty SGI (IRIX) partition table
   o   create a new empty MBR (DOS) partition table
   s   create a new empty Sun partition table

`;

/** Liste courte des types (commande `l` et `L`). */
const TYPE_LIST = ` 5  Extended          82  Linux swap / So   83  Linux             8e  Linux LVM\n 7  HPFS/NTFS/exFAT    b  W95 FAT32          c  W95 FAT32 (LBA)   fd  Linux raid auto\n\nAliases:\n   linux          - 83\n   swap           - 82\n   extended       - 05\n   uefi           - EF\n   raid           - FD\n   lvm            - 8E\n   linuxex        - 85\n`;

/** Types acceptés (code hexadécimal ou alias). */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  linux: '83',
  swap: '82',
  extended: '5',
  lvm: '8e',
  raid: 'fd',
  '83': '83',
  '82': '82',
  '8e': '8e',
  '5': '5',
  '05': '5',
  '7': '7',
  b: 'b',
  c: 'c',
  fd: 'fd',
};

/**
 * Ouvre `fdisk` sur un disque : message d'accueil et première invite.
 *
 * @param machine - Machine simulée.
 * @param name - Nom du disque (`sdb`).
 * @returns Le texte d'accueil et l'état de départ.
 */
export function startFdisk(machine: Machine, name: string): { text: string; state: FdiskState } {
  const disk = diskOf(machine, name);
  let text =
    'Welcome to fdisk (util-linux 2.38.1).\nChanges will remain in memory only, until you decide to write them.\nBe careful before using the write command.\n\n';
  if (disk.partitions.some((p) => mountOf(machine, partitionPath(name, p.number)))) {
    text +=
      "This disk is currently in use - repartitioning is probably a bad idea.\nIt's recommended to umount all file systems, and swapoff all swap\npartitions on this disk.\n\n";
  }
  let diskId = disk.diskId;
  if (disk.label === null) {
    diskId = `0x${seedFromString(`fdisk:${name}:${disk.size}`).toString(16).padStart(8, '0')}`;
    text += `Device does not contain a recognized partition table.\nCreated a new DOS (MBR) disklabel with disk identifier ${diskId}.\n\n`;
  }
  return {
    text,
    state: { session: { disk: name, diskId, partitions: disk.partitions }, step: 'command' },
  };
}

/** Résultat d'une réponse : texte affiché, étape suivante (ou fin), machine écrite. */
export interface FdiskResult {
  readonly text: string;
  readonly next: FdiskState | null;
  readonly machine?: Machine;
}

/** Repasse à l'invite de commande. */
function back(session: FdiskSession, text: string): FdiskResult {
  return { text, next: { session, step: 'command' } };
}

/**
 * Traite une réponse saisie dans `fdisk`.
 *
 * @param machine - Machine simulée.
 * @param state - État courant.
 * @param answer - Ligne tapée.
 * @returns Le texte, l'état suivant et, après `w`, la machine modifiée.
 */
export function answerFdisk(machine: Machine, state: FdiskState, answer: string): FdiskResult {
  const input = answer.trim();
  const session = state.session;
  const disk = diskOf(machine, session.disk);
  switch (state.step) {
    case 'command':
      return fdiskCommand(machine, state, input, disk);
    case 'n-type': {
      const kind = input === '' ? 'p' : input;
      if (kind !== 'p' && kind !== 'e')
        return { text: `Invalid partition type \`${kind}'.\n`, next: state };
      return { text: '', next: { ...state, step: 'n-number', kind } };
    }
    case 'n-number': {
      const free = freeNumbers(session);
      const number = input === '' ? free[0] : Number(input);
      if (number === undefined || !free.includes(number))
        return { text: 'Value out of range.\n', next: state };
      return { text: '', next: { ...state, step: 'n-first', number } };
    }
    case 'n-first': {
      const gap = firstGap(session, disk);
      const first = input === '' ? (gap?.start ?? FIRST_SECTOR) : Number(input);
      const inGap = gaps(session, disk).some((g) => first >= g.start && first <= g.end);
      if (!Number.isInteger(first) || !inGap) return { text: 'Value out of range.\n', next: state };
      return { text: '', next: { ...state, step: 'n-last', first } };
    }
    case 'n-last': {
      const first = state.first ?? FIRST_SECTOR;
      const max = gapEnd(session, disk, first);
      let last: number | null;
      if (input === '') last = max;
      else if (input.startsWith('+')) {
        const bytes = parseUnitSize(input.slice(1), SECTOR);
        last = bytes === null ? null : first + Math.ceil(bytes / SECTOR) - 1;
      } else last = /^\d+$/.test(input) ? Number(input) : null;
      if (last === null || last < first || last > max)
        return { text: 'Value out of range.\n', next: state };
      const number = state.number ?? 1;
      const type = state.kind === 'e' ? '5' : '83';
      const partitions = [...session.partitions, { number, start: first, end: last, type }].sort(
        (a, b) => a.number - b.number,
      );
      return back(
        { ...session, partitions },
        `\nCreated a new partition ${number} of type '${partitionTypeName(type)}' and of size ${humanFdiskSize((last - first + 1) * SECTOR)}.\n\n`,
      );
    }
    case 't-number':
    case 'd-number': {
      const numbers = session.partitions.map((p) => p.number);
      const number = input === '' ? numbers.at(-1) : Number(input);
      if (number === undefined || !numbers.includes(number))
        return { text: 'Value out of range.\n', next: state };
      if (state.step === 'd-number') return deletePartition(session, number);
      return { text: '', next: { ...state, step: 't-code', number } };
    }
    case 't-code': {
      if (input === 'L' || input === 'l') return { text: TYPE_LIST, next: state };
      const type = TYPE_ALIASES[input.toLowerCase()];
      if (!type)
        return {
          text: `Type 0 means free space to many systems. Having partitions of type 0 is probably unwise.\nFailed to change type of partition ${state.number ?? 1}.\n\n`,
          next: { session, step: 'command' },
        };
      const before = session.partitions.find((p) => p.number === state.number);
      const partitions = session.partitions.map((p) =>
        p.number === state.number ? { ...p, type } : p,
      );
      return back(
        { ...session, partitions },
        `Changed type of partition '${partitionTypeName(before?.type ?? '83')}' to '${partitionTypeName(type)}'.\n\n`,
      );
    }
  }
}

/** Supprime une partition de la table en mémoire. */
function deletePartition(session: FdiskSession, number: number): FdiskResult {
  const partitions = session.partitions.filter(
    (p) =>
      p.number !== number &&
      !(session.partitions.find((x) => x.number === number)?.type === '5' && p.number > 4),
  );
  return back({ ...session, partitions }, `Partition ${number} has been deleted.\n\n`);
}

/** Commandes à une lettre. */
function fdiskCommand(
  machine: Machine,
  state: FdiskState,
  input: string,
  disk: BlockDisk,
): FdiskResult {
  const session = state.session;
  switch (input) {
    case '':
      return { text: '', next: state };
    case 'm':
      return { text: HELP, next: state };
    case 'l':
      return { text: TYPE_LIST, next: state };
    case 'p':
      return {
        text: `${diskHeader(`/dev/${session.disk}`, disk.size, 'VMware Virtual S')}${partitionTable(session.disk, session.diskId, session.partitions)}\n`,
        next: state,
      };
    case 'v': {
      const free = gaps(session, disk).reduce((sum, g) => sum + g.end - g.start + 1, 0);
      return { text: `Remaining ${free} unallocated 512-byte sectors.\n\n`, next: state };
    }
    case 'o':
      return back(
        { ...session, partitions: [] },
        `Created a new DOS (MBR) disklabel with disk identifier ${session.diskId}.\n\n`,
      );
    case 'n': {
      const primaries = session.partitions.filter((p) => p.number <= 4);
      const free = freeNumbers(session);
      if (free.length === 0 || gaps(session, disk).length === 0)
        return {
          text: 'To create more partitions, first replace a primary with an extended partition.\n\n',
          next: state,
        };
      const extended = primaries.filter((p) => p.type === '5').length;
      return {
        text: `Partition type\n   p   primary (${primaries.length - extended} primary, ${extended} extended, ${free.length} free)\n   e   extended (container for logical partitions)\n`,
        next: { session, step: 'n-type' },
      };
    }
    case 't':
    case 'd': {
      if (session.partitions.length === 0)
        return { text: 'No partition is defined yet!\n\n', next: state };
      if (session.partitions.length === 1) {
        const only = session.partitions[0]?.number ?? 1;
        const selected = `Selected partition ${only}\n`;
        if (input === 'd') {
          const result = deletePartition(session, only);
          return { ...result, text: selected + result.text };
        }
        return { text: selected, next: { session, step: 't-code', number: only } };
      }
      return { text: '', next: { session, step: input === 'd' ? 'd-number' : 't-number' } };
    }
    case 'q':
      return { text: '\n', next: null };
    case 'w':
      return writeTable(machine, session);
    default:
      if (/^[abcFiuxIOgGs]$/.test(input))
        return {
          text: `${input}: (commande non disponible dans cette simulation)\n\n`,
          next: state,
        };
      return { text: `${input}: unknown command\n`, next: state };
  }
}

/** Écrit la table sur le disque (`w`) : les signatures des partitions disparues partent aussi. */
function writeTable(machine: Machine, session: FdiskSession): FdiskResult {
  const storage = storageOf(machine);
  const disk = storage.disks.find((d) => d.name === session.disk);
  if (!disk) return { text: '', next: null };
  const kept = new Set(
    session.partitions
      .filter((p) =>
        disk.partitions.some((old) => old.number === p.number && old.start === p.start),
      )
      .map((p) => partitionPath(disk.name, p.number)),
  );
  const signatures = Object.fromEntries(
    Object.entries(storage.signatures).filter(
      ([path]) =>
        !path.startsWith(`/dev/${disk.name}`) || kept.has(path) || path === `/dev/${disk.name}`,
    ),
  );
  const busy = disk.partitions.some((p) => mountOf(machine, partitionPath(disk.name, p.number)));
  const next = withStorage(machine, {
    ...storage,
    signatures,
    pvs: storage.pvs.filter((pv) => !pv.startsWith(`/dev/${disk.name}`) || kept.has(pv)),
    disks: storage.disks.map((d) =>
      d.name === disk.name
        ? { ...d, label: 'dos', diskId: session.diskId, partitions: session.partitions }
        : d,
    ),
  });
  const text = busy
    ? 'The partition table has been altered.\nCalling ioctl() to re-read partition table.\nRe-reading the partition table failed.: Périphérique ou ressource occupé\n\nThe kernel still uses the old table. The new table will be used at the next reboot or after you run partprobe(8) or partx(8).\n\nSyncing disks.\n\n'
    : 'The partition table has been altered.\nCalling ioctl() to re-read partition table.\nSyncing disks.\n\n';
  return { text, next: null, machine: next };
}
