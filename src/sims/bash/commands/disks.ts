import { diskUsage } from '@sims/shared/disks';
import { statPath } from '@sims/shared/fs';
import { isInside, normalizePath } from '@sims/shared/path';
import { formatHumanSize } from '@sims/shared/size';
import {
  canonicalPath,
  EXTENT,
  findDevice,
  humanBlockSize,
  lvmSize,
  mapperPath,
  mountOf,
  parseUnitSize,
  partitionPath,
  pvExtents,
  storageOf,
  vgExtents,
  vgOfPv,
  withStorage,
  type LogicalVolume,
  type Storage,
} from '@sims/shared/storage';
import type { Disk, Machine } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { diskHeader, encodeFdisk, fdiskPrompt, partitionTable, startFdisk } from '../fdisk';
import { withPending } from '../pending';
import { createPv, makeExt4, MKE2FS_BANNER } from '../storage-ops';

/** Rappel qu'ajoute util-linux à chaque échec de montage. */
const DMESG = '       dmesg(1) may have more information after failed mount system call.\n';

// --- Recherche des périphériques ---------------------------------------------------------

/**
 * Résout une désignation de périphérique : chemin, `UUID=…`, `LABEL=…`.
 *
 * @param machine - Machine simulée.
 * @param spec - Désignation.
 * @returns Le chemin canonique, ou `null`.
 */
export function resolveSpec(machine: Machine, spec: string): string | null {
  const storage = storageOf(machine);
  const match = /^(UUID|LABEL)=["']?([^"']+)["']?$/.exec(spec);
  if (match) {
    const key = match[1] === 'UUID' ? 'uuid' : 'label';
    const found = Object.entries(storage.signatures).find(([, sig]) => sig[key] === match[2]);
    return found?.[0] ?? null;
  }
  const device = findDevice(machine, spec);
  return device ? device.path : null;
}

/** MAJ:MIN d'un disque ou d'une partition (8:16 pour sdb, 8:17 pour sdb1). */
function majMin(diskIndex: number, partition = 0): string {
  return `${String(8).padStart(3)}:${String(diskIndex * 16 + partition).padEnd(3)}`;
}

/** Point de montage affiché par lsblk. */
function mountpoint(machine: Machine, path: string): string {
  if (storageOf(machine).signatures[path]?.type === 'swap') return '[SWAP]';
  return mountOf(machine, path)?.mount ?? '';
}

// --- lsblk ----------------------------------------------------------------------------

/** Ligne de lsblk avant mise en colonnes. */
interface LsblkRow {
  readonly name: string;
  readonly path: string;
  readonly majMin: string;
  readonly rm: string;
  readonly size: number | string;
  readonly type: string;
}

/** Arborescence des périphériques, comme lsblk. */
function lsblkRows(machine: Machine, only: string | null): LsblkRow[] {
  const storage = storageOf(machine);
  const rows: LsblkRow[] = [];
  const lvsUnder = (pv: string): LogicalVolume[] => {
    const vg = vgOfPv(machine, pv);
    return vg && vg.pvs[0] === pv ? storage.lvs.filter((lv) => lv.vg === vg.name) : [];
  };
  storage.disks.forEach((disk, diskIndex) => {
    if (only && only !== `/dev/${disk.name}`) return;
    rows.push({
      name: disk.name,
      path: `/dev/${disk.name}`,
      majMin: majMin(diskIndex),
      rm: '0',
      size: disk.size,
      type: 'disk',
    });
    const parts = [...disk.partitions].sort((a, b) => a.number - b.number);
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const path = partitionPath(disk.name, p.number);
      rows.push({
        name: `${last ? '└─' : '├─'}${disk.name}${p.number}`,
        path,
        majMin: majMin(diskIndex, p.number),
        rm: '0',
        // Une partition étendue n'occupe qu'un secteur de description.
        size: p.type === '5' ? '1K' : (p.end - p.start + 1) * 512,
        type: 'part',
      });
      const lvs = lvsUnder(path);
      lvs.forEach((lv, j) => {
        const mapper = mapperPath(lv.vg, lv.name);
        rows.push({
          name: `${last ? '  ' : '│ '}${j === lvs.length - 1 ? '└─' : '├─'}${lv.vg}-${lv.name}`,
          path: mapper,
          majMin: `${String(254).padStart(3)}:${String(storage.lvs.indexOf(lv)).padEnd(3)}`,
          rm: '0',
          size: lv.extents * EXTENT,
          type: 'lvm',
        });
      });
    });
  });
  if (!only)
    rows.push({
      name: 'sr0',
      path: '/dev/sr0',
      majMin: ` 11:0  `,
      rm: '1',
      size: '1024M',
      type: 'rom',
    });
  return rows;
}

/** Commande `lsblk` : disques, partitions et volumes en arbre. */
export const lsblk: BashCommand = {
  name: 'lsblk',
  summary: 'liste les disques, partitions et volumes sous forme d’arbre',
  package: 'util-linux',
  manual: `NOM
       lsblk - lister les périphériques de stockage (blocs)

SYNOPSIS
       lsblk [-f] [PÉRIPHÉRIQUE]

DESCRIPTION
       Affiche disques, partitions et volumes logiques en arbre, avec leur
       taille, leur type et leur point de montage. Premier réflexe quand un
       nouveau disque est branché (il apparaît sans partition : sdb, sdc…).

       -f   systèmes de fichiers : type, étiquette, UUID, place libre`,
  run(args, env) {
    const fs = args.includes('-f') || args.includes('--fs');
    const only = args.find((a) => !a.startsWith('-')) ?? null;
    if (only && !findDevice(env.machine, only))
      return { stderr: `lsblk: ${only}: not a block device\n`, exitCode: 32 };
    const rows = lsblkRows(env.machine, only ? canonicalPath(env.machine, only) : null);
    const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
    const size = (r: LsblkRow) => (typeof r.size === 'number' ? humanBlockSize(r.size) : r.size);
    if (!fs) {
      const lines = rows.map(
        (r) =>
          `${r.name.padEnd(nameWidth)} ${r.majMin} ${r.rm.padStart(2)} ${size(r).padStart(5)}  0 ${r.type.padEnd(4)} ${mountpoint(env.machine, r.path)}`,
      );
      return {
        stdout: `${'NAME'.padEnd(nameWidth)} MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\n${lines.join('\n')}\n`,
        exitCode: 0,
      };
    }
    const signatures = storageOf(env.machine).signatures;
    const table = rows.map((r) => {
      const sig = signatures[r.path];
      const mounted = mountOf(env.machine, r.path);
      const used = mounted ? diskUsage(env.machine, mounted) : 0;
      return [
        r.name,
        sig?.type ?? '',
        sig ? (sig.type === 'ext4' ? '1.0' : sig.type === 'swap' ? '1' : 'LVM2 001') : '',
        sig?.label ?? '',
        sig?.uuid ?? '',
        mounted ? formatHumanSize(Math.max(0, mounted.size - used)).replace('.', ',') : '',
        mounted ? `${Math.ceil((used / mounted.size) * 100)}%` : '',
        mountpoint(env.machine, r.path),
      ];
    });
    const header = ['NAME', 'FSTYPE', 'FSVER', 'LABEL', 'UUID', 'FSAVAIL', 'FSUSE%', 'MOUNTPOINTS'];
    const widths = header.map((h, i) =>
      Math.max(h.length, ...table.map((row) => (row[i] ?? '').length)),
    );
    const line = (cells: string[]) =>
      cells
        .map((c, i) => (i === 5 || i === 6 ? c.padStart(widths[i] ?? 0) : c.padEnd(widths[i] ?? 0)))
        .join(' ')
        .trimEnd();
    return { stdout: `${[header, ...table].map(line).join('\n')}\n`, exitCode: 0 };
  },
};

// --- blkid ----------------------------------------------------------------------------

/** Commande `blkid` : identifiants et types des systèmes de fichiers. */
export const blkid: BashCommand = {
  name: 'blkid',
  summary: 'affiche l’UUID et le type des systèmes de fichiers',
  package: 'util-linux',
  manual: `NOM
       blkid - afficher les attributs des périphériques de blocs

SYNOPSIS
       blkid [PÉRIPHÉRIQUE]

DESCRIPTION
       Donne l'UUID et le type (ext4, swap, LVM2_member) de chaque
       périphérique. L'UUID sert à désigner un système de fichiers dans
       /etc/fstab, plus sûrement que /dev/sdb1 (les noms peuvent changer).`,
  run(args, env) {
    const storage = storageOf(env.machine);
    const only = args.filter((a) => !a.startsWith('-')).map((a) => canonicalPath(env.machine, a));
    let stdout = '';
    const entry = (path: string, partuuid: string | null) => {
      if (only.length > 0 && !only.includes(path)) return;
      const sig = storage.signatures[path];
      const attrs = [
        sig?.label ? `LABEL="${sig.label}"` : '',
        sig ? `UUID="${sig.uuid}"` : '',
        sig?.type === 'ext4' ? 'BLOCK_SIZE="4096"' : '',
        sig ? `TYPE="${sig.type}"` : '',
        partuuid ? `PARTUUID="${partuuid}"` : '',
      ].filter(Boolean);
      if (attrs.length > 0) stdout += `${path}: ${attrs.join(' ')}\n`;
    };
    for (const disk of storage.disks) {
      for (const p of [...disk.partitions].sort((a, b) => a.number - b.number)) {
        entry(
          partitionPath(disk.name, p.number),
          `${disk.diskId.slice(2)}-${String(p.number).padStart(2, '0')}`,
        );
      }
    }
    for (const lv of storage.lvs) entry(mapperPath(lv.vg, lv.name), null);
    return { stdout, exitCode: stdout ? 0 : 2 };
  },
};

// --- fdisk ----------------------------------------------------------------------------

/** Commande `fdisk` : tables de partitions (MBR). */
export const fdisk: BashCommand = {
  name: 'fdisk',
  summary: 'crée et modifie les partitions d’un disque',
  package: 'fdisk',
  manual: `NOM
       fdisk - manipuler la table de partitions d'un disque

SYNOPSIS
       fdisk -l [DISQUE]       fdisk DISQUE

DESCRIPTION
       -l affiche les disques et leurs partitions. Sur un disque, fdisk ouvre
       une session interactive ; rien n'est écrit avant « w ».

       n   nouvelle partition (p : primaire ; Entrée garde la valeur par défaut)
       t   changer le type (8e ou lvm : Linux LVM ; 83 : Linux ; 82 : swap)
       d   supprimer une partition      p   afficher la table
       w   écrire et quitter            q   quitter sans rien écrire

EXEMPLES
       sudo fdisk /dev/sdb     puis n, p, Entrée ×3, t, 8e, w`,
  run(args, env) {
    if (env.user !== 'root') {
      const target = args.find((a) => a.startsWith('/dev/')) ?? '/dev/sda';
      return { stderr: `fdisk: cannot open ${target}: Permission non accordée\n`, exitCode: 1 };
    }
    const storage = storageOf(env.machine);
    if (args.includes('-l')) {
      const only = args.find((a) => a.startsWith('/dev/'));
      const blocks = storage.disks
        .filter((d) => !only || only === `/dev/${d.name}`)
        .map(
          (d) =>
            diskHeader(`/dev/${d.name}`, d.size, 'VMware Virtual S') +
            (d.label ? partitionTable(d.name, d.diskId, d.partitions) : ''),
        );
      if (!only)
        blocks.push(
          ...storage.lvs.map((lv) =>
            diskHeader(mapperPath(lv.vg, lv.name), lv.extents * EXTENT, null),
          ),
        );
      return { stdout: blocks.join('\n'), exitCode: 0 };
    }
    const target = args.find((a) => !a.startsWith('-'));
    if (!target)
      return {
        stderr: "fdisk: bad usage\nTry 'fdisk --help' for more information.\n",
        exitCode: 1,
      };
    const device = findDevice(env.machine, target);
    if (device?.kind !== 'disk')
      return {
        stderr: `fdisk: cannot open ${target}: Aucun fichier ou dossier de ce type\n`,
        exitCode: 1,
      };
    const { text, state } = startFdisk(env.machine, device.disk.name);
    return {
      stdout: text,
      exitCode: 0,
      machine: withPending(env.machine, {
        kind: 'fdisk',
        prompt: fdiskPrompt(state, env.machine),
        secret: false,
        data: { state: encodeFdisk(state) },
      }),
    };
  },
};

// --- mkfs.ext4 ------------------------------------------------------------------------

/** Commande `mkfs.ext4` : crée un système de fichiers ext4. */
export const mkfsExt4: BashCommand = {
  name: 'mkfs.ext4',
  summary: 'formate une partition ou un volume en ext4',
  package: 'e2fsprogs',
  manual: `NOM
       mkfs.ext4 - créer un système de fichiers ext4

SYNOPSIS
       mkfs.ext4 [-L ÉTIQUETTE] PÉRIPHÉRIQUE

DESCRIPTION
       Formate le périphérique : tout son contenu est perdu. Refuse un
       système monté ; demande confirmation s'il trouve déjà une signature.

       -L   étiquette (utilisable dans fstab : LABEL=…)     -F   ne pas demander`,
  run(args, env) {
    let label: string | null = null;
    let force = false;
    let target: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg === '-L') label = args[++i] ?? '';
      else if (arg === '-F') force = true;
      else if (arg === '-q') continue;
      else if (!arg.startsWith('-')) target = arg;
    }
    if (!target) return { stderr: 'Usage: mkfs.ext4 [-L volume-label] device\n', exitCode: 1 };
    const device = findDevice(env.machine, target);
    if (!device)
      return {
        stderr: `${MKE2FS_BANNER}The file ${target} does not exist and no size was specified.\n`,
        exitCode: 1,
      };
    if (env.user !== 'root')
      return {
        stderr: `${MKE2FS_BANNER}Could not open ${target}: Permission non accordée\n`,
        exitCode: 1,
      };
    if (mountOf(env.machine, device.path))
      return {
        stderr: `${MKE2FS_BANNER}${target} is mounted; will not make a filesystem here!\n`,
        exitCode: 1,
      };
    const storage = storageOf(env.machine);
    const counter = Object.keys(storage.signatures).length + env.ctx.rng.int(0, 999);
    const existing = storage.signatures[device.path];
    const partitioned = device.kind === 'disk' && device.disk.partitions.length > 0;
    if (!force && (existing || partitioned)) {
      const warning = partitioned
        ? `Found a dos partition table in ${target}\n`
        : `${target} contains a ${existing?.type ?? ''} file system${existing?.label ? ` labelled '${existing.label}'` : ''}\n`;
      return {
        stdout: MKE2FS_BANNER + warning,
        exitCode: 0,
        machine: withPending(env.machine, {
          kind: 'mkfs-confirm',
          prompt: 'Proceed anyway? (y,N) ',
          secret: false,
          data: { device: device.path, label: label ?? '', counter: String(counter) },
        }),
      };
    }
    const made = makeExt4(env.machine, device.path, label, counter);
    return { machine: made.machine, stdout: MKE2FS_BANNER + made.text, exitCode: 0 };
  },
};

// --- mount / umount ---------------------------------------------------------------------

/** Ligne de /etc/fstab. */
interface FstabEntry {
  readonly spec: string;
  readonly dir: string;
  readonly type: string;
  readonly options: string;
  readonly line: number;
}

/** Lit /etc/fstab ; signale les lignes illisibles. */
export function readFstab(machine: Machine): { entries: FstabEntry[]; errors: string } {
  const node = machine.fs['/etc/fstab'];
  const entries: FstabEntry[] = [];
  let errors = '';
  if (node?.type !== 'file') return { entries, errors };
  node.content.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const [spec, dir, type, options = 'defaults'] = line.split(/\s+/);
    if (!spec || !dir || !type) {
      errors += `mount: /etc/fstab: parse error at line ${index + 1} -- ignored\n`;
      return;
    }
    entries.push({
      spec,
      dir: dir === 'none' ? dir : normalizePath(dir),
      type,
      options,
      line: index + 1,
    });
  });
  return { entries, errors };
}

/** Options affichées par `mount` pour un système monté. */
function mountOptions(disk: Disk): string {
  if (disk.fstype === 'ext4')
    return disk.mount === '/' ? 'rw,relatime,errors=remount-ro' : 'rw,relatime';
  return 'rw,nosuid,nodev,relatime';
}

/** Monte un périphérique sur un dossier, avec les contrôles de mount(8). */
export function mountDevice(
  env: CommandEnv,
  machine: Machine,
  spec: string,
  dir: string,
): CommandOutcome {
  const path = resolveSpec(machine, spec);
  const shownDir = dir;
  const target = normalizePath(env.resolve(dir));
  if (!path) {
    return {
      stderr: spec.includes('=')
        ? `mount: ${shownDir}: can't find ${spec}.\n`
        : `mount: ${shownDir}: special device ${spec} does not exist.\n${DMESG}`,
      exitCode: 32,
    };
  }
  const found = statPath(machine, target, 'root');
  if (!found.ok || found.value.node.type !== 'dir')
    return { stderr: `mount: ${shownDir}: mount point does not exist.\n${DMESG}`, exitCode: 32 };
  const already = mountOf(machine, path);
  if (already)
    return {
      stderr: `mount: ${shownDir}: ${spec} already mounted on ${already.mount}.\n${DMESG}`,
      exitCode: 32,
    };
  const sig = storageOf(machine).signatures[path];
  if (sig?.type === 'swap')
    return {
      stderr: `mount: ${shownDir}: unknown filesystem type 'swap'.\n${DMESG}`,
      exitCode: 32,
    };
  if (sig?.type !== 'ext4') {
    return {
      stderr: `mount: ${shownDir}: wrong fs type, bad option, bad superblock on ${spec}, missing codepage or helper program, or other error.\n${DMESG}`,
      exitCode: 32,
    };
  }
  // df montre une taille un peu inférieure : journal et réserve de l'ext4.
  const disk: Disk = {
    device: path,
    mount: target,
    fstype: 'ext4',
    size: Math.floor(sig.size * 0.968),
    baseUsed: 24 * 1024,
  };
  return { machine: { ...machine, disks: [...machine.disks, disk] }, exitCode: 0 };
}

/** Commande `mount` : monte un système de fichiers, ou liste les montages. */
export const mount: BashCommand = {
  name: 'mount',
  summary: 'monte un système de fichiers dans l’arborescence',
  package: 'mount',
  manual: `NOM
       mount - monter un système de fichiers

SYNOPSIS
       mount                       liste des montages
       mount PÉRIPHÉRIQUE DOSSIER  monter (le dossier doit exister)
       mount -a                    monter tout ce que décrit /etc/fstab

DESCRIPTION
       Le montage est immédiat mais disparaît au redémarrage : pour le rendre
       permanent, ajouter une ligne dans /etc/fstab, par exemple :
       UUID=…  /srv/partage  ext4  defaults  0  2
       puis vérifier avec « sudo mount -a » (aucune erreur = fstab correct).`,
  run(args, env) {
    const words = args.filter(
      (a, i) => !a.startsWith('-') && args[i - 1] !== '-t' && args[i - 1] !== '-o',
    );
    if (args.length === 0 || (words.length === 0 && args.includes('-l'))) {
      const list = [
        'sysfs on /sys type sysfs (rw,nosuid,nodev,noexec,relatime)',
        'proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)',
        ...env.machine.disks.map(
          (d) => `${d.device} on ${d.mount} type ${d.fstype} (${mountOptions(d)})`,
        ),
      ];
      return { stdout: `${list.join('\n')}\n`, exitCode: 0 };
    }
    const all = args.includes('-a');
    if (env.user !== 'root') {
      const shown = words.at(-1) ?? (all ? '/etc/fstab' : '');
      return { stderr: `mount: ${shown}: must be superuser to use mount.\n${DMESG}`, exitCode: 32 };
    }
    const fstab = readFstab(env.machine);
    if (all) {
      let machine = env.machine;
      let stderr = fstab.errors;
      for (const entry of fstab.entries) {
        if (
          entry.type === 'swap' ||
          entry.options.split(',').includes('noauto') ||
          entry.dir === 'none'
        )
          continue;
        if (machine.disks.some((d) => d.mount === entry.dir)) continue;
        const result = mountDevice(env, machine, entry.spec, entry.dir);
        if (result.machine) machine = result.machine;
        stderr += result.stderr ?? '';
      }
      return { machine, stderr, exitCode: stderr && stderr !== fstab.errors ? 32 : 0 };
    }
    if (words.length === 1) {
      // Un seul argument : mount cherche la ligne correspondante dans /etc/fstab.
      const word = words[0] ?? '';
      const target = normalizePath(env.resolve(word));
      const entry = fstab.entries.find((e) => e.dir === target || e.spec === word);
      if (!entry) return { stderr: `mount: ${word}: can't find in /etc/fstab.\n`, exitCode: 1 };
      return mountDevice(env, env.machine, entry.spec, entry.dir);
    }
    return mountDevice(env, env.machine, words[0] ?? '', words[1] ?? '');
  },
};

/** Commande `umount` : démonte un système de fichiers. */
export const umount: BashCommand = {
  name: 'umount',
  summary: 'démonte un système de fichiers',
  package: 'mount',
  manual: `NOM
       umount - démonter un système de fichiers

SYNOPSIS
       umount DOSSIER|PÉRIPHÉRIQUE

DESCRIPTION
       Refuse si le système est utilisé (« target is busy ») : un shell dont
       le répertoire courant est dedans suffit. Faire « cd » ailleurs d'abord.`,
  run(args, env) {
    const word = args.find((a) => !a.startsWith('-'));
    if (!word)
      return {
        stderr: "umount: bad usage\nTry 'umount --help' for more information.\n",
        exitCode: 1,
      };
    const target =
      word.startsWith('/dev/') || word.includes('=') ? null : normalizePath(env.resolve(word));
    const device = resolveSpec(env.machine, word);
    const disk = env.machine.disks.find(
      (d) => d.mount === target || (device !== null && d.device === device),
    );
    if (env.user !== 'root')
      return { stderr: `umount: ${word}: must be superuser to unmount.\n`, exitCode: 32 };
    if (!disk) return { stderr: `umount: ${word}: not mounted.\n`, exitCode: 32 };
    const sessions = [env.machine.session, env.machine.session.parent].filter(
      (s) => s !== undefined,
    );
    if (disk.mount === '/' || sessions.some((s) => isInside(s.cwd, disk.mount)))
      return { stderr: `umount: ${disk.mount}: target is busy.\n`, exitCode: 32 };
    return {
      machine: { ...env.machine, disks: env.machine.disks.filter((d) => d !== disk) },
      exitCode: 0,
    };
  },
};

// --- LVM ----------------------------------------------------------------------------------

/** Message d'LVM sans les droits root. */
const LVM_NOT_ROOT =
  '  WARNING: Running as a non-root user. Functionality may be unavailable.\n  /run/lock/lvm/P_global:aux: open failed: Permission non accordée\n';

/** Échec d'une commande LVM (code 5). */
function lvmFail(stderr: string): CommandOutcome {
  return { stderr, exitCode: 5 };
}

/** Vérifie qu'un périphérique peut devenir volume physique ; message d'LVM sinon. */
function pvProblem(machine: Machine, path: string): string | null {
  const device = findDevice(machine, path);
  if (!device) return `  No device found for ${path}.\n`;
  if (mountOf(machine, device.path))
    return `  Can't open ${path} exclusively.  Mounted filesystem?\n  Can't open ${path} exclusively.  Mounted filesystem?\n`;
  if (device.kind === 'disk' && device.disk.partitions.length > 0)
    return `  Cannot use ${path}: device is partitioned\n`;
  const vg = vgOfPv(machine, device.path);
  if (vg)
    return `  Can't initialize physical volume "${device.path}" of volume group "${vg.name}" without -ff\n  ${device.path}: physical volume not initialized.\n`;
  return null;
}

/** Commande `pvcreate` : initialise un volume physique LVM. */
export const pvcreate: BashCommand = {
  name: 'pvcreate',
  summary: 'prépare une partition ou un disque pour LVM (volume physique)',
  package: 'lvm2',
  manual: `NOM
       pvcreate - initialiser un volume physique LVM

SYNOPSIS
       pvcreate PÉRIPHÉRIQUE...

DESCRIPTION
       Première étape de LVM : PV (pvcreate) → groupe de volumes (vgcreate)
       → volumes logiques (lvcreate), que l'on formate et monte ensuite.
       Partition conseillée : type 8e (Linux LVM) dans fdisk.`,
  run(args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const yes = args.includes('-y') || args.includes('-ff');
    const devices = args.filter((a) => !a.startsWith('-'));
    if (devices.length === 0)
      return {
        stderr:
          "  Please enter a physical volume path.\n  Run `pvcreate --help' for more information.\n",
        exitCode: 3,
      };
    let machine = env.machine;
    let stdout = '';
    for (const path of devices) {
      const problem = pvProblem(machine, path);
      if (problem) return { machine, stdout, stderr: problem, exitCode: 5 };
      const canonical = canonicalPath(machine, path);
      const sig = storageOf(machine).signatures[canonical];
      if (sig && sig.type !== 'LVM2_member' && !yes) {
        return {
          machine: withPending(machine, {
            kind: 'pvcreate-wipe',
            prompt: `WARNING: ${sig.type} signature detected on ${canonical} at offset ${sig.type === 'swap' ? 4086 : 1080}. Wipe it? [y/n]: `,
            secret: false,
            data: { device: canonical, type: sig.type },
          }),
          stdout,
          exitCode: 0,
        };
      }
      const created = createPv(machine, canonical);
      machine = created.machine;
      stdout += created.text;
    }
    return { machine, stdout, exitCode: 0 };
  },
};

/** Ajoute des volumes physiques à un groupe (création des PV au besoin). */
function addPvs(
  machine: Machine,
  vgName: string,
  devices: readonly string[],
): { machine: Machine; stdout: string; error: string | null } {
  let current = machine;
  let stdout = '';
  for (const path of devices) {
    const canonical = canonicalPath(current, path);
    const vg = vgOfPv(current, canonical);
    if (vg)
      return {
        machine,
        stdout: '',
        error: `  Physical volume '${canonical}' is already in volume group '${vg.name}'\n  Unable to add physical volume '${canonical}' to volume group '${vgName}'\n  ${canonical}: physical volume not initialized.\n`,
      };
    if (!storageOf(current).pvs.includes(canonical)) {
      const problem = pvProblem(current, path);
      if (problem) return { machine, stdout: '', error: problem };
      const created = createPv(current, canonical);
      current = created.machine;
      stdout += created.text;
    }
  }
  return { machine: current, stdout, error: null };
}

/** Commande `vgcreate` : crée un groupe de volumes. */
export const vgcreate: BashCommand = {
  name: 'vgcreate',
  summary: 'crée un groupe de volumes LVM à partir de volumes physiques',
  package: 'lvm2',
  manual: `NOM
       vgcreate - créer un groupe de volumes

SYNOPSIS
       vgcreate NOM PV...

EXEMPLES
       sudo vgcreate vg_data /dev/sdb1`,
  run(args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const [name, ...devices] = args.filter((a) => !a.startsWith('-'));
    if (!name || devices.length === 0)
      return {
        stderr:
          "  No command with matching syntax recognised.  Run 'vgcreate --help' for more information.\n  Correct command syntax is:\n  vgcreate VG_new PV ...\n",
        exitCode: 3,
      };
    const storage = storageOf(env.machine);
    if (storage.vgs.some((vg) => vg.name === name))
      return lvmFail(`  A volume group called ${name} already exists.\n`);
    const added = addPvs(env.machine, name, devices);
    if (added.error) return lvmFail(added.error);
    const next = storageOf(added.machine);
    return {
      machine: withStorage(added.machine, {
        ...next,
        vgs: [...next.vgs, { name, pvs: devices.map((d) => canonicalPath(added.machine, d)) }],
      }),
      stdout: `${added.stdout}  Volume group "${name}" successfully created\n`,
      exitCode: 0,
    };
  },
};

/** Commande `vgextend` : agrandit un groupe de volumes. */
export const vgextend: BashCommand = {
  name: 'vgextend',
  summary: 'ajoute un volume physique à un groupe de volumes',
  package: 'lvm2',
  manual: `NOM
       vgextend - ajouter des volumes physiques à un groupe

SYNOPSIS
       vgextend GROUPE PV...`,
  run(args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const [name = '', ...devices] = args.filter((a) => !a.startsWith('-'));
    const storage = storageOf(env.machine);
    const vg = storage.vgs.find((v) => v.name === name);
    if (!vg)
      return lvmFail(`  Volume group "${name}" not found\n  Cannot process volume group ${name}\n`);
    const added = addPvs(env.machine, name, devices);
    if (added.error) return lvmFail(added.error);
    const next = storageOf(added.machine);
    return {
      machine: withStorage(added.machine, {
        ...next,
        vgs: next.vgs.map((v) =>
          v.name === name
            ? { ...v, pvs: [...v.pvs, ...devices.map((d) => canonicalPath(added.machine, d))] }
            : v,
        ),
      }),
      stdout: `${added.stdout}  Volume group "${name}" successfully extended\n`,
      exitCode: 0,
    };
  },
};

/** Taille demandée par -L / -l, en extents (relatif avec « + »). */
function requestedExtents(
  machine: Machine,
  vgName: string,
  size: string | undefined,
  extents: string | undefined,
  current: number,
): { extents: number; relative: boolean } | null {
  const vg = storageOf(machine).vgs.find((v) => v.name === vgName);
  if (!vg) return null;
  const { total, free } = vgExtents(machine, vg);
  if (size !== undefined) {
    const relative = size.startsWith('+');
    const bytes = parseUnitSize(relative ? size.slice(1) : size, 1024 * 1024);
    if (bytes === null) return null;
    const count = Math.ceil(bytes / EXTENT);
    return { extents: relative ? current + count : count, relative };
  }
  if (extents !== undefined) {
    const relative = extents.startsWith('+');
    const text = relative ? extents.slice(1) : extents;
    const percent = /^(\d+)%(FREE|VG)$/i.exec(text);
    let count: number;
    if (percent)
      count = Math.floor(
        ((percent[2]?.toUpperCase() === 'FREE' ? free : total) * Number(percent[1])) / 100,
      );
    else if (/^\d+$/.test(text)) count = Number(text);
    else return null;
    return { extents: relative ? current + count : count, relative };
  }
  return null;
}

/** Taille lisible au format des messages d'LVM (`5,00 GiB`). */
function lvmLongSize(extents: number): string {
  const bytes = extents * EXTENT;
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2).replace('.', ',')} GiB`
    : `${(bytes / 1024 ** 2).toFixed(2).replace('.', ',')} MiB`;
}

/** Lit les options -L, -l, -n, -r et les opérandes d'une commande LVM. */
function lvOptions(args: readonly string[]) {
  const opts: {
    size?: string;
    extents?: string;
    name?: string;
    resize: boolean;
    operands: string[];
  } = {
    resize: false,
    operands: [],
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-L' || arg === '--size') opts.size = args[++i] ?? '';
    else if (/^-L.+/.test(arg)) opts.size = arg.slice(2);
    else if (arg === '-l' || arg === '--extents') opts.extents = args[++i] ?? '';
    else if (/^-l.+/.test(arg)) opts.extents = arg.slice(2);
    else if (arg === '-n' || arg === '--name') opts.name = args[++i] ?? '';
    else if (arg === '-r' || arg === '--resizefs') opts.resize = true;
    else if (arg === '-y') continue;
    else opts.operands.push(arg);
  }
  return opts;
}

/** Commande `lvcreate` : crée un volume logique. */
export const lvcreate: BashCommand = {
  name: 'lvcreate',
  summary: 'crée un volume logique dans un groupe de volumes',
  package: 'lvm2',
  manual: `NOM
       lvcreate - créer un volume logique

SYNOPSIS
       lvcreate -L TAILLE -n NOM GROUPE      lvcreate -l 100%FREE -n NOM GROUPE

DESCRIPTION
       Le volume apparaît sous /dev/GROUPE/NOM (et /dev/mapper/GROUPE-NOM) ;
       il reste à le formater (mkfs.ext4) et à le monter.`,
  run(args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const opts = lvOptions(args);
    const vgName = (opts.operands[0] ?? '').replace(/^\/dev\//, '');
    const storage = storageOf(env.machine);
    const vg = storage.vgs.find((v) => v.name === vgName);
    if (!vg)
      return lvmFail(
        `  Volume group "${vgName}" not found\n  Cannot process volume group ${vgName}\n`,
      );
    const name = opts.name ?? `lvol${storage.lvs.filter((lv) => lv.vg === vgName).length}`;
    if (storage.lvs.some((lv) => lv.vg === vgName && lv.name === name))
      return lvmFail(`  Logical Volume "${name}" already exists in volume group "${vgName}"\n`);
    const wanted = requestedExtents(env.machine, vgName, opts.size, opts.extents, 0);
    if (!wanted || wanted.extents <= 0)
      return { stderr: '  Please specify either size or extents but not both.\n', exitCode: 3 };
    const { free } = vgExtents(env.machine, vg);
    if (wanted.extents > free)
      return lvmFail(
        `  Volume group "${vgName}" has insufficient free space (${free} extents): ${wanted.extents} required.\n`,
      );
    const rounding =
      opts.size && (parseUnitSize(opts.size, 1024 * 1024) ?? 0) % EXTENT !== 0
        ? '  Rounding up size to full physical extent 4,00 MiB\n'
        : '';
    return {
      machine: withStorage(env.machine, {
        ...storage,
        lvs: [...storage.lvs, { name, vg: vgName, extents: wanted.extents }],
      }),
      stdout: `${rounding}  Logical volume "${name}" created.\n`,
      exitCode: 0,
    };
  },
};

/** Agrandit le système ext4 d'un volume à sa nouvelle taille (resize2fs). */
function growFilesystem(
  machine: Machine,
  path: string,
  force: boolean,
): { machine: Machine; stdout: string; stderr: string; exitCode: number } {
  const banner = 'resize2fs 1.47.0 (5-Feb-2023)\n';
  const device = findDevice(machine, path);
  if (!device)
    return {
      machine,
      stdout: '',
      stderr: `${banner}open: Aucun fichier ou dossier de ce type while opening ${path}\n`,
      exitCode: 1,
    };
  const storage = storageOf(machine);
  const sig = storage.signatures[device.path];
  if (sig?.type !== 'ext4') {
    return {
      machine,
      stdout: '',
      stderr: `${banner}resize2fs: Bad magic number in super-block while trying to open ${path}\nCouldn't find valid filesystem superblock.\n`,
      exitCode: 1,
    };
  }
  const blocks = Math.floor(device.size / 4096);
  if (blocks * 4096 === sig.size)
    return {
      machine,
      stdout: `${banner}The filesystem is already ${blocks} (4k) blocks long.  Nothing to do!\n\n`,
      stderr: '',
      exitCode: 0,
    };
  const mounted = mountOf(machine, device.path);
  if (!mounted && !force)
    return {
      machine,
      stdout: '',
      stderr: `${banner}Please run 'e2fsck -f ${path}' first.\n\n`,
      exitCode: 1,
    };
  const signatures: Storage['signatures'] = {
    ...storage.signatures,
    [device.path]: { ...sig, size: blocks * 4096 },
  };
  let next = withStorage(machine, { ...storage, signatures });
  if (mounted) {
    next = {
      ...next,
      disks: next.disks.map((d) =>
        d === mounted ? { ...d, size: Math.floor(blocks * 4096 * 0.968) } : d,
      ),
    };
  }
  const online = mounted
    ? `Filesystem at ${device.path} is mounted on ${mounted.mount}; on-line resizing required\nold_desc_blocks = 1, new_desc_blocks = 1\n`
    : `Resizing the filesystem on ${device.path} to ${blocks} (4k) blocks.\n`;
  return {
    machine: next,
    stdout: `${banner}${online}The filesystem on ${device.path} is now ${blocks} (4k) blocks long.\n\n`,
    stderr: '',
    exitCode: 0,
  };
}

/** Commande `lvextend` : agrandit un volume logique. */
export const lvextend: BashCommand = {
  name: 'lvextend',
  summary: 'agrandit un volume logique (et son système de fichiers avec -r)',
  package: 'lvm2',
  manual: `NOM
       lvextend - agrandir un volume logique

SYNOPSIS
       lvextend -L +TAILLE [-r] VOLUME       lvextend -l +100%FREE [-r] VOLUME

DESCRIPTION
       Agrandir le volume ne suffit pas : le système de fichiers doit suivre
       (resize2fs, ou directement -r). Possible à chaud, volume monté.

EXEMPLES
       sudo lvextend -L +2G -r /dev/vg_data/lv_partage`,
  run(args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const opts = lvOptions(args);
    const target = opts.operands[0] ?? '';
    const path = target.startsWith('/dev/') ? target : `/dev/${target}`;
    const device = findDevice(env.machine, path);
    if (device?.kind !== 'lv') {
      const shown = target.replace(/^\/dev\//, '');
      return lvmFail(`  Failed to find logical volume "${shown}"\n`);
    }
    const lv = device.lv;
    const wanted = requestedExtents(env.machine, lv.vg, opts.size, opts.extents, lv.extents);
    if (!wanted)
      return { stderr: '  Please specify either size or extents but not both.\n', exitCode: 3 };
    if (wanted.extents <= lv.extents)
      return lvmFail(
        `  New size given (${wanted.extents} extents) not larger than existing size (${lv.extents} extents)\n`,
      );
    const storage = storageOf(env.machine);
    const vg = storage.vgs.find((v) => v.name === lv.vg);
    const free = vg ? vgExtents(env.machine, vg).free : 0;
    const need = wanted.extents - lv.extents;
    if (need > free)
      return lvmFail(
        `  Insufficient free space: ${need} extents needed, but only ${free} available\n`,
      );
    let machine = withStorage(env.machine, {
      ...storage,
      lvs: storage.lvs.map((l) => (l === lv ? { ...l, extents: wanted.extents } : l)),
    });
    let stdout = `  Size of logical volume ${lv.vg}/${lv.name} changed from ${lvmLongSize(lv.extents)} (${lv.extents} extents) to ${lvmLongSize(wanted.extents)} (${wanted.extents} extents).\n  Logical volume ${lv.vg}/${lv.name} successfully resized.\n`;
    if (opts.resize && storage.signatures[device.path]?.type === 'ext4') {
      const grown = growFilesystem(machine, device.path, true);
      machine = grown.machine;
      stdout += grown.stdout;
    }
    return { machine, stdout, exitCode: 0 };
  },
};

/** Commande `resize2fs` : adapte un système ext4 à la taille de son volume. */
export const resize2fs: BashCommand = {
  name: 'resize2fs',
  summary: 'agrandit un système de fichiers ext4 à la taille de son volume',
  package: 'e2fsprogs',
  manual: `NOM
       resize2fs - redimensionner un système de fichiers ext2/3/4

SYNOPSIS
       resize2fs [-f] PÉRIPHÉRIQUE

DESCRIPTION
       Après lvextend : agrandit le système de fichiers jusqu'à la nouvelle
       taille du volume. À chaud si le système est monté.`,
  run(args, env) {
    if (env.user !== 'root')
      return {
        stderr:
          'resize2fs 1.47.0 (5-Feb-2023)\nopen: Permission non accordée while opening ' +
          (args.at(-1) ?? '') +
          '\n',
        exitCode: 1,
      };
    const target = args.find((a) => !a.startsWith('-'));
    if (!target)
      return {
        stderr:
          'Usage: resize2fs [-d debug_flags] [-f] [-F] [-M] [-P] [-p] device [-b|-s|new_size] [-S RAID-stride] [-z undo_file]\n\n',
        exitCode: 1,
      };
    const grown = growFilesystem(env.machine, target, args.includes('-f'));
    return {
      machine: grown.machine,
      stdout: grown.stdout,
      stderr: grown.stderr,
      exitCode: grown.exitCode,
    };
  },
};

/** Met en colonnes un tableau d'LVM (deux espaces en tête, tailles alignées à droite). */
function lvmTable(header: string[], rows: string[][], right: readonly number[]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) =>
    `  ${cells.map((c, i) => (right.includes(i) ? c.padStart(widths[i] ?? 0) : c.padEnd(widths[i] ?? 0))).join(' ')}`;
  return `${[line(header), ...rows.map(line)].join('\n')}\n`;
}

/** Commande `pvs` : volumes physiques. */
export const pvs: BashCommand = {
  name: 'pvs',
  summary: 'résumé des volumes physiques LVM',
  package: 'lvm2',
  manual: 'NOM\n       pvs - afficher les volumes physiques LVM',
  run(_args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const storage = storageOf(env.machine);
    if (storage.pvs.length === 0) return { exitCode: 0 };
    const rows = storage.pvs.map((pv) => {
      const vg = vgOfPv(env.machine, pv);
      const size = pvExtents(env.machine, pv) * EXTENT;
      const free = vg
        ? (vgExtents(env.machine, vg).free * pvExtents(env.machine, pv) * EXTENT) /
          Math.max(1, vgExtents(env.machine, vg).total)
        : (findDevice(env.machine, pv)?.size ?? 0);
      return [
        pv,
        vg?.name ?? '',
        'lvm2',
        vg ? 'a--' : '---',
        lvmSize(vg ? size : (findDevice(env.machine, pv)?.size ?? 0)),
        lvmSize(free),
      ];
    });
    return {
      stdout: lvmTable(['PV', 'VG', 'Fmt', 'Attr', 'PSize', 'PFree'], rows, [4, 5]),
      exitCode: 0,
    };
  },
};

/** Commande `vgs` : groupes de volumes. */
export const vgs: BashCommand = {
  name: 'vgs',
  summary: 'résumé des groupes de volumes LVM',
  package: 'lvm2',
  manual: 'NOM\n       vgs - afficher les groupes de volumes LVM',
  run(_args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const storage = storageOf(env.machine);
    if (storage.vgs.length === 0) return { exitCode: 0 };
    const rows = storage.vgs.map((vg) => {
      const { total, free } = vgExtents(env.machine, vg);
      return [
        vg.name,
        String(vg.pvs.length),
        String(storage.lvs.filter((lv) => lv.vg === vg.name).length),
        '0',
        'wz--n-',
        lvmSize(total * EXTENT),
        lvmSize(free * EXTENT),
      ];
    });
    return {
      stdout: lvmTable(
        ['VG', '#PV', '#LV', '#SN', 'Attr', 'VSize', 'VFree'],
        rows,
        [1, 2, 3, 5, 6],
      ),
      exitCode: 0,
    };
  },
};

/** Commande `lvs` : volumes logiques. */
export const lvs: BashCommand = {
  name: 'lvs',
  summary: 'résumé des volumes logiques LVM',
  package: 'lvm2',
  manual: 'NOM\n       lvs - afficher les volumes logiques LVM',
  run(_args, env) {
    if (env.user !== 'root') return lvmFail(LVM_NOT_ROOT);
    const storage = storageOf(env.machine);
    if (storage.lvs.length === 0) return { exitCode: 0 };
    const rows = storage.lvs.map((lv) => [
      lv.name,
      lv.vg,
      mountOf(env.machine, mapperPath(lv.vg, lv.name)) ? '-wi-ao----' : '-wi-a-----',
      lvmSize(lv.extents * EXTENT),
    ]);
    return {
      stdout: lvmTable(
        [
          'LV',
          'VG',
          'Attr',
          'LSize',
          'Pool',
          'Origin',
          'Data%',
          'Meta%',
          'Move',
          'Log',
          'Cpy%Sync',
          'Convert',
        ],
        rows,
        [3],
      ).replace(/ +$/gm, ''),
      exitCode: 0,
    };
  },
};
