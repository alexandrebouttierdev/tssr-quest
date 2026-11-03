import type { Step } from '@content/schemas';
import type { StepHandler } from './step-handler';
import { choiceStep } from './steps/choice.step';
import { dialogueStep } from './steps/dialogue.step';
import { editorStep } from './steps/editor.step';
import { inputStep } from './steps/input.step';
import { orderingStep } from './steps/ordering.step';
import { terminalStep } from './steps/terminal.step';

/** Gestionnaires par type d'étape. */
const HANDLERS = {
  choice: choiceStep,
  dialogue: dialogueStep,
  editor: editorStep,
  input: inputStep,
  ordering: orderingStep,
  terminal: terminalStep,
} as const;

/**
 * Gestionnaire d'une étape selon son type.
 *
 * @param step - Étape de mission.
 * @returns Son gestionnaire, typé de façon large (l'étape lui correspond toujours).
 */
export function handlerFor(step: Step): StepHandler {
  // Le registre garantit la correspondance type d'étape ↔ gestionnaire.
  return HANDLERS[step.type];
}
