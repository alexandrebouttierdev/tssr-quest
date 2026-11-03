import { z } from 'zod';
import { slugSchema } from './common';

/** Taille (`20G`) ou nombre d'octets. */
const sizeSchema = z.union([
  z.string().regex(/^\d+(?:[.,]\d+)?\s*[KMGTP]?$/i),
  z.number().nonnegative(),
]);

/** Fichier, dossier ou lien décrit par une mission (`null` pour le supprimer). */
const fileSpecSchema = z
  .strictObject({
    type: z.enum(['file', 'dir', 'symlink']).optional(),
    content: z.string().optional(),
    size: sizeSchema.optional(),
    owner: z.string().optional(),
    group: z.string().optional(),
    mode: z
      .string()
      .regex(/^[0-7]{3,4}$/)
      .optional(),
    target: z.string().optional(),
  })
  .nullable();

/** Compte utilisateur : simple nom, ou objet détaillé. */
const userSpecSchema = z.union([
  z.string().min(1),
  z.strictObject({
    name: z.string().min(1),
    password: z.string().optional(),
    groups: z.array(z.string()).optional(),
    gecos: z.string().optional(),
    shell: z.string().optional(),
    uid: z.number().int().optional(),
  }),
]);

/** Machine simulée d'une mission (docs/04, clé `machines`). */
export const machineSpecSchema = z.strictObject({
  base: z.literal('debian-server'),
  hostname: z.string().regex(/^[a-z0-9-]+$/),
  session: z.strictObject({ user: z.string().min(1), cwd: z.string().startsWith('/').optional() }),
  users: z.array(userSpecSchema).optional(),
  groups: z.record(z.string(), z.array(z.string())).optional(),
  sudoers: z.array(z.string()).optional(),
  services: z
    .record(
      z.string(),
      z
        .strictObject({
          state: z.enum(['active', 'inactive', 'failed']),
          enabled: z.boolean().optional(),
          failure: z.enum(['no-space-left', 'port-in-use']).nullable().optional(),
        })
        .nullable(),
    )
    .optional(),
  disks: z
    .array(
      z.strictObject({ mount: z.string().startsWith('/'), size: sizeSchema, used: sizeSchema }),
    )
    .optional(),
  files: z.record(z.string().startsWith('/'), fileSpecSchema).optional(),
  network: z
    .strictObject({
      address: z.string().optional(),
      prefix: z.number().int().min(0).max(32).optional(),
      gateway: z.string().optional(),
      dns: z.array(z.string()).optional(),
    })
    .optional(),
});

/** Machine d'une mission. */
export type MachineSpec = z.infer<typeof machineSpecSchema>;

/** Identifiant de machine (clé de `machines`). */
export const machineIdSchema = slugSchema;
