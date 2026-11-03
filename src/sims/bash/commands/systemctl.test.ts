import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const broken = debianServer({
  now: Date.UTC(2026, 10, 3, 8, 26),
  groups: { adm: ['hugo'] },
  disks: [{ mount: '/var', size: '20G', used: '20G' }],
  files: { '/var/log/debug.log': { size: '18G', owner: 'root', group: 'adm', mode: '0640' } },
  services: { apache2: { state: 'failed', failure: 'no-space-left' } },
});

describe('systemctl status', () => {
  it("affiche l'état d'un service en échec et la raison dans le journal", () => {
    const result = runLine(broken, 'systemctl status apache2');

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toMatchInlineSnapshot(`
      "× apache2.service - The Apache HTTP Server
           Loaded: loaded (/lib/systemd/system/apache2.service; enabled; preset: enabled)
           Active: failed (Result: exit-code) since Tue 2026-11-03 08:14:00 CET; 1h 17min ago
             Docs: https://httpd.apache.org/docs/2.4/
          Process: 660 ExecStart=/usr/sbin/apachectl start (code=exited, status=1/FAILURE)
              CPU: 24ms

      nov. 03 08:14:00 srv-web01 systemd[1]: Starting apache2.service - The Apache HTTP Server...
      nov. 03 08:14:00 srv-web01 apachectl[663]: (28)No space left on device: AH00023: Couldn't create the proxy mutex
      nov. 03 08:14:00 srv-web01 apachectl[663]: AH00016: Configuration Failed
      nov. 03 08:14:00 srv-web01 apachectl[660]: Action 'start' failed.
      nov. 03 08:14:00 srv-web01 apachectl[660]: The Apache error log may have more information.
      nov. 03 08:14:00 srv-web01 systemd[1]: apache2.service: Control process exited, code=exited, status=1/FAILURE
      nov. 03 08:14:00 srv-web01 systemd[1]: apache2.service: Failed with result 'exit-code'.
      nov. 03 08:14:00 srv-web01 systemd[1]: Failed to start apache2.service - The Apache HTTP Server.
      "
    `);
  });

  it('enregistre la consultation comme réussie malgré le code 3', () => {
    const result = runLine(broken, 'systemctl status apache2.service');

    expect(result.state.history.at(-1)).toMatchObject({
      command: 'systemctl status apache2.service',
      ok: true,
      exitCode: 3,
    });
  });

  it('masque le journal à un compte hors des groupes adm et systemd-journal', () => {
    const julie = debianServer({ user: 'julie', services: { apache2: { state: 'active' } } });

    expect(runLine(julie, 'systemctl status apache2').stdout).not.toContain('Started');
  });

  it('affiche un service actif avec ses processus', () => {
    const ok = runLines(broken, ['sudo rm /var/log/debug.log', 'sudo systemctl restart apache2']);
    const status = runLine(ok.state, 'systemctl status apache2');

    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain('● apache2.service - The Apache HTTP Server');
    expect(status.stdout).toContain(
      'Active: active (running) since Tue 2026-11-03 09:31:44 CET; now',
    );
    expect(status.stdout).toMatch(/└─\d+ \/usr\/sbin\/apache2 -k start/);
  });

  it('affiche un service arrêté', () => {
    const machine = debianServer({ services: { nginx: { state: 'inactive', enabled: false } } });

    const out = runLine(machine, 'systemctl status nginx').stdout;

    expect(out).toContain('○ nginx.service');
    expect(out).toContain('disabled; preset: enabled)');
    expect(out).toContain('Active: inactive (dead)');
  });

  it('signale une unité inconnue avec le code 4', () => {
    const result = runLine(broken, 'systemctl status inconnu');

    expect(result.stderr).toBe('Unit inconnu.service could not be found.\n');
    expect(result.exitCode).toBe(4);
  });

  it("résume l'état de la machine sans argument", () => {
    expect(runLine(broken, 'systemctl status').stdout).toBe('● srv-web01\n    State: degraded\n');
  });
});

describe('systemctl start, stop, restart', () => {
  it('demande les droits root', () => {
    expect(runLine(broken, 'systemctl restart apache2').stderr).toBe(
      'Failed to restart apache2.service: Interactive authentication required.\n',
    );
  });

  it('échoue tant que la cause de la panne demeure', () => {
    const result = runLine(broken, 'sudo systemctl restart apache2');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      'Job for apache2.service failed because the control process exited with error code.\nSee "systemctl status apache2.service" and "journalctl -xeu apache2.service" for details.\n',
    );
  });

  it('démarre une fois le disque libéré, quelle que soit la méthode', () => {
    const result = runLines(broken, ['sudo rm /var/log/debug.log', 'sudo systemctl start apache2']);

    expect(result.exitCode).toBe(0);
    expect(result.state.services['apache2']?.state).toBe('active');
  });

  it('arrête un service, et accepte reload', () => {
    const machine = debianServer({ services: { apache2: { state: 'active' } } });

    expect(runLine(machine, 'sudo systemctl stop apache2').state.services['apache2']?.state).toBe(
      'inactive',
    );
    expect(runLine(machine, 'sudo systemctl reload apache2').exitCode).toBe(0);
  });

  it('signale une unité inconnue et un argument manquant', () => {
    expect(runLine(broken, 'sudo systemctl start inconnu').stderr).toBe(
      'Failed to start inconnu.service: Unit inconnu.service not found.\n',
    );
    expect(runLine(broken, 'sudo systemctl start').stderr).toBe('Too few arguments.\n');
  });
});

describe('systemctl enable, disable et requêtes', () => {
  const machine = debianServer({ services: { nginx: { state: 'inactive', enabled: false } } });

  it('active le démarrage automatique, et démarre avec --now', () => {
    const result = runLine(machine, 'sudo systemctl enable --now nginx');

    expect(result.stderr).toContain(
      'Created symlink /etc/systemd/system/multi-user.target.wants/nginx.service',
    );
    expect(result.state.services['nginx']).toMatchObject({ enabled: true, state: 'active' });
  });

  it('désactive le démarrage automatique', () => {
    const result = runLine(debianServer({}), 'sudo systemctl disable --now cron');

    expect(result.stderr).toContain(
      'Removed "/etc/systemd/system/multi-user.target.wants/cron.service".',
    );
    expect(result.state.services['cron']).toMatchObject({ enabled: false, state: 'inactive' });
  });

  it('refuse enable sans droits ni unité', () => {
    expect(runLine(machine, 'systemctl enable nginx').stderr).toBe(
      'Failed to enable unit: Interactive authentication required.\n',
    );
    expect(runLine(machine, 'sudo systemctl enable inconnu').stderr).toBe(
      'Failed to enable unit: Unit file inconnu.service does not exist.\n',
    );
    expect(runLine(machine, 'sudo systemctl enable').exitCode).toBe(1);
  });

  it('répond à is-active, is-enabled et is-failed', () => {
    expect(runLine(machine, 'systemctl is-active nginx')).toMatchObject({
      stdout: 'inactive\n',
      exitCode: 3,
    });
    expect(runLine(machine, 'systemctl is-active ssh')).toMatchObject({
      stdout: 'active\n',
      exitCode: 0,
    });
    expect(runLine(machine, 'systemctl is-enabled nginx')).toMatchObject({
      stdout: 'disabled\n',
      exitCode: 1,
    });
    expect(runLine(machine, 'systemctl is-enabled inconnu').stdout).toBe('not-found\n');
    expect(runLine(broken, 'systemctl is-failed apache2')).toMatchObject({
      stdout: 'failed\n',
      exitCode: 0,
    });
  });

  it('liste les services chargés et ceux en échec', () => {
    expect(runLine(broken, 'systemctl list-units --type=service').stdout).toContain(
      '● apache2.service loaded failed failed',
    );
    expect(runLine(broken, 'systemctl --failed').stdout).toContain('1 loaded units listed.');
  });

  it('accepte daemon-reload et refuse un verbe inconnu', () => {
    expect(runLine(machine, 'sudo systemctl daemon-reload').exitCode).toBe(0);
    expect(runLine(machine, 'systemctl danse').stderr).toBe('Unknown command verb danse.\n');
  });
});
