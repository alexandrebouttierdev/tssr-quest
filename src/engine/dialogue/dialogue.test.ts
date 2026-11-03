import { describe, expect, it } from 'vitest';
import { compileContent } from '@content/compile';
import { indexContent } from '@content/loader';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import {
  advanceDialogue,
  chooseDialogue,
  dialogueConditionMet,
  startDialogue,
  type DialogueWorld,
} from './dialogue-runner';
import { missionAvailable, selectNode, type NpcDialogueWorld } from './select-node';

const content = indexContent(compileContent(VALID_CONTENT_FILES).bundle);
const hugo = content.dialogues.get('hugo')!;
const world: DialogueWorld = { flags: {}, completedMissions: [], items: [], level: 1 };

describe('interpréteur de dialogues', () => {
  it("joue les répliques dans l'ordre", () => {
    const first = startDialogue(hugo, 'intro', world);
    expect(first.line?.say).toBe('Bonjour {prenom}, on a une panne.');
    expect(first.line?.mood).toBe('inquiet');

    const second = advanceDialogue(first.cursor!, world);
    expect(second.line?.say).toBe('Tu veux un indice ?');
    expect(second.line?.choices).toHaveLength(2);
  });

  it("n'avance pas une réplique qui attend un choix", () => {
    const atChoice = advanceDialogue(startDialogue(hugo, 'intro', world).cursor!, world);

    expect(advanceDialogue(atChoice.cursor!, world).line?.say).toBe('Tu veux un indice ?');
  });

  it('joue la suite du choix, ses effets, puis reprend le nœud', () => {
    const atChoice = advanceDialogue(startDialogue(hugo, 'intro', world).cursor!, world);

    const chosen = chooseDialogue(atChoice.cursor!, 1, world);
    expect(chosen.line?.say).toBe('Bien.');
    expect(chosen.effects).toEqual([{ flag: 'confiance' }]);

    const end = advanceDialogue(chosen.cursor!, world);
    expect(end.cursor).toBeNull();
    expect(end.effects).toEqual([{ startStep: 'relance' }]);
  });

  it('ignore un choix inexistant', () => {
    const atChoice = advanceDialogue(startDialogue(hugo, 'intro', world).cursor!, world);

    expect(chooseDialogue(atChoice.cursor!, 9, world).cursor).toBe(atChoice.cursor);
  });

  it('saute une réplique dont la condition est fausse', () => {
    const outro = startDialogue(hugo, 'outro', world);

    expect(advanceDialogue(outro.cursor!, world).line?.say).toBe('À bientôt.');
  });

  it('joue une réplique conditionnelle quand le drapeau est posé', () => {
    const outro = startDialogue(hugo, 'outro', { ...world, flags: { confiance: true } });

    expect(advanceDialogue(outro.cursor!, world).line?.say).toBe('Et sans indice.');
  });

  it('refuse un nœud absent', () => {
    expect(() => startDialogue(hugo, 'absent', world)).toThrow(/introuvable/);
  });

  it('évalue toutes les conditions de réplique', () => {
    const w: DialogueWorld = {
      flags: { a: true },
      completedMissions: ['x.y'],
      items: ['cle'],
      level: 3,
    };

    expect(dialogueConditionMet({ flag: 'a' }, w, w.flags)).toBe(true);
    expect(dialogueConditionMet({ notFlag: 'a' }, w, w.flags)).toBe(false);
    expect(dialogueConditionMet({ missionDone: 'x.y' }, w, w.flags)).toBe(true);
    expect(dialogueConditionMet({ hasItem: 'cle' }, w, w.flags)).toBe(true);
    expect(dialogueConditionMet({ level: 4 }, w, w.flags)).toBe(false);
  });
});

describe("choix du dialogue d'un PNJ", () => {
  const base: NpcDialogueWorld = { ...world, debriefed: [], activeMission: null };

  it("propose l'intro de la première mission disponible", () => {
    expect(selectNode('hugo', content, base)).toEqual({
      nodeId: 'intro',
      kind: 'intro',
      missionId: 'test.panne',
    });
  });

  it("propose l'outro d'une mission terminée non débriefée", () => {
    const w = { ...base, completedMissions: ['test.panne', 'test.suite'] };

    expect(selectNode('hugo', content, w)).toEqual({
      nodeId: 'outro',
      kind: 'outro',
      missionId: 'test.panne',
    });
  });

  it('propose la réplique par défaut sinon', () => {
    const w = {
      ...base,
      completedMissions: ['test.panne', 'test.suite'],
      debriefed: ['test.panne', 'test.suite'],
    };

    expect(selectNode('hugo', content, w)).toEqual({ nodeId: 'default', kind: 'default' });
    expect(selectNode('hugo', content, { ...base, activeMission: 'test.panne' }).kind).toBe(
      'default',
    );
  });

  it('vérifie les prérequis des missions', () => {
    const suite = content.missions.get('test.suite')!;

    expect(missionAvailable(suite, base)).toBe(false);
    expect(missionAvailable(suite, { ...base, completedMissions: ['test.panne'] })).toBe(true);
    expect(
      missionAvailable({ ...suite, requires: { flags: ['f'], items: ['i'], level: 2 } }, base),
    ).toBe(false);
  });
});
