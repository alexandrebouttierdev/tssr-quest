/**
 * Animation des tuiles du décor : LED des baies (états A/B) et curseur des écrans.
 * Les identifiants globaux sont ceux du jeu de tuiles « salle serveurs » (gid = indice + 1).
 */

/** Paires de tuiles qui alternent (LED état A ↔ état B, écran 1 ↔ écran 2). */
export const TILE_SWAPS: ReadonlyMap<number, number> = new Map([
  [5, 7],
  [7, 5],
  [6, 8],
  [8, 6],
  [9, 10],
  [10, 9],
]);

/**
 * Tuile à afficher au pas d'animation donné : une colonne sur deux bascule à chaque pas,
 * pour que les baies ne clignotent pas toutes ensemble.
 *
 * @param gid - Tuile actuelle.
 * @param column - Colonne de la tuile.
 * @param tick - Numéro du pas d'animation.
 * @returns La tuile suivante (inchangée si elle n'est pas animée ou pas concernée).
 */
export function nextTileFrame(gid: number, column: number, tick: number): number {
  const swap = TILE_SWAPS.get(gid);
  if (swap === undefined || (column + tick) % 2 !== 0) return gid;
  return swap;
}
