import { describe, expect, it } from 'vitest';
import { formatHumanSize, parseSize } from './size';

describe('tailles', () => {
  it.each([
    ['512', 512],
    ['4K', 4096],
    ['1,5M', 1.5 * 1024 ** 2],
    ['20G', 20 * 1024 ** 3],
    ['2T', 2 * 1024 ** 4],
    ['18g', 18 * 1024 ** 3],
  ])('lit %s', (text, bytes) => {
    expect(parseSize(text)).toBe(bytes);
  });

  it('accepte un nombre déjà en octets', () => {
    expect(parseSize(42)).toBe(42);
  });

  it('refuse une taille illisible', () => {
    expect(() => parseSize('beaucoup')).toThrow(/Taille invalide/);
  });

  it.each([
    [0, '0'],
    [512, '512'],
    [4096, '4,0K'],
    [1.2 * 1024 ** 2, '1,2M'],
    [6.1 * 1024 ** 3, '6,1G'],
    [20 * 1024 ** 3, '20G'],
    [18 * 1024 ** 3 + 1, '19G'],
    [9.96 * 1024 ** 3, '10G'],
  ])('formate %d octets en %s comme df -h en fr_FR', (bytes, text) => {
    expect(formatHumanSize(bytes)).toBe(text);
  });
});
