import type { MissionResult } from '@core/model';
import type { MissionRunView } from '@core/store/mission-run.slice';
import type { Mission } from '@content/schemas';
import type { Machine } from '@sims/shared/types';
import { examXp, gradeExam } from '../grading/grade';
import { buildMachine } from './machines';
import { handlerFor } from './step-registry';
import { currentStep } from './step-handler';
import type { EngineContext, MissionRun, StepRuntime } from './types';

/** XP d'une étape réussie (docs/01). */
export const STEP_XP = 20;
/** Bonus d'une étape réussie sans erreur ni indice. */
export const PERFECT_BONUS = 10;
/** XP de fin de mission quand le YAML n'en précise pas. */
export const DEFAULT_MISSION_XP = 50;

/** État de départ d'une étape. */
function freshStep(
  mission: Mission,
  stepIndex: number,
  machines: Readonly<Record<string, Machine>>,
  ctx: EngineContext,
): StepRuntime {
  const step = mission.steps[stepIndex];
  if (!step) throw new Error(`Étape ${stepIndex} absente de ${mission.id}`);
  return {
    errors: 0,
    hintsRevealed: 0,
    completed: false,
    feedback: null,
    data: handlerFor(step).init(step, { machines }, ctx),
  };
}

/**
 * Démarre une mission : construit ses machines et prépare la première étape
 * (ou l'étape demandée par l'effet de dialogue `startStep`).
 *
 * @param mission - Mission du contenu.
 * @param ctx - Horloge et aléatoire.
 * @param startStepId - Étape de départ (première par défaut).
 * @returns L'état de la mission.
 */
export function startMission(
  mission: Mission,
  ctx: EngineContext,
  startStepId?: string,
): MissionRun {
  const now = ctx.now.getTime();
  const machines = Object.fromEntries(
    Object.entries(mission.machines ?? {}).map(([id, spec]) => [id, buildMachine(spec, now)]),
  );
  const found =
    startStepId === undefined ? 0 : mission.steps.findIndex((s) => s.id === startStepId);
  const stepIndex = Math.max(0, found);
  return {
    missionId: mission.id,
    stepIndex,
    machines,
    step: freshStep(mission, stepIndex, machines, ctx),
    totalErrors: 0,
    totalHints: 0,
    perfectSteps: 0,
    stepXp: 0,
    startedAt: now,
  };
}

/**
 * Traite une saisie du joueur dans l'étape en cours et réévalue sa réussite.
 *
 * @param mission - Mission du contenu.
 * @param run - État courant.
 * @param payload - Saisie (ligne de commande, options cochées, texte, ordre…).
 * @param ctx - Horloge et aléatoire.
 * @returns Le nouvel état.
 */
export function submitInput(
  mission: Mission,
  run: MissionRun,
  payload: unknown,
  ctx: EngineContext,
): MissionRun {
  const step = currentStep(mission, run);
  const handler = handlerFor(step);
  const outcome = handler.input(step, run, payload, ctx);
  const errors = outcome.verdict === false ? 1 : 0;
  const next: MissionRun = {
    ...run,
    machines: outcome.machines ?? run.machines,
    totalErrors: run.totalErrors + errors,
    step: {
      ...run.step,
      data: outcome.data,
      errors: run.step.errors + errors,
      feedback: outcome.feedback,
      completed: run.step.completed || outcome.verdict === true,
    },
  };
  const completed = handler.isComplete(step, next);
  const justCompleted = completed && !run.step.completed;
  return {
    ...next,
    step: {
      ...next.step,
      completed,
      feedback:
        justCompleted && step.type === 'terminal'
          ? { kind: 'success', code: 'step-complete' }
          : next.step.feedback,
    },
  };
}

/**
 * Révèle l'indice suivant de l'étape (trois niveaux au plus). Chaque indice retire
 * le bonus sans faute de l'étape, jamais la progression.
 *
 * @param mission - Mission du contenu.
 * @param run - État courant.
 * @returns Le nouvel état (inchangé s'il n'y a plus d'indice).
 */
export function revealHint(mission: Mission, run: MissionRun): MissionRun {
  const hints = currentStep(mission, run).hints ?? [];
  if (run.step.hintsRevealed >= hints.length || run.step.completed) return run;
  return {
    ...run,
    totalHints: run.totalHints + 1,
    step: { ...run.step, hintsRevealed: run.step.hintsRevealed + 1 },
  };
}

/** Passage à l'étape suivante, ou fin de mission avec son résultat. */
export type AdvanceResult =
  { readonly run: MissionRun } | { readonly result: MissionResult; readonly run: MissionRun };

/**
 * Valide l'étape terminée et passe à la suivante, ou termine la mission.
 *
 * @param mission - Mission du contenu.
 * @param run - État courant (l'étape doit être réussie).
 * @param ctx - Horloge et aléatoire.
 * @param options - `exam` : la mission est l'épreuve du chapitre (notée sur 20).
 * @returns Le nouvel état, et le résultat si c'était la dernière étape.
 * @throws {Error} Si l'étape n'est pas encore réussie.
 */
export function advance(
  mission: Mission,
  run: MissionRun,
  ctx: EngineContext,
  options: { readonly exam?: boolean } = {},
): AdvanceResult {
  const step = currentStep(mission, run);
  if (!run.step.completed) throw new Error(`L'étape ${step.id} n'est pas terminée`);
  const perfect = run.step.errors === 0 && run.step.hintsRevealed === 0;
  const done: MissionRun = {
    ...run,
    perfectSteps: run.perfectSteps + (perfect ? 1 : 0),
    stepXp: run.stepXp + (step.xp ?? STEP_XP) + (perfect ? PERFECT_BONUS : 0),
  };
  const nextIndex = run.stepIndex + 1;
  if (nextIndex < mission.steps.length) {
    return {
      run: {
        ...done,
        stepIndex: nextIndex,
        step: freshStep(mission, nextIndex, done.machines, ctx),
      },
    };
  }
  const base: MissionResult = {
    perfectSteps: done.perfectSteps,
    totalSteps: mission.steps.length,
    errors: done.totalErrors,
    hintsUsed: done.totalHints,
    durationMs: ctx.now.getTime() - run.startedAt,
    xpEarned: done.stepXp + (mission.rewards.xp ?? DEFAULT_MISSION_XP),
  };
  if (!options.exam) return { run: done, result: base };
  // Épreuve : la note remplace l'XP de fin de mission (200, ou 300 avec la mention).
  const grade = gradeExam({ hintsUsed: done.totalHints, errors: done.totalErrors });
  const result: MissionResult = {
    ...base,
    xpEarned: done.stepXp + examXp(grade.total),
    grade: grade.total,
    gradeDetail: { autonomy: grade.autonomy, rigor: grade.rigor },
  };
  return { run: done, result };
}

/**
 * Vue de la mission publiée dans le store pour l'interface.
 *
 * @param mission - Mission du contenu.
 * @param run - État courant.
 * @returns La vue (sans les machines simulées).
 */
export function missionView(mission: Mission, run: MissionRun): MissionRunView {
  const step = currentStep(mission, run);
  const handler = handlerFor(step);
  const hints = step.hints ?? [];
  return {
    missionId: mission.id,
    title: mission.title,
    summary: mission.summary,
    ...(mission.ticket
      ? { ticket: { number: mission.ticket.number, priority: mission.ticket.priority } }
      : {}),
    phase: 'step',
    stepIndex: run.stepIndex,
    stepCount: mission.steps.length,
    step: handler.view(step, run),
    objectives: handler.objectives(step, run),
    hints: hints.slice(0, run.step.hintsRevealed),
    hintCount: hints.length,
    ...(step.sheet ? { sheet: step.sheet } : {}),
    feedback: run.step.feedback,
    stepCompleted: run.step.completed,
  };
}
