import { z } from 'zod';
import type { EditorStep } from '@content/schemas';
import type { Machine } from '@sims/shared/types';
import { parseKeys } from '@sims/vim';
import { evaluateCondition } from '../conditions';
import type { StepHandler } from '../step-handler';
import type { MissionRun } from '../types';
import { editorKey, editorView, openEditor } from '../vim-session';

/** Saisie d'une étape d'éditeur : une touche. */
const keySchema = z.object({ key: z.string().min(1) });

/** Machine de l'étape. */
function machineOf(step: EditorStep, run: Pick<MissionRun, 'machines'>): Machine {
  const machine = run.machines[step.machine];
  if (!machine) throw new Error(`Machine absente : ${step.machine}`);
  return machine;
}

/** Étape « éditeur » : modifier un fichier dans vim ; les objectifs portent sur son contenu. */
export const editorStep: StepHandler<EditorStep> = {
  init: (step, run) => ({ type: 'editor', editor: openEditor(machineOf(step, run), step.file) }),
  view(step, run) {
    const editor =
      run.step.data.type === 'editor'
        ? run.step.data.editor
        : openEditor(machineOf(step, run), step.file);
    return { type: 'editor', id: step.id, goal: step.goal, editor: editorView(editor) };
  },
  objectives(step, run) {
    const world = { machines: run.machines, defaultMachine: step.machine };
    return step.objectives.map((o) => ({
      id: o.id,
      label: o.label,
      done: evaluateCondition(o.when, world),
    }));
  },
  input(step, run, payload, ctx) {
    const key = keySchema.safeParse(payload);
    if (!key.success || run.step.data.type !== 'editor')
      return { data: run.step.data, verdict: null, feedback: run.step.feedback };
    const machine = machineOf(step, run);
    const result = editorKey(machine, run.step.data.editor, key.data.key, ctx.now.getTime());
    // Quitter vim le rouvre aussitôt : l'étape se joue entièrement dans l'éditeur.
    const editor = result.editor ?? openEditor(result.machine, step.file);
    return {
      data: { type: 'editor', editor },
      machines: { ...run.machines, [step.machine]: result.machine },
      verdict: null,
      feedback: run.step.feedback,
    };
  },
  isComplete(step, run) {
    const world = { machines: run.machines, defaultMachine: step.machine };
    return step.objectives.every((o) => evaluateCondition(o.when, world));
  },
  referenceInputs: (step) => parseKeys(step.solution.join('')).map((key) => ({ key })),
};
