import { createContext, useContext, type ReactNode } from 'react';
import type { EventBus } from '@core/events/bus';
import type { GameEvent } from '@core/events/events';

/** Services dont l'interface a besoin en plus du store. */
export interface UiServices {
  /** Bus d'événements (les composants émettent, ils ne modifient pas le jeu). */
  readonly bus: EventBus;
  /** Autocomplétion du terminal de la mission en cours. */
  readonly complete: (partial: string) => readonly string[];
  /** Titre et corps (Markdown simple) d'une fiche « À retenir ». */
  readonly sheet: (id: string) => { title: string; body: string } | undefined;
}

/** Contexte des services d'interface. */
const UiServicesContext = createContext<UiServices | null>(null);

/**
 * Fournit les services d'interface aux composants.
 *
 * @param props - Services et enfants.
 * @returns Le fournisseur.
 */
export function UiServicesProvider({
  services,
  children,
}: {
  services: UiServices;
  children: ReactNode;
}) {
  return <UiServicesContext.Provider value={services}>{children}</UiServicesContext.Provider>;
}

/**
 * Services d'interface du contexte.
 *
 * @returns Les services.
 * @throws {Error} Hors d'un `UiServicesProvider`.
 */
export function useUiServices(): UiServices {
  const services = useContext(UiServicesContext);
  if (!services) throw new Error('UiServicesProvider manquant');
  return services;
}

/**
 * Fonction d'émission d'événements sur le bus.
 *
 * @returns `emit(event)`.
 */
export function useEmit(): (event: GameEvent) => void {
  const { bus } = useUiServices();
  return (event) => bus.emit(event);
}
