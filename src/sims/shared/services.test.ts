import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { removePath } from './fs';
import { restartService, startService, stopService } from './services';

const NOW = Date.UTC(2026, 10, 3, 8, 31, 44);

describe('services systemd', () => {
  it('démarre un service arrêté et lui attribue un PID et ses processus', () => {
    const machine = debianServer({ services: { apache2: { state: 'inactive' } } });

    const { machine: after, ok } = startService(machine, 'apache2', NOW);

    expect(ok).toBe(true);
    expect(after.services['apache2']).toMatchObject({ state: 'active', since: NOW });
    const pid = after.services['apache2']?.mainPid;
    expect(after.processes.some((p) => p.pid === pid && p.command.includes('apache2'))).toBe(true);
    expect(after.logs['apache2']?.at(-1)?.message).toBe(
      'Started apache2.service - The Apache HTTP Server.',
    );
  });

  it('échoue au démarrage tant que le disque est plein', () => {
    const machine = debianServer({
      disks: [{ mount: '/var', size: '20G', used: '20G' }],
      files: { '/var/log/debug.log': { size: '18G' } },
      services: { apache2: { state: 'failed', failure: 'no-space-left' } },
    });

    const { machine: after, ok } = startService(machine, 'apache2', NOW);

    expect(ok).toBe(false);
    expect(after.services['apache2']?.state).toBe('failed');
    expect(after.logs['apache2']?.map((l) => l.message)).toContain(
      "(28)No space left on device: AH00023: Couldn't create the proxy mutex",
    );
  });

  it('redémarre dès que la cause de la panne a disparu', () => {
    const machine = debianServer({
      disks: [{ mount: '/var', size: '20G', used: '20G' }],
      files: { '/var/log/debug.log': { size: '18G' } },
      services: { apache2: { state: 'failed', failure: 'no-space-left' } },
    });
    const cleaned = removePath(machine, '/var/log/debug.log', 'root', {});
    if (!cleaned.ok) throw new Error('préparation');

    const { machine: after, ok } = restartService(cleaned.value, 'apache2', NOW);

    expect(ok).toBe(true);
    expect(after.services['apache2']).toMatchObject({ state: 'active', failure: null });
  });

  it('échoue si un autre service actif occupe le port', () => {
    const machine = debianServer({
      services: { nginx: { state: 'active' }, apache2: { state: 'inactive' } },
    });

    const { machine: after, ok } = startService(machine, 'apache2', NOW);

    expect(ok).toBe(false);
    expect(after.services['apache2']?.state).toBe('failed');
    expect(after.logs['apache2']?.map((l) => l.message).join('\n')).toContain(
      'Address already in use',
    );
  });

  it('arrête un service et retire ses processus', () => {
    const machine = debianServer({ services: { apache2: { state: 'active' } } });
    const pid = machine.services['apache2']?.mainPid;

    const { machine: after } = stopService(machine, 'apache2', NOW);

    expect(after.services['apache2']).toMatchObject({ state: 'inactive', mainPid: null });
    expect(after.processes.some((p) => p.pid === pid)).toBe(false);
  });

  it('ne fait rien pour un service inconnu', () => {
    const machine = debianServer({});

    expect(startService(machine, 'inconnu', NOW)).toEqual({ machine, ok: false });
    expect(stopService(machine, 'inconnu', NOW)).toEqual({ machine, ok: false });
  });

  it('laisse un service déjà actif tel quel au démarrage', () => {
    const machine = debianServer({});

    const { machine: after, ok } = startService(machine, 'ssh', NOW);

    expect(ok).toBe(true);
    expect(after.services['ssh']).toEqual(machine.services['ssh']);
  });
});
