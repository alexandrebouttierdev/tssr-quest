import {
  contentBundleSchema,
  type Chapter,
  type ContentBundle,
  type DialogueFile,
  type Mission,
  type Npc,
  type Sheet,
  type Zone,
  type Item,
} from './schemas';

/** Contenu chargé avec des index d'accès rapide. */
export interface ContentIndex {
  readonly bundle: ContentBundle;
  readonly missions: ReadonlyMap<string, Mission>;
  readonly chapters: ReadonlyMap<string, Chapter>;
  readonly dialogues: ReadonlyMap<string, DialogueFile>;
  readonly npcs: ReadonlyMap<string, Npc>;
  readonly zones: ReadonlyMap<string, Zone>;
  readonly items: ReadonlyMap<string, Item>;
  readonly sheets: ReadonlyMap<string, Sheet>;
}

/**
 * Indexe un paquet de contenu déjà validé.
 *
 * @param bundle - Contenu compilé.
 * @returns Les index par identifiant.
 */
export function indexContent(bundle: ContentBundle): ContentIndex {
  return {
    bundle,
    missions: new Map(bundle.missions.map((m) => [m.id, m])),
    chapters: new Map(
      [...bundle.chapters].sort((a, b) => a.number - b.number).map((c) => [c.id, c]),
    ),
    dialogues: new Map(bundle.dialogues.map((d) => [d.npc, d])),
    npcs: new Map(bundle.npcs.map((n) => [n.id, n])),
    zones: new Map(bundle.zones.map((z) => [z.id, z])),
    items: new Map(bundle.items.map((i) => [i.id, i])),
    sheets: new Map(bundle.sheets.map((s) => [s.id, s])),
  };
}

/**
 * Valide le JSON produit par `npm run content:build` (frontière de confiance) et l'indexe.
 *
 * @param raw - JSON importé depuis `src/content/generated/content.json`.
 * @returns Le contenu indexé.
 * @throws {Error} Si le JSON ne respecte pas le schéma (contenu à recompiler).
 */
export function loadContent(raw: unknown): ContentIndex {
  const result = contentBundleSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Contenu invalide, relancer npm run content:build : ${result.error.issues[0]?.message ?? ''}`,
    );
  }
  return indexContent(result.data);
}
