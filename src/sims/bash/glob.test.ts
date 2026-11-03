import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { expandGlob, globToRegExp, hasGlob } from './glob';

describe('jokers', () => {
  it('traduit un motif en expression régulière', () => {
    expect(globToRegExp('*.log').test('syslog.log')).toBe(true);
    expect(globToRegExp('*.log').test('syslog')).toBe(false);
    expect(globToRegExp('a?c').test('abc')).toBe(true);
    expect(globToRegExp('[ab]*').test('beta')).toBe(true);
    expect(globToRegExp('[!ab]*').test('beta')).toBe(false);
    expect(globToRegExp('x.y').test('xzy')).toBe(false);
  });

  it('détecte la présence de jokers', () => {
    expect(hasGlob('*.txt')).toBe(true);
    expect(hasGlob('fichier.txt')).toBe(false);
  });

  const machine = debianServer({
    files: {
      '/srv/a.log': {},
      '/srv/b.log': {},
      '/srv/c.txt': {},
      '/srv/.cache.log': {},
      '/srv/sub/d.log': {},
    },
  });

  it('développe un motif relatif, trié, sans les fichiers cachés', () => {
    expect(expandGlob('*.log', { machine, user: 'hugo', cwd: '/srv' })).toEqual(['a.log', 'b.log']);
  });

  it('développe un motif absolu sur plusieurs niveaux', () => {
    expect(expandGlob('/srv/*/*.log', { machine, user: 'hugo', cwd: '/' })).toEqual([
      '/srv/sub/d.log',
    ]);
  });

  it('inclut les fichiers cachés quand le motif commence par un point', () => {
    expect(expandGlob('.*.log', { machine, user: 'hugo', cwd: '/srv' })).toEqual(['.cache.log']);
  });

  it('renvoie une liste vide sans correspondance', () => {
    expect(expandGlob('*.pdf', { machine, user: 'hugo', cwd: '/srv' })).toEqual([]);
  });

  it('ne liste pas un dossier illisible', () => {
    expect(expandGlob('/root/*', { machine, user: 'hugo', cwd: '/' })).toEqual([]);
  });
});
