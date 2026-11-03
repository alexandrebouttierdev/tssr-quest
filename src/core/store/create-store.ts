import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createInventorySlice, initialInventoryState } from './inventory.slice';
import { createMissionRunSlice } from './mission-run.slice';
import { createPlayerSlice, initialPlayerState } from './player.slice';
import { createProgressSlice, initialProgressState } from './progress.slice';
import { createProgressionSlice, initialProgressionState } from './progression.slice';
import { createReputationSlice, initialReputationState } from './reputation.slice';
import { createSettingsSlice, initialSettingsState } from './settings.slice';
import type { GameState, GameStore } from './types';
import { createUiSlice, initialUiState } from './ui.slice';

/** Store du jeu, utilisable hors de React (Phaser, moteur, tests). */
export type GameStoreApi = StoreApi<GameStore>;

/**
 * État complet d'une nouvelle partie.
 *
 * @returns Un nouvel objet à chaque appel.
 */
export function initialGameState(): GameState {
  return {
    player: initialPlayerState(),
    progress: initialProgressState(),
    progression: initialProgressionState(),
    inventory: initialInventoryState(),
    reputation: initialReputationState(),
    ui: initialUiState(),
    settings: initialSettingsState(),
    missionRun: null,
  };
}

/**
 * Crée un store de jeu indépendant (Zustand vanilla + Immer).
 *
 * @param initial - Tranches à remplacer au départ (sauvegarde chargée, test).
 * @returns Le store, lisible avec `getState()` et observable avec `subscribe()`.
 * @example
 * const store = createGameStore();
 * store.getState().setFlag('hugo-confiance');
 */
export function createGameStore(initial: Partial<GameState> = {}): GameStoreApi {
  return createStore<GameStore>()(
    immer((...args) => ({
      ...createPlayerSlice(...args),
      ...createProgressSlice(...args),
      ...createProgressionSlice(...args),
      ...createInventorySlice(...args),
      ...createReputationSlice(...args),
      ...createUiSlice(...args),
      ...createSettingsSlice(...args),
      ...createMissionRunSlice(...args),
      ...initial,
    })),
  );
}

/** Store unique de la partie en cours (docs/02 : « un seul état de vérité »). */
export const gameStore: GameStoreApi = createGameStore();
