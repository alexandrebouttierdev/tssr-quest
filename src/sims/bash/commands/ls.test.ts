import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '../test-utils';

const NOW = Date.UTC(2026, 10, 3, 8, 26);
const machine = debianServer({
  now: NOW,
  disks: [{ mount: '/var', size: '20G', used: '20G' }],
  files: {
    '/var/log/debug.log': {
      size: '18G',
      owner: 'root',
      group: 'adm',
      mode: '0640',
      mtime: NOW - 13 * 60_000,
    },
    '/srv/b.txt': { content: 'bb', mtime: NOW - 60_000 },
    '/srv/a.txt': { content: 'aaaa', mtime: NOW - 120_000 },
    '/srv/.cache': { content: '', mtime: NOW },
    '/srv/lien': { type: 'symlink', target: 'a.txt', mtime: NOW },
  },
});

describe('commande ls', () => {
  it('liste le dossier courant sans les fichiers cachés', () => {
    expect(runLine(machine, 'cd /srv; ls').stdout).toBe('a.txt  b.txt  lien\n');
  });

  it('liste un nom par ligne quand la sortie va dans un tube', () => {
    expect(runLine(machine, 'ls /srv | cat').stdout).toBe('a.txt\nb.txt\nlien\n');
  });

  it('affiche les fichiers cachés avec -a, et . et .. en tête', () => {
    // En fr_FR, le tri ignore la ponctuation : .cache se range à « cache ».
    expect(runLine(machine, 'ls -a1 /srv').stdout).toBe('.\n..\na.txt\nb.txt\n.cache\nlien\n');
    expect(runLine(machine, 'ls -A1 /srv').stdout).toBe('a.txt\nb.txt\n.cache\nlien\n');
  });

  it('trie par date avec -t et inverse avec -r', () => {
    expect(runLine(machine, 'ls -1t /srv').stdout).toBe('lien\nb.txt\na.txt\n');
    expect(runLine(machine, 'ls -1r /srv').stdout).toBe('lien\nb.txt\na.txt\n');
    expect(runLine(machine, 'ls -1S /srv').stdout).toBe('lien\na.txt\nb.txt\n');
  });

  it('affiche le format long', () => {
    expect(runLine(machine, 'ls -l /srv').stdout).toMatchInlineSnapshot(`
      "total 8
      -rw-r--r-- 1 root root 4  3 nov.  09:24 a.txt
      -rw-r--r-- 1 root root 2  3 nov.  09:25 b.txt
      lrwxrwxrwx 1 root root 5  3 nov.  09:26 lien -> a.txt
      "
    `);
  });

  it('affiche des tailles lisibles avec -lh', () => {
    const out = runLine(machine, 'ls -lh /var/log').stdout;

    expect(out.split('\n')[0]).toBe('total 19G');
    expect(out).toMatch(/\n-rw-r----- 1 root adm +18G {2}3 nov\. {2}09:13 debug\.log\n/);
  });

  it('affiche le dossier lui-même avec -d', () => {
    expect(runLine(machine, 'ls -ld /tmp').stdout).toMatch(
      /^drwxrwxrwt 2 root root 4096 .* \/tmp\n$/,
    );
  });

  it('affiche un fichier donné en argument', () => {
    expect(runLine(machine, 'ls /srv/a.txt').stdout).toBe('/srv/a.txt\n');
  });

  it('affiche un en-tête par dossier quand il y en a plusieurs', () => {
    expect(runLine(machine, 'ls /srv /home').stdout).toBe(
      '/home:\nhugo  julie\n\n/srv:\na.txt  b.txt  lien\n',
    );
  });

  it('dispose de nombreux noms en colonnes', () => {
    const out = runLine(machine, 'ls /usr/bin').stdout;

    expect(out.split('\n').length).toBeGreaterThan(5);
    expect(out.split('\n').every((l) => l.length <= 80)).toBe(true);
  });

  it('signale un chemin absent avec le code 2', () => {
    const result = runLine(machine, 'ls /absent');

    expect(result.stderr).toBe(
      "ls: impossible d'accéder à '/absent': Aucun fichier ou dossier de ce type\n",
    );
    expect(result.exitCode).toBe(2);
  });

  it("refuse d'ouvrir un dossier sans droit de lecture", () => {
    expect(runLine(machine, 'ls /root').stderr).toBe(
      "ls: impossible d'ouvrir le répertoire '/root': Permission non accordée\n",
    );
  });

  it('refuse une option inconnue', () => {
    const result = runLine(machine, 'ls -z');

    expect(result.stderr).toBe(
      "ls: option invalide -- 'z'\nSaisissez « ls --help » pour plus d'informations.\n",
    );
    expect(result.exitCode).toBe(2);
  });

  it('affiche les bits spéciaux setuid et sticky', () => {
    expect(runLine(machine, 'ls -l /usr/bin/sudo').stdout).toMatch(/^-rwsr-xr-x /);
    expect(runLine(machine, 'ls -ld /tmp').stdout).toMatch(/^drwxrwxrwt /);
  });
});
