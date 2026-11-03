import type { Mission } from '@content/schemas';
import { advance, startMission, submitInput } from './mission-runner';
import { handlerFor } from './step-registry';
import type { EngineContext } from './types';

/** Résultat du rejeu d'une étape. */
export interface StepReplay {
  readonly stepId: string;
  /** L'étape était-elle déjà réussie avant toute saisie ? (doit être faux) */
  readonly trivial: boolean;
  /** L'étape est-elle réussie après la solution de référence ? (doit être vrai) */
  readonly solved: boolean;
  /** Objectifs encore faux après la solution. */
  readonly missing: readonly string[];
  /** Erreurs comptées pendant la solution de référence (doit être 0). */
  readonly errors: number;
}

/**
 * Rejoue la solution de référence de chaque étape, dans l'ordre, sur l'état de
 * départ de la mission (docs/04, règle 4 de la validation du contenu).
 *
 * @param mission - Mission à vérifier.
 * @param ctx - Horloge et aléatoire déterministes.
 * @returns Le bilan de chaque étape.
 */
export function replayMission(mission: Mission, ctx: EngineContext): StepReplay[] {
  const report: StepReplay[] = [];
  let run = startMission(mission, ctx);
  for (const step of mission.steps) {
    const handler = handlerFor(step);
    const trivial = handler.isComplete(step, run) || run.step.completed;
    for (const payload of handler.referenceInputs(step, run))
      run = submitInput(mission, run, payload, ctx);
    const missing = handler
      .objectives(step, run)
      .filter((o) => !o.done)
      .map((o) => o.id);
    report.push({
      stepId: step.id,
      trivial,
      solved: run.step.completed,
      missing,
      errors: run.step.errors,
    });
    if (!run.step.completed) break;
    run = advance(mission, run, ctx).run;
  }
  return report;
}
