/**
 * Animation des tuiles du décor (LED, écrans, ventilateurs, vapeur du café), décrite
 * dans la carte au format Tiled. Chaque tuile reçoit un décalage qui dépend de sa
 * position : les baies d'une même rangée ne clignotent jamais toutes ensemble.
 */
import type { TileAnimation } from './map-loader';

/**
 * Décalage (ms) d'une tuile, stable et réparti : un hachage de ses coordonnées.
 *
 * @param x - Colonne.
 * @param y - Ligne.
 * @param cycle - Durée totale de l'animation.
 * @returns Un décalage dans [0, cycle[.
 */
export function tilePhase(x: number, y: number, cycle: number): number {
  const h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
  return h % Math.max(1, cycle);
}

/**
 * Image d'une tuile animée à un instant donné.
 *
 * @param animation - Images et durées.
 * @param x - Colonne de la tuile.
 * @param y - Ligne de la tuile.
 * @param timeMs - Temps écoulé (ms).
 * @returns L'identifiant global de l'image à afficher.
 */
export function animatedGid(
  animation: TileAnimation,
  x: number,
  y: number,
  timeMs: number,
): number {
  const cycle = animation.durations.reduce((s, d) => s + d, 0);
  let t = (timeMs + tilePhase(x, y, cycle)) % cycle;
  for (const [i, duration] of animation.durations.entries()) {
    if (t < duration) return animation.gids[i] ?? animation.gids[0] ?? 0;
    t -= duration;
  }
  return animation.gids[0] ?? 0;
}
