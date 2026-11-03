import { describe, expect, it } from 'vitest';
import { createGameStore } from '../store';
import { CURRENT_SAVE_VERSION, migrateSave, SaveMigrationError } from './migrations';
import { createMemoryStorage } from './memory-storage';
import { createSaveManager, SaveImportError, SAVE_SLOTS } from './save-manager';
import { saveFileSchema } from './save.schema';

/** Prépare un store avec une partie un peu avancée. */
function advancedStore() {
  const store = createGameStore();
  const s = store.getState();
  s.setPlayerIdentity({ name: 'Alex', pronouns: 'elle' });
  s.setPlayerLocation({ zoneId: 'salle-serveurs', x: 96, y: 80, facing: 'left' });
  s.setProgression({ xp: 420, level: 2, skills: { linux: 12 } });
  s.setFlag('hugo-confiance');
  s.addItem('badge-serveurs');
  s.adjustReputation('commercial', 6);
  s.updateSettings({ textSpeed: 60 });
  s.setInputMode('ui');
  return store;
}

describe('gestionnaire de sauvegarde', () => {
  it('propose les emplacements auto et slot-1 à slot-3', () => {
    expect(SAVE_SLOTS).toEqual(['auto', 'slot-1', 'slot-2', 'slot-3']);
  });

  it("sauvegarde puis recharge une partie à l'identique", async () => {
    const manager = createSaveManager(createMemoryStorage(), { now: () => 1234 });
    const store = advancedStore();

    await manager.save('slot-1', store.getState());
    const loaded = await manager.load('slot-1');

    expect(loaded?.savedAt).toBe(1234);
    expect(loaded?.version).toBe(CURRENT_SAVE_VERSION);
    const restored = createGameStore(manager.toGameState(loaded!));
    expect(restored.getState().player.name).toBe('Alex');
    expect(restored.getState().player.position).toEqual({ x: 96, y: 80 });
    expect(restored.getState().progression.skills.linux).toBe(12);
    expect(restored.getState().progress.flags['hugo-confiance']).toBe(true);
    expect(restored.getState().inventory.items).toEqual(['badge-serveurs']);
    expect(restored.getState().reputation.commercial).toBe(56);
    expect(restored.getState().settings.textSpeed).toBe(60);
  });

  it("ne sauvegarde pas l'état d'interface ni la mission en cours", async () => {
    const manager = createSaveManager(createMemoryStorage());

    await manager.save('auto', advancedStore().getState());
    const loaded = await manager.load('auto');

    expect(loaded?.data).not.toHaveProperty('ui');
    expect(loaded?.data).not.toHaveProperty('missionRun');
    const restored = createGameStore(manager.toGameState(loaded!));
    expect(restored.getState().ui.inputMode).toBe('world');
  });

  it('renvoie null pour un emplacement vide', async () => {
    const manager = createSaveManager(createMemoryStorage());

    expect(await manager.load('slot-3')).toBeNull();
  });

  it('liste les emplacements avec un résumé', async () => {
    const manager = createSaveManager(createMemoryStorage(), { now: () => 99 });
    await manager.save('slot-2', advancedStore().getState());

    const list = await manager.list();

    expect(list).toEqual([
      { slot: 'auto', summary: null },
      { slot: 'slot-1', summary: null },
      {
        slot: 'slot-2',
        summary: { savedAt: 99, playerName: 'Alex', level: 2, zoneId: 'salle-serveurs' },
      },
      { slot: 'slot-3', summary: null },
    ]);
  });

  it('supprime un emplacement', async () => {
    const manager = createSaveManager(createMemoryStorage());
    await manager.save('slot-1', advancedStore().getState());

    await manager.remove('slot-1');

    expect(await manager.load('slot-1')).toBeNull();
  });

  it('ignore une sauvegarde corrompue au chargement', async () => {
    const storage = createMemoryStorage();
    await storage.set('tssr-quest/save/slot-1', '{pas du json');
    const manager = createSaveManager(storage);

    expect(await manager.load('slot-1')).toBeNull();
    expect(await manager.list()).toContainEqual({ slot: 'slot-1', summary: null });
  });

  it('exporte une partie en texte JSON et la réimporte', async () => {
    const manager = createSaveManager(createMemoryStorage(), { now: () => 5 });
    await manager.save('slot-1', advancedStore().getState());
    const file = await manager.load('slot-1');

    const text = manager.exportToText(file!);
    const imported = manager.importFromText(text);

    expect(JSON.parse(text)).toMatchObject({ version: CURRENT_SAVE_VERSION, savedAt: 5 });
    expect(imported).toEqual(file);
  });

  it("refuse d'importer un texte qui n'est pas du JSON", () => {
    const manager = createSaveManager(createMemoryStorage());

    expect(() => manager.importFromText('bonjour')).toThrow(SaveImportError);
  });

  it("refuse d'importer un JSON qui ne respecte pas le schéma", () => {
    const manager = createSaveManager(createMemoryStorage());

    expect(() => manager.importFromText(JSON.stringify({ version: 1, data: {} }))).toThrow(
      SaveImportError,
    );
  });
});

describe('schéma de sauvegarde', () => {
  it('rejette une XP négative', async () => {
    const manager = createSaveManager(createMemoryStorage());
    await manager.save('auto', createGameStore().getState());
    const file = (await manager.load('auto'))!;

    const result = saveFileSchema.safeParse({
      ...file,
      data: { ...file.data, progression: { ...file.data.progression, xp: -1 } },
    });

    expect(result.success).toBe(false);
  });
});

describe('migrations de sauvegarde', () => {
  it("applique les migrations dans l'ordre jusqu'à la version cible", () => {
    const migrations = {
      1: (raw: Record<string, unknown>) => ({ ...raw, version: 2, a: 'ajouté en v2' }),
      2: (raw: Record<string, unknown>) => ({
        ...raw,
        version: 3,
        b: `${String(raw['a'])} puis v3`,
      }),
    };

    const migrated = migrateSave({ version: 1 }, { migrations, targetVersion: 3 });

    expect(migrated).toEqual({ version: 3, a: 'ajouté en v2', b: 'ajouté en v2 puis v3' });
  });

  it('laisse intacte une sauvegarde déjà à jour', () => {
    const raw = { version: CURRENT_SAVE_VERSION, x: 1 };

    expect(migrateSave(raw)).toEqual(raw);
  });

  it('refuse une sauvegarde sans numéro de version', () => {
    expect(() => migrateSave({ data: {} })).toThrow(SaveMigrationError);
    expect(() => migrateSave('texte')).toThrow(SaveMigrationError);
  });

  it("refuse une sauvegarde d'une version future", () => {
    expect(() => migrateSave({ version: CURRENT_SAVE_VERSION + 1 })).toThrow(
      /version plus récente/,
    );
  });

  it('refuse une sauvegarde dont une migration manque', () => {
    expect(() => migrateSave({ version: 1 }, { migrations: {}, targetVersion: 2 })).toThrow(
      /migration/,
    );
  });
});

describe('stockage en mémoire', () => {
  it('lit, écrit, liste et supprime des clés', async () => {
    const storage = createMemoryStorage();

    await storage.set('a', '1');
    await storage.set('b', '2');
    await storage.del('a');

    expect(await storage.get('a')).toBeUndefined();
    expect(await storage.get('b')).toBe('2');
    expect(await storage.keys()).toEqual(['b']);
  });
});
