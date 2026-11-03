/** XP cumulée nécessaire pour chaque niveau, du niveau 1 au niveau 10 (docs/01). */
export const LEVEL_THRESHOLDS = [0, 300, 800, 1500, 2500, 3800, 5400, 7300, 9500, 12000] as const;

/** Niveau maximal. */
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/**
 * Niveau correspondant à une XP cumulée.
 *
 * @param xp - XP cumulée.
 * @returns Le niveau, de 1 à 10.
 */
export function levelForXp(xp: number): number {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((threshold, index) => {
    if (xp >= threshold) level = index + 1;
  });
  return level;
}

/** Résultat d'un gain d'XP. */
export interface XpGain {
  readonly xp: number;
  readonly level: number;
  /** Niveaux atteints pendant ce gain (pour l'animation de montée de niveau). */
  readonly levelsGained: readonly number[];
}

/**
 * Ajoute de l'XP et calcule les niveaux franchis.
 *
 * @param current - XP et niveau actuels.
 * @param amount - XP gagnée (un gain négatif est ignoré : l'erreur n'est jamais punitive).
 * @returns La nouvelle XP, le nouveau niveau et les niveaux franchis.
 */
export function gainXp(current: { xp: number; level: number }, amount: number): XpGain {
  const xp = current.xp + Math.max(0, amount);
  const level = levelForXp(xp);
  const levelsGained: number[] = [];
  for (let l = current.level + 1; l <= level; l++) levelsGained.push(l);
  return { xp, level, levelsGained };
}

/**
 * Progression dans le niveau courant, pour la barre d'XP du HUD.
 *
 * @param xp - XP cumulée.
 * @returns Niveau, XP acquise dans le niveau, XP nécessaire pour le suivant et ratio (0 à 1).
 */
export function xpProgress(xp: number): {
  level: number;
  current: number;
  needed: number;
  ratio: number;
} {
  const level = levelForXp(xp);
  const start = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level];
  if (next === undefined) return { level, current: xp - start, needed: 0, ratio: 1 };
  const needed = next - start;
  return { level, current: xp - start, needed, ratio: (xp - start) / needed };
}
