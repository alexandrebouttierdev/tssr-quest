import { z } from 'zod';
import { missionIdSchema, playerTextSchema, serviceIdSchema, slugSchema } from './common';

/** Effet d'une réplique ou d'un choix (docs/04, « Effets disponibles »). */
export const effectSchema = z.union([
  z.strictObject({ flag: z.string().min(1) }),
  z.strictObject({ unflag: z.string().min(1) }),
  z.strictObject({
    reputation: z.partialRecord(serviceIdSchema, z.number().int().min(-10).max(10)),
  }),
  z.strictObject({ giveItem: slugSchema }),
  z.strictObject({ takeItem: slugSchema }),
  z.strictObject({ startMission: missionIdSchema }),
  z.strictObject({ startStep: slugSchema }),
  z.strictObject({ unlockZone: slugSchema }),
  z.strictObject({ unlockSheet: slugSchema }),
]);

/** Effet de dialogue. */
export type DialogueEffect = z.infer<typeof effectSchema>;

/** Condition d'affichage d'une réplique (`if`). */
export const dialogueConditionSchema = z.union([
  z.strictObject({ flag: z.string().min(1) }),
  z.strictObject({ notFlag: z.string().min(1) }),
  z.strictObject({ missionDone: missionIdSchema }),
  z.strictObject({ hasItem: slugSchema }),
  z.strictObject({ level: z.number().int().min(1).max(10) }),
]);

/** Condition de dialogue. */
export type DialogueCondition = z.infer<typeof dialogueConditionSchema>;

/** Expressions possibles d'un portrait. */
export const moodSchema = z.enum(['neutre', 'content', 'inquiet']);

/** Réplique d'un dialogue (récursive : un choix contient d'autres répliques). */
export interface DialogueLine {
  readonly say?: string | undefined;
  readonly mood?: 'neutre' | 'content' | 'inquiet' | undefined;
  readonly if?: DialogueCondition | undefined;
  readonly effects?: readonly DialogueEffect[] | undefined;
  readonly choices?: readonly DialogueChoice[] | undefined;
}

/** Choix de réponse du joueur. */
export interface DialogueChoice {
  readonly text: string;
  readonly effects?: readonly DialogueEffect[] | undefined;
  readonly then?: readonly DialogueLine[] | undefined;
}

/** Schéma d'une réplique. */
export const dialogueLineSchema: z.ZodType<DialogueLine> = z.lazy(() =>
  z
    .strictObject({
      say: playerTextSchema.optional(),
      mood: moodSchema.optional(),
      if: dialogueConditionSchema.optional(),
      effects: z.array(effectSchema).optional(),
      choices: z
        .array(
          z.strictObject({
            text: playerTextSchema,
            effects: z.array(effectSchema).optional(),
            then: z.array(dialogueLineSchema).optional(),
          }),
        )
        .min(2)
        .max(4)
        .optional(),
    })
    .refine(
      (l) => l.say !== undefined || l.effects !== undefined,
      'une réplique a un texte (say) ou des effets',
    )
    .refine(
      (l) => l.choices === undefined || l.say !== undefined,
      'des choix suivent toujours une réplique',
    ),
);

/** Fichier de dialogues d'un PNJ (`content/dialogues/<pnj>.dialogue.yaml`). */
export const dialogueFileSchema = z.strictObject({
  npc: slugSchema,
  nodes: z
    .record(slugSchema, z.array(dialogueLineSchema).min(1))
    .refine((n) => 'default' in n, 'un nœud « default » est obligatoire'),
});

/** Fichier de dialogues validé. */
export type DialogueFile = z.infer<typeof dialogueFileSchema>;
