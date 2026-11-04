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
          failure: z.enum(['no-space-left', 'port-in-use', 'config-invalid']).nullable().optional(),
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
  processes: z
    .array(
      z.strictObject({
        user: z.string().min(1),
        command: z.string().min(1),
        cpu: z.number().min(0).max(100).optional(),
        rss: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  network: z
    .strictObject({
      address: z.string().optional(),
      prefix: z.number().int().min(0).max(32).optional(),
      gateway: z.string().optional(),
      dns: z.array(z.string()).optional(),
      iface: z.string().min(1).optional(),
      /** Interface désactivée au démarrage (panne « plus de réseau »). */
      down: z.boolean().optional(),
      dhcp: z.boolean().optional(),
      /** Pas de route par défaut (configuration incomplète). */
      noGateway: z.boolean().optional(),
      /** Autres hôtes du réseau local qui répondent au ping. */
      neighbors: z
        .array(
          z.strictObject({
            address: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}$/),
            name: z.string().min(1).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  /** Paquets installés en plus, mises à jour publiées, dpkg interrompu. */
  packages: z
    .strictObject({
      install: z.array(z.string().min(1)).optional(),
      updates: z
        .record(
          z.string().min(1),
          z.strictObject({
            version: z.string().min(1),
            suite: z.enum(['bookworm', 'bookworm-updates', 'bookworm-security']).optional(),
          }),
        )
        .optional(),
      halfConfigured: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /** Disques vierges ajoutés à la machine (`{ name: sdb, size: 10G }`). */
  extraDisks: z
    .array(z.strictObject({ name: z.string().regex(/^sd[b-z]$/), size: sizeSchema }))
    .optional(),
  rootPassword: z.string().min(1).optional(),
});

/** Machine d'une mission. */
export type MachineSpec = z.infer<typeof machineSpecSchema>;

/** Identifiant de machine (clé de `machines`). */
export const machineIdSchema = slugSchema;
