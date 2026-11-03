import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { gameStore, type GameStoreApi } from './create-store';
import type { GameStore } from './types';

/** Contexte React qui permet d'injecter un autre store (tests, prévisualisations). */
const GameStoreContext = createContext<GameStoreApi>(gameStore);

/**
 * Fournit un store de jeu aux composants descendants.
 *
 * @param props - `store` à fournir et enfants.
 * @returns Le fournisseur de contexte.
 */
export function GameStoreProvider({
  store,
  children,
}: {
  store: GameStoreApi;
  children: ReactNode;
}) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

/**
 * Lit une valeur du store depuis un composant React, avec un sélecteur fin
 * (le composant ne se redessine que si la valeur sélectionnée change).
 *
 * @param selector - Fonction qui extrait la valeur utile.
 * @returns La valeur sélectionnée.
 * @example
 * const level = useGameStore((s) => s.progression.level);
 */
export function useGameStore<T>(selector: (state: GameStore) => T): T {
  const store = useContext(GameStoreContext);
  return useStore(store, selector);
}

/**
 * Renvoie l'API du store courant (pour appeler des actions hors rendu).
 *
 * @returns Le store fourni par le contexte.
 */
export function useGameStoreApi(): GameStoreApi {
  return useContext(GameStoreContext);
}
