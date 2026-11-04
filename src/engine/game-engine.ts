import type { EventBus, Unsubscribe } from '@core/events/bus';
import { bashSimulator } from '@sims/bash';
import { createRng, type Rng } from '@core/random/rng';
import type { GameStoreApi } from '@core/store/create-store';
import type { DialogueView } from '@core/store/ui.slice';
import type { ContentIndex } from '@content/loader';
import type { DialogueEffect, Mission } from '@content/schemas';
import {
  advanceDialogue,
  chooseDialogue,
  startDialogue,
  type DialogueCursor,
  type DialogueStep,
  type DialogueWorld,
} from './dialogue/dialogue-runner';
import { selectNode, type NpcDialogueWorld } from './dialogue/select-node';
import {
  advance,
  missionView,
  revealHint,
  startMission,
  submitInput,
} from './missions/mission-runner';
import { computeRewards } from './missions/rewards';
import type { EngineContext, MissionRun } from './missions/types';

/** Options du moteur de jeu. */
export interface GameEngineOptions {
  readonly store: GameStoreApi;
  readonly bus: EventBus;
  readonly content: ContentIndex;
  /** Horloge simulée (par défaut : l'heure réelle). */
  readonly clock?: () => Date;
  /** Graine de l'aléatoire de la partie. */
  readonly seed?: number;
  /** Appelé après chaque fin de mission (sauvegarde automatique). */
  readonly onAutosave?: () => void;
}

/** Moteur de jeu branché sur le bus et le store. */
export interface GameEngine {
  /** Mission en cours (état complet, machines comprises), pour le débogage et les tests. */
  currentRun(): MissionRun | null;
  /** Autocomplétion de la ligne en cours dans le terminal de la mission. */
  completeCommand(partial: string): readonly string[];
  /** Débranche le moteur du bus. */
  dispose(): void;
}

/** Raison pour laquelle un dialogue est joué (ce qui se passe à sa fin). */
type DialoguePurpose =
  | { readonly kind: 'intro'; readonly missionId: string }
  | { readonly kind: 'outro'; readonly missionId: string }
  | { readonly kind: 'other' };

/**
 * Crée le moteur : il écoute les événements du monde et de l'interface, fait tourner
 * dialogues et missions, et publie le résultat dans le store (docs/02, « Cycle d'une interaction »).
 *
 * @param options - Store, bus, contenu, horloge.
 * @returns Le moteur, à détruire avec `dispose()`.
 */
export function createGameEngine(options: GameEngineOptions): GameEngine {
  const { store, bus, content } = options;
  const clock = options.clock ?? (() => new Date());
  const rng: Rng = createRng(options.seed ?? 20261103);
  const ctx = (): EngineContext => ({ now: clock(), rng });

  let dialogue: { cursor: DialogueCursor; purpose: DialoguePurpose } | null = null;
  let mission: Mission | null = null;
  let run: MissionRun | null = null;
  let pendingStep: string | null = null;
  let pendingMission: string | null = null;

  const world = (): NpcDialogueWorld => {
    const s = store.getState();
    return {
      flags: s.progress.flags,
      completedMissions: Object.keys(s.progress.completedMissions),
      items: s.inventory.items,
      level: s.progression.level,
      debriefed: s.progress.debriefed,
      activeMission: run?.missionId ?? null,
    };
  };

  const syncInputMode = () => {
    const s = store.getState();
    s.setInputMode(dialogue || run ? 'ui' : 'world');
  };

  const publishRun = () => {
    const s = store.getState();
    if (mission && run) {
      s.setMissionRun(missionView(mission, run));
      s.setOpenWindow('mission');
    } else {
      s.setMissionRun(null);
      if (s.ui.openWindow === 'mission') s.setOpenWindow(null);
    }
    syncInputMode();
  };

  const applyEffects = (effects: readonly DialogueEffect[]) => {
    const s = store.getState();
    for (const effect of effects) {
      if ('flag' in effect) s.setFlag(effect.flag);
      else if ('unflag' in effect) s.clearFlag(effect.unflag);
      else if ('reputation' in effect) {
        for (const [service, delta] of Object.entries(effect.reputation)) {
          if (delta !== undefined)
            s.adjustReputation(service as keyof typeof effect.reputation, delta);
        }
      } else if ('giveItem' in effect) s.addItem(effect.giveItem);
      else if ('takeItem' in effect) s.removeItem(effect.takeItem);
      else if ('unlockZone' in effect) s.unlockZone(effect.unlockZone);
      else if ('unlockSheet' in effect) s.unlockSheet(effect.unlockSheet);
      else if ('startStep' in effect) pendingStep = effect.startStep;
      else pendingMission = effect.startMission;
    }
  };

  const viewOf = (cursor: DialogueCursor, step: DialogueStep): DialogueView | null => {
    if (!step.line?.say) return null;
    const npc = content.npcs.get(cursor.npcId);
    const name = store.getState().player.name || 'toi';
    return {
      npcId: cursor.npcId,
      nodeId: cursor.nodeId,
      speaker: npc?.name ?? cursor.npcId,
      ...(npc ? { role: npc.role } : {}),
      ...(step.line.mood ? { mood: step.line.mood } : {}),
      text: step.line.say.replaceAll('{prenom}', name),
      choices: (step.line.choices ?? []).map((c, i) => ({ id: String(i), text: c.text })),
    };
  };

  const beginMission = (target: Mission, stepId: string | null) => {
    mission = target;
    run = startMission(target, ctx(), stepId ?? undefined);
    store.getState().setCurrentChapter(target.chapter);
    publishRun();
  };

  const onDialogueEnd = (purpose: DialoguePurpose) => {
    if (purpose.kind === 'intro') {
      const target = content.missions.get(purpose.missionId);
      if (target) beginMission(target, pendingStep);
    } else if (purpose.kind === 'outro') {
      store.getState().markDebriefed(purpose.missionId);
    }
    pendingStep = null;
    if (pendingMission !== null && !run) {
      const target = content.missions.get(pendingMission);
      if (target) beginMission(target, null);
    }
    pendingMission = null;
  };

  const handleDialogueStep = (step: DialogueStep, purpose: DialoguePurpose) => {
    applyEffects(step.effects);
    if (step.cursor && step.line) {
      dialogue = { cursor: step.cursor, purpose };
      store.getState().setDialogue(viewOf(step.cursor, step));
      syncInputMode();
      return;
    }
    dialogue = null;
    store.getState().setDialogue(null);
    onDialogueEnd(purpose);
    syncInputMode();
  };

  const playNode = (ref: string, purpose: DialoguePurpose) => {
    const [npcId = '', nodeId = 'default'] = ref.split('#');
    const file = content.dialogues.get(npcId);
    if (!file) return;
    const dialogueWorld: DialogueWorld = world();
    handleDialogueStep(startDialogue(file, nodeId, dialogueWorld), purpose);
  };

  const completeMission = (target: Mission, result: Parameters<typeof computeRewards>[1]) => {
    const s = store.getState();
    const rewards = computeRewards(target, result, s.progression);
    s.setProgression({ xp: rewards.xp, level: rewards.level, skills: rewards.skills });
    for (const [service, delta] of Object.entries(rewards.reputation)) {
      if (delta !== undefined)
        s.adjustReputation(service as Parameters<typeof s.adjustReputation>[0], delta);
    }
    rewards.items.forEach((i) => s.addItem(i));
    rewards.sheets.forEach((sheet) => s.unlockSheet(sheet));
    s.recordMissionCompleted(target.id, { ...result, completedAt: clock().getTime() });
    const chapter = content.chapters.get(target.chapter);
    const done = store.getState().progress.completedMissions;
    if (
      chapter?.badge &&
      [...chapter.missions, ...(chapter.exam ? [chapter.exam] : [])].every((m) => done[m])
    ) {
      s.addBadge(chapter.badge.id);
      chapter.unlocks?.items.forEach((i) => s.addItem(i));
      chapter.unlocks?.zones.forEach((z) => s.unlockZone(z));
    }
    mission = null;
    run = null;
    publishRun();
    bus.emit({ type: 'audio/play', sound: 'mission-success' });
    bus.emit({ type: 'mission/completed', missionId: target.id, result });
    for (const level of rewards.levelsGained) bus.emit({ type: 'progression/level-up', level });
    options.onAutosave?.();
    playNode(target.dialogue.outro, { kind: 'outro', missionId: target.id });
  };

  const subscriptions: Unsubscribe[] = [
    bus.on('world/interact', ({ targetId }) => {
      if (dialogue || run || !content.npcs.has(targetId)) return;
      const selection = selectNode(targetId, content, world());
      const purpose: DialoguePurpose =
        selection.kind === 'intro' && selection.missionId
          ? { kind: 'intro', missionId: selection.missionId }
          : selection.kind === 'outro' && selection.missionId
            ? { kind: 'outro', missionId: selection.missionId }
            : { kind: 'other' };
      playNode(`${targetId}#${selection.nodeId}`, purpose);
    }),
    bus.on('dialogue/advance', () => {
      if (dialogue) handleDialogueStep(advanceDialogue(dialogue.cursor, world()), dialogue.purpose);
    }),
    bus.on('dialogue/choice', ({ choiceId }) => {
      if (dialogue)
        handleDialogueStep(
          chooseDialogue(dialogue.cursor, Number(choiceId), world()),
          dialogue.purpose,
        );
    }),
    bus.on('mission/start', ({ missionId }) => {
      const target = content.missions.get(missionId);
      if (!target || run) return;
      beginMission(target, null);
    }),
    bus.on('mission/step-input', ({ payload }) => {
      if (!mission || !run) return;
      const before = run;
      run = submitInput(mission, run, payload, ctx());
      if (run.step.completed && !before.step.completed)
        bus.emit({ type: 'audio/play', sound: 'objective-done' });
      else if (run.step.errors > before.step.errors)
        bus.emit({ type: 'audio/play', sound: 'mission-error' });
      publishRun();
    }),
    bus.on('mission/hint-requested', () => {
      if (!mission || !run) return;
      run = revealHint(mission, run);
      publishRun();
    }),
    bus.on('mission/continue', () => {
      if (!mission || !run || !run.step.completed) return;
      const exam = content.chapters.get(mission.chapter)?.exam === mission.id;
      const next = advance(mission, run, ctx(), { exam });
      if ('result' in next) completeMission(mission, next.result);
      else {
        run = next.run;
        publishRun();
      }
    }),
    bus.on('mission/abandon', () => {
      if (!mission || !run) return;
      const abandoned = mission;
      mission = null;
      run = null;
      publishRun();
      if (abandoned.dialogue.abandon) playNode(abandoned.dialogue.abandon, { kind: 'other' });
    }),
  ];

  return {
    currentRun: () => run,
    completeCommand(partial) {
      const step = mission?.steps[run?.stepIndex ?? -1];
      if (!run || step?.type !== 'terminal') return [];
      const machine = run.machines[step.machine];
      return machine ? bashSimulator.complete(machine, partial) : [];
    },
    dispose: () => subscriptions.forEach((unsubscribe) => unsubscribe()),
  };
}
