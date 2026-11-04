import { z } from 'zod';
import { dialogueRefSchema, playerTextSchema, slugSchema } from './common';
import { objectiveSchema } from './conditions';

/** Champs communs à toutes les étapes (docs/04, « Types d'étapes »). */
const stepBase = {
  id: slugSchema,
  /** Trois niveaux d'indice : piste, commande, solution. */
  hints: z.array(playerTextSchema).max(3).optional(),
  /** Fiche « À retenir » liée. */
  sheet: slugSchema.optional(),
  /** Limite de temps en secondes (rare). */
  timeLimit: z.number().int().positive().optional(),
  /** XP de l'étape (20 par défaut). */
  xp: z.number().int().nonnegative().optional(),
};

/** Étape « dialogue » : réussie à la fin du nœud. */
export const dialogueStepSchema = z.strictObject({
  ...stepBase,
  type: z.literal('dialogue'),
  node: dialogueRefSchema,
});

/** Étape « choix » (QCM à une ou plusieurs bonnes réponses). */
export const choiceStepSchema = z
  .strictObject({
    ...stepBase,
    type: z.literal('choice'),
    question: playerTextSchema,
    options: z
      .array(
        z.strictObject({
          text: playerTextSchema,
          correct: z.boolean().optional(),
          feedback: playerTextSchema.optional(),
        }),
      )
      .min(2)
      .max(6),
    multiple: z.boolean().optional(),
    explain: playerTextSchema.optional(),
  })
  .refine((s) => s.options.some((o) => o.correct), 'au moins une option doit être correcte')
  .refine(
    (s) => s.multiple || s.options.filter((o) => o.correct).length === 1,
    'une seule bonne option sans « multiple: true »',
  );

/** Normalisations applicables à une réponse saisie. */
export const normalizeSchema = z.enum(['lower', 'trim', 'nospace', 'ip']);

/** Étape « saisie » : une réponse libre comparée à des réponses ou à un motif. */
export const inputStepSchema = z
  .strictObject({
    ...stepBase,
    type: z.literal('input'),
    question: playerTextSchema,
    answers: z.array(z.string().min(1)).min(1).optional(),
    pattern: z.string().min(1).optional(),
    /** Exemple de bonne réponse, obligatoire avec `pattern` (rejoué par les tests). */
    example: z.string().min(1).optional(),
    normalize: z.array(normalizeSchema).optional(),
    explain: playerTextSchema.optional(),
  })
  .refine(
    (s) => s.answers !== undefined || s.pattern !== undefined,
    'il faut « answers » ou « pattern »',
  )
  .refine(
    (s) => s.pattern === undefined || s.example !== undefined,
    'un « example » est requis avec « pattern »',
  );

/** Étape « ordre » : remettre des éléments dans le bon ordre (donné par le YAML). */
export const orderingStepSchema = z.strictObject({
  ...stepBase,
  type: z.literal('ordering'),
  question: playerTextSchema,
  items: z.array(playerTextSchema).min(2).max(8),
  explain: playerTextSchema.optional(),
});

/** Étape « terminal » : objectifs vérifiés sur l'état de la machine. */
export const terminalStepSchema = z.strictObject({
  ...stepBase,
  type: z.literal('terminal'),
  sim: z.literal('bash'),
  machine: slugSchema,
  goal: playerTextSchema,
  objectives: z.array(objectiveSchema).min(1),
  /**
   * Solution de référence, rejouée par `npm run test:content`. Une ligne vide est un
   * simple appui sur Entrée (valeur par défaut d'une question de fdisk, par exemple).
   */
  solution: z
    .array(z.string())
    .min(1)
    .refine((lines) => lines.some((l) => l.trim() !== ''), 'solution vide'),
});

/** Étape « éditeur » : modifier un fichier dans vim. */
export const editorStepSchema = z.strictObject({
  ...stepBase,
  type: z.literal('editor'),
  machine: slugSchema,
  file: z.string().startsWith('/'),
  /** Éditer avec les droits de root (`sudo vim`), pour les fichiers de /etc. */
  sudo: z.boolean().optional(),
  goal: playerTextSchema,
  objectives: z.array(objectiveSchema).min(1),
  /** Touches de la solution (texte tel quel, `<Esc>`, `<CR>`…), rejouées par les tests. */
  solution: z.array(z.string().min(1)).min(1),
});

/** Étape de mission (union discriminée par `type`). */
export const stepSchema = z.union([
  dialogueStepSchema,
  choiceStepSchema,
  inputStepSchema,
  orderingStepSchema,
  terminalStepSchema,
  editorStepSchema,
]);

/** Étape de mission. */
export type Step = z.infer<typeof stepSchema>;
/** Étape à choix. */
export type ChoiceStep = z.infer<typeof choiceStepSchema>;
/** Étape de saisie. */
export type InputStep = z.infer<typeof inputStepSchema>;
/** Étape d'ordre. */
export type OrderingStep = z.infer<typeof orderingStepSchema>;
/** Étape de terminal. */
export type TerminalStep = z.infer<typeof terminalStepSchema>;
/** Étape d'éditeur. */
export type EditorStep = z.infer<typeof editorStepSchema>;
/** Étape de dialogue. */
export type DialogueStep = z.infer<typeof dialogueStepSchema>;
