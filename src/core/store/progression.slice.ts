import { SKILL_IDS, type SkillId } from '../model';
import type { SliceCreator } from './types';

/** Tranche `progression` : XP, niveau et compétences (calculés par `engine/progression`). */
export interface ProgressionState {
  readonly xp: number;
  readonly level: number;
  readonly skills: Readonly<Record<SkillId, number>>;
}

/** Actions de la tranche `progression`. */
export interface ProgressionActions {
  /**
   * Remplace les valeurs fournies. Le calcul (gain d'XP, passage de niveau, plafond
   * des compétences) est fait par le moteur : le store ne fait que stocker.
   */
  setProgression(update: {
    xp?: number;
    level?: number;
    skills?: Partial<Record<SkillId, number>>;
  }): void;
}

/**
 * État initial : niveau 1, aucune XP, compétences à zéro.
 *
 * @returns Un nouvel état de la tranche `progression`.
 */
export function initialProgressionState(): ProgressionState {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>;
  return { xp: 0, level: 1, skills };
}

/** Fabrique de la tranche `progression`. */
export const createProgressionSlice: SliceCreator<
  { progression: ProgressionState } & ProgressionActions
> = (set) => ({
  progression: initialProgressionState(),
  setProgression: ({ xp, level, skills }) =>
    set((s) => {
      if (xp !== undefined) s.progression.xp = xp;
      if (level !== undefined) s.progression.level = level;
      if (skills) {
        for (const id of SKILL_IDS) {
          const value = skills[id];
          if (value !== undefined) s.progression.skills[id] = value;
        }
      }
    }),
});
