import type { MissionResult } from '../model';
import type { SliceCreator } from './types';

/** Trace d'une mission terminée, conservée dans la sauvegarde. */
export interface MissionRecord extends MissionResult {
  /** Horodatage (ms depuis l'époque Unix) de la fin de mission. */
  readonly completedAt: number;
}

/** Tranche `progress` : avancement dans la campagne. */
export interface ProgressState {
  readonly currentChapter: string | null;
  readonly completedMissions: Readonly<Record<string, MissionRecord>>;
  /** Drapeaux narratifs posés par les dialogues et les missions. */
  readonly flags: Readonly<Record<string, true>>;
  readonly badges: readonly string[];
  readonly unlockedSheets: readonly string[];
  readonly unlockedZones: readonly string[];
  /** Missions dont l'outro a déjà été jouée par le mentor. */
  readonly debriefed: readonly string[];
}

/** Actions de la tranche `progress`. */
export interface ProgressActions {
  setCurrentChapter(chapterId: string | null): void;
  recordMissionCompleted(missionId: string, record: MissionRecord): void;
  setFlag(name: string): void;
  clearFlag(name: string): void;
  addBadge(badgeId: string): void;
  unlockSheet(sheetId: string): void;
  unlockZone(zoneId: string): void;
  markDebriefed(missionId: string): void;
}

/**
 * État initial de la progression narrative.
 *
 * @returns Un nouvel état de la tranche `progress`.
 */
export function initialProgressState(): ProgressState {
  return {
    currentChapter: null,
    completedMissions: {},
    flags: {},
    badges: [],
    unlockedSheets: [],
    unlockedZones: [],
    debriefed: [],
  };
}

/** Ajoute une valeur à une liste si elle n'y est pas déjà. */
function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/** Fabrique de la tranche `progress`. */
export const createProgressSlice: SliceCreator<{ progress: ProgressState } & ProgressActions> = (
  set,
) => ({
  progress: initialProgressState(),
  setCurrentChapter: (chapterId) =>
    set((s) => {
      s.progress.currentChapter = chapterId;
    }),
  recordMissionCompleted: (missionId, record) =>
    set((s) => {
      s.progress.completedMissions[missionId] = record;
    }),
  setFlag: (name) =>
    set((s) => {
      s.progress.flags[name] = true;
    }),
  clearFlag: (name) =>
    set((s) => {
      delete s.progress.flags[name];
    }),
  addBadge: (badgeId) => set((s) => addUnique(s.progress.badges, badgeId)),
  unlockSheet: (sheetId) => set((s) => addUnique(s.progress.unlockedSheets, sheetId)),
  unlockZone: (zoneId) => set((s) => addUnique(s.progress.unlockedZones, zoneId)),
  markDebriefed: (missionId) => set((s) => addUnique(s.progress.debriefed, missionId)),
});
