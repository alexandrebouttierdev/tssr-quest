/**
 * Outils de test des composants : un store et un bus neufs, fournis par les contextes.
 */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createEventBus, type EventBus } from '@core/events/bus';
import type { GameEvent } from '@core/events/events';
import { createGameStore, type GameStoreApi } from '@core/store/create-store';
import { GameStoreProvider } from '@core/store/use-game-store';
import { UiServicesProvider, type UiServices } from './hooks/game-services';

/** Résultat d'un rendu avec services. */
export interface ServicesRender extends RenderResult {
  readonly store: GameStoreApi;
  readonly bus: EventBus;
  /** Événements émis par les composants. */
  readonly events: GameEvent[];
}

/**
 * Rend un composant avec un store, un bus et des services d'interface de test.
 *
 * @param ui - Élément à rendre.
 * @param overrides - Services à remplacer (autocomplétion, fiches).
 * @returns Le rendu, le store, le bus et les événements émis.
 */
export function renderWithServices(
  ui: ReactElement,
  overrides: Partial<UiServices> = {},
): ServicesRender {
  const store = createGameStore();
  const bus = createEventBus();
  const events: GameEvent[] = [];
  bus.onAny((e) => events.push(e));
  const services: UiServices = { bus, complete: () => [], sheet: () => undefined, ...overrides };
  const result = render(
    <GameStoreProvider store={store}>
      <UiServicesProvider services={services}>{ui}</UiServicesProvider>
    </GameStoreProvider>,
  );
  return { ...result, store, bus, events };
}
