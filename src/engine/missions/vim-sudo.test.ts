import { describe, expect, it } from 'vitest';
import { createRng } from '@core/random/rng';
import { compileContent } from '@content/compile';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import { missionView, startMission, submitInput } from './mission-runner';
import { replayMission } from './replay';
import type { EngineContext } from './types';

const MISSION = `
id: test.sudo-vim
chapter: test
title: Éditer un fichier système
summary: Modifier un fichier de /etc.
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
steps:
  - id: terminal
    type: terminal
    sim: bash
    machine: srv
    goal: Ajoute une ligne au message du jour.
    objectives:
      - { id: motd, label: Message, when: { file: { path: /etc/motd, contains: "Maintenance jeudi" } } }
    solution: [sudo vim /etc/motd, "vim: GoMaintenance jeudi<Esc>:wq<CR>"]
  - id: editeur
    type: editor
    machine: srv
    file: /etc/issue.net
    sudo: true
    goal: Écris la bannière.
    objectives:
      - { id: banniere, label: Bannière, when: { file: { path: /etc/issue.net, contains: "Accès réservé" } } }
    solution: ["ggdGiAccès réservé<Esc>", ":wq<CR>"]
recap: [sudo vim pour les fichiers de /etc.]
`;

const { bundle } = compileContent({
  ...VALID_CONTENT_FILES,
  'chapters/05-test/chapter.yaml': VALID_CONTENT_FILES['chapters/05-test/chapter.yaml']!.replace(
    'missions: [test.panne, test.suite]',
    'missions: [test.panne, test.suite, test.sudo-vim]',
  ),
  'chapters/05-test/sudo-vim.mission.yaml': MISSION,
});
const mission = bundle.missions.find((m) => m.id === 'test.sudo-vim')!;
const ctx = (): EngineContext => ({
  now: new Date(Date.UTC(2026, 10, 3, 8, 30)),
  rng: createRng(1),
});

describe('vim avec les droits de root', () => {
  it('écrit un fichier de /etc après sudo vim, pas après vim', () => {
    let run = startMission(mission, ctx());
    run = submitInput(mission, run, { line: 'vim /etc/motd' }, ctx());
    for (const key of ['G', 'o', 'x', 'Escape', ':', 'w', 'q', 'Enter'])
      run = submitInput(mission, run, { key }, ctx());
    const editor = run.step.data.type === 'terminal' ? run.step.data.editor : null;
    expect(editor?.message).toMatch(/E212|lecture seule|readonly|E45/i);
  });

  it('rejoue les solutions : terminal sudo vim et étape éditeur sudo', () => {
    const report = replayMission(mission, ctx());
    expect(report.map((r) => [r.stepId, r.solved, r.errors])).toEqual([
      ['terminal', true, 0],
      ['editeur', true, 0],
    ]);
  });
});

describe('saisie masquée', () => {
  it('masque le champ et ne réaffiche jamais un mot de passe', () => {
    let run = startMission(mission, ctx());
    run = submitInput(mission, run, { line: 'sudo passwd hugo' }, ctx());
    const view = missionView(mission, run);
    expect(view.step?.type === 'terminal' && view.step.secret).toBe(true);
    run = submitInput(mission, run, { line: 'Secret-2026' }, ctx());
    const lines = run.step.data.type === 'terminal' ? run.step.data.lines.map((l) => l.text) : [];
    expect(lines.join('\n')).not.toContain('Secret-2026');
    expect(lines).toContain('Nouveau mot de passe :');
  });
});
