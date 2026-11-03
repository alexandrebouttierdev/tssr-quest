import type { GameStore } from '@core/store/types';
import { selectNode } from '@engine/dialogue/select-node';
import type { Npc, NpcMarker } from './entities/Npc';
import type { WorldServices } from './services';

/** Ce que le pont expose à la scène. */
export interface WorldBridge {
  /** Vrai quand l'interface capte le clavier (dialogue, fenêtre de mission). */
  isInputSuspended(): boolean;
  /** Publie la cible d'interaction courante (invite « E — Parler à Hugo »). */
  setInteractionTarget(npcId: string | null): void;
  /** Demande une interaction avec un PNJ. */
  interact(npcId: string): void;
  /** Mémorise la position du joueur dans le store (sauvegarde). */
  savePosition(x: number, y: number, facing: GameStore['player']['facing']): void;
  /** Se désabonne du store. */
  destroy(): void;
}

/**
 * Relie la scène du monde au store et au bus (docs/02, règle 7 de CLAUDE.md :
 * Phaser ne parle à l'interface qu'à travers eux).
 *
 * @param services - Store, bus et contenu.
 * @param zoneId - Zone affichée.
 * @param npcs - PNJ de la scène (pour leurs marqueurs).
 * @returns Le pont, à détruire avec la scène.
 */
export function createWorldBridge(
  services: WorldServices,
  zoneId: string,
  npcs: readonly Npc[],
): WorldBridge {
  const { store, bus, content } = services;
  let currentTarget: string | null = null;

  const markerFor = (npcId: string, state: GameStore): NpcMarker => {
    const selection = selectNode(npcId, content, {
      flags: state.progress.flags,
      completedMissions: Object.keys(state.progress.completedMissions),
      items: state.inventory.items,
      level: state.progression.level,
      debriefed: state.progress.debriefed,
      activeMission: state.missionRun?.missionId ?? null,
    });
    if (state.missionRun || state.ui.dialogue) return null;
    return selection.kind === 'intro' ? 'mission' : selection.kind === 'outro' ? 'debrief' : null;
  };

  const refreshMarkers = (state: GameStore) => {
    for (const npc of npcs) npc.setMarker(markerFor(npc.npcId, state));
  };
  refreshMarkers(store.getState());
  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.progress !== previous.progress ||
      state.missionRun?.missionId !== previous.missionRun?.missionId ||
      state.ui.dialogue !== previous.ui.dialogue
    ) {
      refreshMarkers(state);
    }
  });
  bus.emit({ type: 'world/zone-entered', zoneId });

  return {
    isInputSuspended: () => store.getState().ui.inputMode === 'ui',
    setInteractionTarget(npcId) {
      if (npcId === currentTarget) return;
      currentTarget = npcId;
      const npc = npcId ? content.npcs.get(npcId) : undefined;
      store
        .getState()
        .setInteractionPrompt(npcId && npc ? { targetId: npcId, label: npc.name } : null);
    },
    interact(npcId) {
      if (store.getState().ui.inputMode === 'ui') return;
      bus.emit({ type: 'world/interact', targetId: npcId });
    },
    savePosition(x, y, facing) {
      store.getState().setPlayerLocation({ zoneId, x: Math.round(x), y: Math.round(y), facing });
    },
    destroy() {
      unsubscribe();
      store.getState().setInteractionPrompt(null);
    },
  };
}
