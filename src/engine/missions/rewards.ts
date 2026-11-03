import type { MissionResult, SkillId } from '@core/model';
import type { ProgressionState } from '@core/store/progression.slice';
import type { Mission } from '@content/schemas';
import { gainXp } from '../progression/levels';
import { addSkillPoints, type SkillTier } from '../progression/skills';

/** Récompenses calculées à la fin d'une mission. */
export interface RewardOutcome {
  readonly xp: number;
  readonly level: number;
  readonly levelsGained: readonly number[];
  readonly skills: Readonly<Record<SkillId, number>>;
  readonly tiersReached: readonly { skill: SkillId; tier: SkillTier }[];
  readonly reputation: Readonly<Partial<Record<string, number>>>;
  readonly items: readonly string[];
  readonly sheets: readonly string[];
}

/**
 * Calcule la progression après une mission : XP (déjà totalisée dans le résultat),
 * points de compétence, réputation, objets et fiches.
 *
 * @param mission - Mission terminée.
 * @param result - Résultat (XP gagnée, erreurs…).
 * @param progression - Progression actuelle du joueur.
 * @returns Les nouvelles valeurs à enregistrer.
 */
export function computeRewards(
  mission: Mission,
  result: MissionResult,
  progression: ProgressionState,
): RewardOutcome {
  const xp = gainXp(progression, result.xpEarned);
  const skills = addSkillPoints(progression.skills, mission.rewards.skills ?? {});
  return {
    xp: xp.xp,
    level: xp.level,
    levelsGained: xp.levelsGained,
    skills: skills.skills,
    tiersReached: skills.tiersReached,
    reputation: mission.rewards.reputation ?? {},
    items: mission.rewards.items ?? [],
    sheets: mission.rewards.sheets ?? [],
  };
}
