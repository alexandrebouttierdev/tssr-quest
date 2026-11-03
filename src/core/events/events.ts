import type { MissionResult, SoundId } from '../model';

/** Gravité d'une notification affichée au joueur. */
export type NotificationKind = 'info' | 'success' | 'warning';

/**
 * Tous les événements qui circulent entre le monde, l'interface et le moteur.
 * Ajouter un événement ici oblige à le traiter là où il est attendu.
 */
export type GameEvent =
  /** Le joueur interagit avec un PNJ ou un objet du monde. */
  | { readonly type: 'world/interact'; readonly targetId: string }
  /** Le joueur entre dans une zone. */
  | { readonly type: 'world/zone-entered'; readonly zoneId: string }
  /** Le joueur fait avancer le dialogue (réplique suivante). */
  | { readonly type: 'dialogue/advance' }
  /** Le joueur choisit une réponse dans un dialogue. */
  | { readonly type: 'dialogue/choice'; readonly nodeId: string; readonly choiceId: string }
  /** Démarrage d'une mission. */
  | { readonly type: 'mission/start'; readonly missionId: string }
  /** Saisie du joueur dans l'étape en cours (ligne de commande, réponse, ordre…). */
  | { readonly type: 'mission/step-input'; readonly payload: unknown }
  /** Le joueur demande l'indice suivant. */
  | { readonly type: 'mission/hint-requested' }
  /** Le joueur quitte la mission en cours. */
  | { readonly type: 'mission/abandon' }
  /** Le joueur ferme la fenêtre d'une étape terminée pour passer à la suite. */
  | { readonly type: 'mission/continue' }
  /** Une mission vient d'être terminée. */
  | {
      readonly type: 'mission/completed';
      readonly missionId: string;
      readonly result: MissionResult;
    }
  /** Le joueur vient de passer un niveau. */
  | { readonly type: 'progression/level-up'; readonly level: number }
  /** Demande d'affichage d'une notification. */
  | { readonly type: 'ui/notify'; readonly message: string; readonly kind: NotificationKind }
  /** Demande de lecture d'un son. */
  | { readonly type: 'audio/play'; readonly sound: SoundId };

/** Nom d'un type d'événement. */
export type GameEventType = GameEvent['type'];

/** Événement correspondant à un type donné. */
export type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;
