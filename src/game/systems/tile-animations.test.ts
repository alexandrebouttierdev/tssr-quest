import { describe, expect, it } from 'vitest';
import { nextTileFrame } from './tile-animations';

describe('animation des tuiles', () => {
  it('bascule les LED une colonne sur deux', () => {
    expect(nextTileFrame(5, 0, 0)).toBe(7);
    expect(nextTileFrame(5, 1, 0)).toBe(5);
    expect(nextTileFrame(8, 1, 1)).toBe(6);
  });

  it('laisse les tuiles non animées', () => {
    expect(nextTileFrame(1, 0, 0)).toBe(1);
  });
});
