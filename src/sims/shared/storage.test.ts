import { describe, expect, it } from 'vitest';
import { createDebianServer } from './factories';
import {
  canonicalPath,
  findDevice,
  humanBlockSize,
  humanFdiskSize,
  lvmSize,
  lvmUuid,
  mapperPath,
  parseUnitSize,
  partitionTypeName,
  pvExtents,
  stableUuid,
  storageOf,
} from './storage';

describe('formats de taille', () => {
  it('suit util-linux, fdisk et LVM', () => {
    expect(humanBlockSize(20 * 1024 ** 3)).toBe('20G');
    expect(humanBlockSize(975 * 1024 ** 2)).toBe('975M');
    expect(humanBlockSize(9.5 * 1024 ** 3)).toBe('9,5G');
    expect(humanBlockSize(512)).toBe('512B');
    expect(humanFdiskSize(10 * 1024 ** 3)).toBe('10 GiB');
    expect(humanFdiskSize(2.5 * 1024 ** 3)).toBe('2.5 GiB');
    expect(lvmSize(5 * 1024 ** 3)).toBe('5,00g');
    expect(lvmSize(10 * 1024 ** 3 - 4 * 1024 ** 2)).toBe('<10,00g');
    expect(lvmSize(500 * 1024 ** 2)).toBe('500,00m');
    expect(parseUnitSize('5G', 1)).toBe(5 * 1024 ** 3);
    expect(parseUnitSize('500MiB', 1)).toBe(500 * 1024 ** 2);
    expect(parseUnitSize('2048', 512)).toBe(2048 * 512);
    expect(parseUnitSize('1,5G', 1)).toBe(1.5 * 1024 ** 3);
    expect(parseUnitSize('beaucoup', 1)).toBeNull();
    expect(partitionTypeName('8e')).toBe('Linux LVM');
    expect(partitionTypeName('99')).toBe('Unknown');
  });

  it('produit des identifiants stables', () => {
    expect(stableUuid('a')).toBe(stableUuid('a'));
    expect(stableUuid('a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(lvmUuid('pv')).toMatch(/^\w{6}-\w{4}-\w{4}-\w{4}-\w{4}-\w{4}-\w{6}$/);
    expect(mapperPath('vg-data', 'lv')).toBe('/dev/mapper/vg--data-lv');
  });
});

describe('stockage initial', () => {
  const machine = createDebianServer({
    users: ['hugo'],
    disks: [{ mount: '/var', size: '20G', used: '1G', device: '/dev/sda3' }],
    extraDisks: [{ name: 'sdb', size: '10G' }],
  });

  it("reprend l'installation guidée : racine, /var, swap en partition étendue, disque vierge", () => {
    const storage = storageOf(machine);
    expect(storage.disks.map((d) => d.name)).toEqual(['sda', 'sdb']);
    expect(storage.disks[0]?.partitions.map((p) => [p.number, p.type])).toEqual([
      [1, '83'],
      [2, '5'],
      [3, '83'],
      [5, '82'],
    ]);
    expect(storage.disks[1]).toMatchObject({ label: null, partitions: [] });
    expect(storage.signatures['/dev/sda3']?.type).toBe('ext4');
    expect(storage.signatures['/dev/sda5']?.type).toBe('swap');
  });

  it('retrouve disques, partitions et volumes', () => {
    expect(findDevice(machine, '/dev/sdb')?.kind).toBe('disk');
    expect(findDevice(machine, '/dev/sda1')?.kind).toBe('part');
    expect(findDevice(machine, '/dev/sdc')).toBeNull();
    expect(canonicalPath(machine, '/dev/inconnu')).toBe('/dev/inconnu');
    expect(pvExtents(machine, '/dev/sdb')).toBe(2559);
    expect(storageOf({ ...machine, storage: undefined as never })).toEqual({
      disks: [],
      signatures: {},
      pvs: [],
      vgs: [],
      lvs: [],
    });
  });
});
