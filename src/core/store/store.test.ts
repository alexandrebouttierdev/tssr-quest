import { describe, expect, it } from 'vitest';
import { createGameStore, initialGameState } from './index';

describe('store du jeu', () => {
  it("démarre avec l'état initial d'une nouvelle partie", () => {
    const store = createGameStore();

    const state = store.getState();

    expect(state.player.name).toBe('');
    expect(state.progression).toEqual({
      xp: 0,
      level: 1,
      skills: {
        support: 0,
        reseau: 0,
        windows: 0,
        linux: 0,
        virtualisation: 0,
        securite: 0,
        scripting: 0,
        sauvegarde: 0,
      },
    });
    expect(state.ui.inputMode).toBe('world');
    expect(state.settings.difficulty).toBe('formation');
    expect(state.missionRun).toBeNull();
  });

  it("accepte un état de départ partiel (chargement d'une sauvegarde)", () => {
    const store = createGameStore({
      player: { ...initialGameState().player, name: 'Alex' },
    });

    expect(store.getState().player.name).toBe('Alex');
    expect(store.getState().progression.level).toBe(1);
  });

  it('isole les stores créés séparément', () => {
    const a = createGameStore();
    const b = createGameStore();

    a.getState().setPlayerIdentity({ name: 'A', pronouns: 'iel' });

    expect(b.getState().player.name).toBe('');
  });

  it('notifie les abonnés à chaque modification', () => {
    const store = createGameStore();
    const levels: number[] = [];
    store.subscribe((s) => levels.push(s.progression.level));

    store.getState().setProgression({ xp: 300, level: 2 });

    expect(levels).toEqual([2]);
  });
});

describe('tranche player', () => {
  it("enregistre l'identité du joueur", () => {
    const store = createGameStore();

    store.getState().setPlayerIdentity({
      name: 'Alex',
      pronouns: 'elle',
      appearance: { hair: 2, hairColor: 3, skin: 1, outfit: 4 },
    });

    const { player } = store.getState();
    expect(player.name).toBe('Alex');
    expect(player.pronouns).toBe('elle');
    expect(player.appearance).toEqual({ hair: 2, hairColor: 3, skin: 1, outfit: 4 });
  });

  it("met à jour la position sans changer l'orientation si elle n'est pas fournie", () => {
    const store = createGameStore();

    store.getState().setPlayerLocation({ zoneId: 'salle-serveurs', x: 40, y: 64 });

    const { player } = store.getState();
    expect(player.zoneId).toBe('salle-serveurs');
    expect(player.position).toEqual({ x: 40, y: 64 });
    expect(player.facing).toBe('down');
  });

  it("met à jour l'orientation quand elle est fournie", () => {
    const store = createGameStore();

    store.getState().setPlayerLocation({ zoneId: 'dsi', x: 1, y: 2, facing: 'left' });

    expect(store.getState().player.facing).toBe('left');
  });
});

describe('tranche progress', () => {
  it('enregistre une mission terminée', () => {
    const store = createGameStore();
    const record = {
      completedAt: 1000,
      errors: 1,
      hintsUsed: 0,
      durationMs: 5000,
      xpEarned: 230,
      perfectSteps: 1,
      totalSteps: 2,
    };

    store.getState().recordMissionCompleted('linux-admin.intranet-down', record);

    expect(store.getState().progress.completedMissions['linux-admin.intranet-down']).toEqual(
      record,
    );
  });

  it('pose et retire un drapeau narratif', () => {
    const store = createGameStore();

    store.getState().setFlag('hugo-confiance');
    expect(store.getState().progress.flags['hugo-confiance']).toBe(true);

    store.getState().clearFlag('hugo-confiance');
    expect(store.getState().progress.flags['hugo-confiance']).toBeUndefined();
  });

  it('ajoute badges, fiches, zones et débriefings sans doublon', () => {
    const store = createGameStore();
    const s = store.getState();

    s.addBadge('badge-linux-admin');
    s.addBadge('badge-linux-admin');
    s.unlockSheet('fiche-systemctl');
    s.unlockSheet('fiche-systemctl');
    s.unlockZone('salle-serveurs');
    s.unlockZone('salle-serveurs');
    s.markDebriefed('m1');
    s.markDebriefed('m1');

    const { progress } = store.getState();
    expect(progress.badges).toEqual(['badge-linux-admin']);
    expect(progress.unlockedSheets).toEqual(['fiche-systemctl']);
    expect(progress.unlockedZones).toEqual(['salle-serveurs']);
    expect(progress.debriefed).toEqual(['m1']);
  });

  it('change le chapitre courant', () => {
    const store = createGameStore();

    store.getState().setCurrentChapter('linux-admin');

    expect(store.getState().progress.currentChapter).toBe('linux-admin');
  });
});

describe('tranche progression', () => {
  it("remplace l'XP et le niveau", () => {
    const store = createGameStore();

    store.getState().setProgression({ xp: 850, level: 3 });

    expect(store.getState().progression.xp).toBe(850);
    expect(store.getState().progression.level).toBe(3);
  });

  it('remplace les points de compétence fournis seulement', () => {
    const store = createGameStore();

    store.getState().setProgression({ skills: { linux: 12, support: 3 } });

    const { skills } = store.getState().progression;
    expect(skills.linux).toBe(12);
    expect(skills.support).toBe(3);
    expect(skills.reseau).toBe(0);
  });
});

describe('tranche inventory', () => {
  it('ajoute et retire des objets', () => {
    const store = createGameStore();

    store.getState().addItem('cable-console');
    store.getState().addItem('cable-console');
    store.getState().addItem('badge-serveurs');
    store.getState().removeItem('cable-console');

    expect(store.getState().inventory.items).toEqual(['badge-serveurs']);
  });
});

describe('tranche reputation', () => {
  it('ajuste une jauge en la bornant entre 0 et 100', () => {
    const store = createGameStore();

    store.getState().adjustReputation('commercial', 6);
    store.getState().adjustReputation('accueil', -80);
    store.getState().adjustReputation('direction', 200);

    const { reputation } = store.getState();
    expect(reputation.commercial).toBe(56);
    expect(reputation.accueil).toBe(0);
    expect(reputation.direction).toBe(100);
  });
});

describe('tranche ui', () => {
  it("bascule le mode d'entrée", () => {
    const store = createGameStore();

    store.getState().setInputMode('ui');

    expect(store.getState().ui.inputMode).toBe('ui');
  });

  it('affiche puis ferme un dialogue', () => {
    const store = createGameStore();
    const view = {
      npcId: 'hugo',
      nodeId: 'default',
      speaker: 'Hugo',
      text: 'Toujours les journaux.',
      choices: [],
    };

    store.getState().setDialogue(view);
    expect(store.getState().ui.dialogue).toEqual(view);

    store.getState().setDialogue(null);
    expect(store.getState().ui.dialogue).toBeNull();
  });

  it('empile les notifications avec un identifiant unique puis les retire', () => {
    const store = createGameStore();

    const first = store.getState().pushNotification({ message: 'A', kind: 'info' });
    const second = store.getState().pushNotification({ message: 'B', kind: 'success' });
    store.getState().dismissNotification(first);

    expect(first).not.toBe(second);
    expect(store.getState().ui.notifications).toEqual([
      { id: second, message: 'B', kind: 'success' },
    ]);
  });

  it("affiche et efface l'invite d'interaction", () => {
    const store = createGameStore();

    store.getState().setInteractionPrompt({ targetId: 'hugo', label: 'Parler à Hugo' });
    expect(store.getState().ui.interactionPrompt?.label).toBe('Parler à Hugo');

    store.getState().setInteractionPrompt(null);
    expect(store.getState().ui.interactionPrompt).toBeNull();
  });

  it('ouvre une fenêtre', () => {
    const store = createGameStore();

    store.getState().setOpenWindow('mission');

    expect(store.getState().ui.openWindow).toBe('mission');
  });
});

describe('tranche settings', () => {
  it('fusionne les réglages modifiés', () => {
    const store = createGameStore();

    store.getState().updateSettings({ textSpeed: 60, volumes: { music: 0.2 } });

    const { settings } = store.getState();
    expect(settings.textSpeed).toBe(60);
    expect(settings.volumes.music).toBe(0.2);
    expect(settings.volumes.sfx).toBe(0.8);
    expect(settings.difficulty).toBe('formation');
  });
});

describe('tranche missionRun', () => {
  it('publie puis efface la vue de la mission en cours', () => {
    const store = createGameStore();
    const view = {
      missionId: 'm',
      title: 'Titre',
      phase: 'step' as const,
      stepIndex: 0,
      stepCount: 1,
      step: { type: 'input' as const, id: 's', question: 'Q ?' },
      objectives: [],
      hints: [],
      hintCount: 0,
      feedback: null,
      stepCompleted: false,
    };

    store.getState().setMissionRun(view);
    expect(store.getState().missionRun?.title).toBe('Titre');

    store.getState().setMissionRun(null);
    expect(store.getState().missionRun).toBeNull();
  });
});
