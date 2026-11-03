import { describe, expect, it } from 'vitest';
import { shadowRuns } from './shadows';

describe('ombres portées', () => {
  it('regroupe les objets voisins et ignore ceux posés sur un autre objet', () => {
    // 4 × 3 : une rangée de deux baies (5), une baie seule, et une baie au-dessus d'une autre.
    const data = [5, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0];
    const runs = shadowRuns(
      data,
      4,
      (gid) => gid === 5,
      (x, y) => data[y * 4 + x] === 5,
    );

    expect(runs).toEqual([
      { x: 0, y: 0, length: 2 },
      { x: 3, y: 1, length: 1 },
    ]);
  });
});
