import { SERVICE_IDS, type ServiceId } from '../model';
import type { SliceCreator } from './types';

/** Tranche `reputation` : satisfaction de chaque service, de 0 à 100. */
export type ReputationState = Readonly<Record<ServiceId, number>>;

/** Actions de la tranche `reputation`. */
export interface ReputationActions {
  /** Ajoute (ou retire) des points à un service ; le résultat reste entre 0 et 100. */
  adjustReputation(service: ServiceId, delta: number): void;
}

/** Satisfaction de départ de chaque service. */
const INITIAL_REPUTATION = 50;

/**
 * Tous les services à 50.
 *
 * @returns Un nouvel état de la tranche `reputation`.
 */
export function initialReputationState(): ReputationState {
  return Object.fromEntries(SERVICE_IDS.map((id) => [id, INITIAL_REPUTATION])) as Record<
    ServiceId,
    number
  >;
}

/** Fabrique de la tranche `reputation`. */
export const createReputationSlice: SliceCreator<
  { reputation: ReputationState } & ReputationActions
> = (set) => ({
  reputation: initialReputationState(),
  adjustReputation: (service, delta) =>
    set((s) => {
      s.reputation[service] = Math.min(100, Math.max(0, s.reputation[service] + delta));
    }),
});
