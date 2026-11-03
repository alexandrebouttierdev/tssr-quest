import { z } from 'zod';
import type { ChoiceStep } from '@content/schemas';
import type { StepHandler } from '../step-handler';

/** Saisie d'une étape à choix : indices des options cochées. */
const payloadSchema = z.object({ options: z.array(z.number().int().min(0)).min(1) });

/** Indices des bonnes options. */
function correctIndices(step: ChoiceStep): number[] {
  return step.options.flatMap((o, i) => (o.correct ? [i] : []));
}

/** Étape « choix » : une (ou plusieurs avec `multiple`) bonne(s) option(s). */
export const choiceStep: StepHandler<ChoiceStep> = {
  init: () => ({ type: 'choice' }),
  view: (step) => ({
    type: 'choice',
    id: step.id,
    question: step.question,
    options: step.options.map((o, i) => ({ id: String(i), text: o.text })),
    multiple: step.multiple ?? false,
  }),
  objectives: () => [],
  input(step, run, payload) {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success || run.step.completed)
      return { data: run.step.data, verdict: null, feedback: run.step.feedback };
    const chosen = [...new Set(parsed.data.options)].sort((a, b) => a - b);
    const expected = correctIndices(step);
    const correct = chosen.length === expected.length && chosen.every((c, i) => c === expected[i]);
    if (correct) {
      return {
        data: run.step.data,
        verdict: true,
        feedback: step.explain
          ? { kind: 'success', text: step.explain }
          : { kind: 'success', code: 'correct' },
      };
    }
    const wrong = chosen.map((i) => step.options[i]).find((o) => o && !o.correct);
    return {
      data: run.step.data,
      verdict: false,
      feedback: wrong?.feedback
        ? { kind: 'error', text: wrong.feedback }
        : { kind: 'error', code: 'incorrect' },
    };
  },
  isComplete: (_step, run) => run.step.completed,
  referenceInputs: (step) => [{ options: correctIndices(step) }],
};
