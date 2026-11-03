import { z } from 'zod';
import { playerTextSchema, slugSchema } from './common';

/** Fiche d'un PNJ (`content/npcs/<id>.npc.yaml`). */
export const npcSchema = z.strictObject({
  id: slugSchema,
  name: playerTextSchema,
  role: playerTextSchema,
  zone: slugSchema,
  /** Teintes du sprite (recoloration du personnage de base). */
  palette: z
    .strictObject({
      hair: z.string().regex(/^#[0-9a-f]{6}$/i),
      skin: z.string().regex(/^#[0-9a-f]{6}$/i),
      outfit: z.string().regex(/^#[0-9a-f]{6}$/i),
    })
    .optional(),
  /** Traits du portrait généré (assets/generators/portraits.ts). */
  portrait: z
    .strictObject({
      hair: z.enum(['court', 'long', 'boucle', 'chignon', 'rase']).optional(),
      beard: z.boolean().optional(),
      glasses: z.boolean().optional(),
    })
    .optional(),
  /** Hauteur de la « voix » (bip) de 0,5 à 2. */
  voicePitch: z.number().min(0.5).max(2).optional(),
  description: playerTextSchema,
});

/** PNJ validé. */
export type Npc = z.infer<typeof npcSchema>;

/** Zone du monde (`content/zones/zones.yaml`). */
export const zoneSchema = z.strictObject({
  id: slugSchema,
  name: playerTextSchema,
  site: playerTextSchema,
  /** Carte Tiled `content/maps/<map>.tmj`. */
  map: slugSchema,
  /** Chapitre d'ouverture. */
  opensAt: z.number().int().min(0).max(18),
});

/** Zone validée. */
export type Zone = z.infer<typeof zoneSchema>;

/** Objet d'inventaire (`content/items/items.yaml`). */
export const itemSchema = z.strictObject({
  id: slugSchema,
  name: playerTextSchema,
  category: z.enum(['outil', 'badge', 'quete', 'consommable', 'cosmetique']),
  description: playerTextSchema,
});

/** Objet validé. */
export type Item = z.infer<typeof itemSchema>;

/** Fiche « À retenir » (`content/sheets/<id>.md`). */
export const sheetSchema = z.strictObject({
  id: slugSchema,
  title: playerTextSchema,
  /** Corps en Markdown simple. */
  body: playerTextSchema,
  skill: z.string().optional(),
});

/** Fiche validée. */
export type Sheet = z.infer<typeof sheetSchema>;
