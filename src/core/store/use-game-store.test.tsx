import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createGameStore } from './index';
import { GameStoreProvider, useGameStore } from './use-game-store';
import type { ReactNode } from 'react';

describe('hook useGameStore', () => {
  it('lit une valeur du store fourni et se met à jour', () => {
    const store = createGameStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GameStoreProvider store={store}>{children}</GameStoreProvider>
    );

    const { result } = renderHook(() => useGameStore((s) => s.progression.level), { wrapper });
    expect(result.current).toBe(1);

    act(() => store.getState().setProgression({ level: 4 }));

    expect(result.current).toBe(4);
  });

  it('utilise le store global quand aucun fournisseur ne le précise', () => {
    const { result } = renderHook(() => useGameStore((s) => s.ui.inputMode));

    expect(result.current).toBe('world');
  });
});
