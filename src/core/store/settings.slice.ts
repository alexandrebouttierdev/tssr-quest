import type { Difficulty } from '../model';
import type { SliceCreator } from './types';

/** Volumes par catégorie, de 0 à 1. */
export interface Volumes {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly ambience: number;
  readonly voice: number;
}

/** Tranche `settings` : options du joueur (docs/08-ui-hud.md, onglet Options). */
export interface SettingsState {
  readonly volumes: Volumes;
  /** Vitesse d'apparition du texte, en caractères par seconde (0 = instantané). */
  readonly textSpeed: number;
  readonly textSize: 'normal' | 'grand' | 'tres-grand';
  /** Police lisible (Atkinson Hyperlegible) à la place de la police pixel. */
  readonly readableFont: boolean;
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  /** Bloom sur les éléments émissifs (désactivable pour les petites configurations). */
  readonly bloom: boolean;
  readonly difficulty: Difficulty;
}

/** Modification partielle des réglages (les volumes peuvent l'être un par un). */
export type SettingsUpdate = Partial<Omit<SettingsState, 'volumes'>> & {
  volumes?: Partial<Volumes>;
};

/** Actions de la tranche `settings`. */
export interface SettingsActions {
  updateSettings(update: SettingsUpdate): void;
}

/**
 * Réglages par défaut (mode Formation, 35 caractères/s).
 *
 * @returns Un nouvel état de la tranche `settings`.
 */
export function initialSettingsState(): SettingsState {
  return {
    volumes: { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.6, voice: 0.7 },
    textSpeed: 35,
    textSize: 'normal',
    readableFont: false,
    highContrast: false,
    reducedMotion: false,
    bloom: true,
    difficulty: 'formation',
  };
}

/** Fabrique de la tranche `settings`. */
export const createSettingsSlice: SliceCreator<{ settings: SettingsState } & SettingsActions> = (
  set,
) => ({
  settings: initialSettingsState(),
  updateSettings: ({ volumes, ...rest }) =>
    set((s) => {
      Object.assign(s.settings, rest);
      if (volumes) Object.assign(s.settings.volumes, volumes);
    }),
});
