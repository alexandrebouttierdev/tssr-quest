import { describe, expect, it } from 'vitest';
import { createEventBus } from '@core/events/bus';
import type { GameEvent } from '@core/events/events';
import { createGameStore } from '@core/store/create-store';
import { compileContent } from '@content/compile';
import { indexContent } from '@content/loader';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import { createGameEngine } from './game-engine';

/** Monte un moteur sur le contenu de test. */
function setup() {
  const store = createGameStore();
  const bus = createEventBus();
  const events: GameEvent[] = [];
  bus.onAny((e) => events.push(e));
  let saves = 0;
  const content = indexContent(compileContent(VALID_CONTENT_FILES).bundle);
  const engine = createGameEngine({
    store,
    bus,
    content,
    clock: () => new Date(Date.UTC(2026, 10, 3, 8, 30)),
    seed: 1,
    onAutosave: () => saves++,
  });
  store.getState().setPlayerIdentity({ name: 'Alex', pronouns: 'elle' });
  return { store, bus, events, engine, saves: () => saves };
}

/** Joue l'intro d'Hugo en choisissant « Non » (drapeau confiance). */
function playIntro(store: ReturnType<typeof setup>['store'], bus: ReturnType<typeof setup>['bus']) {
  bus.emit({ type: 'world/interact', targetId: 'hugo' });
  bus.emit({ type: 'dialogue/advance' });
  const node = store.getState().ui.dialogue?.nodeId ?? '';
  bus.emit({ type: 'dialogue/choice', nodeId: node, choiceId: '1' });
  bus.emit({ type: 'dialogue/advance' });
}

describe('moteur de jeu', () => {
  it("ouvre le dialogue d'intro quand on parle au PNJ, avec le prénom du joueur", () => {
    const { store, bus } = setup();

    bus.emit({ type: 'world/interact', targetId: 'hugo' });

    expect(store.getState().ui.dialogue).toMatchObject({
      npcId: 'hugo',
      nodeId: 'intro',
      speaker: 'Hugo',
      role: 'Administrateur systèmes',
      mood: 'inquiet',
      text: 'Bonjour Alex, on a une panne.',
      choices: [],
    });
    expect(store.getState().ui.inputMode).toBe('ui');
  });

  it('ignore une interaction avec un objet inconnu', () => {
    const { store, bus } = setup();

    bus.emit({ type: 'world/interact', targetId: 'plante' });

    expect(store.getState().ui.dialogue).toBeNull();
  });

  it("démarre la mission à la fin de l'intro, à l'étape demandée", () => {
    const { store, bus, engine } = setup();

    playIntro(store, bus);

    expect(store.getState().progress.flags['confiance']).toBe(true);
    expect(store.getState().ui.dialogue).toBeNull();
    expect(store.getState().ui.openWindow).toBe('mission');
    expect(store.getState().missionRun).toMatchObject({
      missionId: 'test.panne',
      phase: 'step',
      stepIndex: 0,
    });
    expect(engine.currentRun()?.machines['srv']).toBeDefined();
    expect(store.getState().progress.currentChapter).toBe('test');
  });

  it("fait tourner la mission jusqu'au bout et distribue les récompenses", () => {
    const { store, bus, events, saves } = setup();
    playIntro(store, bus);

    bus.emit({ type: 'mission/hint-requested' });
    expect(store.getState().missionRun?.hints).toEqual(['Une piste']);
    bus.emit({ type: 'mission/continue' });
    expect(store.getState().missionRun?.stepIndex).toBe(0);
    bus.emit({ type: 'mission/step-input', payload: { line: 'sudo systemctl start apache2' } });
    expect(store.getState().missionRun?.stepCompleted).toBe(true);
    bus.emit({ type: 'mission/continue' });
    bus.emit({ type: 'mission/step-input', payload: { options: [1] } });
    bus.emit({ type: 'mission/step-input', payload: { options: [0] } });
    bus.emit({ type: 'mission/continue' });
    bus.emit({ type: 'mission/step-input', payload: { text: '80' } });
    bus.emit({ type: 'mission/continue' });
    bus.emit({ type: 'mission/step-input', payload: { order: ['0', '1', '2'] } });
    bus.emit({ type: 'mission/continue' });

    const s = store.getState();
    expect(s.missionRun).toBeNull();
    expect(s.progress.completedMissions['test.panne']).toMatchObject({
      errors: 1,
      hintsUsed: 1,
      perfectSteps: 2,
      xpEarned: 2 * 30 + 2 * 20 + 100,
    });
    expect(s.progression).toMatchObject({ xp: 200, level: 1 });
    expect(s.progression.skills.linux).toBe(5);
    expect(s.reputation.commercial).toBe(53);
    expect(s.inventory.items).toEqual(['cle']);
    expect(s.progress.unlockedSheets).toEqual(['fiche-a']);
    expect(saves()).toBe(1);
    expect(events.map((e) => e.type)).toContain('mission/completed');
    expect(
      events
        .filter((e) => e.type === 'audio/play')
        .map((e) => (e.type === 'audio/play' ? e.sound : '')),
    ).toEqual([
      'objective-done',
      'mission-error',
      'objective-done',
      'objective-done',
      'objective-done',
      'mission-success',
    ]);
    // L'outro démarre aussitôt, avec la réplique conditionnelle du drapeau.
    expect(s.ui.dialogue?.nodeId).toBe('outro');
    bus.emit({ type: 'dialogue/advance' });
    expect(store.getState().ui.dialogue?.text).toBe('Et sans indice.');
    bus.emit({ type: 'dialogue/advance' });
    bus.emit({ type: 'dialogue/advance' });
    expect(store.getState().progress.debriefed).toEqual(['test.panne']);
    expect(store.getState().ui.inputMode).toBe('world');
  });

  it('annonce les montées de niveau', () => {
    const { store, bus, events } = setup();
    store.getState().setProgression({ xp: 290 });
    bus.emit({ type: 'mission/start', missionId: 'test.suite' });
    bus.emit({ type: 'mission/step-input', payload: { options: [0] } });
    bus.emit({ type: 'mission/continue' });

    expect(events).toContainEqual({ type: 'progression/level-up', level: 2 });
    expect(store.getState().progression.level).toBe(2);
    expect(store.getState().progress.badges).toEqual([]);
  });

  it("abandonne une mission et joue le dialogue d'abandon", () => {
    const { store, bus } = setup();
    playIntro(store, bus);

    bus.emit({ type: 'mission/abandon' });

    expect(store.getState().missionRun).toBeNull();
    expect(store.getState().ui.openWindow).toBeNull();
    expect(store.getState().ui.dialogue?.text).toBe('Reviens quand tu veux.');
    bus.emit({ type: 'dialogue/advance' });
    expect(store.getState().ui.inputMode).toBe('world');
  });

  it('ignore les événements de mission hors mission et après dispose', () => {
    const { store, bus, engine } = setup();
    bus.emit({ type: 'mission/step-input', payload: {} });
    bus.emit({ type: 'mission/hint-requested' });
    bus.emit({ type: 'mission/continue' });
    bus.emit({ type: 'mission/abandon' });
    bus.emit({ type: 'dialogue/advance' });
    bus.emit({ type: 'mission/start', missionId: 'absente' });
    expect(store.getState().missionRun).toBeNull();

    engine.dispose();
    bus.emit({ type: 'world/interact', targetId: 'hugo' });
    expect(store.getState().ui.dialogue).toBeNull();
  });

  it('applique les effets de dialogue sur la partie', () => {
    const store = createGameStore();
    const bus = createEventBus();
    const files = {
      ...VALID_CONTENT_FILES,
      'dialogues/hugo.dialogue.yaml': `npc: hugo
nodes:
  intro: [{ say: Intro. }]
  outro: [{ say: Outro. }]
  abandon: [{ say: Abandon. }]
  default:
    - say: Tiens.
      effects: [{ giveItem: cle }, { reputation: { accueil: 5 } }, { unlockZone: salle }, { unlockSheet: fiche-a }, { flag: a }]
    - effects: [{ unflag: a }, { takeItem: cle }, { startMission: test.suite }]
`,
    };
    const content = indexContent(compileContent(files).bundle);
    createGameEngine({ store, bus, content });
    store.getState().recordMissionCompleted('test.panne', {
      completedAt: 0,
      perfectSteps: 0,
      totalSteps: 1,
      errors: 0,
      hintsUsed: 0,
      durationMs: 0,
      xpEarned: 0,
    });
    store.getState().markDebriefed('test.panne');
    store.getState().recordMissionCompleted('test.suite', {
      completedAt: 0,
      perfectSteps: 0,
      totalSteps: 1,
      errors: 0,
      hintsUsed: 0,
      durationMs: 0,
      xpEarned: 0,
    });
    store.getState().markDebriefed('test.suite');

    bus.emit({ type: 'world/interact', targetId: 'hugo' });
    expect(store.getState().inventory.items).toEqual(['cle']);
    bus.emit({ type: 'dialogue/advance' });

    const s = store.getState();
    expect(s.reputation.accueil).toBe(55);
    expect(s.progress.unlockedZones).toEqual(['salle']);
    expect(s.progress.flags['a']).toBeUndefined();
    expect(s.inventory.items).toEqual([]);
    expect(s.missionRun?.missionId).toBe('test.suite');
  });

  it('remet le badge du chapitre quand toutes ses missions sont terminées', () => {
    const { store, bus } = setup();
    store.getState().recordMissionCompleted('test.panne', {
      completedAt: 0,
      perfectSteps: 0,
      totalSteps: 1,
      errors: 0,
      hintsUsed: 0,
      durationMs: 0,
      xpEarned: 0,
    });
    bus.emit({ type: 'mission/start', missionId: 'test.suite' });
    bus.emit({ type: 'mission/step-input', payload: { options: [0] } });
    bus.emit({ type: 'mission/continue' });

    expect(store.getState().progress.badges).toEqual(['badge-test']);
    expect(store.getState().progress.unlockedZones).toEqual(['salle']);
  });
});
