import { z } from 'zod';
import type { OrderingStep } from '@content/schemas';
import type { StepHandler } from '../step-handler';

/** Saisie d'une étape d'ordre : identifiants des éléments, dans l'ordre choisi. */
const payloadSchema = z.object({ order: z.array(z.string()) });

/** Étape « ordre » : remettre les éléments dans l'ordre du YAML. */
export const orderingStep: StepHandler<OrderingStep> = {
  init(step, _run, ctx) {
    const indices = step.items.map((_, i) => i);
    let shown = ctx.rng.shuffle(indices);
    // Un mélange qui retombe sur l'ordre correct ne demanderait rien : on décale d'un cran.
    if (shown.every((v, i) => v === i)) shown = [...shown.slice(1), shown[0] ?? 0];
    return { type: 'ordering', shown };
  },
  view(step, run) {
    const shown =
      run.step.data.type === 'ordering' ? run.step.data.shown : step.items.map((_, i) => i);
    return {
      type: 'ordering',
      id: step.id,
      question: step.question,
      items: shown.map((i) => ({ id: String(i), text: step.items[i] ?? '' })),
    };
  },
  objectives: () => [],
  input(step, run, payload) {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success || run.step.completed)
      return { data: run.step.data, verdict: null, feedback: run.step.feedback };
    const correct =
      parsed.data.order.length === step.items.length &&
      parsed.data.order.every((id, i) => id === String(i));
    if (correct) {
      return {
        data: run.step.data,
        verdict: true,
        feedback: step.explain
          ? { kind: 'success', text: step.explain }
          : { kind: 'success', code: 'correct' },
      };
    }
    return { data: run.step.data, verdict: false, feedback: { kind: 'error', code: 'incorrect' } };
  },
  isComplete: (_step, run) => run.step.completed,
  referenceInputs: (step) => [{ order: step.items.map((_, i) => String(i)) }],
};
