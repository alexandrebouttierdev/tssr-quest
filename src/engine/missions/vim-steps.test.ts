import { describe, expect, it } from 'vitest';
import { createRng } from '@core/random/rng';
import { compileContent } from '@content/compile';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import { missionView, startMission, submitInput } from './mission-runner';
import { replayMission } from './replay';
import type { EngineContext, MissionRun } from './types';

const MISSION = `
id: test.vim
chapter: test
title: Éditer un fichier
summary: Modifier un fichier de configuration.
giver: hugo
zone: salle
rewards: {}
dialogue: { intro: "hugo#intro", outro: "hugo#outro" }
machines:
  srv:
    base: debian-server
    hostname: srv
    session: { user: hugo }
    users: [hugo]
    sudoers: [hugo]
    files:
      /home/hugo/app.conf: { owner: hugo, content: "port=80\\n" }
steps:
  - id: terminal
    type: terminal
    sim: bash
    machine: srv
    goal: Change le port dans app.conf avec vim.
    objectives:
      - { id: port, label: Port 8080, when: { file: { path: /home/hugo/app.conf, contains: "port=8080" } } }
    solution: [vim app.conf, "vim: $a80<Esc>:wq<CR>"]
  - id: editeur
    type: editor
    machine: srv
    file: /home/hugo/notes.txt
    goal: Écris une note.
    objectives:
      - { id: note, label: Note écrite, when: { file: { path: /home/hugo/notes.txt, contains: "relire les journaux" } } }
    solution: ["irelire les journaux<Esc>", ":wq<CR>"]
recap: [vim a des modes.]
`;

const { bundle, errors } = compileContent({
  ...VALID_CONTENT_FILES,
  'chapters/05-test/chapter.yaml': VALID_CONTENT_FILES['chapters/05-test/chapter.yaml']!.replace(
    'missions: [test.panne, test.suite]',
    'missions: [test.panne, test.suite, test.vim]',
  ),
  'chapters/05-test/vim.mission.yaml': MISSION,
});
const mission = bundle.missions.find((m) => m.id === 'test.vim')!;
const ctx = (): EngineContext => ({
  now: new Date(Date.UTC(2026, 10, 3, 8, 30)),
  rng: createRng(1),
});

/** Tape des touches une à une. */
function keys(run: MissionRun, text: string): MissionRun {
  return [...text].reduce((r, key) => submitInput(mission, r, { key }, ctx()), run);
}

describe('vim dans les missions', () => {
  it('compile la mission sans erreur', () => {
    expect(errors).toEqual([]);
  });

  it('ouvre vim depuis le terminal, écrit le fichier et revient au shell', () => {
    let run = submitInput(mission, startMission(mission, ctx()), { line: 'vim app.conf' }, ctx());
    const view = missionView(mission, run);
    expect(view.step?.type === 'terminal' && view.step.editor).toMatchObject({
      fileName: '/home/hugo/app.conf',
      lines: ['port=80'],
      message: '"app.conf" 1L, 8B',
    });

    run = keys(run, '$a80');
    run = submitInput(mission, run, { key: 'Escape' }, ctx());
    run = keys(run, ':wq');
    run = submitInput(mission, run, { key: 'Enter' }, ctx());

    expect(run.step.completed).toBe(true);
    expect(missionView(mission, run).step).not.toHaveProperty('editor');
    expect(
      submitInput(
        mission,
        submitInput(mission, startMission(mission, ctx()), { line: 'vim app.conf' }, ctx()),
        { line: 'ls' },
        ctx(),
      ).step.data,
    ).toMatchObject({ type: 'terminal' });
  });

  it("refuse d'enregistrer un fichier protégé (lecture seule, puis E212 avec w!)", () => {
    let run = submitInput(
      mission,
      startMission(mission, ctx()),
      { line: 'vim /etc/hostname' },
      ctx(),
    );
    run = keys(run, 'x:w!');
    run = submitInput(mission, run, { key: 'Enter' }, ctx());
    const view = missionView(mission, run);

    expect(view.step?.type === 'terminal' && view.step.editor?.message).toContain(
      "E212: Impossible d'ouvrir le fichier pour l'écriture",
    );
    const unreadable = submitInput(
      mission,
      startMission(mission, ctx()),
      { line: 'vim /etc/shadow' },
      ctx(),
    );
    const shadow = missionView(mission, unreadable);
    expect(shadow.step?.type === 'terminal' && shadow.step.editor?.message).toBe(
      '"shadow" [Permission refusée]',
    );
    expect(
      missionView(
        mission,
        submitInput(mission, startMission(mission, ctx()), { line: 'vim /etc' }, ctx()),
      ).step,
    ).not.toHaveProperty('editor');
  });

  it("joue une étape d'éditeur qui rouvre vim après l'avoir quitté", () => {
    let run = startMission(mission, ctx(), 'editeur');
    expect(missionView(mission, run).step).toMatchObject({
      type: 'editor',
      goal: 'Écris une note.',
      editor: { message: '"notes.txt" [Nouveau]' },
    });

    run = submitInput(mission, run, { autre: 1 }, ctx());
    run = keys(run, 'irelire les journaux');
    run = submitInput(mission, run, { key: 'Escape' }, ctx());
    run = keys(run, ':wq');
    run = submitInput(mission, run, { key: 'Enter' }, ctx());

    expect(run.step.completed).toBe(true);
    expect(missionView(mission, run).objectives).toEqual([
      { id: 'note', label: 'Note écrite', done: true },
    ]);
    expect(missionView(mission, run).step).toMatchObject({
      type: 'editor',
      editor: { lines: ['relire les journaux'] },
    });
  });

  it('rejoue les solutions avec des touches vim', () => {
    expect(replayMission(mission, ctx()).map((r) => r.solved)).toEqual([true, true]);
  });
});
