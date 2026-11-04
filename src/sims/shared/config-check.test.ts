import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import type { Machine } from './types';
import { checkApache, checkServiceConfig, checkSshd } from './config-check';

const web = debianServer({ services: { apache2: { state: 'active' } } });

/** Remplace le site par défaut d'Apache. */
function site(content: string): Machine {
  const path = '/etc/apache2/sites-available/000-default.conf';
  const node = web.fs[path];
  if (node?.type !== 'file') throw new Error('site par défaut absent');
  return { ...web, fs: { ...web.fs, [path]: { ...node, content } } };
}

describe('checkApache', () => {
  it('accepte la configuration du paquet', () => {
    expect(checkApache(web)).toMatchObject({ ok: true, errors: [] });
  });

  it('repère une balise fermante qui ne correspond pas', () => {
    const result = checkApache(site('<VirtualHost *:80>\n<Directory /var/www>\n</VirtualHost>\n'));
    expect(result.errors).toEqual([
      'AH00526: Syntax error on line 3 of /etc/apache2/sites-enabled/000-default.conf:',
      'Expected </Directory> but saw </VirtualHost>',
    ]);
  });

  it('repère une section inconnue', () => {
    const result = checkApache(site('<VirtualHots *:80>\n</VirtualHots>\n'));
    expect(result.errors[1]).toBe(
      "Invalid command '<VirtualHots', perhaps misspelled or defined by a module not included in the server configuration",
    );
  });

  it('ne lit pas un site désactivé', () => {
    const { ['/etc/apache2/sites-enabled/000-default.conf']: _link, ...fs } = site('Faux\n').fs;
    expect(checkApache({ ...web, fs }).ok).toBe(true);
  });
});

describe('checkSshd et checkServiceConfig', () => {
  it('compte toutes les options inconnues', () => {
    const node = web.fs['/etc/ssh/sshd_config'];
    if (node?.type !== 'file') throw new Error('sshd_config absent');
    const bad = {
      ...web,
      fs: { ...web.fs, '/etc/ssh/sshd_config': { ...node, content: 'Prot 22\nUseDSN no\n' } },
    };
    expect(checkSshd(bad).errors).toHaveLength(3);
    expect(checkSshd(bad).errors[2]).toBe(
      '/etc/ssh/sshd_config: terminating, 2 bad configuration options',
    );
    expect(checkServiceConfig(bad, 'ssh').ok).toBe(false);
  });

  it('ne vérifie pas les services sans contrôle connu', () => {
    expect(checkServiceConfig(web, 'cron')).toEqual({ ok: true, errors: [], warnings: [] });
  });
});
