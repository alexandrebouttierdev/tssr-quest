import type { FeedbackView, ObjectiveView, StepView } from '@core/store/mission-run.slice';
import type { Mission, Step } from '@content/schemas';
import type { Machine } from '@sims/shared/types';
import type { EngineContext, MissionRun, StepData } from './types';

/** Résultat du traitement d'une saisie par un gestionnaire d'étape. */
export interface InputOutcome {
  /** Nouvelles données de l'étape. */
  readonly data: StepData;
  /** Machines modifiées (étapes de terminal). */
  readonly machines?: Readonly<Record<string, Machine>>;
  /** `true` : bonne réponse ; `false` : erreur comptée ; `null` : action neutre (exploration). */
  readonly verdict: boolean | null;
  readonly feedback: FeedbackView | null;
}

/** Gestionnaire d'un type d'étape (docs/04, « Types d'étapes »). */
export interface StepHandler<S extends Step = Step> {
  /** Données de départ de l'étape. */
  init(step: S, run: Pick<MissionRun, 'machines'>, ctx: EngineContext): StepData;
  /** Ce que l'interface affiche. */
  view(step: S, run: MissionRun): StepView;
  /** Objectifs affichés (vide pour les étapes sans objectifs). */
  objectives(step: S, run: MissionRun): ObjectiveView[];
  /** Traite une saisie du joueur. */
  input(step: S, run: MissionRun, payload: unknown, ctx: EngineContext): InputOutcome;
  /** Vrai quand l'étape est réussie. */
  isComplete(step: S, run: MissionRun): boolean;
  /** Saisies de référence qui réussissent l'étape (rejouées par `npm run test:content`). */
  referenceInputs(step: S, run: MissionRun): unknown[];
}

/** Mission et étape courantes, utilitaire partagé. */
export function currentStep(mission: Mission, run: MissionRun): Step {
  const step = mission.steps[run.stepIndex];
  if (!step) throw new Error(`Étape ${run.stepIndex} absente de ${mission.id}`);
  return step;
}
