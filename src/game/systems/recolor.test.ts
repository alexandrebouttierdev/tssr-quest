import { describe, expect, it } from 'vitest';
import { BASE_COLORS, paletteColorMap, parseHex, recolorPixels, shade } from './recolor';

describe('recoloration des sprites', () => {
  it('lit et assombrit les couleurs', () => {
    expect(parseHex('#e0884f')).toBe(0xe0884f);
    expect(shade(0x808080, 0.5)).toBe(0x404040);
  });

  it('remplace les couleurs de la palette de base', () => {
    const map = paletteColorMap({ hair: '#2b2b2b', skin: '#d6a27c', outfit: '#e0884f' });
    const pixels = new Uint8ClampedArray([0x3d, 0x7b, 0xe0, 255, 1, 2, 3, 255]);

    recolorPixels(pixels, map);

    expect([...pixels]).toEqual([0xe0, 0x88, 0x4f, 255, 1, 2, 3, 255]);
    expect(map.get(BASE_COLORS.hair)).toBe(0x2b2b2b);
  });
});
