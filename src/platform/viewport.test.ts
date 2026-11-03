import { describe, expect, it } from 'vitest';
import { integerZoom } from './viewport';

describe('zoom entier', () => {
  it.each([
    [1920, 1080, 4],
    [1366, 768, 2],
    [960, 540, 2],
    [390, 844, 1],
    [100, 100, 1],
  ])('%d × %d → ×%d', (w, h, zoom) => {
    expect(integerZoom(w, h)).toBe(zoom);
  });
});
