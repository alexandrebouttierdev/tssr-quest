import { z } from 'zod';
import type { InputStep } from '@content/schemas';
import type { StepHandler } from '../step-handler';

/** Saisie d'une étape de réponse libre. */
const payloadSchema = z.object({ text: z.string() });

/**
 * Normalise une réponse selon les options de l'étape.
 *
 * @param text - Réponse brute.
 * @param rules - Normalisations : `trim`, `lower`, `nospace`, `ip` (zéros de tête retirés).
 * @returns La réponse normalisée.
 */
export function normalizeAnswer(
  text: string,
  rules: readonly ('lower' | 'trim' | 'nospace' | 'ip')[],
): string {
  let out = text;
  if (rules.includes('trim')) out = out.trim();
  if (rules.includes('lower')) out = out.toLowerCase();
  if (rules.includes('nospace')) out = out.replace(/\s+/g, '');
  if (rules.includes('ip')) out = out.trim().replace(/\b0+(\d)/g, '$1');
  return out;
}

/** Vrai si la réponse est acceptée. */
function accepts(step: InputStep, text: string): boolean {
  const rules = step.normalize ?? ['trim'];
  const value = normalizeAnswer(text, rules);
  if (step.answers?.some((a) => normalizeAnswer(a, rules) === value)) return true;
  return step.pattern !== undefined && new RegExp(`^(?:${step.pattern})$`).test(value);
}

/** Étape « saisie » : réponse comparée à une liste ou à un motif. */
export const inputStep: StepHandler<InputStep> = {
  init: () => ({ type: 'input' }),
  view: (step) => ({ type: 'input', id: step.id, question: step.question }),
  objectives: () => [],
  input(step, run, payload) {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success || run.step.completed || parsed.data.text.trim() === '') {
      return { data: run.step.data, verdict: null, feedback: run.step.feedback };
    }
    if (accepts(step, parsed.data.text)) {
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
  referenceInputs: (step) => [{ text: step.answers?.[0] ?? step.example ?? '' }],
};
