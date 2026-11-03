import { describe, expect, it } from 'vitest';
import { findPath, findPathToAdjacent, gridFromRows } from './pathfinding';

const grid = gridFromRows(['.....', '.###.', '.#...', '.#.#.', '...#.']);

describe('pathfinding A*', () => {
  it('trouve le plus court chemin en contournant les obstacles', () => {
    const path = findPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 });

    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it('renvoie un chemin vide quand on est déjà arrivé', () => {
    expect(findPath(grid, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('renvoie null pour une cible bloquée, hors carte ou inaccessible', () => {
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(findPath(grid, { x: 0, y: 0 }, { x: 9, y: 9 })).toBeNull();
    const closed = gridFromRows(['.#.', '##.', '...']);
    expect(findPath(closed, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it("s'arrête à côté d'une cible bloquée (un PNJ)", () => {
    const path = findPathToAdjacent(grid, { x: 0, y: 3 }, { x: 1, y: 3 });

    expect(path).toEqual([]);
    expect(findPathToAdjacent(grid, { x: 4, y: 4 }, { x: 2, y: 3 })).toEqual([
      { x: 4, y: 3 },
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it("renvoie null si aucune case voisine n'est accessible", () => {
    const boxed = gridFromRows(['...', '.#.', '...']);
    const walls = gridFromRows(['.#.', '###', '.#.']);

    expect(findPathToAdjacent(boxed, { x: 0, y: 0 }, { x: 1, y: 1 })).not.toBeNull();
    expect(findPathToAdjacent(walls, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });
});
