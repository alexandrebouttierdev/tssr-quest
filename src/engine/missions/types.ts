import type { FeedbackView, TerminalLine } from '@core/store/mission-run.slice';
import type { Rng } from '@core/random/rng';
import type { Machine } from '@sims/shared/types';

/** Contexte d'exécution fourni par le moteur (horloge et aléatoire de la partie). */
export interface EngineContext {
  readonly now: Date;
  readonly rng: Rng;
}

/** Données propres au type de l'étape en cours. */
export type StepData =
  | { readonly type: 'terminal'; readonly lines: readonly TerminalLine[] }
  | { readonly type: 'choice' }
  | { readonly type: 'input' }
  /** Ordre d'affichage des éléments (indices dans l'ordre correct). */
  | { readonly type: 'ordering'; readonly shown: readonly number[] }
  | { readonly type: 'dialogue' };

/** État de l'étape en cours. */
export interface StepRuntime {
  readonly errors: number;
  readonly hintsRevealed: number;
  readonly completed: boolean;
  readonly feedback: FeedbackView | null;
  readonly data: StepData;
}

/** État complet d'une mission en cours (pur et sérialisable, propre au moteur). */
export interface MissionRun {
  readonly missionId: string;
  readonly stepIndex: number;
  /** Machines simulées, partagées par toutes les étapes de la mission. */
  readonly machines: Readonly<Record<string, Machine>>;
  readonly step: StepRuntime;
  readonly totalErrors: number;
  readonly totalHints: number;
  readonly perfectSteps: number;
  /** XP gagnée par les étapes déjà validées. */
  readonly stepXp: number;
  /** Début de la mission (ms). */
  readonly startedAt: number;
}
