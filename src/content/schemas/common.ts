import { z } from 'zod';
import { SERVICE_IDS, SKILL_IDS } from '@core/model';

/** Identifiant simple en kebab-case (`hugo`, `salle-serveurs`). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'identifiant en kebab-case attendu');

/** Identifiant de mission : `<chapitre>.<slug>`. */
export const missionIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, 'identifiant de mission « chapitre.slug » attendu');

/** Référence à un nœud de dialogue : `pnj#nœud`. */
export const dialogueRefSchema = z
  .string()
  .regex(/^[a-z0-9-]+#[a-z0-9-]+$/, 'référence « pnj#nœud » attendue');

/** Identifiant de compétence. */
export const skillIdSchema = z.enum(SKILL_IDS);

/** Identifiant de service de LabCorp (réputation). */
export const serviceIdSchema = z.enum(SERVICE_IDS);

/** Priorité d'un ticket. */
export const prioritySchema = z.enum(['basse', 'normale', 'haute', 'critique']);

/** Texte destiné au joueur : jamais vide. */
export const playerTextSchema = z.string().trim().min(1);

/** Date `AAAA-MM-JJ`. */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue');
