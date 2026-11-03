/**
 * Ombres portées du décor : sous chaque suite d'objets bloquants (baies, bureaux, murs),
 * une bande sombre tombe sur le sol, décalée vers la droite (la lumière vient du haut à
 * gauche). Ce calcul est pur ; la scène se contente de dessiner les bandes.
 */

/** Bande d'ombre, en cases. */
export interface ShadowRun {
  /** Première colonne. */
  readonly x: number;
  /** Ligne de l'objet qui projette l'ombre (l'ombre tombe sur la ligne suivante). */
  readonly y: number;
  /** Nombre de cases. */
  readonly length: number;
}

/**
 * Suites horizontales d'objets bloquants dont la case du dessous est libre.
 *
 * @param data - Calque de tuiles (identifiants globaux, ligne par ligne).
 * @param width - Largeur du calque.
 * @param solid - Vrai pour un identifiant de tuile qui projette une ombre.
 * @param blocked - Vrai si la case (x, y) est déjà occupée (l'ombre n'y tombe pas).
 * @returns Les bandes d'ombre.
 */
export function shadowRuns(
  data: readonly number[],
  width: number,
  solid: (gid: number) => boolean,
  blocked: (x: number, y: number) => boolean,
): ShadowRun[] {
  const runs: ShadowRun[] = [];
  const height = Math.floor(data.length / width);
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const casts = x < width && solid(data[y * width + x] ?? 0) && !blocked(x, y + 1);
      if (casts && start < 0) start = x;
      if (!casts && start >= 0) {
        runs.push({ x: start, y, length: x - start });
        start = -1;
      }
    }
  }
  return runs;
}
