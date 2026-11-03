import { describe, expect, it } from 'vitest';
import { integerZoom, viewportFor } from './viewport';

describe('zoom entier', () => {
  it.each([
    [1920, 1080, 6],
    [1280, 720, 4],
    [1366, 768, 4],
    [960, 540, 3],
    [390, 844, 2],
    [100, 100, 1],
  ])('%d × %d → ×%d', (w, h, zoom) => {
    expect(integerZoom(w, h)).toBe(zoom);
  });
});

describe('vue logique', () => {
  it('remplit toute la fenêtre avec environ 11 tuiles de haut', () => {
    expect(viewportFor(1280, 720)).toEqual({ zoom: 4, width: 320, height: 180 });
    expect(viewportFor(1366, 768)).toEqual({ zoom: 4, width: 342, height: 192 });
    expect(viewportFor(390, 844)).toEqual({ zoom: 2, width: 195, height: 422 });
  });
});
