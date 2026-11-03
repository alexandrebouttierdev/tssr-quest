import type { StateCreator } from 'zustand';
import type { InventoryActions, InventoryState } from './inventory.slice';
import type { MissionRunActions, MissionRunView } from './mission-run.slice';
import type { PlayerActions, PlayerState } from './player.slice';
import type { ProgressActions, ProgressState } from './progress.slice';
import type { ProgressionActions, ProgressionState } from './progression.slice';
import type { ReputationActions, ReputationState } from './reputation.slice';
import type { SettingsActions, SettingsState } from './settings.slice';
import type { UiActions, UiState } from './ui.slice';

/** Données du jeu (sans les actions), une clé par tranche. */
export interface GameState {
  readonly player: PlayerState;
  readonly progress: ProgressState;
  readonly progression: ProgressionState;
  readonly inventory: InventoryState;
  readonly reputation: ReputationState;
  readonly ui: UiState;
  readonly settings: SettingsState;
  /** Vue de la mission en cours, publiée par le moteur ; `null` hors mission. */
  readonly missionRun: MissionRunView | null;
}

/** Actions explicites qui modifient le store. */
export type GameActions = PlayerActions &
  ProgressActions &
  ProgressionActions &
  InventoryActions &
  ReputationActions &
  UiActions &
  SettingsActions &
  MissionRunActions;

/** Contenu complet du store : données et actions. */
export type GameStore = GameState & GameActions;

/** Signature d'une fabrique de tranche avec le middleware Immer. */
export type SliceCreator<T> = StateCreator<GameStore, [['zustand/immer', never]], [], T>;
