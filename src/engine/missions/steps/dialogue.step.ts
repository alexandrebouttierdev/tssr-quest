import { z } from 'zod';
import type { DialogueStep } from '@content/schemas';
import type { StepHandler } from '../step-handler';

/** Saisie envoyée par le moteur quand le nœud de dialogue est terminé. */
const payloadSchema = z.object({ done: z.literal(true) });

/** Étape « dialogue » : réussie à la fin du nœud de dialogue. */
export const dialogueStep: StepHandler<DialogueStep> = {
  init: () => ({ type: 'dialogue' }),
  view: (step) => ({ type: 'dialogue', id: step.id }),
  objectives: () => [],
  input(_step, run, payload) {
    const done = payloadSchema.safeParse(payload).success;
    return { data: run.step.data, verdict: done ? true : null, feedback: null };
  },
  isComplete: (_step, run) => run.step.completed,
  referenceInputs: () => [{ done: true }],
};
