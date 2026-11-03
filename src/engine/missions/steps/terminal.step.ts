import { z } from 'zod';
import type { TerminalLine } from '@core/store/mission-run.slice';
import type { TerminalStep } from '@content/schemas';
import { bashSimulator } from '@sims/bash';
import { parseKeys } from '@sims/vim';
import type { Machine } from '@sims/shared/types';
import { evaluateCondition } from '../conditions';
import type { StepHandler } from '../step-handler';
import { editorKey, editorView, openEditor } from '../vim-session';
import type { MissionRun } from '../types';

/** Saisie d'une étape de terminal : une ligne de commande. */
const payloadSchema = z.object({ line: z.string() });

/** Saisie quand vim est ouvert dans le terminal : une touche. */
const keySchema = z.object({ key: z.string().min(1) });

/** Nombre maximal de lignes gardées à l'écran. */
const MAX_LINES = 400;

/**
 * Programmes qui ne font que lire : leur échec relève de l'exploration et n'est pas
 * compté comme une erreur.
 */
const READ_ONLY = new Set([
  'ls',
  'cat',
  'cd',
  'pwd',
  'echo',
  'man',
  'aide',
  'help',
  '?',
  'clear',
  'df',
  'du',
  'journalctl',
  'whoami',
  'hostname',
  'curl',
  'true',
  'false',
  'export',
  'exit',
  'logout',
]);

/** Programme et sous-commande « significatifs » d'une ligne (sans sudo). */
function signature(line: string): string | null {
  const words = line
    .trim()
    .split(/\s+/)
    .filter((w) => !w.startsWith('-'));
  const [first, second] = words[0] === 'sudo' ? words.slice(1) : words;
  if (!first || READ_ONLY.has(first)) return null;
  if (first === 'systemctl') {
    return second &&
      !['status', 'is-active', 'is-enabled', 'is-failed', 'list-units'].includes(second)
      ? `systemctl ${second}`
      : null;
  }
  return first;
}

/** Découpe une sortie en lignes d'affichage. */
function toLines(kind: TerminalLine['kind'], text: string): TerminalLine[] {
  if (!text) return [];
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((t) => ({ kind, text: t }));
}

/** Machine de l'étape. */
function machineOf(step: TerminalStep, run: Pick<MissionRun, 'machines'>): Machine {
  const machine = run.machines[step.machine];
  if (!machine) throw new Error(`Machine absente : ${step.machine}`);
  return machine;
}

/** Étape « terminal » : objectifs évalués sur l'état de la machine après chaque commande. */
export const terminalStep: StepHandler<TerminalStep> = {
  init(step, run, ctx) {
    const banner = bashSimulator.banner(machineOf(step, run), { now: ctx.now, rng: ctx.rng });
    return {
      type: 'terminal',
      lines: [...toLines('system', banner), { kind: 'system', text: '' }],
    };
  },
  view(step, run) {
    return {
      type: 'terminal',
      id: step.id,
      goal: step.goal,
      sim: step.sim,
      machine: step.machine,
      prompt: bashSimulator.prompt(machineOf(step, run)),
      lines: run.step.data.type === 'terminal' ? run.step.data.lines : [],
      ...(run.step.data.type === 'terminal' && run.step.data.editor
        ? { editor: editorView(run.step.data.editor) }
        : {}),
    };
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
    const previous = run.step.data.type === 'terminal' ? run.step.data.lines : [];
    const openEditorState = run.step.data.type === 'terminal' ? run.step.data.editor : null;
    if (openEditorState) {
      const key = keySchema.safeParse(payload);
      if (!key.success) return { data: run.step.data, verdict: null, feedback: run.step.feedback };
      const result = editorKey(
        machineOf(step, run),
        openEditorState,
        key.data.key,
        ctx.now.getTime(),
      );
      const hook = run.step.data.type === 'terminal' ? (run.step.data.editorHook ?? null) : null;
      // Éditeur fermé après `crontab -e` : crontab vérifie et installe la table.
      if (result.editor === null && hook && bashSimulator.afterEdit) {
        const after = bashSimulator.afterEdit(result.machine, hook, { now: ctx.now, rng: ctx.rng });
        const lines = [...previous];
        for (const chunk of after.output ?? []) lines.push(...toLines(chunk.stream, chunk.text));
        return {
          data: {
            type: 'terminal',
            lines: lines.slice(-MAX_LINES),
            editor: null,
            editorHook: null,
          },
          machines: { ...run.machines, [step.machine]: after.state },
          verdict: null,
          feedback: run.step.feedback,
        };
      }
      return {
        data: { type: 'terminal', lines: previous, editor: result.editor, editorHook: hook },
        machines: { ...run.machines, [step.machine]: result.machine },
        verdict: null,
        feedback: run.step.feedback,
      };
    }
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) return { data: run.step.data, verdict: null, feedback: run.step.feedback };
    const machine = machineOf(step, run);
    const echo: TerminalLine = {
      kind: 'input',
      // Ctrl+D s'affiche « <EOT> », comme dans la console.
      text: `${bashSimulator.prompt(machine)} ${parsed.data.line === '\u0004' ? '<EOT>' : parsed.data.line}`,
    };
    // Une ligne vide ne fait rien… sauf répondre à une question en attente (Entrée = défaut).
    if (parsed.data.line.trim() === '' && !machine.session.pending) {
      return {
        data: { type: 'terminal', lines: [...previous, echo] },
        verdict: null,
        feedback: run.step.feedback,
      };
    }
    const result = bashSimulator.exec(machine, parsed.data.line, { now: ctx.now, rng: ctx.rng });
    let lines: TerminalLine[] = [...previous, echo];
    for (const chunk of result.output ?? []) lines.push(...toLines(chunk.stream, chunk.text));
    if (result.effects?.some((e) => e.type === 'clear')) lines = [];
    const kept = result.effects?.some((e) => e.type === 'exit') ?? false;
    const editPath = result.effects?.find((e) => e.type === 'open-editor');
    const editor =
      editPath?.type === 'open-editor' ? openEditor(result.state, editPath.path) : null;
    const editorHook = editPath?.type === 'open-editor' ? (editPath.onClose ?? null) : null;
    // Erreur comptée : une action qui modifie l'état (pas une lecture) a échoué.
    const failedAction =
      result.exitCode !== 0 &&
      result.state.history.at(-1)?.ok === false &&
      signature(parsed.data.line) !== null;
    return {
      data: { type: 'terminal', lines: lines.slice(-MAX_LINES), editor, editorHook },
      machines: { ...run.machines, [step.machine]: result.state },
      verdict: failedAction ? false : null,
      feedback: kept ? { kind: 'info', code: 'session-kept-open' } : null,
    };
  },
  isComplete(step, run) {
    const world = { machines: run.machines, defaultMachine: step.machine };
    return step.objectives.every((o) => evaluateCondition(o.when, world));
  },
  referenceInputs: (step) =>
    step.solution.flatMap((line): ({ key: string } | { line: string })[] =>
      // Une ligne « vim: <touches> » de la solution désigne des touches tapées dans vim.
      line.startsWith('vim:')
        ? parseKeys(line.slice(4).trimStart()).map((key) => ({ key }))
        : [{ line }],
    ),
};
