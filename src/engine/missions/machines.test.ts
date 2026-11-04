import { describe, expect, it } from 'vitest';
import { conditionSchema, machineSpecSchema } from '@content/schemas';
import { buildMachine } from './machines';

const NOW = Date.UTC(2026, 10, 3, 8, 0);

describe('machines décrites dans le contenu', () => {
  it('construit une machine avec paquets, disque en plus et réseau en panne', () => {
    const spec = machineSpecSchema.parse({
      base: 'debian-server',
      hostname: 'srv-fichiers',
      session: { user: 'hugo' },
      users: ['hugo'],
      sudoers: ['hugo'],
      packages: { install: ['apache2'], updates: { curl: { version: '7.88.1-10+deb12u12' } } },
      extraDisks: [{ name: 'sdb', size: '10G' }],
      network: {
        address: '192.168.10.30',
        down: true,
        neighbors: [{ address: '192.168.10.40', name: 'srv-impression' }],
      },
      services: { apache2: { state: 'failed', failure: 'config-invalid' } },
    });
    const machine = buildMachine(spec, NOW);
    expect(machine.hostname).toBe('srv-fichiers');
    expect(machine.packages['apache2']?.installed).toBe(true);
    expect(machine.packages['curl']?.update?.version).toBe('7.88.1-10+deb12u12');
    expect(machine.storage?.disks.some((d) => d.name === 'sdb')).toBe(true);
    expect(machine.interfaces.find((i) => i.name !== 'lo')?.up).toBe(false);
    expect(machine.neighbors?.some((n) => n.name === 'srv-impression')).toBe(true);
  });

  it('refuse un disque mal nommé et une suite inconnue', () => {
    const base = { base: 'debian-server', hostname: 'srv', session: { user: 'root' } };
    expect(
      machineSpecSchema.safeParse({ ...base, extraDisks: [{ name: 'sda', size: '1G' }] }).success,
    ).toBe(false);
    expect(
      machineSpecSchema.safeParse({
        ...base,
        packages: { updates: { curl: { version: '1', suite: 'sid' } } },
      }).success,
    ).toBe(false);
  });
});

describe('schéma des conditions', () => {
  it('accepte les nouvelles conditions et refuse les champs inconnus', () => {
    const ok = [
      { user: { name: 'julie.martin', groups: ['compta'] } },
      { group: { name: 'compta', members: ['julie.martin'] } },
      { net: { ip: '192.168.10.30/24', gateway: '192.168.10.254', persistent: true } },
      { cron: { user: 'root', matches: 'sauvegarde', schedule: '30 2 * * *' } },
      { at: { matches: 'reboot' } },
      { disk: { mount: '/srv/partage', persistent: true, minSize: '5G' } },
      { lvm: { vg: 'vg_data', lv: 'lv_partage' } },
      { package: { name: 'apache2', installed: false } },
      { process: { matches: 'calcul', running: false } },
    ];
    for (const condition of ok) expect(conditionSchema.safeParse(condition).success).toBe(true);
    expect(conditionSchema.safeParse({ net: { ip: '192.168.10.30' } }).success).toBe(false);
    expect(conditionSchema.safeParse({ user: { name: 'x', admin: true } }).success).toBe(false);
    expect(conditionSchema.safeParse({ cron: { matches: '(' } }).success).toBe(false);
  });
});
