import { SKILL_IDS, type SkillId } from '@core/model';

/** Paliers de compétence (docs/01, « Paliers et avantages »). */
export const SKILL_TIERS = [25, 50, 75, 100] as const;

/** Palier de compétence (0 si aucun). */
export type SkillTier = 0 | (typeof SKILL_TIERS)[number];

/**
 * Palier atteint pour un nombre de points.
 *
 * @param points - Points de la compétence (0 à 100).
 * @returns Le palier le plus haut atteint.
 */
export function skillTier(points: number): SkillTier {
  let tier: SkillTier = 0;
  for (const t of SKILL_TIERS) if (points >= t) tier = t;
  return tier;
}

/** Avantages d'une compétence selon ses points. */
export interface SkillPerks {
  /** Palier 25 : un indice gratuit par mission du domaine. */
  readonly freeHint: boolean;
  /** Palier 50 : autocomplétion Tab dans les simulateurs du domaine. */
  readonly autocomplete: boolean;
  /** Palier 75 : exemples avancés dans les fiches. */
  readonly advancedSheets: boolean;
  /** Palier 100 : titre honorifique et tenue exclusive. */
  readonly honorTitle: boolean;
}

/**
 * Avantages débloqués pour un nombre de points.
 *
 * @param points - Points de la compétence.
 * @returns Les avantages.
 */
export function perksFor(points: number): SkillPerks {
  return {
    freeHint: points >= 25,
    autocomplete: points >= 50,
    advancedSheets: points >= 75,
    honorTitle: points >= 100,
  };
}

/**
 * Ajoute des points de compétence (plafond 100) et liste les paliers franchis.
 *
 * @param skills - Points actuels.
 * @param gains - Points gagnés par compétence.
 * @returns Les nouveaux points et les paliers atteints pendant ce gain.
 */
export function addSkillPoints(
  skills: Readonly<Record<SkillId, number>>,
  gains: Partial<Record<SkillId, number>>,
): { skills: Record<SkillId, number>; tiersReached: { skill: SkillId; tier: SkillTier }[] } {
  const next = { ...skills };
  const tiersReached: { skill: SkillId; tier: SkillTier }[] = [];
  for (const id of SKILL_IDS) {
    const gain = gains[id];
    if (!gain) continue;
    const before = skillTier(next[id]);
    next[id] = Math.min(100, next[id] + gain);
    const after = skillTier(next[id]);
    if (after > before) tiersReached.push({ skill: id, tier: after });
  }
  return { skills: next, tiersReached };
}
