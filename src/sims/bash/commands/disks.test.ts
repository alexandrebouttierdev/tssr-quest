import { describe, expect, it } from 'vitest';
import { createDebianServer } from '@sims/shared/factories';
import type { Machine } from '@sims/shared/types';
import { bashSimulator } from '../simulator';
import { runLine, runLines } from '../test-utils';

const machine = createDebianServer({
  users: ['hugo'],
  sudoers: ['hugo'],
  extraDisks: [{ name: 'sdb', size: '10G' }],
});

/** Partitionne sdb en une partition LVM de tout le disque. */
const partitioned = runLines(machine, [
  'sudo fdisk /dev/sdb',
  'n',
  '',
  '',
  '',
  '',
  't',
  'lvm',
  'w',
]).state;

/** Chaîne LVM complète, volume formaté et monté. */
const mounted = runLines(partitioned, [
  'sudo pvcreate /dev/sdb1',
  'sudo vgcreate vg_data /dev/sdb1',
  'sudo lvcreate -L 5G -n lv_partage vg_data',
  'sudo mkfs.ext4 /dev/vg_data/lv_partage',
  'sudo mkdir /srv/partage',
  'sudo mount /dev/vg_data/lv_partage /srv/partage',
]).state;

describe('lsblk et blkid', () => {
  it('affiche les disques en arbre avec leurs montages', () => {
    const out = runLine(mounted, 'lsblk').stdout;
    expect(out).toContain('sdb                      8:16   0   10G  0 disk ');
    expect(out).toContain('└─sdb1                   8:17   0   10G  0 part ');
    expect(out).toContain('  └─vg_data-lv_partage 254:0    0    5G  0 lvm  /srv/partage');
    expect(out).toContain('└─sda5');
    expect(out).toContain('[SWAP]');
    expect(runLine(mounted, 'lsblk /dev/sdb').stdout).not.toContain('sda');
    expect(runLine(mounted, 'lsblk /dev/sdz').stderr).toBe('lsblk: /dev/sdz: not a block device\n');
    expect(runLine(mounted, 'lsblk -f').stdout).toMatch(/sdb1 +LVM2_member LVM2 001/);
  });

  it('donne UUID et types', () => {
    const out = runLine(mounted, '/usr/sbin/blkid').stdout;
    expect(out).toMatch(
      /^\/dev\/sdb1: UUID="[\w-]+" TYPE="LVM2_member" PARTUUID="[0-9a-f]{8}-01"$/m,
    );
    expect(out).toMatch(
      /^\/dev\/mapper\/vg_data-lv_partage: UUID="[0-9a-f-]+" BLOCK_SIZE="4096" TYPE="ext4"$/m,
    );
    expect(runLine(machine, '/usr/sbin/blkid /dev/sdb').exitCode).toBe(2);
  });
});

describe('fdisk', () => {
  it('liste les disques en root seulement', () => {
    expect(runLine(machine, '/usr/sbin/fdisk -l').stderr).toBe(
      'fdisk: cannot open /dev/sda: Permission non accordée\n',
    );
    const out = runLine(partitioned, 'sudo fdisk -l /dev/sdb').stdout;
    expect(out).toContain('Disk /dev/sdb: 10 GiB, 10737418240 bytes, 20971520 sectors');
    expect(out).toMatch(/\/dev\/sdb1 +2048 20971519 20969472 +10G 8e Linux LVM/);
    expect(runLine(mounted, 'sudo fdisk -l').stdout).toContain(
      'Disk /dev/mapper/vg_data-lv_partage: 5 GiB',
    );
  });

  it('crée une partition de taille donnée, change son type, puis la supprime', () => {
    const started = runLine(machine, 'sudo fdisk /dev/sdb');
    expect(started.stdout).toContain('Created a new DOS (MBR) disklabel with disk identifier 0x');
    expect(bashSimulator.prompt(started.state)).toBe('Command (m for help):');
    const asked = runLines(started.state, ['n', 'p', '1', '']);
    expect(bashSimulator.prompt(asked.state)).toBe(
      'Last sector, +/-sectors or +/-size{K,M,G,T,P} (2048-20971519, default 20971519):',
    );
    const created = runLine(asked.state, '+2G');
    expect(created.stdout).toBe(
      "\nCreated a new partition 1 of type 'Linux' and of size 2 GiB.\n\n",
    );
    const second = runLines(created.state, ['n', '', '', '', '']);
    expect(second.stdout).toContain("Created a new partition 2 of type 'Linux' and of size 8 GiB.");
    expect(bashSimulator.prompt(runLine(second.state, 't').state)).toBe(
      'Partition number (1,2, default 2):',
    );
    const typed = runLines(second.state, ['t', '1', '82']);
    expect(typed.stdout).toBe("Changed type of partition 'Linux' to 'Linux swap / Solaris'.\n\n");
    const deleted = runLines(typed.state, ['d', '2']);
    expect(deleted.stdout).toBe('Partition 2 has been deleted.\n\n');
    const printed = runLine(deleted.state, 'p').stdout;
    expect(printed).toContain('82 Linux swap / Solaris');
    // q abandonne tout : le disque reste vierge.
    const quit = runLine(deleted.state, 'q').state;
    expect(quit.storage?.disks[1]?.partitions).toEqual([]);
    expect(quit.session.pending).toBeUndefined();
  });

  it('refuse les saisies hors limites et explique ses commandes', () => {
    const started = runLine(machine, 'sudo fdisk /dev/sdb').state;
    expect(runLine(started, 'z').stdout).toBe('z: unknown command\n');
    expect(runLine(started, 'm').stdout).toContain('   n   add a new partition');
    expect(runLine(started, 'l').stdout).toContain('8e  Linux LVM');
    expect(runLine(started, 'g').stdout).toContain('non disponible dans cette simulation');
    expect(runLine(started, 'd').stdout).toBe('No partition is defined yet!\n\n');
    expect(runLine(started, 'v').stdout).toBe(
      'Remaining 20969472 unallocated 512-byte sectors.\n\n',
    );
    expect(runLines(started, ['n', 'x']).stdout).toBe("Invalid partition type `x'.\n");
    expect(runLines(started, ['n', 'p', '7']).stdout).toBe('Value out of range.\n');
    expect(runLines(started, ['n', 'p', '1', '10']).stdout).toBe('Value out of range.\n');
    expect(runLines(started, ['n', 'p', '1', '', '+99G']).stdout).toBe('Value out of range.\n');
    expect(runLines(partitioned, ['sudo fdisk /dev/sdb', 't', 'xyz']).stdout).toContain(
      'Failed to change type of partition 1.',
    );
    expect(runLine(machine, 'sudo fdisk /dev/sdc').stderr).toBe(
      'fdisk: cannot open /dev/sdc: Aucun fichier ou dossier de ce type\n',
    );
    expect(runLine(machine, 'sudo fdisk').exitCode).toBe(1);
  });

  it("prévient que le disque système est utilisé, et qu'il garde l'ancienne table", () => {
    const started = runLine(machine, 'sudo fdisk /dev/sda');
    expect(started.stdout).toContain(
      'This disk is currently in use - repartitioning is probably a bad idea.',
    );
    expect(runLine(started.state, 'w').stdout).toContain('Re-reading the partition table failed.');
  });
});

describe('mkfs.ext4', () => {
  it('formate, et demande confirmation sur une signature existante', () => {
    const lv = runLines(partitioned, [
      'sudo pvcreate /dev/sdb1',
      'sudo vgcreate vg_data /dev/sdb1',
      'sudo lvcreate -l 100%FREE -n lv_tout vg_data',
    ]).state;
    const made = runLine(lv, 'sudo mkfs.ext4 -L partage /dev/vg_data/lv_tout');
    expect(made.stdout).toMatch(/^mke2fs 1\.47\.0 \(5-Feb-2023\)\n/);
    expect(made.stdout).toContain('Creating filesystem with 2620416 4k blocks and 655104 inodes');
    expect(made.state.storage?.signatures['/dev/mapper/vg_data-lv_tout']).toMatchObject({
      type: 'ext4',
      label: 'partage',
    });
    const again = runLine(made.state, 'sudo mkfs.ext4 /dev/vg_data/lv_tout');
    expect(again.stdout).toContain("contains a ext4 file system labelled 'partage'");
    expect(bashSimulator.prompt(again.state)).toBe('Proceed anyway? (y,N)');
    expect(
      runLine(again.state, 'n').state.storage?.signatures['/dev/mapper/vg_data-lv_tout']?.label,
    ).toBe('partage');
    expect(
      runLine(again.state, 'y').state.storage?.signatures['/dev/mapper/vg_data-lv_tout']?.label,
    ).toBeUndefined();
    expect(runLine(partitioned, 'sudo mkfs.ext4 /dev/sdb').stdout).toContain(
      'Found a dos partition table in /dev/sdb',
    );
    expect(runLine(partitioned, 'sudo mkfs.ext4 -F /dev/sdb1').exitCode).toBe(0);
  });

  it('refuse un système monté, un périphérique absent, un utilisateur ordinaire', () => {
    expect(runLine(machine, 'sudo mkfs.ext4 /dev/sda1').stderr).toContain(
      '/dev/sda1 is mounted; will not make a filesystem here!',
    );
    expect(runLine(machine, 'sudo mkfs.ext4 /dev/sdc1').stderr).toContain(
      'The file /dev/sdc1 does not exist and no size was specified.',
    );
    expect(runLine(machine, '/usr/sbin/mkfs.ext4 /dev/sdb').stderr).toContain(
      'Could not open /dev/sdb: Permission non accordée',
    );
    expect(runLine(machine, 'sudo mkfs.ext4').exitCode).toBe(1);
  });
});

describe('mount, umount et fstab', () => {
  it('monte, liste et démonte', () => {
    expect(runLine(mounted, 'df -h').stdout).toMatch(
      /^\/dev\/mapper\/vg_data-lv_partage +4,9G +24K +4,9G +1% \/srv\/partage$/m,
    );
    expect(runLine(mounted, 'mount').stdout).toContain(
      '/dev/mapper/vg_data-lv_partage on /srv/partage type ext4 (rw,relatime)',
    );
    const busy = runLines(mounted, ['cd /srv/partage', 'sudo umount /srv/partage']);
    expect(busy.stderr).toBe('umount: /srv/partage: target is busy.\n');
    const unmounted = runLine(mounted, 'sudo umount /srv/partage').state;
    expect(unmounted.disks.some((d) => d.mount === '/srv/partage')).toBe(false);
    expect(runLine(unmounted, 'sudo umount /srv/partage').stderr).toBe(
      'umount: /srv/partage: not mounted.\n',
    );
    expect(runLine(mounted, 'umount /srv/partage').stderr).toBe(
      'umount: /srv/partage: must be superuser to unmount.\n',
    );
    expect(runLine(mounted, 'sudo umount /').stderr).toBe('umount: /: target is busy.\n');
  });

  it('explique chaque échec de montage', () => {
    const fail = (state: Machine, line: string) => runLine(state, line).stderr.split('\n')[0];
    expect(fail(mounted, 'mount /dev/sdb1 /mnt')).toBe(
      'mount: /mnt: must be superuser to use mount.',
    );
    expect(fail(mounted, 'sudo mount /dev/sdc1 /mnt')).toBe(
      'mount: /mnt: special device /dev/sdc1 does not exist.',
    );
    expect(fail(mounted, 'sudo mount /dev/vg_data/lv_partage /srv/autre')).toBe(
      'mount: /srv/autre: mount point does not exist.',
    );
    expect(fail(mounted, 'sudo mount /dev/vg_data/lv_partage /mnt')).toBe(
      'mount: /mnt: /dev/vg_data/lv_partage already mounted on /srv/partage.',
    );
    expect(fail(mounted, 'sudo mount /dev/sdb1 /mnt')).toMatch(
      /^mount: \/mnt: wrong fs type, bad option/,
    );
    expect(fail(mounted, 'sudo mount /dev/sda5 /mnt')).toBe(
      "mount: /mnt: unknown filesystem type 'swap'.",
    );
    expect(fail(mounted, 'sudo mount /mnt')).toBe("mount: /mnt: can't find in /etc/fstab.");
  });

  it('monte tout /etc/fstab avec mount -a, par UUID', () => {
    const uuid = mounted.storage?.signatures['/dev/mapper/vg_data-lv_partage']?.uuid ?? '';
    const withFstab = runLines(mounted, [
      'sudo umount /srv/partage',
      `echo "UUID=${uuid} /srv/partage ext4 defaults 0 2" | sudo tee -a /etc/fstab`,
      'sudo mount -a',
    ]);
    expect(withFstab.exitCode).toBe(0);
    expect(withFstab.state.disks.some((d) => d.mount === '/srv/partage')).toBe(true);
    const viaDir = runLines(withFstab.state, [
      'sudo umount /srv/partage',
      'sudo mount /srv/partage',
    ]).state;
    expect(viaDir.disks.some((d) => d.mount === '/srv/partage')).toBe(true);
    const broken = runLines(mounted, [
      'echo "UUID=0000 /srv/vide ext4 defaults 0 2" | sudo tee -a /etc/fstab',
      'echo "ligne-cassee" | sudo tee -a /etc/fstab',
      'sudo mount -a',
    ]);
    expect(broken.stderr).toContain('mount: /etc/fstab: parse error at line');
    expect(broken.stderr).toContain("mount: /srv/vide: can't find UUID=0000.");
    expect(broken.exitCode).toBe(32);
  });
});

describe('LVM', () => {
  it('résume volumes physiques, groupes et volumes logiques', () => {
    expect(runLine(mounted, 'sudo pvs').stdout).toBe(
      '  PV        VG      Fmt  Attr   PSize  PFree\n  /dev/sdb1 vg_data lvm2 a--  <10,00g <5,00g\n',
    );
    expect(runLine(mounted, 'sudo vgs').stdout).toContain(
      '  vg_data   1   1   0 wz--n- <10,00g <5,00g',
    );
    expect(runLine(mounted, 'sudo lvs').stdout).toContain('  lv_partage vg_data -wi-ao---- 5,00g');
    expect(runLine(machine, 'sudo pvs').stdout ?? '').toBe('');
    expect(runLine(mounted, '/usr/sbin/pvs').stderr).toContain(
      'WARNING: Running as a non-root user.',
    );
  });

  it('agrandit un volume et son système de fichiers', () => {
    const grown = runLine(mounted, 'sudo lvextend -L +2G -r /dev/vg_data/lv_partage');
    expect(grown.stdout).toContain(
      'Size of logical volume vg_data/lv_partage changed from 5,00 GiB (1280 extents) to 7,00 GiB (1792 extents).',
    );
    expect(grown.stdout).toContain(
      'The filesystem on /dev/mapper/vg_data-lv_partage is now 1835008 (4k) blocks long.',
    );
    expect(runLine(grown.state, 'df -h /srv/partage').stdout).toContain('6,8G');
    // Sans -r, il faut resize2fs ensuite.
    const lvOnly = runLine(mounted, 'sudo lvextend -l +100%FREE vg_data/lv_partage').state;
    expect(runLine(lvOnly, 'df -h /srv/partage').stdout).toContain('4,9G');
    expect(runLine(lvOnly, 'sudo resize2fs /dev/vg_data/lv_partage').stdout).toContain(
      'on-line resizing required',
    );
    expect(runLine(grown.state, 'sudo resize2fs /dev/vg_data/lv_partage').stdout).toContain(
      'Nothing to do!',
    );
  });

  it('signale les erreurs de chaque étape', () => {
    expect(runLine(machine, 'sudo pvcreate /dev/sdc1').stderr).toBe(
      '  No device found for /dev/sdc1.\n',
    );
    expect(runLine(machine, 'sudo pvcreate /dev/sda1').stderr).toContain('Mounted filesystem?');
    expect(runLine(partitioned, 'sudo pvcreate /dev/sdb').stderr).toBe(
      '  Cannot use /dev/sdb: device is partitioned\n',
    );
    expect(runLine(mounted, 'sudo pvcreate /dev/sdb1').stderr).toContain(
      'Can\'t initialize physical volume "/dev/sdb1" of volume group "vg_data" without -ff',
    );
    expect(runLine(machine, 'sudo pvcreate').exitCode).toBe(3);
    expect(runLine(mounted, 'sudo vgcreate vg_data /dev/sdb1').stderr).toBe(
      '  A volume group called vg_data already exists.\n',
    );
    expect(runLine(mounted, 'sudo vgcreate vg_autre /dev/sdb1').stderr).toContain(
      "is already in volume group 'vg_data'",
    );
    expect(runLine(machine, 'sudo vgcreate vg_x').exitCode).toBe(3);
    expect(runLine(mounted, 'sudo vgextend vg_x /dev/sdb1').stderr).toContain(
      'Volume group "vg_x" not found',
    );
    expect(runLine(mounted, 'sudo lvcreate -L 20G -n gros vg_data').stderr).toBe(
      '  Volume group "vg_data" has insufficient free space (1279 extents): 5120 required.\n',
    );
    expect(runLine(mounted, 'sudo lvcreate -L 1G -n lv_partage vg_data').stderr).toContain(
      'already exists',
    );
    expect(runLine(mounted, 'sudo lvcreate -L 1G -n x vg_x').stderr).toContain(
      'Volume group "vg_x" not found',
    );
    expect(runLine(mounted, 'sudo lvcreate -L 10M -n petit vg_data').stdout).toContain(
      'Rounding up size to full physical extent',
    );
    expect(runLine(mounted, 'sudo lvcreate -n rien vg_data').exitCode).toBe(3);
    expect(runLine(mounted, 'sudo lvextend -L 1G /dev/vg_data/lv_partage').stderr).toContain(
      'not larger than existing size',
    );
    expect(runLine(mounted, 'sudo lvextend -L +20G /dev/vg_data/lv_partage').stderr).toContain(
      'Insufficient free space',
    );
    expect(runLine(mounted, 'sudo lvextend -L +1G /dev/vg_data/absent').stderr).toBe(
      '  Failed to find logical volume "vg_data/absent"\n',
    );
    expect(runLine(mounted, 'sudo resize2fs /dev/sdb1').stderr).toContain(
      'Bad magic number in super-block',
    );
    expect(runLine(mounted, 'sudo resize2fs /dev/sdz').stderr).toContain(
      'Aucun fichier ou dossier de ce type',
    );
    expect(runLine(mounted, '/usr/sbin/resize2fs /dev/sdb1').exitCode).toBe(1);
    expect(runLine(mounted, 'sudo resize2fs').exitCode).toBe(1);
  });

  it('efface une ancienne signature après confirmation, et la vérifie avant de créer un groupe', () => {
    const formatted = runLine(partitioned, 'sudo mkfs.ext4 -F /dev/sdb1').state;
    const asked = runLine(formatted, 'sudo pvcreate /dev/sdb1');
    expect(bashSimulator.prompt(asked.state)).toBe(
      'WARNING: ext4 signature detected on /dev/sdb1 at offset 1080. Wipe it? [y/n]:',
    );
    expect(runLine(asked.state, 'n').stderr).toContain('Aborting pvcreate on /dev/sdb1.');
    expect(runLine(asked.state, 'y').stdout).toBe(
      '  Wiping ext4 signature on /dev/sdb1.\n  Physical volume "/dev/sdb1" successfully created.\n',
    );
    expect(runLine(formatted, 'sudo pvcreate -y /dev/sdb1').exitCode).toBe(0);
    // vgcreate initialise lui-même un volume physique vierge.
    expect(runLine(partitioned, 'sudo vgcreate vg_data /dev/sdb1').stdout).toBe(
      '  Physical volume "/dev/sdb1" successfully created.\n  Volume group "vg_data" successfully created\n',
    );
  });
});
