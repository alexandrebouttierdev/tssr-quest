import { createEventBus, type EventBus } from '@core/events/bus';
import { createSaveManager, type SaveManager } from '@core/save/save-manager';
import { gameStore, type GameStoreApi } from '@core/store/create-store';
import type { ContentIndex } from '@content/loader';
import { createGameEngine, type GameEngine } from '@engine/game-engine';
import { createIndexedDbStorage } from '@platform/storage';
import type { UiServices } from '@ui/hooks/game-services';

/** Début de la journée de jeu : mardi 3 novembre 2026, 9 h 26, heure de Paris. */
export const GAME_START = Date.UTC(2026, 10, 3, 8, 26, 0);

/**
 * Horloge de la partie : part de `GAME_START` et avance au rythme du temps réel
 * (le cycle de journée accéléré arrive avec engine/time en phase 1).
 *
 * @param now - Horloge réelle (ms), injectable pour les tests.
 * @returns Une fonction qui donne l'heure de jeu.
 */
export function createGameClock(now: () => number = () => performance.now()): () => Date {
  const origin = now();
  return () => new Date(GAME_START + (now() - origin));
}

/** Tous les services de la partie, créés une fois au démarrage. */
export interface AppServices {
  readonly store: GameStoreApi;
  readonly bus: EventBus;
  readonly content: ContentIndex;
  readonly engine: GameEngine;
  readonly saves: SaveManager;
  readonly ui: UiServices;
}

/**
 * Assemble store, bus, moteur et sauvegarde (sauvegarde automatique en fin de mission).
 *
 * @param content - Contenu du jeu.
 * @param store - Store de la partie (le store global par défaut).
 * @returns Les services.
 */
export function createAppServices(
  content: ContentIndex,
  store: GameStoreApi = gameStore,
): AppServices {
  const bus = createEventBus({ onError: (error) => console.error(error) });
  const saves = createSaveManager(createIndexedDbStorage());
  const engine = createGameEngine({
    store,
    bus,
    content,
    clock: createGameClock(),
    onAutosave: () => {
      saves.save('auto', store.getState()).catch((error: unknown) => console.error(error));
    },
  });
  return {
    store,
    bus,
    content,
    engine,
    saves,
    ui: {
      bus,
      complete: (partial) => engine.completeCommand(partial),
      sheet: (id) => content.sheets.get(id),
    },
  };
}

/**
 * Recharge la sauvegarde automatique, si elle existe, dans le store.
 *
 * @param services - Services de la partie.
 * @returns Vrai si une partie a été restaurée.
 */
export async function restoreAutosave(services: AppServices): Promise<boolean> {
  try {
    const file = await services.saves.load('auto');
    if (!file) return false;
    services.store.setState(services.saves.toGameState(file));
    return true;
  } catch {
    return false;
  }
}
