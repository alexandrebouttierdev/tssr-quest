/**
 * Lecture du dossier `content/` sur le disque, et compilation complète
 * (schémas + cohérence) partagée par les scripts et le plugin Vite.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileContent, type ContentError } from '../src/content/compile';
import type { ContentBundle } from '../src/content/schemas';
import { validateBundle } from '../src/content/validate';

/** Racine du projet. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Dossier du contenu. */
export const CONTENT_DIR = join(ROOT, 'content');

/** Fichier JSON produit pour le jeu. */
export const GENERATED_FILE = join(ROOT, 'src', 'content', 'generated', 'content.json');

/**
 * Lit récursivement tous les fichiers texte d'un dossier.
 *
 * @param dir - Dossier racine.
 * @returns Le texte de chaque fichier, indexé par chemin relatif (séparateurs `/`).
 */
export function readContentFiles(dir: string = CONTENT_DIR): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

/**
 * Compile et valide tout le contenu du disque.
 *
 * @returns Le paquet et toutes les erreurs (schémas puis cohérence).
 */
export function buildContent(): { bundle: ContentBundle; errors: ContentError[] } {
  const { bundle, errors } = compileContent(readContentFiles());
  return { bundle, errors: [...errors, ...(errors.length ? [] : validateBundle(bundle))] };
}

/**
 * Écrit le JSON compilé dans `src/content/generated/` et copie les cartes Tiled dans `public/maps/`.
 *
 * @param bundle - Contenu compilé.
 */
export function writeGenerated(bundle: ContentBundle): void {
  mkdirSync(join(ROOT, 'src', 'content', 'generated'), { recursive: true });
  writeFileSync(GENERATED_FILE, `${JSON.stringify(bundle)}\n`);
  const mapsDir = join(CONTENT_DIR, 'maps');
  const publicMaps = join(ROOT, 'public', 'maps');
  mkdirSync(publicMaps, { recursive: true });
  for (const entry of readdirSync(mapsDir)) {
    if (entry.endsWith('.tmj'))
      writeFileSync(join(publicMaps, entry), readFileSync(join(mapsDir, entry)));
  }
}

/**
 * Affiche les erreurs de contenu de façon lisible.
 *
 * @param errors - Erreurs à afficher.
 */
export function printErrors(errors: readonly ContentError[]): void {
  for (const error of errors) console.error(`✗ ${error.file} — ${error.message}`);
}
