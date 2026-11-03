import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({
  files: {
    '/home/hugo/rapport/notes.txt': { owner: 'hugo', content: 'ligne de rapport\n'.repeat(20) },
    '/home/hugo/rapport/chiffres.csv': { owner: 'hugo', content: 'a;b\n1;2\n' },
    '/home/hugo/gros.bin': { owner: 'hugo', size: '10M' },
    '/etc/secret.conf': { content: 'mdp\n', mode: '0600' },
  },
});

describe('tar', () => {
  it('crée, liste et extrait une archive compressée', () => {
    const created = runLine(machine, 'tar -czvf rapport.tar.gz rapport');
    expect(created.stdout).toBe('rapport/\nrapport/chiffres.csv\nrapport/notes.txt\n');
    expect(runLine(created.state, 'file rapport.tar.gz').stdout).toBe(
      'rapport.tar.gz: gzip compressed data, from Unix\n',
    );

    expect(runLine(created.state, 'tar -tzf rapport.tar.gz').stdout).toBe(
      'rapport/\nrapport/chiffres.csv\nrapport/notes.txt\n',
    );
    expect(runLine(created.state, 'tar -tvf rapport.tar.gz').stdout).toMatch(
      /^drwxr-xr-x hugo\/hugo +0 \d{4}-\d\d-\d\d \d\d:\d\d rapport\/\n-rw-r--r-- hugo\/hugo +8 /,
    );

    const extracted = runLines(created.state, [
      'mkdir /tmp/r',
      'tar -xzf rapport.tar.gz -C /tmp/r',
      'cat /tmp/r/rapport/chiffres.csv',
    ]);
    expect(extracted.stdout).toBe('a;b\n1;2\n');
  });

  it("accepte l'ancienne syntaxe sans tiret et une archive non compressée", () => {
    const result = runLines(machine, [
      'tar cf r.tar rapport',
      'rm -r rapport',
      'tar xvf r.tar rapport/notes.txt',
      'ls rapport',
    ]);

    expect(result.stdout).toBe('notes.txt\n');
    expect(runLines(machine, ['tar cf r.tar rapport', 'ls -l r.tar']).stdout).toMatch(/ 10240 /);
    expect(runLines(machine, ['tar cf r.tar rapport', 'file r.tar']).stdout).toBe(
      'r.tar: POSIX tar archive (GNU)\n',
    );
  });

  it('retire le / initial des chemins absolus', () => {
    const result = runLine(machine, 'tar -cf etc.tar /etc/hostname');

    expect(result.stderr).toBe('tar: Suppression de « / » au début des noms des membres\n');
    expect(runLines(machine, ['tar -cf etc.tar /etc/hostname', 'tar -tf etc.tar']).stdout).toBe(
      'etc/hostname\n',
    );
  });

  it('signale les fichiers illisibles et les erreurs de syntaxe', () => {
    expect(runLine(machine, 'tar -cf s.tar /etc/secret.conf').stderr).toContain(
      "tar: /etc/secret.conf : Impossible d'ouvrir: Permission non accordée",
    );
    expect(runLine(machine, 'tar -cf s.tar absent').stderr).toContain(
      'Impossible de faire un stat',
    );
    expect(runLine(machine, 'tar -cf /etc/a.tar rapport').stderr).toContain(
      "Impossible d'ouvrir: Permission non accordée",
    );
    expect(runLine(machine, 'tar -f x.tar').stderr).toContain(
      "Vous devez spécifier l'une des options",
    );
    expect(runLine(machine, 'tar -cx -f x.tar').exitCode).toBe(2);
    expect(runLine(machine, 'tar -c rapport').stderr).toContain("Refus d'écrire");
    expect(runLine(machine, 'tar -cf x.tar').stderr).toContain('Refus de créer une archive vide');
    expect(runLine(machine, 'tar -xf rapport/notes.txt').stderr).toContain(
      'ne ressemble pas à une archive',
    );
    expect(runLine(machine, 'tar -xf absent.tar').stderr).toContain("Impossible d'ouvrir");
    expect(runLine(machine, 'tar -cQf x.tar rapport').exitCode).toBe(2);
    expect(runLine(machine, 'tar --bidule').exitCode).toBe(2);
    expect(
      runLines(machine, [
        'tar --create --gzip --verbose --file=a.tgz rapport',
        'tar --list --file=a.tgz',
      ]).stdout,
    ).toContain('rapport/notes.txt');
    expect(runLines(machine, ['tar cf r.tar rapport', 'tar xf r.tar -C /absent']).stderr).toContain(
      'Impossible de faire un chdir',
    );
    expect(
      runLines(machine, ['tar cf r.tar rapport', 'cd /', 'tar --extract --file=/home/hugo/r.tar'])
        .stderr,
    ).toContain('Impossible de créer le répertoire');
  });
});

describe('gzip, gunzip, zcat', () => {
  it('compresse et décompresse un fichier', () => {
    const zipped = runLine(machine, 'gzip -v rapport/notes.txt');
    expect(zipped.stderr).toMatch(
      /^rapport\/notes\.txt:\t +\d+\.\d% -- replaced with rapport\/notes\.txt\.gz\n$/,
    );
    expect(zipped.state.fs['/home/hugo/rapport/notes.txt']).toBeUndefined();

    expect(runLine(zipped.state, 'zcat rapport/notes.txt.gz').stdout).toBe(
      'ligne de rapport\n'.repeat(20),
    );
    expect(runLine(zipped.state, 'gzip -l rapport/notes.txt.gz').stdout).toMatch(
      /compressed +uncompressed +ratio uncompressed_name\n +\d+ +340 +\d+\.\d% notes\.txt\n/,
    );
    const unzipped = runLine(zipped.state, 'gunzip rapport/notes.txt.gz');
    expect(unzipped.state.fs['/home/hugo/rapport/notes.txt']).toMatchObject({
      content: 'ligne de rapport\n'.repeat(20),
    });
  });

  it("garde l'original avec -k et compresse peu un binaire", () => {
    const result = runLine(machine, 'gzip -k gros.bin');

    expect(result.state.fs['/home/hugo/gros.bin']).toBeDefined();
    expect(runLine(result.state, 'ls -l gros.bin.gz').stdout).toMatch(/ 10276045 /);
    expect(runLine(machine, 'gzip -kv rapport/chiffres.csv').stderr).toContain('created');
  });

  it('signale les erreurs', () => {
    expect(runLine(machine, 'gzip absent').stderr).toBe(
      'gzip: absent: Aucun fichier ou dossier de ce type\n',
    );
    expect(runLine(machine, 'gzip rapport').stderr).toBe(
      'gzip: rapport is a directory -- ignored\n',
    );
    expect(runLines(machine, ['gzip -k gros.bin', 'gzip gros.bin.gz']).stderr).toBe(
      'gzip: gros.bin.gz already has .gz suffix -- unchanged\n',
    );
    expect(runLine(machine, 'gzip /etc/secret.conf').stderr).toContain('Permission non accordée');
    expect(runLine(machine, 'gunzip gros.bin').stderr).toBe(
      'gzip: gros.bin: unknown suffix -- ignored\n',
    );
    expect(runLines(machine, ['cp gros.bin faux.gz', 'gunzip faux.gz']).stderr).toBe(
      'gzip: faux.gz: not in gzip format\n',
    );
    expect(runLine(machine, 'gunzip absent.gz').stderr).toContain('Aucun fichier');
    expect(runLine(machine, 'gzip -l gros.bin').stderr).toContain('not in gzip format');
    expect(runLine(machine, 'gzip').exitCode).toBe(1);
    expect(runLine(machine, 'gzip -Q x').exitCode).toBe(1);
    expect(runLine(machine, 'gzip /etc/hostname').stderr).toContain('Permission non accordée');
  });
});

describe('zip et unzip', () => {
  it('crée, liste et extrait une archive zip', () => {
    const created = runLine(machine, 'zip -r rapport.zip rapport');
    expect(created.stdout).toBe(
      '  adding: rapport/ (stored 0%)\n  adding: rapport/chiffres.csv (stored 0%)\n  adding: rapport/notes.txt (deflated 53%)\n',
    );

    expect(runLine(created.state, 'unzip -l rapport.zip').stdout).toMatch(
      /^Archive: {2}rapport\.zip\n {2}Length +Date +Time +Name\n/,
    );
    const extracted = runLine(created.state, 'unzip rapport.zip -d /tmp/z');
    expect(extracted.stdout).toBe(
      'Archive:  rapport.zip\n   creating: /tmp/z/rapport/\n  inflating: /tmp/z/rapport/chiffres.csv\n  inflating: /tmp/z/rapport/notes.txt\n',
    );
    expect(extracted.state.fs['/tmp/z/rapport/notes.txt']).toBeDefined();
    expect(
      runLines(machine, [
        'zip a rapport/notes.txt',
        'rm rapport/notes.txt',
        'unzip a.zip',
        'ls rapport',
      ]).stdout,
    ).toContain('notes.txt');
  });

  it('signale les erreurs', () => {
    expect(runLine(machine, 'zip vide.zip').exitCode).toBe(12);
    expect(runLine(machine, 'zip a.zip absent').stderr).toContain('name not matched');
    expect(runLine(machine, 'zip /etc/a.zip rapport/notes.txt').exitCode).toBe(15);
    expect(runLine(machine, 'unzip absent.zip').stderr).toContain('cannot find or open absent.zip');
    expect(runLine(machine, 'unzip').stdout).toBe('');
  });
});
