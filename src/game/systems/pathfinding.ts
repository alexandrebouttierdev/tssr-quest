/**
 * Pathfinding A* sur grille (déplacement au clic ou au toucher, docs/06).
 * Logique pure, sans Phaser : testée dans Node.
 */

/** Case de la grille. */
export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

/** Grille de collisions : `true` = case bloquée. Indexée `[y][x]`. */
export type CollisionGrid = readonly (readonly boolean[])[];

/** Les quatre voisins orthogonaux. */
const NEIGHBOURS: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Construit une grille à partir de lignes de texte (`#` bloqué, autre caractère libre).
 *
 * @param rows - Lignes de la grille.
 * @returns La grille de collisions.
 */
export function gridFromRows(rows: readonly string[]): CollisionGrid {
  return rows.map((row) => [...row].map((c) => c === '#'));
}

/** Vrai si la case est dans la grille et libre. */
function walkable(grid: CollisionGrid, p: GridPoint): boolean {
  return grid[p.y]?.[p.x] === false;
}

/**
 * Plus court chemin (4 directions) entre deux cases, par A* avec la distance de Manhattan.
 *
 * @param grid - Grille de collisions.
 * @param start - Case de départ.
 * @param goal - Case d'arrivée.
 * @returns Les cases à parcourir (départ exclu, arrivée incluse), `[]` si déjà arrivé, `null` si impossible.
 */
export function findPath(
  grid: CollisionGrid,
  start: GridPoint,
  goal: GridPoint,
): GridPoint[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!walkable(grid, goal)) return null;
  const key = (p: GridPoint) => `${p.x},${p.y}`;
  const h = (p: GridPoint) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  const open: { point: GridPoint; f: number; g: number; order: number }[] = [
    { point: start, f: h(start), g: 0, order: 0 },
  ];
  const cameFrom = new Map<string, GridPoint>();
  const best = new Map<string, number>([[key(start), 0]]);
  let order = 1;
  while (open.length > 0) {
    // File de priorité simple : les cartes font au plus 40 × 25 cases.
    open.sort((a, b) => a.f - b.f || a.order - b.order);
    const current = open.shift();
    if (!current) break;
    if (current.point.x === goal.x && current.point.y === goal.y) {
      const path: GridPoint[] = [];
      let cursor: GridPoint | undefined = current.point;
      while (cursor && key(cursor) !== key(start)) {
        path.unshift(cursor);
        cursor = cameFrom.get(key(cursor));
      }
      return path;
    }
    for (const d of NEIGHBOURS) {
      const next = { x: current.point.x + d.x, y: current.point.y + d.y };
      if (!walkable(grid, next)) continue;
      const g = current.g + 1;
      if (g >= (best.get(key(next)) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(key(next), g);
      cameFrom.set(key(next), current.point);
      open.push({ point: next, g, f: g + h(next), order: order++ });
    }
  }
  return null;
}

/**
 * Chemin vers la case libre la plus proche à côté d'une cible bloquée (un PNJ, une baie).
 *
 * @param grid - Grille de collisions.
 * @param start - Case de départ.
 * @param target - Case de la cible.
 * @returns Le chemin le plus court vers une case voisine, ou `null`.
 */
export function findPathToAdjacent(
  grid: CollisionGrid,
  start: GridPoint,
  target: GridPoint,
): GridPoint[] | null {
  let best: GridPoint[] | null = null;
  for (const d of NEIGHBOURS) {
    const spot = { x: target.x + d.x, y: target.y + d.y };
    const path = findPath(grid, start, spot);
    if (path && (best === null || path.length < best.length)) best = path;
  }
  return best;
}
