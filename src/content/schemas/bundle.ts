import { z } from 'zod';
import { dialogueFileSchema } from './dialogue';
import { chapterSchema, missionSchema } from './mission';
import { itemSchema, npcSchema, sheetSchema, zoneSchema } from './world';

/** Tout le contenu compilé du jeu (`src/content/generated/content.json`). */
export const contentBundleSchema = z.strictObject({
  chapters: z.array(chapterSchema),
  missions: z.array(missionSchema),
  dialogues: z.array(dialogueFileSchema),
  npcs: z.array(npcSchema),
  zones: z.array(zoneSchema),
  items: z.array(itemSchema),
  sheets: z.array(sheetSchema),
});

/** Contenu compilé. */
export type ContentBundle = z.infer<typeof contentBundleSchema>;
