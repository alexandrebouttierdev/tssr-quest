import { z } from 'zod';
import {
  dialogueRefSchema,
  missionIdSchema,
  playerTextSchema,
  prioritySchema,
  serviceIdSchema,
  skillIdSchema,
  slugSchema,
} from './common';
import { machineSpecSchema } from './machine';
import { stepSchema } from './steps';

/** Pseudo-chapitre des quêtes secondaires (`sq.vim-exit`), rangées dans content/side-quests/. */
export const SIDE_QUEST_CHAPTER = 'sq';

/** Mission (docs/04, « Mission »). */
export const missionSchema = z
  .strictObject({
    id: missionIdSchema,
    chapter: slugSchema,
    title: playerTextSchema,
    summary: playerTextSchema,
    giver: slugSchema,
    zone: slugSchema,
    requires: z
      .strictObject({
        missions: z.array(missionIdSchema).optional(),
        flags: z.array(z.string()).optional(),
        items: z.array(slugSchema).optional(),
        level: z.number().int().min(1).max(10).optional(),
      })
      .optional(),
    ticket: z
      .strictObject({
        number: z.number().int().positive(),
        priority: prioritySchema,
        requester: slugSchema,
        service: serviceIdSchema,
      })
      .optional(),
    rewards: z.strictObject({
      /** XP de fin de mission (50 par défaut), en plus de l'XP des étapes. */
      xp: z.number().int().nonnegative().optional(),
      skills: z.partialRecord(skillIdSchema, z.number().int().min(0).max(30)).optional(),
      reputation: z.partialRecord(serviceIdSchema, z.number().int().min(-10).max(10)).optional(),
      items: z.array(slugSchema).optional(),
      sheets: z.array(slugSchema).optional(),
    }),
    dialogue: z.strictObject({
      intro: dialogueRefSchema,
      outro: dialogueRefSchema,
      abandon: dialogueRefSchema.optional(),
    }),
    machines: z.record(slugSchema, machineSpecSchema).optional(),
    steps: z.array(stepSchema).min(1),
    recap: z.array(playerTextSchema).min(1),
    /** Variantes de révision (appliquées à partir de la phase 1). */
    variants: z
      .array(z.strictObject({ id: slugSchema, replace: z.record(z.string(), z.unknown()) }))
      .optional(),
  })
  .superRefine((mission, ctx) => {
    const ids = new Set<string>();
    for (const step of mission.steps) {
      if (ids.has(step.id))
        ctx.addIssue({ code: 'custom', message: `étape en double : ${step.id}` });
      ids.add(step.id);
      if (
        (step.type === 'terminal' || step.type === 'editor') &&
        !mission.machines?.[step.machine]
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `machine inconnue « ${step.machine} » dans l'étape ${step.id}`,
        });
      }
    }
    if (!mission.id.startsWith(`${mission.chapter}.`)) {
      ctx.addIssue({
        code: 'custom',
        message: `l'identifiant doit commencer par « ${mission.chapter}. »`,
      });
    }
  });

/** Mission validée. */
export type Mission = z.infer<typeof missionSchema>;

/** Chapitre (docs/04, « Chapitre »). */
export const chapterSchema = z.strictObject({
  id: slugSchema,
  number: z.number().int().min(1).max(18),
  title: playerTextSchema,
  eniModule: playerTextSchema,
  period: z.strictObject({ from: z.string(), to: z.string() }),
  zones: z.array(slugSchema),
  mentor: slugSchema,
  unlocks: z.strictObject({ zones: z.array(slugSchema), items: z.array(slugSchema) }).optional(),
  missions: z.array(missionIdSchema).min(1),
  exam: missionIdSchema.optional(),
  badge: z.strictObject({ id: slugSchema, name: playerTextSchema }).optional(),
});

/** Chapitre validé. */
export type Chapter = z.infer<typeof chapterSchema>;
