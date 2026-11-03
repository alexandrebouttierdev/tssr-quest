/** Version courante du format de sauvegarde (voir `save.schema.ts`). */
export const CURRENT_SAVE_VERSION = 1;

/**
 * Migration d'une sauvegarde de la version `n` vers `n + 1`. Elle reçoit l'objet brut
 * (pas encore validé) et doit renvoyer un objet dont `version` vaut `n + 1`.
 */
export type SaveMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations connues, indexées par la version de départ. Ajouter un changement de format :
 * incrémenter `CURRENT_SAVE_VERSION`, écrire la migration ici et son test.
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {};

/** Erreur levée quand une sauvegarde ne peut pas être mise à niveau. */
export class SaveMigrationError extends Error {
  override readonly name = 'SaveMigrationError';
}

/** Vérifie qu'une valeur est un objet simple (et non un tableau ou `null`). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Met une sauvegarde brute au format courant en appliquant les migrations une à une.
 *
 * @param raw - Objet lu dans le stockage ou dans un fichier importé.
 * @param options - Migrations et version cible (remplaçables pour les tests).
 * @returns L'objet migré, à valider ensuite avec `saveFileSchema`.
 * @throws {SaveMigrationError} Si la version est absente, future, ou qu'une migration manque.
 */
export function migrateSave(
  raw: unknown,
  options: {
    migrations?: Readonly<Record<number, SaveMigration>>;
    targetVersion?: number;
  } = {},
): Record<string, unknown> {
  const { migrations = SAVE_MIGRATIONS, targetVersion = CURRENT_SAVE_VERSION } = options;
  if (!isRecord(raw) || typeof raw['version'] !== 'number') {
    throw new SaveMigrationError('Sauvegarde invalide : numéro de version absent.');
  }
  let current = raw;
  let version = raw['version'];
  if (version > targetVersion) {
    throw new SaveMigrationError(
      `Sauvegarde d'une version plus récente (${version}) que celle du jeu (${targetVersion}).`,
    );
  }
  while (version < targetVersion) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new SaveMigrationError(`Aucune migration depuis la version ${version}.`);
    }
    current = migrate(current);
    version += 1;
  }
  return current;
}
