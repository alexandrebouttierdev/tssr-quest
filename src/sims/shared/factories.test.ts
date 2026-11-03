import { describe, expect, it } from 'vitest';
import { createDebianServer, deviceUuid, networkAddress } from './factories';
import { readFile } from './fs';

describe('fabrique createDebianServer', () => {
  it("crée l'arborescence FHS de base", () => {
    const machine = createDebianServer({ hostname: 'srv-web01' });

    for (const dir of ['/etc', '/var/log', '/home', '/usr/bin', '/tmp', '/root', '/srv', '/opt']) {
      expect(machine.fs[dir]?.type, dir).toBe('dir');
    }
    expect(machine.fs['/tmp']?.mode).toBe(0o1777);
    expect(machine.fs['/bin']).toMatchObject({ type: 'symlink', target: 'usr/bin' });
  });

  it('écrit le nom de la machine dans /etc/hostname', () => {
    const machine = createDebianServer({ hostname: 'srv-web01' });

    expect(readFile(machine, '/etc/hostname', 'root')).toEqual({ ok: true, value: 'srv-web01\n' });
  });

  it('crée les comptes, leur dossier personnel et /etc/passwd', () => {
    const machine = createDebianServer({ users: ['hugo'], sudoers: ['hugo'] });

    expect(machine.users['hugo']).toMatchObject({ uid: 1000, group: 'hugo', home: '/home/hugo' });
    expect(machine.fs['/home/hugo']).toMatchObject({ type: 'dir', owner: 'hugo', mode: 0o700 });
    expect(machine.groups['sudo']?.members).toContain('hugo');
    const passwd = readFile(machine, '/etc/passwd', 'hugo');
    expect(passwd.ok && passwd.value).toContain('hugo:x:1000:1000:hugo,,,:/home/hugo:/bin/bash');
  });

  it('ouvre la session demandée', () => {
    const machine = createDebianServer({ users: ['hugo'], session: { user: 'hugo' } });

    expect(machine.session).toMatchObject({ user: 'hugo', cwd: '/home/hugo' });
    expect(machine.session.env['HOME']).toBe('/home/hugo');
  });

  it('applique les fichiers de la mission, crée leurs dossiers et en supprime', () => {
    const machine = createDebianServer({
      files: {
        '/srv/app/config.ini': { content: 'a=1\n', owner: 'root', mode: '0600' },
        '/etc/motd': null,
      },
    });

    expect(machine.fs['/srv/app']?.type).toBe('dir');
    expect(machine.fs['/srv/app/config.ini']).toMatchObject({ content: 'a=1\n', mode: 0o600 });
    expect(machine.fs['/etc/motd']).toBeUndefined();
  });

  it('crée un dossier ou un lien quand la mission le demande', () => {
    const machine = createDebianServer({
      files: {
        '/srv/partage': { type: 'dir', mode: '2775', group: 'users' },
        '/srv/lien': { type: 'symlink', target: '/srv/partage' },
      },
    });

    expect(machine.fs['/srv/partage']).toMatchObject({ type: 'dir', mode: 0o2775, group: 'users' });
    expect(machine.fs['/srv/lien']).toMatchObject({ type: 'symlink', target: '/srv/partage' });
  });

  it("installe le paquet d'un service demandé et produit le journal de sa panne", () => {
    const machine = createDebianServer({
      now: Date.UTC(2026, 10, 3, 8, 26),
      disks: [{ mount: '/var', size: '20G', used: '20G' }],
      services: { apache2: { state: 'failed', failure: 'no-space-left' } },
    });

    expect(machine.packages['apache2']?.installed).toBe(true);
    expect(machine.services['apache2']).toMatchObject({ state: 'failed', enabled: true });
    expect(machine.logs['apache2']?.length).toBeGreaterThan(3);
    expect(machine.disks.find((d) => d.mount === '/var')?.device).toBe('/dev/sda3');
  });

  it('refuse un service absent du catalogue', () => {
    expect(() => createDebianServer({ services: { inconnu: { state: 'active' } } })).toThrow(
      /Service inconnu/,
    );
  });

  it('refuse une session sur un compte inexistant', () => {
    expect(() => createDebianServer({ session: { user: 'fantome' } })).toThrow(/Compte inconnu/);
  });
});

describe('adresses réseau', () => {
  it.each([
    ['192.168.10.20', 24, '192.168.10.0'],
    ['10.1.2.3', 8, '10.0.0.0'],
    ['172.16.5.130', 26, '172.16.5.128'],
    ['8.8.8.8', 0, '0.0.0.0'],
  ])('calcule le réseau de %s/%d', (address, prefix, expected) => {
    expect(networkAddress(address, prefix)).toBe(expected);
  });

  it('configure lo et une interface avec la passerelle par défaut', () => {
    const machine = createDebianServer({
      network: { address: '10.0.0.5', prefix: 16, gateway: '10.0.0.1' },
    });

    expect(machine.interfaces.map((i) => [i.name, i.ipv4])).toEqual([
      ['lo', '127.0.0.1/8'],
      ['ens33', '10.0.0.5/16'],
    ]);
    expect(machine.routes[0]).toEqual({
      destination: 'default',
      gateway: '10.0.0.1',
      device: 'ens33',
    });
  });

  it('produit des UUID de disque stables et bien formés', () => {
    expect(deviceUuid('srv', '/dev/sda1')).toBe(deviceUuid('srv', '/dev/sda1'));
    expect(deviceUuid('srv', '/dev/sda1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('fichiers de comptes', () => {
  it('écrit /etc/shadow avec un mot de passe verrouillé pour les comptes sans mot de passe', () => {
    const machine = createDebianServer({ users: [{ name: 'hugo', password: 'Azerty123' }] });

    const shadow = readFile(machine, '/etc/shadow', 'root');

    expect(shadow.ok && shadow.value).toMatch(/^hugo:\$y\$j9T\$/m);
    expect(shadow.ok && shadow.value).toMatch(/^www-data:\*:/m);
    expect(readFile(machine, '/etc/shadow', 'hugo').ok).toBe(false);
  });

  it('remplace le disque racine et ajoute des groupes de mission', () => {
    const machine = createDebianServer({
      users: [{ name: 'hugo', groups: ['web'] }],
      groups: { web: [] },
      disks: [{ mount: '/', size: '50G', used: '10G' }],
    });

    expect(machine.disks.find((d) => d.mount === '/')?.size).toBe(50 * 1024 ** 3);
    expect(machine.groups['web']?.members).toEqual(['hugo']);
  });

  it('refuse un mode illisible et un groupe inconnu', () => {
    expect(() => createDebianServer({ files: { '/srv/x': { mode: '9999' } } })).toThrow(
      /Mode invalide/,
    );
    expect(() => createDebianServer({ users: [{ name: 'a', groups: ['absent'] }] })).toThrow(
      /Groupe inconnu/,
    );
  });

  it('retire un service par défaut et accepte un service arrêté sans panne', () => {
    const machine = createDebianServer({
      services: {
        rsyslog: null,
        nginx: { state: 'inactive' },
        mariadb: { state: 'failed', failure: 'port-in-use' },
      },
    });

    expect(machine.services['rsyslog']).toBeUndefined();
    expect(machine.services['nginx']).toMatchObject({ state: 'inactive', failure: null });
    expect(machine.services['mariadb']?.failure).toEqual({ kind: 'port-in-use', port: 3306 });
  });
});
