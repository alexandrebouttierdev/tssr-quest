import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '../test-utils';

const machine = debianServer({
  now: Date.UTC(2026, 10, 3, 8, 26),
  groups: { adm: ['hugo'] },
  services: { apache2: { state: 'failed', failure: 'no-space-left' } },
  disks: [{ mount: '/var', size: '20G', used: '20G' }],
});

describe('commande journalctl', () => {
  it("affiche le journal d'un service", () => {
    const out = runLine(machine, 'journalctl -u apache2').stdout;

    expect(out.split('\n')[0]).toBe(
      'nov. 03 08:14:00 srv-web01 systemd[1]: Starting apache2.service - The Apache HTTP Server...',
    );
    expect(out).toContain(
      "apachectl[663]: (28)No space left on device: AH00023: Couldn't create the proxy mutex",
    );
  });

  it('limite le nombre de lignes avec -n', () => {
    expect(runLine(machine, 'journalctl -u apache2 -n 1').stdout).toBe(
      'nov. 03 08:14:00 srv-web01 systemd[1]: Failed to start apache2.service - The Apache HTTP Server.\n',
    );
    expect(runLine(machine, 'journalctl --unit=apache2 --lines=2').stdout.split('\n')).toHaveLength(
      3,
    );
  });

  it('ajoute les explications de systemd avec -xe', () => {
    const out = runLine(machine, 'journalctl -xeu apache2').stdout;

    expect(out).toContain('░░ Subject: A start job for unit apache2.service has failed');
  });

  it('fusionne les journaux de tous les services sans -u', () => {
    const out = runLine(machine, 'journalctl --no-pager').stdout;

    expect(out).toContain('Started ssh.service - OpenBSD Secure Shell server.');
    expect(out).toContain('Started cron.service');
  });

  it('explique les démarrages réussis avec -x', () => {
    expect(runLine(machine, 'journalctl -x -u ssh').stdout).toContain('has finished successfully');
  });

  it("indique quand il n'y a aucune entrée", () => {
    expect(runLine(machine, 'journalctl -u inconnu').stdout).toBe('-- No entries --\n');
  });

  it('prévient un compte qui ne peut pas lire le journal système', () => {
    const result = runLine(debianServer({ user: 'julie' }), 'journalctl -u ssh');

    expect(result.stdout).toBe('-- No entries --\n');
    expect(result.stderr).toContain(
      "Users in groups 'adm', 'systemd-journal' can see all messages.",
    );
  });

  it('suit le journal avec -f (dernières lignes)', () => {
    expect(runLine(machine, 'journalctl -f -u apache2').stdout.split('\n')).toHaveLength(9);
  });

  it('signale les options invalides', () => {
    expect(runLine(machine, 'journalctl -z').exitCode).toBe(1);
    expect(runLine(machine, 'journalctl -u').exitCode).toBe(1);
    expect(runLine(machine, 'journalctl apache2').stderr).toBe(
      "Failed to add match 'apache2': Invalid argument\n",
    );
  });
});

describe('filtres de priorité et de démarrage', () => {
  it('ne garde que les erreurs avec -p err (ou 3)', () => {
    const out = runLine(machine, 'journalctl -p err').stdout;
    expect(out).toContain('Failed to start apache2.service');
    expect(out).not.toContain('No space left on device');
    expect(runLine(machine, 'journalctl -p 3 -b').stdout).toBe(out);
    expect(runLine(machine, 'journalctl --priority=info').stdout).toContain('No space left');
    expect(runLine(machine, 'journalctl -p grave').stderr).toBe(
      'Failed to parse priority value: grave\n',
    );
  });
});
