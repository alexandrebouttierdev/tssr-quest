/**
 * Dimensionnement de la vue du monde (docs/07).
 *
 * Le jeu affiche environ 16 × 9 tuiles de 16 px, agrandies d'un facteur entier
 * (pixel art net, sans flou). La taille logique du canevas s'adapte à la fenêtre pour
 * la remplir entièrement : pas de bandes noires, et plus de monde visible sur un
 * écran large plutôt que des personnages minuscules.
 */

/** Hauteur logique visée (≈ 9 tuiles), qui fixe le facteur d'agrandissement. */
export const TARGET_HEIGHT = 144;

/** Largeur logique minimale (portrait, petits écrans). */
export const MIN_WIDTH = 180;

/** Résolution logique de référence (16:9), utilisée avant de connaître la fenêtre. */
export const BASE_WIDTH = 256;

/** Hauteur logique de référence. */
export const BASE_HEIGHT = TARGET_HEIGHT;

/** Taille logique du canevas et facteur d'agrandissement. */
export interface Viewport {
  /** Facteur entier appliqué aux pixels du jeu. */
  readonly zoom: number;
  /** Largeur logique (pixels du jeu). */
  readonly width: number;
  /** Hauteur logique (pixels du jeu). */
  readonly height: number;
}

/**
 * Zoom entier pour une fenêtre : la plus petite dimension contient environ 144 pixels
 * de jeu, sans descendre sous 180 pixels de large.
 *
 * @param width - Largeur disponible (px CSS).
 * @param height - Hauteur disponible (px CSS).
 * @returns Le zoom (au moins 1).
 */
export function integerZoom(width: number, height: number): number {
  let zoom = Math.max(1, Math.floor(Math.min(width, height) / TARGET_HEIGHT));
  while (zoom > 1 && width / zoom < MIN_WIDTH) zoom--;
  return zoom;
}

/**
 * Vue complète pour une fenêtre : zoom entier et taille logique qui la remplit.
 *
 * @param width - Largeur disponible (px CSS).
 * @param height - Hauteur disponible (px CSS).
 * @returns Le zoom et la taille logique du canevas.
 */
export function viewportFor(width: number, height: number): Viewport {
  const zoom = integerZoom(width, height);
  return {
    zoom,
    width: Math.max(1, Math.ceil(width / zoom)),
    height: Math.max(1, Math.ceil(height / zoom)),
  };
}
