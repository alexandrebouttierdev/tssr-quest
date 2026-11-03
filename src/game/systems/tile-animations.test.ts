import { describe, expect, it } from 'vitest';
import { animatedGid, tilePhase } from './tile-animations';

const anim = { gids: [10, 11, 12], durations: [100, 100, 200] };

describe('animation des tuiles', () => {
  it('enchaîne les images selon leur durée, avec un décalage propre à chaque tuile', () => {
    const phase = tilePhase(3, 5, 400);
    const at = (t: number) => animatedGid(anim, 3, 5, t - phase);

    expect(at(0)).toBe(10);
    expect(at(150)).toBe(11);
    expect(at(250)).toBe(12);
    expect(at(399)).toBe(12);
    expect(at(400)).toBe(10);
  });

  it('décale les tuiles voisines', () => {
    const phases = new Set([0, 1, 2, 3, 4, 5].map((x) => tilePhase(x, 0, 1000)));
    expect(phases.size).toBeGreaterThan(3);
    expect(tilePhase(1, 1, 0)).toBe(0);
  });
});
