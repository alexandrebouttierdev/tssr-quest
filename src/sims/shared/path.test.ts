import { describe, expect, it } from 'vitest';
import { basename, dirname, isInside, joinPath, normalizePath, resolveUserPath } from './path';

describe('chemins', () => {
  it.each([
    ['/', '/'],
    ['/var//log/', '/var/log'],
    ['/var/./log', '/var/log'],
    ['/var/log/../www', '/var/www'],
    ['/..', '/'],
    ['/a/b/../../..', '/'],
  ])('normalise %s en %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it('résout un chemin relatif depuis le répertoire courant', () => {
    expect(resolveUserPath('log/syslog', '/var', '/home/hugo')).toBe('/var/log/syslog');
    expect(resolveUserPath('..', '/var/log', '/home/hugo')).toBe('/var');
  });

  it('remplace ~ par le répertoire personnel', () => {
    expect(resolveUserPath('~', '/tmp', '/home/hugo')).toBe('/home/hugo');
    expect(resolveUserPath('~/notes.txt', '/tmp', '/home/hugo')).toBe('/home/hugo/notes.txt');
  });

  it('garde un chemin absolu', () => {
    expect(resolveUserPath('/etc/passwd', '/tmp', '/home/hugo')).toBe('/etc/passwd');
  });

  it('donne le parent et le nom', () => {
    expect(dirname('/var/log/syslog')).toBe('/var/log');
    expect(dirname('/var')).toBe('/');
    expect(dirname('/')).toBe('/');
    expect(basename('/var/log/syslog')).toBe('syslog');
    expect(basename('/')).toBe('/');
  });

  it('joint des chemins', () => {
    expect(joinPath('/', 'etc')).toBe('/etc');
    expect(joinPath('/var/log', 'apache2')).toBe('/var/log/apache2');
  });

  it("indique si un chemin est à l'intérieur d'un autre", () => {
    expect(isInside('/var/log/syslog', '/var')).toBe(true);
    expect(isInside('/var', '/var')).toBe(true);
    expect(isInside('/variable', '/var')).toBe(false);
    expect(isInside('/etc', '/')).toBe(true);
  });
});
