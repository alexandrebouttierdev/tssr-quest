import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { applyMode } from './permissions';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({
  groups: { compta: ['hugo'] },
  files: {
    '/srv/app.conf': { owner: 'hugo', mode: '0644' },
    '/srv/partage/a.txt': { owner: 'hugo' },
    '/etc/shadow-test': { owner: 'root', mode: '0640' },
  },
});

describe('calcul des modes', () => {
  it.each([
    ['640', 0o644, false, 0o640],
    ['2775', 0o755, true, 0o2775],
    ['u+x', 0o644, false, 0o744],
    ['g-w,o=', 0o664, false, 0o640],
    ['a+r', 0o600, false, 0o644],
    ['+x', 0o644, false, 0o755],
    ['u=rwx,g=rx,o=', 0o644, false, 0o750],
    ['g+s', 0o755, true, 0o2755],
    ['+t', 0o777, true, 0o1777],
    ['u+s', 0o755, false, 0o4755],
    ['a+X', 0o644, true, 0o755],
    ['a+X', 0o644, false, 0o644],
  ] as const)('%s appliqué à %o donne %o', (spec, current, isDir, expected) => {
    expect(applyMode(spec, current, isDir)).toBe(expected);
  });

  it('refuse une notation invalide', () => {
    expect(applyMode('u+z', 0o644, false)).toBeNull();
  });
});

describe('chmod', () => {
  it('applique un mode octal ou symbolique équivalent', () => {
    expect(runLine(machine, 'chmod 640 /srv/app.conf').state.fs['/srv/app.conf']?.mode).toBe(0o640);
    expect(
      runLine(machine, 'chmod u=rw,g=r,o= /srv/app.conf').state.fs['/srv/app.conf']?.mode,
    ).toBe(0o640);
  });

  it("refuse de modifier un fichier dont on n'est pas propriétaire", () => {
    const result = runLine(machine, 'chmod 777 /etc/shadow-test');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "chmod: modification des droits de '/etc/shadow-test': Opération non permise\n",
    );
  });

  it('applique récursivement et affiche les changements', () => {
    const result = runLine(machine, 'sudo chmod -Rv g+w /srv/partage');

    expect(result.state.fs['/srv/partage/a.txt']?.mode).toBe(0o664);
    expect(result.stdout).toContain(
      "mode de '/srv/partage/a.txt' changé de 0644 (rw-r--r--) en 0664 (rw-rw-r--)",
    );
    expect(runLine(machine, 'chmod -c 644 /srv/app.conf').stdout).toBe('');
    expect(runLine(machine, 'chmod -v 644 /srv/app.conf').stdout).toContain('conservé à 0644');
  });

  it('signale les erreurs', () => {
    expect(runLine(machine, 'chmod').stderr).toContain('opérande manquant');
    expect(runLine(machine, 'chmod 644').stderr).toContain("opérande manquant après '644'");
    expect(runLine(machine, 'chmod u+z x').stderr).toContain('mode incorrect');
    expect(runLine(machine, 'chmod 644 absent').stderr).toBe(
      "chmod: impossible d'accéder à 'absent': Aucun fichier ou dossier de ce type\n",
    );
    expect(runLine(machine, 'sudo chmod 777 /bin').exitCode).toBe(0);
  });
});

describe('chown et chgrp', () => {
  it('change le propriétaire (root) et le groupe', () => {
    expect(
      runLine(machine, 'sudo chown julie:compta /srv/app.conf').state.fs['/srv/app.conf'],
    ).toMatchObject({ owner: 'julie', group: 'compta' });
    expect(
      runLine(machine, 'sudo chown julie: /srv/app.conf').state.fs['/srv/app.conf'],
    ).toMatchObject({ owner: 'julie', group: 'julie' });
    expect(
      runLine(machine, 'sudo chown -R www-data /srv/partage').state.fs['/srv/partage/a.txt']?.owner,
    ).toBe('www-data');
    expect(runLine(machine, 'chown :compta /srv/app.conf').state.fs['/srv/app.conf']?.group).toBe(
      'compta',
    );
  });

  it('refuse de donner un fichier sans être root', () => {
    expect(runLine(machine, 'chown julie /srv/app.conf').stderr).toBe(
      "chown: modification du propriétaire de '/srv/app.conf': Opération non permise\n",
    );
    expect(runLine(machine, 'chown :julie /srv/app.conf').stderr).toContain(
      'modification du groupe',
    );
    expect(runLine(machine, 'sudo chown fantome x').stderr).toBe(
      'chown: utilisateur incorrect: « fantome »\n',
    );
    expect(runLine(machine, 'sudo chown hugo:fantome x').stderr).toBe(
      'chown: groupe incorrect: « hugo:fantome »\n',
    );
    expect(runLine(machine, 'chown').exitCode).toBe(1);
    expect(runLine(machine, 'chown hugo').exitCode).toBe(1);
  });

  it('change le groupe vers un groupe du propriétaire', () => {
    expect(runLine(machine, 'chgrp compta /srv/app.conf').state.fs['/srv/app.conf']?.group).toBe(
      'compta',
    );
    expect(runLine(machine, 'chgrp julie /srv/app.conf').stderr).toBe(
      "chgrp: modification du groupe de '/srv/app.conf': Opération non permise\n",
    );
    expect(
      runLine(machine, 'sudo chgrp -R julie /srv/partage').state.fs['/srv/partage/a.txt']?.group,
    ).toBe('julie');
    expect(runLine(machine, 'chgrp fantome x').exitCode).toBe(1);
    expect(runLine(machine, 'chgrp').exitCode).toBe(1);
    expect(runLine(machine, 'chgrp compta').exitCode).toBe(1);
  });
});

describe('umask', () => {
  it('affiche et change le masque, appliqué aux créations', () => {
    expect(runLine(machine, 'umask').stdout).toBe('0022\n');
    expect(runLine(machine, 'umask -S').stdout).toBe('u=rwx,g=rx,o=rx\n');
    const state = runLines(machine, ['umask 027', 'touch f', 'mkdir d']).state;
    expect(state.fs['/home/hugo/f']?.mode).toBe(0o640);
    expect(state.fs['/home/hugo/d']?.mode).toBe(0o750);
    expect(runLine(machine, 'umask 9').exitCode).toBe(1);
  });
});
