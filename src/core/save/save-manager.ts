import type { GameState } from '../store/types';
import { CURRENT_SAVE_VERSION, migrateSave, SaveMigrationError } from './migrations';
import { saveFileSchema, type SaveFile } from './save.schema';

/** Emplacements de sauvegarde : automatique et trois manuels. */
export const SAVE_SLOTS = ['auto', 'slot-1', 'slot-2', 'slot-3'] as const;

/** Identifiant d'un emplacement de sauvegarde. */
export type SaveSlot = (typeof SAVE_SLOTS)[number];

/**
 * Stockage clé/valeur asynchrone. L'implémentation navigateur (IndexedDB) est dans
 * `src/platform/storage.ts` ; `core` ne connaît que cette interface.
 */
export interface SaveStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Résumé d'une sauvegarde, affiché dans le menu de chargement. */
export interface SaveSummary {
  readonly savedAt: number;
  readonly playerName: string;
  readonly level: number;
  readonly zoneId: string;
}

/** Erreur levée quand un fichier importé n'est pas une sauvegarde valide. */
export class SaveImportError extends Error {
  override readonly name = 'SaveImportError';
}

/** Gestionnaire des sauvegardes d'une partie. */
export interface SaveManager {
  /** Sauvegarde les tranches persistantes de l'état dans un emplacement. */
  save(slot: SaveSlot, state: GameState): Promise<SaveFile>;
  /** Charge un emplacement ; `null` s'il est vide ou illisible. */
  load(slot: SaveSlot): Promise<SaveFile | null>;
  /** Liste les emplacements avec leur résumé. */
  list(): Promise<{ slot: SaveSlot; summary: SaveSummary | null }[]>;
  /** Vide un emplacement. */
  remove(slot: SaveSlot): Promise<void>;
  /** Convertit une sauvegarde en texte JSON lisible (fichier `.tssrsave`). */
  exportToText(file: SaveFile): string;
  /**
   * Lit un fichier exporté, le migre et le valide.
   *
   * @throws {SaveImportError} Si le texte n'est pas une sauvegarde valide.
   */
  importFromText(text: string): SaveFile;
  /** Transforme une sauvegarde en état de départ pour `createGameStore`. */
  toGameState(file: SaveFile): Partial<GameState>;
}

/** Préfixe des clés dans le stockage, pour cohabiter avec d'autres données. */
const KEY_PREFIX = 'tssr-quest/save/';

/**
 * Valide un objet brut (déjà analysé) : migration puis schéma Zod.
 *
 * @throws {SaveMigrationError | Error} Si la sauvegarde est invalide.
 */
function parseRaw(raw: unknown): SaveFile {
  const migrated = migrateSave(raw);
  const result = saveFileSchema.safeParse(migrated);
  if (!result.success) {
    throw new Error(`Sauvegarde invalide : ${result.error.issues[0]?.message ?? 'inconnue'}`);
  }
  return result.data;
}

/**
 * Crée le gestionnaire de sauvegarde.
 *
 * @param storage - Stockage clé/valeur (IndexedDB en jeu, mémoire en test).
 * @param options - `now` : horloge injectable pour des tests déterministes.
 * @returns Le gestionnaire.
 * @example
 * const saves = createSaveManager(createIndexedDbStorage());
 * await saves.save('auto', gameStore.getState());
 */
export function createSaveManager(
  storage: SaveStorage,
  options: { now?: () => number } = {},
): SaveManager {
  const now = options.now ?? (() => Date.now());

  const load = async (slot: SaveSlot): Promise<SaveFile | null> => {
    const text = await storage.get(KEY_PREFIX + slot);
    if (text === undefined) return null;
    try {
      return parseRaw(JSON.parse(text));
    } catch {
      // Une sauvegarde illisible ne doit jamais bloquer le jeu : l'emplacement est vu vide.
      return null;
    }
  };

  return {
    async save(slot, state) {
      const file: SaveFile = saveFileSchema.parse({
        version: CURRENT_SAVE_VERSION,
        savedAt: now(),
        data: {
          player: state.player,
          progress: state.progress,
          progression: state.progression,
          inventory: state.inventory,
          reputation: state.reputation,
          settings: state.settings,
        },
      });
      await storage.set(KEY_PREFIX + slot, JSON.stringify(file));
      return file;
    },
    load,
    async list() {
      return Promise.all(
        SAVE_SLOTS.map(async (slot) => {
          const file = await load(slot);
          return {
            slot,
            summary: file && {
              savedAt: file.savedAt,
              playerName: file.data.player.name,
              level: file.data.progression.level,
              zoneId: file.data.player.zoneId,
            },
          };
        }),
      );
    },
    remove: (slot) => storage.del(KEY_PREFIX + slot),
    exportToText: (file) => JSON.stringify(file, null, 2),
    importFromText(text) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new SaveImportError(
          "Le fichier n'est pas une sauvegarde TSSR Quest (JSON invalide).",
        );
      }
      try {
        return parseRaw(raw);
      } catch (error) {
        const reason =
          error instanceof SaveMigrationError || error instanceof Error ? error.message : '';
        throw new SaveImportError(`Sauvegarde refusée. ${reason}`);
      }
    },
    toGameState(file) {
      const { player, progress, progression, inventory, reputation, settings } = file.data;
      return {
        player,
        progress: {
          ...progress,
          completedMissions: Object.fromEntries(
            Object.entries(progress.completedMissions).map(([id, { grade, ...rest }]) => [
              id,
              grade === undefined ? rest : { ...rest, grade },
            ]),
          ),
        },
        progression,
        inventory,
        reputation,
        settings,
      };
    },
  };
}
