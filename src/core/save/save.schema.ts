import { z } from 'zod';
import { SERVICE_IDS, SKILL_IDS } from '../model';

/** Nombre fini positif ou nul. */
const nonNegative = z.number().finite().min(0);

/** Volume entre 0 et 1. */
const volume = z.number().min(0).max(1);

/** Schéma de la tranche `player` sauvegardée. */
const playerSchema = z.object({
  name: z.string().max(40),
  pronouns: z.enum(['il', 'elle', 'iel']),
  appearance: z.object({
    hair: z.number().int().min(0),
    hairColor: z.number().int().min(0),
    skin: z.number().int().min(0),
    outfit: z.number().int().min(0),
  }),
  zoneId: z.string().min(1),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  facing: z.enum(['up', 'down', 'left', 'right']),
});

/** Schéma d'une mission terminée. */
const missionRecordSchema = z.object({
  completedAt: nonNegative,
  perfectSteps: z.number().int().min(0),
  totalSteps: z.number().int().min(0),
  errors: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  durationMs: nonNegative,
  xpEarned: nonNegative,
  grade: z.number().min(0).max(20).optional(),
});

/** Schéma de la tranche `progress` sauvegardée. */
const progressSchema = z.object({
  currentChapter: z.string().nullable(),
  completedMissions: z.record(z.string(), missionRecordSchema),
  flags: z.record(z.string(), z.literal(true)),
  badges: z.array(z.string()),
  unlockedSheets: z.array(z.string()),
  unlockedZones: z.array(z.string()),
  debriefed: z.array(z.string()),
});

/** Schéma de la tranche `progression` sauvegardée. */
const progressionSchema = z.object({
  xp: nonNegative,
  level: z.number().int().min(1).max(10),
  skills: z.record(z.enum(SKILL_IDS), z.number().min(0).max(100)),
});

/** Schéma de la tranche `settings` sauvegardée. */
const settingsSchema = z.object({
  volumes: z.object({
    master: volume,
    music: volume,
    sfx: volume,
    ambience: volume,
    voice: volume,
  }),
  textSpeed: nonNegative,
  textSize: z.enum(['normal', 'grand', 'tres-grand']),
  readableFont: z.boolean(),
  highContrast: z.boolean(),
  reducedMotion: z.boolean(),
  bloom: z.boolean(),
  difficulty: z.enum(['decouverte', 'formation', 'examen']),
});

/** Données de jeu sauvegardées (les tranches `ui` et `missionRun` ne le sont pas). */
export const saveDataSchema = z.object({
  player: playerSchema,
  progress: progressSchema,
  progression: progressionSchema,
  inventory: z.object({ items: z.array(z.string()) }),
  reputation: z.record(z.enum(SERVICE_IDS), z.number().min(0).max(100)),
  settings: settingsSchema,
});

/** Fichier de sauvegarde complet, version 1. */
export const saveFileSchema = z.object({
  version: z.literal(1),
  /** Horodatage de la sauvegarde (ms depuis l'époque Unix). */
  savedAt: nonNegative,
  data: saveDataSchema,
});

/** Données de jeu sauvegardées. */
export type SaveData = z.infer<typeof saveDataSchema>;

/** Fichier de sauvegarde validé. */
export type SaveFile = z.infer<typeof saveFileSchema>;
