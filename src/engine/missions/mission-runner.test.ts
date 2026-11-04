import { describe, expect, it } from 'vitest';
import { createRng } from '@core/random/rng';
import { initialProgressionState } from '@core/store/progression.slice';
import { compileContent } from '@content/compile';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import { advance, missionView, revealHint, startMission, submitInput } from './mission-runner';
import { replayMission } from './replay';
import { computeRewards } from './rewards';
import type { EngineContext, MissionRun } from './types';

const { bundle } = compileContent(VALID_CONTENT_FILES);
const mission = bundle.missions.find((m) => m.id === 'test.panne')!;
const ctx = (): EngineContext => ({
  now: new Date(Date.UTC(2026, 10, 3, 8, 30)),
  rng: createRng(7),
});

/** Passe l'étape de terminal avec la solution. */
function solveTerminal(run: MissionRun): MissionRun {
  return submitInput(mission, run, { line: 'sudo systemctl start apache2' }, ctx());
}

describe("déroulement d'une mission", () => {
  it('démarre sur la première étape avec ses machines', () => {
    const run = startMission(mission, ctx());

    expect(run.stepIndex).toBe(0);
    expect(run.machines['srv']?.services['apache2']?.state).toBe('inactive');
    expect(run.step.data.type).toBe('terminal');
  });

  it("peut démarrer sur une étape donnée, ou la première si elle n'existe pas", () => {
    expect(startMission(mission, ctx(), 'quiz').stepIndex).toBe(1);
    expect(startMission(mission, ctx(), 'absente').stepIndex).toBe(0);
  });

  it("publie la vue de l'étape de terminal avec la bannière et les objectifs", () => {
    const view = missionView(mission, startMission(mission, ctx()));

    expect(view).toMatchObject({
      missionId: 'test.panne',
      title: 'La panne',
      ticket: { number: 1, priority: 'haute' },
      stepCount: 4,
      hintCount: 3,
      hints: [],
    });
    expect(view.objectives).toEqual([{ id: 'actif', label: 'Service actif', done: false }]);
    expect(view.step?.type === 'terminal' && view.step.prompt).toBe('hugo@srv:~$');
    expect(view.step?.type === 'terminal' && view.step.lines[0]?.text).toMatch(/^Linux srv /);
  });

  it("exécute les commandes, coche les objectifs et termine l'étape", () => {
    let run = startMission(mission, ctx());
    run = submitInput(mission, run, { line: 'systemctl status apache2' }, ctx());
    expect(run.step.completed).toBe(false);

    run = solveTerminal(run);

    expect(run.step.completed).toBe(true);
    expect(run.step.feedback).toEqual({ kind: 'success', code: 'step-complete' });
    expect(missionView(mission, run).objectives[0]?.done).toBe(true);
    const lines = run.step.data.type === 'terminal' ? run.step.data.lines.map((l) => l.text) : [];
    expect(lines).toContain('hugo@srv:~$ sudo systemctl start apache2');
  });

  it('compte une action ratée comme une erreur, pas une exploration', () => {
    let run = startMission(mission, ctx());
    run = submitInput(mission, run, { line: 'ls /absent' }, ctx());
    expect(run.step.errors).toBe(0);

    run = submitInput(mission, run, { line: 'systemctl start apache2' }, ctx());

    expect(run.step.errors).toBe(1);
    expect(run.totalErrors).toBe(1);
  });

  it('ignore une saisie mal formée et affiche une ligne vide', () => {
    let run = startMission(mission, ctx());
    const before = run;
    run = submitInput(mission, run, { autre: 1 }, ctx());
    expect(run.step).toEqual(before.step);

    run = submitInput(mission, run, { line: '  ' }, ctx());
    expect(run.step.data.type === 'terminal' && run.step.data.lines.at(-1)?.text).toBe(
      'hugo@srv:~$   ',
    );
  });

  it("efface l'écran avec clear et garde la session ouverte après exit", () => {
    let run = startMission(mission, ctx());
    run = submitInput(mission, run, { line: 'clear' }, ctx());
    expect(run.step.data.type === 'terminal' && run.step.data.lines).toEqual([]);

    run = submitInput(mission, run, { line: 'exit' }, ctx());
    expect(run.step.feedback).toEqual({ kind: 'info', code: 'session-kept-open' });
  });

  it('révèle les indices un par un, au plus trois', () => {
    let run = startMission(mission, ctx());
    for (let i = 0; i < 5; i++) run = revealHint(mission, run);

    expect(run.step.hintsRevealed).toBe(3);
    expect(run.totalHints).toBe(3);
    expect(missionView(mission, run).hints).toEqual(['Une piste', 'Une commande', 'La solution']);
  });

  it("ne révèle plus d'indice une fois l'étape réussie", () => {
    const run = solveTerminal(startMission(mission, ctx()));

    expect(revealHint(mission, run)).toBe(run);
  });

  it("refuse d'avancer tant que l'étape n'est pas réussie", () => {
    expect(() => advance(mission, startMission(mission, ctx()), ctx())).toThrow(
      /n'est pas terminée/,
    );
  });

  it('gère une étape à choix : erreur expliquée puis bonne réponse', () => {
    let run = advance(mission, solveTerminal(startMission(mission, ctx())), ctx()).run;
    expect(missionView(mission, run).step).toMatchObject({
      type: 'choice',
      options: [{ id: '0' }, { id: '1' }],
      multiple: false,
    });

    run = submitInput(mission, run, { options: [1] }, ctx());
    expect(run.step.feedback).toEqual({ kind: 'error', text: 'Surtout pas.' });
    expect(run.step.errors).toBe(1);

    run = submitInput(mission, run, { options: [0] }, ctx());
    expect(run.step.completed).toBe(true);
    expect(run.step.feedback).toEqual({ kind: 'success', text: "status affiche l'état." });

    const after = submitInput(mission, run, { options: [1] }, ctx());
    expect(after.step.errors).toBe(1);
  });

  it("gère une étape de saisie et une étape d'ordre", () => {
    let run = startMission(mission, ctx(), 'saisie');
    expect(missionView(mission, run).step).toEqual({
      type: 'input',
      id: 'saisie',
      question: 'Quel port écoute Apache ?',
    });
    run = submitInput(mission, run, { text: '' }, ctx());
    expect(run.step.errors).toBe(0);
    run = submitInput(mission, run, { text: '443' }, ctx());
    expect(run.step.feedback).toEqual({ kind: 'error', code: 'incorrect' });
    run = submitInput(mission, run, { text: ' 80 ' }, ctx());
    expect(run.step.completed).toBe(true);
    expect(run.step.feedback).toEqual({ kind: 'success', code: 'correct' });

    run = advance(mission, run, ctx()).run;
    const view = missionView(mission, run);
    const shown = view.step?.type === 'ordering' ? view.step.items.map((i) => i.id) : [];
    expect(shown).not.toEqual(['0', '1', '2']);
    expect([...shown].sort()).toEqual(['0', '1', '2']);
    run = submitInput(mission, run, { order: ['2', '1', '0'] }, ctx());
    expect(run.step.completed).toBe(false);
    run = submitInput(mission, run, { order: ['0', '1', '2'] }, ctx());
    expect(run.step.completed).toBe(true);
  });

  it('termine la mission avec son résultat et son XP', () => {
    let run = solveTerminal(revealHint(mission, startMission(mission, ctx())));
    run = advance(mission, run, ctx()).run;
    run = submitInput(mission, run, { options: [0] }, ctx());
    run = advance(mission, run, ctx()).run;
    run = submitInput(mission, run, { text: '80' }, ctx());
    run = advance(mission, run, ctx()).run;
    run = submitInput(mission, run, { order: ['0', '1', '2'] }, ctx());

    const end = advance(mission, run, ctx());

    expect('result' in end && end.result).toEqual({
      perfectSteps: 3,
      totalSteps: 4,
      errors: 0,
      hintsUsed: 1,
      durationMs: 0,
      xpEarned: 3 * 30 + 20 + 100,
    });
  });

  it('note une épreuve sur 20 et remplace l’XP de fin par celle de l’épreuve', () => {
    let run = startMission(mission, ctx());
    run = submitInput(mission, run, { line: 'sytemctl status apache2' }, ctx());
    run = solveTerminal(revealHint(mission, run));
    run = advance(mission, run, ctx(), { exam: true }).run;
    run = submitInput(mission, run, { options: [1] }, ctx());
    run = submitInput(mission, run, { options: [0] }, ctx());
    run = advance(mission, run, ctx(), { exam: true }).run;
    run = submitInput(mission, run, { text: '80' }, ctx());
    run = advance(mission, run, ctx(), { exam: true }).run;
    run = submitInput(mission, run, { order: ['0', '1', '2'] }, ctx());

    const end = advance(mission, run, ctx(), { exam: true });

    // 12 + autonomie (4 − 1 indice) + rigueur (4 − 2 erreurs : commande inconnue, mauvaise option).
    expect('result' in end && end.result).toMatchObject({
      grade: 17,
      gradeDetail: { autonomy: 3, rigor: 2 },
      xpEarned: 30 + 30 + 20 + 20 + 300,
    });
  });

  it('calcule les récompenses : XP, niveau, compétences, réputation, objets et fiches', () => {
    const outcome = computeRewards(
      mission,
      { perfectSteps: 4, totalSteps: 4, errors: 0, hintsUsed: 0, durationMs: 1, xpEarned: 220 },
      { ...initialProgressionState(), xp: 100 },
    );

    expect(outcome).toMatchObject({
      xp: 320,
      level: 2,
      levelsGained: [2],
      reputation: { commercial: 3 },
      items: ['cle'],
      sheets: ['fiche-a'],
    });
    expect(outcome.skills.linux).toBe(5);
  });

  it('calcule des récompenses vides pour une mission sans bonus', () => {
    const suite = bundle.missions.find((m) => m.id === 'test.suite')!;

    expect(
      computeRewards(
        suite,
        { perfectSteps: 1, totalSteps: 1, errors: 0, hintsUsed: 0, durationMs: 1, xpEarned: 80 },
        initialProgressionState(),
      ),
    ).toMatchObject({
      items: [],
      sheets: [],
      reputation: {},
    });
  });
});

describe('rejeu des solutions de référence', () => {
  it('résout chaque étape de la mission de test sans erreur', () => {
    expect(replayMission(mission, ctx())).toEqual([
      { stepId: 'relance', trivial: false, solved: true, missing: [], errors: 0 },
      { stepId: 'quiz', trivial: false, solved: true, missing: [], errors: 0 },
      { stepId: 'saisie', trivial: false, solved: true, missing: [], errors: 0 },
      { stepId: 'ordre', trivial: false, solved: true, missing: [], errors: 0 },
    ]);
  });

  it("s'arrête à la première étape non résolue", () => {
    const broken = {
      ...mission,
      steps: mission.steps.map((s) => (s.type === 'terminal' ? { ...s, solution: ['ls'] } : s)),
    };

    expect(replayMission(broken, ctx())).toEqual([
      { stepId: 'relance', trivial: false, solved: false, missing: ['actif'], errors: 0 },
    ]);
  });
});
