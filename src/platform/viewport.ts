/** Résolution logique du jeu (docs/07). */
export const BASE_WIDTH = 480;

/** Hauteur logique du jeu. */
export const BASE_HEIGHT = 270;

/**
 * Zoom entier le plus grand qui fait tenir le jeu dans la fenêtre (pas de flou).
 *
 * @param width - Largeur disponible (px CSS).
 * @param height - Hauteur disponible (px CSS).
 * @returns Le zoom (au moins 1).
 */
export function integerZoom(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / BASE_WIDTH, height / BASE_HEIGHT)));
}
