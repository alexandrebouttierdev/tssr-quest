import { castDraft } from 'immer';
import type { NotificationKind } from '../events/events';
import type { SliceCreator } from './types';

/** Choix proposé au joueur dans un dialogue. */
export interface DialogueChoiceView {
  readonly id: string;
  readonly text: string;
}

/** Réplique affichée par la boîte de dialogue (publiée par `engine/dialogue`). */
export interface DialogueView {
  readonly npcId: string;
  readonly nodeId: string;
  /** Nom affiché (« Hugo »). */
  readonly speaker: string;
  /** Rôle affiché sous le nom (« Administrateur systèmes »). */
  readonly role?: string;
  /** Expression du portrait (`neutre`, `content`, `inquiet`). */
  readonly mood?: string;
  readonly text: string;
  /** Choix de réponse ; vide si la réplique se contente d'avancer. */
  readonly choices: readonly DialogueChoiceView[];
}

/** Notification empilée en bas de l'écran. */
export interface Notification {
  readonly id: number;
  readonly message: string;
  readonly kind: NotificationKind;
}

/** Invite d'interaction contextuelle (« E — Parler à Hugo »). */
export interface InteractionPrompt {
  readonly targetId: string;
  readonly label: string;
}

/** Fenêtre plein écran ouverte au-dessus du monde. */
export type OpenWindow = 'mission' | 'menu' | null;

/** Tranche `ui` : état d'affichage, non sauvegardé. */
export interface UiState {
  /** `world` : le joueur se déplace ; `ui` : une fenêtre capte le clavier. */
  readonly inputMode: 'world' | 'ui';
  readonly dialogue: DialogueView | null;
  readonly openWindow: OpenWindow;
  readonly notifications: readonly Notification[];
  readonly interactionPrompt: InteractionPrompt | null;
}

/** Actions de la tranche `ui`. */
export interface UiActions {
  setInputMode(mode: UiState['inputMode']): void;
  setDialogue(view: DialogueView | null): void;
  setOpenWindow(window: OpenWindow): void;
  /** Empile une notification et renvoie son identifiant. */
  pushNotification(notification: Omit<Notification, 'id'>): number;
  dismissNotification(id: number): void;
  setInteractionPrompt(prompt: InteractionPrompt | null): void;
}

/**
 * Interface au repos : exploration, rien d'ouvert.
 *
 * @returns Un nouvel état de la tranche `ui`.
 */
export function initialUiState(): UiState {
  return {
    inputMode: 'world',
    dialogue: null,
    openWindow: null,
    notifications: [],
    interactionPrompt: null,
  };
}

/** Fabrique de la tranche `ui`. */
export const createUiSlice: SliceCreator<{ ui: UiState } & UiActions> = (set) => {
  // Compteur propre à chaque store : les identifiants restent uniques dans une partie.
  let nextNotificationId = 1;
  return {
    ui: initialUiState(),
    setInputMode: (mode) =>
      set((s) => {
        s.ui.inputMode = mode;
      }),
    setDialogue: (view) =>
      set((s) => {
        s.ui.dialogue = castDraft(view);
      }),
    setOpenWindow: (window) =>
      set((s) => {
        s.ui.openWindow = window;
      }),
    pushNotification: (notification) => {
      const id = nextNotificationId++;
      set((s) => {
        s.ui.notifications.push({ id, ...notification });
      });
      return id;
    },
    dismissNotification: (id) =>
      set((s) => {
        s.ui.notifications = s.ui.notifications.filter((n) => n.id !== id);
      }),
    setInteractionPrompt: (prompt) =>
      set((s) => {
        s.ui.interactionPrompt = prompt;
      }),
  };
};
