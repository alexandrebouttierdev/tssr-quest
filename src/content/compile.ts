import { parse as parseYaml, YAMLParseError } from 'yaml';
import type { z } from 'zod';
import {
  chapterSchema,
  dialogueFileSchema,
  itemSchema,
  missionSchema,
  SIDE_QUEST_CHAPTER,
  npcSchema,
  sheetSchema,
  zoneSchema,
  type ContentBundle,
} from './schemas';

/** Erreur de contenu, rattachée à son fichier. */
export interface ContentError {
  /** Chemin relatif au dossier `content/`. */
  readonly file: string;
  readonly message: string;
}

/** Résultat d'une compilation. */
export interface CompileResult {
  readonly bundle: ContentBundle;
  readonly errors: readonly ContentError[];
}

/** Formate les problèmes Zod en messages lisibles. */
function zodMessages(file: string, error: z.ZodError): ContentError[] {
  return error.issues.map((issue) => ({
    file,
    message: `${issue.path.length ? `${issue.path.join('.')} : ` : ''}${issue.message}`,
  }));
}

/** Lit un fichier YAML ; renvoie `undefined` et une erreur s'il est mal formé. */
function readYaml(file: string, text: string, errors: ContentError[]): unknown {
  try {
    return parseYaml(text);
  } catch (error) {
    const message =
      error instanceof YAMLParseError
        ? (error.message.split('\n')[0] ?? error.message)
        : String(error);
    errors.push({ file, message: `YAML invalide : ${message}` });
    return undefined;
  }
}

/** Valide une valeur avec un schéma et l'ajoute à la liste si elle est correcte. */
function collect<T>(
  file: string,
  value: unknown,
  schema: z.ZodType<T>,
  into: T[],
  errors: ContentError[],
): void {
  if (value === undefined) return;
  const result = schema.safeParse(value);
  if (result.success) into.push(result.data);
  else errors.push(...zodMessages(file, result.error));
}

/**
 * Lit une fiche Markdown : la première ligne `# Titre` donne le titre.
 *
 * @param id - Identifiant (nom du fichier sans `.md`).
 * @param text - Contenu du fichier.
 * @returns Les champs de la fiche (à valider).
 */
export function parseSheet(id: string, text: string): { id: string; title: string; body: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const titleLine = lines.findIndex((l) => l.startsWith('# '));
  const title = titleLine >= 0 ? (lines[titleLine] ?? '').slice(2).trim() : '';
  const body = lines
    .slice(titleLine + 1)
    .join('\n')
    .trim();
  return { id, title, body };
}

/**
 * Compile tous les fichiers de contenu en un seul paquet validé par les schémas Zod.
 * Fonction pure : elle reçoit le texte des fichiers, sans accès disque.
 *
 * @param files - Texte de chaque fichier, indexé par chemin relatif à `content/`.
 * @returns Le paquet (avec les seuls éléments valides) et la liste des erreurs.
 */
export function compileContent(files: Readonly<Record<string, string>>): CompileResult {
  const errors: ContentError[] = [];
  const bundle = {
    chapters: [] as z.infer<typeof chapterSchema>[],
    missions: [] as z.infer<typeof missionSchema>[],
    dialogues: [] as z.infer<typeof dialogueFileSchema>[],
    npcs: [] as z.infer<typeof npcSchema>[],
    zones: [] as z.infer<typeof zoneSchema>[],
    items: [] as z.infer<typeof itemSchema>[],
    sheets: [] as z.infer<typeof sheetSchema>[],
  };
  for (const [file, text] of Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const name = file.split('/').pop() ?? file;
    if (/^chapters\/[^/]+\/chapter\.yaml$/.test(file)) {
      collect(file, readYaml(file, text, errors), chapterSchema, bundle.chapters, errors);
    } else if (/^chapters\/[^/]+\/[^/]+\.mission\.yaml$/.test(file)) {
      const before = bundle.missions.length;
      collect(file, readYaml(file, text, errors), missionSchema, bundle.missions, errors);
      if (bundle.missions[before]?.chapter === SIDE_QUEST_CHAPTER)
        errors.push({ file, message: 'une quête secondaire se range dans side-quests/' });
    } else if (/^side-quests\/[^/]+\.mission\.yaml$/.test(file)) {
      const before = bundle.missions.length;
      collect(file, readYaml(file, text, errors), missionSchema, bundle.missions, errors);
      const added = bundle.missions[before];
      if (added && added.chapter !== SIDE_QUEST_CHAPTER)
        errors.push({
          file,
          message: `une quête secondaire a pour chapitre « ${SIDE_QUEST_CHAPTER} »`,
        });
    } else if (/^dialogues\/[^/]+\.dialogue\.yaml$/.test(file)) {
      const before = bundle.dialogues.length;
      collect(file, readYaml(file, text, errors), dialogueFileSchema, bundle.dialogues, errors);
      const added = bundle.dialogues[before];
      if (added && `${added.npc}.dialogue.yaml` !== name) {
        errors.push({ file, message: `le fichier doit s'appeler ${added.npc}.dialogue.yaml` });
      }
    } else if (/^npcs\/[^/]+\.npc\.yaml$/.test(file)) {
      collect(file, readYaml(file, text, errors), npcSchema, bundle.npcs, errors);
    } else if (file === 'zones/zones.yaml' || file === 'items/items.yaml') {
      const value = readYaml(file, text, errors);
      if (value === undefined) continue;
      if (!Array.isArray(value)) {
        errors.push({ file, message: 'une liste est attendue' });
        continue;
      }
      for (const [index, entry] of value.entries()) {
        if (file === 'zones/zones.yaml')
          collect(`${file}#${index}`, entry, zoneSchema, bundle.zones, errors);
        else collect(`${file}#${index}`, entry, itemSchema, bundle.items, errors);
      }
    } else if (/^sheets\/[^/]+\.md$/.test(file)) {
      collect(
        file,
        parseSheet(name.replace(/\.md$/, ''), text),
        sheetSchema,
        bundle.sheets,
        errors,
      );
    } else if (/^maps\//.test(file) || /(^|\/)README\.md$/.test(file) || name === '.gitkeep') {
      continue;
    } else {
      errors.push({
        file,
        message: 'fichier inattendu dans content/ (nom ou emplacement à revoir)',
      });
    }
  }
  return { bundle, errors };
}
