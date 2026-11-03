import { describe, expect, it } from 'vitest';
import { alignTable, compareNames, formatColumns, modeString } from './format';
import type { FsNode } from '@sims/shared/types';

/** Nœud de test avec un mode donné. */
const node = (type: FsNode['type'], mode: number): FsNode =>
  type === 'symlink'
    ? { type, mode, owner: 'r', group: 'r', mtime: 0, target: 'x' }
    : type === 'dir'
      ? { type, mode, owner: 'r', group: 'r', mtime: 0 }
      : { type, mode, owner: 'r', group: 'r', mtime: 0, content: '' };

describe('mise en forme', () => {
  it.each([
    ['file', 0o644, '-rw-r--r--'],
    ['dir', 0o2775, 'drwxrwsr-x'],
    ['dir', 0o1777, 'drwxrwxrwt'],
    ['dir', 0o1770, 'drwxrwx--T'],
    ['file', 0o4644, '-rwSr--r--'],
    ['symlink', 0o777, 'lrwxrwxrwx'],
  ] as const)('écrit les droits de %s %o en %s', (type, mode, text) => {
    expect(modeString(node(type, mode))).toBe(text);
  });

  it('trie les noms comme la locale française', () => {
    expect(['b', '.a', 'A', 'é'].sort(compareNames)).toEqual(['.a', 'A', 'b', 'é']);
  });

  it('aligne un tableau', () => {
    expect(
      alignTable(
        [
          ['a', '1'],
          ['bbb', '22'],
        ],
        ['l', 'r'],
      ),
    ).toEqual(['a    1', 'bbb 22']);
  });

  it('dispose les noms en colonnes, colonne par colonne', () => {
    expect(formatColumns(['a', 'b', 'c'], 80)).toBe('a  b  c\n');
    expect(formatColumns(['aaaa', 'bbbb', 'cccc'], 10)).toBe('aaaa  cccc\nbbbb\n');
    expect(formatColumns([], 80)).toBe('');
    expect(formatColumns(['un-nom-tres-long'], 5)).toBe('un-nom-tres-long\n');
  });
});
