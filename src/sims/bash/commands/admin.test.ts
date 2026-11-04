import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import type { Machine } from '@sims/shared/types';
import { runLine, runLines } from '../test-utils';

const web = debianServer({ services: { apache2: { state: 'active' } } });

/** Machine avec un fichier remplacé. */
function withFile(machine: Machine, path: string, content: string): Machine {
  const node = machine.fs[path];
  return {
    ...machine,
    fs: {
      ...machine.fs,
      [path]: {
        type: 'file',
        owner: 'root',
        group: 'root',
        mode: 0o644,
        mtime: 0,
        ...(node?.type === 'file' ? node : {}),
        content,
      },
    },
  };
}

describe('apache2ctl', () => {
  it('valide la configuration du paquet, avec l’avertissement ServerName', () => {
    const out = runLine(web, 'sudo apache2ctl configtest');
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toMatch(/^AH00558: apache2: Could not reliably determine/);
    expect(out.stderr.endsWith('Syntax OK\n')).toBe(true);
    expect(runLine(web, 'sudo apachectl -t').stderr).toContain('Syntax OK');
  });

  it('montre la ligne fautive et refuse de redémarrer', () => {
    const broken = withFile(
      web,
      '/etc/apache2/sites-available/000-default.conf',
      '<VirtualHost *:80>\n\tDocumentRot /var/www/html\n</VirtualHost>\n',
    );
    const out = runLine(broken, 'sudo apache2ctl configtest');
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toBe(
      'AH00526: Syntax error on line 2 of /etc/apache2/sites-enabled/000-default.conf:\n' +
        "Invalid command 'DocumentRot', perhaps misspelled or defined by a module not included in the server configuration\n" +
        "Action 'configtest' failed.\nThe Apache error log may have more information.\n",
    );
    const restart = runLine(broken, 'sudo apache2ctl restart');
    expect(restart.exitCode).toBe(1);
    expect(restart.stderr).toContain("Action 'restart' failed.");
    expect(restart.state.services['apache2']?.state).toBe('active');
  });

  it('signale une section non fermée et un DocumentRoot absent', () => {
    const open = withFile(
      web,
      '/etc/apache2/sites-available/000-default.conf',
      '<VirtualHost *:80>\n\tDocumentRoot /var/www/intranet\n',
    );
    expect(runLine(open, 'sudo apache2ctl -t').stderr).toContain('<VirtualHost> was not closed.');
    const missing = withFile(
      web,
      '/etc/apache2/sites-available/000-default.conf',
      '<VirtualHost *:80>\n\tDocumentRoot /var/www/intranet\n</VirtualHost>\n',
    );
    const out = runLine(missing, 'sudo apache2ctl -t');
    expect(out.exitCode).toBe(0);
    expect(out.stderr).toContain(
      'AH00112: Warning: DocumentRoot [/var/www/intranet] does not exist',
    );
  });

  it('pilote le service via systemd', () => {
    const stopped = runLine(web, 'sudo apache2ctl stop').state;
    expect(stopped.services['apache2']?.state).toBe('inactive');
    expect(runLine(stopped, 'sudo apache2ctl start').state.services['apache2']?.state).toBe(
      'active',
    );
    expect(runLine(web, 'sudo apache2ctl').stderr).toMatch(/^Usage: apache2ctl start\|stop/);
  });

  it('n’est pas dans le PATH d’un utilisateur', () => {
    expect(runLine(web, 'apache2ctl configtest').stderr).toBe(
      'bash: apache2ctl : commande introuvable\n',
    );
  });
});

describe('a2ensite et a2dissite', () => {
  const withSite = withFile(
    web,
    '/etc/apache2/sites-available/intranet.conf',
    '<VirtualHost *:80>\n\tServerName intranet.labcorp.lan\n\tDocumentRoot /var/www/html\n</VirtualHost>\n',
  );

  it('active un site par un lien dans sites-enabled', () => {
    const out = runLine(withSite, 'sudo a2ensite intranet');
    expect(out.stdout).toBe(
      'Enabling site intranet.\nTo activate the new configuration, you need to run:\n  systemctl reload apache2\n',
    );
    const link = out.state.fs['/etc/apache2/sites-enabled/intranet.conf'];
    expect(link).toMatchObject({ type: 'symlink', target: '../sites-available/intranet.conf' });
    expect(runLine(out.state, 'sudo a2ensite intranet.conf').stdout).toBe(
      'Site intranet already enabled\n',
    );
  });

  it('désactive un site', () => {
    const out = runLine(web, 'sudo a2dissite 000-default');
    expect(out.stdout).toMatch(/^Site 000-default disabled\.\n/);
    expect(out.state.fs['/etc/apache2/sites-enabled/000-default.conf']).toBeUndefined();
    expect(runLine(out.state, 'sudo a2dissite 000-default').stdout).toBe(
      'Site 000-default already disabled\n',
    );
  });

  it('refuse un site inconnu', () => {
    const out = runLine(web, 'sudo a2ensite extranet');
    expect(out.stderr).toBe('ERROR: Site extranet does not exist!\n');
    expect(out.exitCode).toBe(1);
  });
});

describe('sshd -t', () => {
  it('ne dit rien quand la configuration est bonne', () => {
    const out = runLine(web, 'sudo sshd -t');
    expect(out).toMatchObject({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('nomme l’option inconnue et la valeur refusée', () => {
    const bad = withFile(web, '/etc/ssh/sshd_config', 'Port 22\nPermitRootLogn no\n');
    const out = runLine(bad, 'sudo sshd -t');
    expect(out.exitCode).toBe(255);
    expect(out.stderr).toBe(
      '/etc/ssh/sshd_config: line 2: Bad configuration option: PermitRootLogn\n' +
        '/etc/ssh/sshd_config: terminating, 1 bad configuration options\n',
    );
    const value = withFile(web, '/etc/ssh/sshd_config', 'PasswordAuthentication non\n');
    expect(runLine(value, 'sudo sshd -t').stderr).toBe(
      '/etc/ssh/sshd_config line 1: unsupported option "non".\n',
    );
    const port = withFile(web, '/etc/ssh/sshd_config', 'Port 2a22\n');
    expect(runLine(port, 'sudo sshd -t').stderr).toBe(
      '/etc/ssh/sshd_config line 1: Badly formatted port number.\n',
    );
  });

  it('empêche ssh de redémarrer avec une configuration fausse', () => {
    const bad = withFile(web, '/etc/ssh/sshd_config', 'PermitRootLogn no\n');
    const restarted = runLine(bad, 'sudo systemctl restart ssh');
    expect(restarted.state.services['ssh']?.state).toBe('failed');
    const status = runLine(restarted.state, 'systemctl status ssh').stdout;
    expect(status).toContain('status=255/EXCEPTION');
    const journal = runLine(restarted.state, 'sudo journalctl -u ssh').stdout;
    expect(journal).toContain('Bad configuration option: PermitRootLogn');
  });
});

describe('service', () => {
  it('est réservé aux administrateurs (/usr/sbin)', () => {
    expect(runLine(web, 'service apache2 status').stderr).toBe(
      'bash: service : commande introuvable\n',
    );
  });

  it('relaie vers systemctl', () => {
    const stopped = runLine(web, 'sudo service apache2 stop').state;
    expect(stopped.services['apache2']?.state).toBe('inactive');
    expect(runLine(web, 'sudo service apache2 status').stdout).toContain(
      'Active: active (running)',
    );
    expect(runLine(web, 'sudo service tomcat start').stderr).toBe('tomcat: unrecognized service\n');
  });

  it('liste l’état de tous les services', () => {
    const out = runLine(
      runLine(web, 'sudo service apache2 stop').state,
      'sudo service --status-all',
    );
    expect(out.stdout).toContain(' [ - ]  apache2\n');
    expect(out.stdout).toContain(' [ + ]  ssh\n');
  });
});

describe('reboot', () => {
  it('demande les droits root', () => {
    const out = runLine(web, '/usr/sbin/reboot');
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain('Interactive authentication required');
  });

  it('perd ce qui n’est pas permanent', () => {
    const before = runLines(web, [
      'sudo systemctl disable apache2',
      'sudo systemctl start apache2',
      'sudo ip addr add 192.168.10.99/24 dev ens33',
      'sudo -i',
      'cd /etc',
    ]).state;
    expect(before.session.user).toBe('root');
    const out = runLine(before, 'reboot');
    expect(out.stdout).toContain('Connection to srv-web01 closed by remote host.');
    const after = out.state;
    expect(after.services['apache2']?.state).toBe('inactive');
    expect(after.services['ssh']?.state).toBe('active');
    expect(after.interfaces.find((i) => i.name === 'ens33')?.ipv4).toBe('192.168.10.20/24');
    expect(after.session.user).toBe('hugo');
    expect(after.session.cwd).toBe('/home/hugo');
    expect(after.bootTime).toBe(Date.UTC(2026, 10, 3, 8, 31, 44));
    expect(runLine(after, 'uptime').stdout).toContain('up 0 min');
  });

  it('garde un service activé et un montage décrit dans fstab', () => {
    const disks = debianServer({
      services: { apache2: { state: 'active' } },
      extraDisks: [{ name: 'sdb', size: '2G' }],
    });
    const ready = runLines(disks, [
      'sudo mkfs.ext4 /dev/sdb',
      'sudo mkdir /srv/a /srv/b',
      'sudo mount /dev/sdb /srv/a',
    ]).state;
    const lost = runLine(ready, 'sudo reboot').state;
    expect(lost.disks.some((d) => d.mount === '/srv/a')).toBe(false);
    expect(lost.services['apache2']?.state).toBe('active');

    const fstab = ready.fs['/etc/fstab'];
    const content = fstab?.type === 'file' ? fstab.content : '';
    const kept = withFile(ready, '/etc/fstab', `${content}/dev/sdb /srv/a ext4 defaults 0 2\n`);
    expect(runLine(kept, 'sudo reboot').state.disks.some((d) => d.mount === '/srv/a')).toBe(true);
  });

  it('signale une entrée de fstab qui ne monte pas', () => {
    const fstab = web.fs['/etc/fstab'];
    const content = fstab?.type === 'file' ? fstab.content : '';
    const typo = withFile(
      web,
      '/etc/fstab',
      `${content}UUID=0000-dead /srv/data ext4 defaults 0 2\n`,
    );
    const out = runLine(typo, 'sudo reboot');
    expect(out.stdout).toContain('[ TIME ] Timed out waiting for device UUID=0000-dead.');
    expect(out.stdout).toContain('[DEPEND] Dependency failed for /srv/data.');
    const tolerant = withFile(
      web,
      '/etc/fstab',
      `${content}UUID=0000-dead /srv/data ext4 defaults,nofail 0 2\n`,
    );
    expect(runLine(tolerant, 'sudo reboot').stdout).not.toContain('[DEPEND]');
  });

  it('reste hors ligne si la configuration réseau est fausse', () => {
    const iface = web.fs['/etc/network/interfaces'];
    const content = iface?.type === 'file' ? iface.content : '';
    const broken = withFile(web, '/etc/network/interfaces', content.replace(/\taddress .*\n/, ''));
    const out = runLine(broken, 'sudo reboot');
    expect(out.stdout).toContain('[FAILED] Failed to start networking.service');
    expect(out.stdout).toContain("n'a plus d'adresse IP");
    expect(out.state.interfaces.find((i) => i.name === 'ens33')?.ipv4).toBeNull();
  });

  it('éteint aussi avec poweroff et shutdown now', () => {
    expect(runLine(web, 'sudo poweroff').stdout).toContain('The system will power off now!');
    expect(runLine(web, 'sudo shutdown -r now').stdout).toContain('The system will reboot now!');
  });
});

describe('shutdown', () => {
  it('programme puis annule un arrêt', () => {
    const later = runLine(web, 'sudo shutdown -r 23:00');
    expect(later.stdout).toMatch(
      /^Shutdown scheduled for Tue 2026-11-03 23:00:00 CET, use 'shutdown -c' to cancel\.\n/,
    );
    expect(later.stdout).toContain('The system will reboot at Tue 2026-11-03 23:00:00 CET!');
    expect(later.state.scheduledShutdown).toEqual({
      time: Date.UTC(2026, 10, 3, 22, 0),
      reboot: true,
    });
    expect(runLine(later.state, 'sudo shutdown -c').state.scheduledShutdown).toBeUndefined();
    expect(runLine(web, 'sudo shutdown +10').state.scheduledShutdown?.time).toBe(
      Date.UTC(2026, 10, 3, 8, 41, 44),
    );
    expect(runLine(web, 'sudo shutdown demain').stderr).toBe(
      'Failed to parse time specification: demain\n',
    );
  });
});
