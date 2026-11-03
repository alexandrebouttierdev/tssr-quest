import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({
  files: {
    '/home/hugo/a.txt': { owner: 'hugo', content: 'alpha\n' },
    '/home/hugo/projet/x.txt': { owner: 'hugo', content: 'x\n' },
    '/srv/partage': { type: 'dir', mode: '2775', group: 'users' },
    '/etc/secret.conf': { content: 'mdp\n', mode: '0600' },
  },
});

describe('mkdir', () => {
  it('crée un dossier, avec ses parents en -p, et affiche les créations en -v', () => {
    const result = runLines(machine, ['mkdir -v docs', 'mkdir -p a/b/c', 'ls -d a/b/c']);

    expect(result.stdout).toBe('a/b/c\n');
    expect(runLine(machine, 'mkdir -v docs').stdout).toBe("mkdir: création du répertoire 'docs'\n");
  });

  it('applique un mode avec -m', () => {
    expect(runLine(machine, 'mkdir -m 750 prive').state.fs['/home/hugo/prive']?.mode).toBe(0o750);
    expect(runLine(machine, 'mkdir -m 9 x').stderr).toBe('mkdir: mode non valable « 9 »\n');
  });

  it('signale un dossier existant, un parent absent et un dossier protégé', () => {
    expect(runLine(machine, 'mkdir projet').stderr).toBe(
      'mkdir: impossible de créer le répertoire « projet »: Le fichier existe\n',
    );
    expect(runLine(machine, 'mkdir a/b').stderr).toBe(
      'mkdir: impossible de créer le répertoire « a/b »: Aucun fichier ou dossier de ce type\n',
    );
    expect(runLine(machine, 'mkdir /etc/app').stderr).toBe(
      'mkdir: impossible de créer le répertoire « /etc/app »: Permission non accordée\n',
    );
    expect(runLine(machine, 'mkdir').stderr).toContain('mkdir: opérande manquant');
    expect(runLine(machine, 'mkdir -z x').exitCode).toBe(1);
  });

  it('hérite du groupe et du bit setgid dans un dossier setgid', () => {
    const result = runLine(machine, 'sudo mkdir /srv/partage/compta');

    expect(result.state.fs['/srv/partage/compta']).toMatchObject({ group: 'users', mode: 0o2755 });
  });
});

describe('rmdir', () => {
  it('supprime un dossier vide, et ses parents avec -p', () => {
    const result = runLines(machine, ['mkdir -p a/b/c', 'rmdir -p a/b/c']);

    expect(result.state.fs['/home/hugo/a']).toBeUndefined();
  });

  it('refuse un dossier non vide ou un fichier', () => {
    expect(runLine(machine, 'rmdir projet').stderr).toBe(
      "rmdir: impossible de supprimer 'projet': Le dossier n'est pas vide\n",
    );
    expect(runLine(machine, 'rmdir a.txt').stderr).toBe(
      "rmdir: impossible de supprimer 'a.txt': N'est pas un dossier\n",
    );
    expect(runLine(machine, 'rmdir').exitCode).toBe(1);
    expect(runLine(machine, 'rmdir -z x').exitCode).toBe(1);
  });
});

describe('touch', () => {
  it('crée un fichier vide et met à jour la date', () => {
    const result = runLines(machine, ['touch vide.txt', 'touch a.txt']);

    expect(result.state.fs['/home/hugo/vide.txt']).toMatchObject({ content: '', owner: 'hugo' });
    expect(result.state.fs['/home/hugo/a.txt']?.mtime).toBe(Date.UTC(2026, 10, 3, 8, 31, 44));
  });

  it('respecte -c et les droits', () => {
    expect(runLine(machine, 'touch -c absent').state.fs['/home/hugo/absent']).toBeUndefined();
    expect(runLine(machine, 'touch /etc/hostname').stderr).toBe(
      "touch: impossible de faire un touch '/etc/hostname': Permission non accordée\n",
    );
    expect(runLine(machine, 'touch /etc/nouveau').stderr).toBe(
      "touch: impossible de faire un touch '/etc/nouveau': Permission non accordée\n",
    );
    expect(runLine(machine, 'touch /root/x').stderr).toContain('Permission non accordée');
    expect(runLine(machine, 'touch').stderr).toContain('opérande de fichier manquant');
    expect(runLine(machine, 'touch -z').exitCode).toBe(1);
  });
});

describe('cp', () => {
  it('copie un fichier, vers un nom ou dans un dossier', () => {
    const result = runLines(machine, [
      'cp a.txt b.txt',
      'cp a.txt projet/',
      'cat b.txt projet/a.txt',
    ]);

    expect(result.stdout).toBe('alpha\nalpha\n');
  });

  it('copie un dossier avec -r et refuse sans', () => {
    expect(runLine(machine, 'cp projet copie').stderr).toBe(
      "cp: -r non spécifié ; omission du répertoire 'projet'\n",
    );
    expect(runLine(machine, 'cp -r projet copie').state.fs['/home/hugo/copie/x.txt']).toMatchObject(
      { content: 'x\n' },
    );
  });

  it('copie sous le compte courant, ou en gardant tout avec -a', () => {
    const plain = runLine(machine, 'sudo cp /etc/hostname /tmp/h');
    const archive = runLine(machine, 'sudo cp -a /home/hugo/a.txt /tmp/a');

    expect(plain.state.fs['/tmp/h']).toMatchObject({ owner: 'root', mode: 0o644 });
    expect(archive.state.fs['/tmp/a']).toMatchObject({ owner: 'hugo' });
  });

  it('signale les erreurs de copie', () => {
    expect(runLine(machine, 'cp absent x').stderr).toBe(
      "cp: impossible d'évaluer 'absent': Aucun fichier ou dossier de ce type\n",
    );
    expect(runLine(machine, 'cp /etc/secret.conf x').stderr).toBe(
      "cp: impossible d'ouvrir '/etc/secret.conf': Permission non accordée\n",
    );
    expect(runLine(machine, 'cp a.txt /etc/').stderr).toBe(
      "cp: impossible de créer le fichier standard '/etc/': Permission non accordée\n",
    );
    expect(runLine(machine, 'cp a.txt').stderr).toContain(
      "opérande de fichier cible manquant après 'a.txt'",
    );
    expect(runLine(machine, 'cp').stderr).toContain('opérande de fichier manquant');
    expect(runLine(machine, 'cp a.txt projet/x.txt b').stderr).toBe(
      "cp: la cible 'b' n'est pas un répertoire\n",
    );
    expect(runLine(machine, 'cp -r projet projet/sous').stderr).toContain('vers lui-même');
    expect(runLine(machine, 'cp a.txt projet/x.txt projet').stderr).toBe(
      "cp: 'projet/x.txt' et 'projet/x.txt' identifient le même fichier\n",
    );
    expect(runLine(machine, 'cp -z a b').exitCode).toBe(1);
  });

  it("n'écrase pas avec -n et affiche les copies avec -v", () => {
    expect(
      runLine(machine, 'cp -n a.txt projet/x.txt').state.fs['/home/hugo/projet/x.txt'],
    ).toMatchObject({ content: 'x\n' });
    expect(runLine(machine, 'cp -v a.txt c.txt').stdout).toBe("'a.txt' -> 'c.txt'\n");
  });
});

describe('mv', () => {
  it('renomme et déplace', () => {
    const result = runLines(machine, ['mv a.txt b.txt', 'mv b.txt projet', 'ls projet']);

    expect(result.stdout).toBe('b.txt  x.txt\n');
    expect(result.state.fs['/home/hugo/a.txt']).toBeUndefined();
    expect(runLine(machine, 'mv -v a.txt z.txt').stdout).toBe("renommé 'a.txt' -> 'z.txt'\n");
  });

  it('refuse sans droit sur le dossier de départ', () => {
    expect(runLine(machine, 'mv /etc/hostname /tmp/').stderr).toBe(
      "mv: impossible de déplacer '/etc/hostname' vers '/tmp/': Permission non accordée\n",
    );
    expect(runLine(machine, 'mv a.txt /etc/').stderr).toBe(
      "mv: impossible de déplacer 'a.txt' vers '/etc/': Permission non accordée\n",
    );
    expect(runLine(machine, 'mv projet/x.txt projet').stderr).toBe(
      "mv: 'projet/x.txt' et 'projet/x.txt' identifient le même fichier\n",
    );
    expect(runLine(machine, 'mv absent x').exitCode).toBe(1);
  });

  it("refuse d'écraser un dossier par un fichier", () => {
    expect(runLine(machine, 'mkdir d; mkdir d/a.txt; mv a.txt d').stderr).toContain(
      "impossible d'écraser le répertoire",
    );
  });
});

describe('ln', () => {
  it('crée un lien symbolique', () => {
    expect(runLines(machine, ['ln -s /etc/hostname nom', 'cat nom']).stdout).toBe('srv-web01\n');
    const result = runLines(machine, ['ln -s /etc/hostname nom', 'ls -l nom']);

    expect(result.stdout).toMatch(/^lrwxrwxrwx 1 hugo hugo 13 .* nom -> \/etc\/hostname\n$/);
  });

  it('crée un lien physique et refuse les cas interdits', () => {
    expect(runLine(machine, 'ln a.txt lien').state.fs['/home/hugo/lien']).toMatchObject({
      content: 'alpha\n',
    });
    expect(runLine(machine, 'ln -s a.txt projet/').state.fs['/home/hugo/projet/a.txt']?.type).toBe(
      'symlink',
    );
    expect(runLine(machine, 'ln -s a.txt projet/x.txt').stderr).toBe(
      "ln: impossible de créer le lien symbolique 'projet/x.txt': Le fichier existe\n",
    );
    expect(runLine(machine, 'ln -sf a.txt projet/x.txt').exitCode).toBe(0);
    expect(runLine(machine, 'ln projet p2').stderr).toBe(
      "ln: 'projet': lien physique non permis vers un répertoire\n",
    );
    expect(runLine(machine, 'ln absent l').stderr).toContain("impossible d'accéder à 'absent'");
    expect(runLine(machine, 'ln -s a.txt /etc/l').stderr).toContain('Permission non accordée');
    expect(runLine(machine, 'ln -s a.txt /nulle/l').stderr).toContain('Aucun fichier');
    expect(runLine(machine, 'ln').exitCode).toBe(1);
    expect(runLine(machine, 'ln -z').exitCode).toBe(1);
  });
});
