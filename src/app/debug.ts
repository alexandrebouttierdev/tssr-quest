import type Phaser from 'phaser';
import type { AppServices } from './services';

/** Outils de pilotage exposés aux tests E2E (docs/09), uniquement en mode test. */
export interface TssrDebug {
  /** Démarre une mission directement (sans dialogue d'intro). */
  startMission(id: string): void;
  /** Pose un drapeau narratif. */
  setFlag(name: string): void;
  /** Ajoute de l'XP au joueur. */
  setXp(xp: number): void;
  /** Interagit avec un PNJ comme si le joueur appuyait sur E. */
  interact(npcId: string): void;
  /** Déplace le joueur (coordonnées en pixels de la carte). */
  teleport(zoneId: string, x: number, y: number): void;
  /** État du store, pour les vérifications. */
  state(): ReturnType<AppServices['store']['getState']>;
}

declare global {
  interface Window {
    __TSSR_DEBUG__?: TssrDebug;
  }
}

/**
 * Installe `window.__TSSR_DEBUG__` (mode test seulement).
 *
 * @param services - Services de la partie.
 * @param game - Instance Phaser, pour la téléportation.
 */
export function installDebug(services: AppServices, game: () => Phaser.Game | null): void {
  if (import.meta.env.MODE !== 'test') return;
  window.__TSSR_DEBUG__ = {
    startMission: (id) => services.bus.emit({ type: 'mission/start', missionId: id }),
    setFlag: (name) => services.store.getState().setFlag(name),
    setXp: (xp) => services.store.getState().setProgression({ xp }),
    interact: (npcId) => services.bus.emit({ type: 'world/interact', targetId: npcId }),
    teleport: (zoneId, x, y) => {
      services.store.getState().setPlayerLocation({ zoneId, x, y });
      game()?.scene.getScene('world')?.scene.restart();
    },
    state: () => services.store.getState(),
  };
}
