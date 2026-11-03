import { describe, expect, it } from 'vitest';
import { integerZoom, viewportFor } from './viewport';

describe('zoom entier', () => {
  it.each([
    [2560, 1440, 10],
    [1920, 1080, 7],
    [1280, 720, 5],
    [1366, 768, 5],
    [960, 540, 3],
    [390, 844, 2],
    [100, 100, 1],
  ])('%d × %d → ×%d', (w, h, zoom) => {
    expect(integerZoom(w, h)).toBe(zoom);
  });
});

describe('vue logique', () => {
  it('remplit toute la fenêtre avec environ 9 tuiles de haut', () => {
    expect(viewportFor(1280, 720)).toEqual({ zoom: 5, width: 256, height: 144 });
    expect(viewportFor(1366, 768)).toEqual({ zoom: 5, width: 274, height: 154 });
    expect(viewportFor(390, 844)).toEqual({ zoom: 2, width: 195, height: 422 });
  });
});
