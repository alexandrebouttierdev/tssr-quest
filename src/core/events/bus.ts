import type { GameEvent, GameEventOf, GameEventType } from './events';

/** Fonction appelée à la réception d'un événement d'un type donné. */
export type EventHandler<T extends GameEventType> = (event: GameEventOf<T>) => void;

/** Fonction appelée pour chaque événement, quel que soit son type. */
export type AnyEventHandler = (event: GameEvent) => void;

/** Fonction qui annule un abonnement. */
export type Unsubscribe = () => void;

/** Options de création du bus. */
export interface EventBusOptions {
  /**
   * Appelée quand un abonné lève une erreur. Sans elle, l'erreur est relancée
   * après que tous les autres abonnés ont été appelés.
   */
  readonly onError?: (error: unknown, event: GameEvent) => void;
}

/** Bus d'événements typé : frontière entre le monde, l'interface et le moteur. */
export interface EventBus {
  /** Abonne un gestionnaire à un type d'événement ; renvoie la fonction de désabonnement. */
  on<T extends GameEventType>(type: T, handler: EventHandler<T>): Unsubscribe;
  /** Abonne un gestionnaire pour une seule réception. */
  once<T extends GameEventType>(type: T, handler: EventHandler<T>): Unsubscribe;
  /** Retire un gestionnaire précédemment abonné. */
  off<T extends GameEventType>(type: T, handler: EventHandler<T>): void;
  /** Abonne un gestionnaire à tous les événements (journalisation, débogage). */
  onAny(handler: AnyEventHandler): Unsubscribe;
  /** Émet un événement, de façon synchrone, vers ses abonnés. */
  emit(event: GameEvent): void;
  /** Retire tous les abonnements (fin de partie, tests). */
  clear(): void;
}

/**
 * Crée un bus d'événements typé.
 *
 * Les abonnés sont appelés de façon synchrone, dans l'ordre d'abonnement. La liste
 * des abonnés est figée au début de chaque émission : un abonnement ajouté pendant
 * l'émission ne reçoit que les événements suivants.
 *
 * @param options - Gestion des erreurs levées par les abonnés.
 * @returns Un bus vide.
 * @example
 * const bus = createEventBus();
 * bus.on('world/interact', (e) => console.warn(e.targetId));
 * bus.emit({ type: 'world/interact', targetId: 'hugo' });
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  // Les gestionnaires sont stockés sans leur type précis : la cohérence type/gestionnaire
  // est garantie par les signatures de `on` et `off`.
  const handlers = new Map<GameEventType, AnyEventHandler[]>();
  let anyHandlers: AnyEventHandler[] = [];

  const off: EventBus['off'] = (type, handler) => {
    const list = handlers.get(type);
    if (!list) return;
    handlers.set(
      type,
      list.filter((h) => h !== (handler as AnyEventHandler)),
    );
  };

  const on: EventBus['on'] = (type, handler) => {
    const list = handlers.get(type) ?? [];
    handlers.set(type, [...list, handler as AnyEventHandler]);
    return () => off(type, handler);
  };

  return {
    on,
    off,
    once(type, handler) {
      const unsubscribe = on(type, (event) => {
        unsubscribe();
        handler(event);
      });
      return unsubscribe;
    },
    onAny(handler) {
      anyHandlers = [...anyHandlers, handler];
      return () => {
        anyHandlers = anyHandlers.filter((h) => h !== handler);
      };
    },
    emit(event) {
      const targets = [...(handlers.get(event.type) ?? []), ...anyHandlers];
      let firstError: { error: unknown } | null = null;
      for (const handler of targets) {
        try {
          handler(event);
        } catch (error) {
          if (options.onError) options.onError(error, event);
          else firstError ??= { error };
        }
      }
      if (firstError) throw firstError.error;
    },
    clear() {
      handlers.clear();
      anyHandlers = [];
    },
  };
}
