import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import {
  fileSize,
  listDir,
  makeDir,
  readFile,
  removePath,
  setNode,
  statPath,
  writeFile,
} from './fs';

const NOW = Date.UTC(2026, 10, 3, 8, 0, 0);

describe('lecture du système de fichiers', () => {
  it('trouve un fichier et suit les liens symboliques', () => {
    const machine = debianServer({});

    const result = statPath(machine, '/bin/ls', 'hugo');

    expect(result.ok && result.value.path).toBe('/usr/bin/ls');
    expect(result.ok && result.value.node.type).toBe('file');
  });

  it('peut ne pas suivre le dernier lien (lstat)', () => {
    const machine = debianServer({});

    const result = statPath(machine, '/bin', 'hugo', { follow: false });

    expect(result.ok && result.value.node.type).toBe('symlink');
  });

  it('renvoie ENOENT pour un chemin absent', () => {
    const machine = debianServer({});

    expect(statPath(machine, '/nulle/part', 'hugo')).toEqual({
      ok: false,
      error: 'ENOENT',
      path: '/nulle/part',
    });
  });

  it("renvoie ENOTDIR quand un composant intermédiaire n'est pas un dossier", () => {
    const machine = debianServer({ files: { '/srv/a.txt': { content: 'x' } } });

    const result = statPath(machine, '/srv/a.txt/b', 'hugo');

    expect(result.ok ? null : result.error).toBe('ENOTDIR');
  });

  it('détecte une boucle de liens symboliques', () => {
    let machine = debianServer({});
    const link = (target: string) =>
      ({ type: 'symlink', owner: 'root', group: 'root', mode: 0o777, mtime: 0, target }) as const;
    machine = setNode(machine, '/tmp/a', link('/tmp/b'));
    machine = setNode(machine, '/tmp/b', link('/tmp/a'));

    const result = statPath(machine, '/tmp/a', 'hugo');

    expect(result.ok ? null : result.error).toBe('ELOOP');
  });

  it('refuse de traverser un dossier sans droit x', () => {
    const machine = debianServer({});

    const result = statPath(machine, '/root/.bashrc', 'hugo');

    expect(result.ok ? null : result.error).toBe('EACCES');
  });

  it('lit le contenu quand le droit r est accordé', () => {
    const machine = debianServer({
      files: { '/home/hugo/notes.txt': { content: 'bonjour\n', owner: 'hugo' } },
    });

    expect(readFile(machine, '/home/hugo/notes.txt', 'hugo')).toEqual({
      ok: true,
      value: 'bonjour\n',
    });
  });

  it('refuse la lecture sans droit r', () => {
    const machine = debianServer({});

    const result = readFile(machine, '/etc/shadow', 'hugo');

    expect(result.ok ? null : result.error).toBe('EACCES');
  });

  it('refuse de lire un dossier comme un fichier', () => {
    const machine = debianServer({});

    const result = readFile(machine, '/etc', 'hugo');

    expect(result.ok ? null : result.error).toBe('EISDIR');
  });

  it("liste un dossier dans l'ordre alphabétique", () => {
    const machine = debianServer({
      files: { '/srv/b.txt': { content: '' }, '/srv/a.txt': { content: '' } },
    });

    const result = listDir(machine, '/srv', 'hugo');

    expect(result.ok && result.value.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('refuse de lister un dossier sans droit r', () => {
    const machine = debianServer({});

    const result = listDir(machine, '/root', 'hugo');

    expect(result.ok ? null : result.error).toBe('EACCES');
  });

  it('calcule la taille déclarée ou celle du contenu en UTF-8', () => {
    expect(
      fileSize({ type: 'file', owner: 'r', group: 'r', mode: 0, mtime: 0, content: 'é' }),
    ).toBe(2);
    expect(
      fileSize({ type: 'file', owner: 'r', group: 'r', mode: 0, mtime: 0, content: '', size: 42 }),
    ).toBe(42);
  });
});

describe('écriture dans le système de fichiers', () => {
  it('crée un fichier avec le propriétaire, le groupe et le mode par défaut', () => {
    const machine = debianServer({});

    const result = writeFile(machine, '/home/hugo/a.txt', 'hugo', 'salut\n', { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fs['/home/hugo/a.txt']).toEqual({
      type: 'file',
      owner: 'hugo',
      group: 'hugo',
      mode: 0o644,
      mtime: NOW,
      content: 'salut\n',
    });
  });

  it('ajoute à la fin en mode append et garde le propriétaire', () => {
    const machine = debianServer({
      files: { '/tmp/log.txt': { content: 'a\n', owner: 'hugo', mode: '0666' } },
    });

    const result = writeFile(machine, '/tmp/log.txt', 'julie', 'b\n', { append: true, now: NOW });

    expect(result.ok && result.value.fs['/tmp/log.txt']).toMatchObject({
      content: 'a\nb\n',
      owner: 'hugo',
    });
  });

  it("refuse de créer un fichier sans droit d'écriture sur le dossier", () => {
    const machine = debianServer({});

    const result = writeFile(machine, '/etc/x.conf', 'hugo', '', { now: NOW });

    expect(result.ok ? null : result.error).toBe('EACCES');
  });

  it('refuse de réécrire un fichier sans droit w', () => {
    const machine = debianServer({});

    const result = writeFile(machine, '/etc/hostname', 'hugo', 'pirate', { now: NOW });

    expect(result.ok ? null : result.error).toBe('EACCES');
  });

  it("refuse d'écrire dans un dossier parent absent", () => {
    const machine = debianServer({});

    const result = writeFile(machine, '/nulle/part.txt', 'root', '', { now: NOW });

    expect(result.ok ? null : result.error).toBe('ENOENT');
  });

  it("refuse d'écrire sur un disque plein", () => {
    const machine = debianServer({ disks: [{ mount: '/var', size: '1G', used: '1G' }] });

    const result = writeFile(machine, '/var/tmp/gros.txt', 'root', 'x', { now: NOW });

    expect(result.ok ? null : result.error).toBe('ENOSPC');
  });

  it("refuse d'écrire dans un dossier comme dans un fichier", () => {
    const machine = debianServer({});

    const result = writeFile(machine, '/tmp', 'root', 'x', { now: NOW });

    expect(result.ok ? null : result.error).toBe('EISDIR');
  });

  it('crée un dossier', () => {
    const machine = debianServer({});

    const result = makeDir(machine, '/home/hugo/projets', 'hugo', { now: NOW });

    expect(result.ok && result.value.fs['/home/hugo/projets']).toMatchObject({
      type: 'dir',
      owner: 'hugo',
      mode: 0o755,
    });
  });

  it('crée les dossiers parents avec parents: true', () => {
    const machine = debianServer({});

    const result = makeDir(machine, '/home/hugo/a/b/c', 'hugo', { parents: true, now: NOW });

    expect(
      result.ok && Object.keys(result.value.fs).filter((p) => p.startsWith('/home/hugo/a')),
    ).toEqual(['/home/hugo/a', '/home/hugo/a/b', '/home/hugo/a/b/c']);
  });

  it('refuse de créer un dossier qui existe déjà, sauf avec parents: true', () => {
    const machine = debianServer({});

    expect(makeDir(machine, '/tmp', 'root', { now: NOW })).toMatchObject({
      ok: false,
      error: 'EEXIST',
    });
    expect(makeDir(machine, '/tmp', 'root', { parents: true, now: NOW }).ok).toBe(true);
  });

  it('refuse de créer un dossier dans un parent absent sans parents: true', () => {
    const machine = debianServer({});

    expect(makeDir(machine, '/home/hugo/x/y', 'hugo', { now: NOW })).toMatchObject({
      ok: false,
      error: 'ENOENT',
    });
  });
});

describe('suppression dans le système de fichiers', () => {
  it('supprime un fichier', () => {
    const machine = debianServer({ files: { '/home/hugo/a.txt': { owner: 'hugo' } } });

    const result = removePath(machine, '/home/hugo/a.txt', 'hugo', {});

    expect(result.ok && result.value.fs['/home/hugo/a.txt']).toBeUndefined();
  });

  it('refuse de supprimer un dossier sans récursivité', () => {
    const machine = debianServer({});

    expect(removePath(machine, '/home/hugo', 'root', {})).toMatchObject({
      ok: false,
      error: 'EISDIR',
    });
  });

  it('supprime un dossier et tout son contenu en récursif', () => {
    const machine = debianServer({
      files: { '/srv/app/a.txt': {}, '/srv/app/sub/b.txt': {} },
    });

    const result = removePath(machine, '/srv/app', 'root', { recursive: true });

    expect(result.ok && Object.keys(result.value.fs).some((p) => p.startsWith('/srv/app'))).toBe(
      false,
    );
  });

  it('supprime un dossier vide en mode rmdir et refuse un dossier non vide', () => {
    const machine = debianServer({ files: { '/srv/plein/a.txt': {} } });
    const withEmpty = makeDir(machine, '/srv/vide', 'root', { now: NOW });
    if (!withEmpty.ok) throw new Error('préparation');

    expect(removePath(withEmpty.value, '/srv/vide', 'root', { emptyDirOnly: true }).ok).toBe(true);
    expect(removePath(withEmpty.value, '/srv/plein', 'root', { emptyDirOnly: true })).toMatchObject(
      {
        ok: false,
        error: 'ENOTEMPTY',
      },
    );
  });

  it("refuse la suppression d'un fichier de /var/log par un utilisateur", () => {
    const machine = debianServer({
      files: { '/var/log/debug.log': { size: '18G', owner: 'root', group: 'adm', mode: '0640' } },
    });

    expect(removePath(machine, '/var/log/debug.log', 'hugo', {})).toMatchObject({
      ok: false,
      error: 'EACCES',
    });
  });

  it('respecte le sticky bit de /tmp', () => {
    const machine = debianServer({ files: { '/tmp/a.txt': { owner: 'julie', mode: '0666' } } });

    expect(removePath(machine, '/tmp/a.txt', 'hugo', {})).toMatchObject({
      ok: false,
      error: 'EPERM',
    });
  });

  it("refuse en récursif de vider un dossier sans droit d'écriture dessus", () => {
    const machine = debianServer({ files: { '/srv/verrou/a.txt': {} } });
    const locked = setNode(machine, '/srv/verrou', {
      type: 'dir',
      owner: 'root',
      group: 'root',
      mode: 0o555,
      mtime: 0,
    });
    const open = setNode(locked, '/srv', {
      type: 'dir',
      owner: 'root',
      group: 'root',
      mode: 0o777,
      mtime: 0,
    });

    expect(removePath(open, '/srv/verrou', 'hugo', { recursive: true })).toMatchObject({
      ok: false,
      error: 'EACCES',
    });
  });

  it('refuse de supprimer la racine', () => {
    const machine = debianServer({});

    expect(removePath(machine, '/', 'root', { recursive: true })).toMatchObject({
      ok: false,
      error: 'EPERM',
    });
  });

  it('renvoie ENOENT pour un fichier absent', () => {
    const machine = debianServer({});

    expect(removePath(machine, '/tmp/absent', 'root', {})).toMatchObject({
      ok: false,
      error: 'ENOENT',
    });
  });

  it('supprime le lien symbolique et non sa cible', () => {
    const machine = debianServer({});

    const result = removePath(machine, '/bin', 'root', {});

    expect(result.ok && result.value.fs['/bin']).toBeUndefined();
    expect(result.ok && result.value.fs['/usr/bin']).toBeDefined();
  });
});
