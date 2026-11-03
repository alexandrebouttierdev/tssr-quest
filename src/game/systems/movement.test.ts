import { describe, expect, it } from 'vitest';
import { directionFromKeys, facingFromVector, findInteractionTarget } from './movement';

describe('déplacements', () => {
  it('donne un vecteur unitaire, y compris en diagonale', () => {
    expect(directionFromKeys({ up: false, down: false, left: false, right: true })).toEqual({
      x: 1,
      y: 0,
    });
    const diag = directionFromKeys({ up: true, down: false, left: true, right: false });
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
    expect(directionFromKeys({ up: true, down: true, left: false, right: false })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('oriente le personnage selon le déplacement', () => {
    expect(facingFromVector({ x: 0, y: 0 }, 'left')).toBe('left');
    expect(facingFromVector({ x: 1, y: 1 }, 'up')).toBe('right');
    expect(facingFromVector({ x: -1, y: 0 }, 'up')).toBe('left');
    expect(facingFromVector({ x: 0, y: -1 }, 'down')).toBe('up');
    expect(facingFromVector({ x: 0, y: 1 }, 'up')).toBe('down');
  });

  it('choisit la cible la plus proche, de préférence devant', () => {
    const targets = [
      { id: 'devant', x: 10, y: 20 },
      { id: 'derriere', x: 10, y: 1 },
      { id: 'loin', x: 100, y: 100 },
    ];

    expect(findInteractionTarget({ x: 10, y: 10, facing: 'down' }, targets)?.id).toBe('devant');
    expect(findInteractionTarget({ x: 10, y: 10, facing: 'up' }, targets)?.id).toBe('derriere');
    expect(findInteractionTarget({ x: 60, y: 60, facing: 'up' }, targets)).toBeNull();
    expect(findInteractionTarget({ x: 10, y: 20, facing: 'up' }, targets)?.id).toBe('devant');
  });
});
