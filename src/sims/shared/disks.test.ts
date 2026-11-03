import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { diskForPath, diskUsage, diskUsagePercent, freeBytes } from './disks';
import { removePath } from './fs';
import { parseSize } from './size';

describe('disques', () => {
  it('associe un chemin au montage le plus précis', () => {
    const machine = debianServer({ disks: [{ mount: '/var', size: '20G', used: '5G' }] });

    expect(diskForPath(machine, '/var/log/syslog')?.mount).toBe('/var');
    expect(diskForPath(machine, '/variable')?.mount).toBe('/');
    expect(diskForPath(machine, '/etc')?.mount).toBe('/');
  });

  it("compte l'occupation déclarée, fichiers simulés compris", () => {
    const machine = debianServer({
      disks: [{ mount: '/var', size: '20G', used: '20G' }],
      files: { '/var/log/debug.log': { size: '18G' } },
    });
    const disk = diskForPath(machine, '/var')!;

    expect(diskUsage(machine, disk)).toBe(parseSize('20G'));
    expect(freeBytes(machine, '/var')).toBe(0);
  });

  it('libère la place quand un gros fichier est supprimé', () => {
    const machine = debianServer({
      disks: [{ mount: '/var', size: '20G', used: '20G' }],
      files: { '/var/log/debug.log': { size: '18G' } },
    });

    const result = removePath(machine, '/var/log/debug.log', 'root', {});

    expect(result.ok && freeBytes(result.value, '/var')).toBe(parseSize('18G'));
  });

  it("ignore un montage de disque sur un chemin qu'aucun disque ne couvre", () => {
    const machine = { ...debianServer({}), disks: [] };

    expect(diskForPath(machine, '/etc')).toBeUndefined();
    expect(freeBytes(machine, '/etc')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("pourcentage d'occupation", () => {
  it('arrondit au supérieur comme la colonne Uti% de df', () => {
    const machine = debianServer({ disks: [{ mount: '/srv', size: '1000', used: '101' }] });
    const disk = diskForPath(machine, '/srv')!;

    expect(diskUsagePercent(machine, disk)).toBe(11);
  });

  it('vaut 0 pour un disque de taille nulle', () => {
    const machine = debianServer({ disks: [{ mount: '/srv', size: 0, used: 0 }] });

    expect(diskUsagePercent(machine, diskForPath(machine, '/srv')!)).toBe(0);
  });
});
