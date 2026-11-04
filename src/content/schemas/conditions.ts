import { z } from 'zod';
import { slugSchema } from './common';

/** Condition « une commande correspondant à l'expression a été exécutée avec succès ». */
export interface CommandCondition {
  readonly command: { readonly matches: string; readonly machine?: string | undefined };
}

/** Condition sur l'état d'un service. */
export interface ServiceCondition {
  readonly service: {
    readonly name: string;
    readonly state?: 'active' | 'inactive' | 'failed' | undefined;
    readonly enabled?: boolean | undefined;
    readonly machine?: string | undefined;
  };
}

/**
 * Condition sur un point de montage : monté ou non, par quel périphérique, taille,
 * occupation (colonne Uti% de df), déclaration dans /etc/fstab.
 */
export interface DiskCondition {
  readonly disk: {
    readonly mount: string;
    /** `false` : rien n'est monté à cet endroit. Par défaut, le montage doit exister. */
    readonly mounted?: boolean | undefined;
    readonly usageBelow?: number | undefined;
    /** Périphérique attendu (`/dev/vg_data/lv_partage`, `UUID=…`). */
    readonly device?: string | undefined;
    readonly fstype?: string | undefined;
    /** Taille minimale du système de fichiers (`5G`). */
    readonly minSize?: string | undefined;
    /** Le montage est déclaré dans /etc/fstab (il survivra au redémarrage). */
    readonly persistent?: boolean | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur LVM : groupe de volumes, ses volumes physiques, un volume logique. */
export interface LvmCondition {
  readonly lvm: {
    readonly vg: string;
    readonly pvs?: readonly string[] | undefined;
    readonly lv?: string | undefined;
    /** Taille minimale du volume logique (ou du groupe sans `lv`). */
    readonly minSize?: string | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur un compte local. */
export interface UserCondition {
  readonly user: {
    readonly name: string;
    readonly exists?: boolean | undefined;
    /** Groupes dont le compte doit être membre (principal ou secondaire). */
    readonly groups?: readonly string[] | undefined;
    /** Groupes dont il ne doit pas être membre. */
    readonly notGroups?: readonly string[] | undefined;
    readonly primaryGroup?: string | undefined;
    readonly shell?: string | undefined;
    readonly home?: string | undefined;
    readonly locked?: boolean | undefined;
    readonly hasPassword?: boolean | undefined;
    /** Le mot de passe doit être changé à la prochaine connexion (`chage -d 0`). */
    readonly mustChangePassword?: boolean | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur un groupe local. */
export interface GroupCondition {
  readonly group: {
    readonly name: string;
    readonly exists?: boolean | undefined;
    readonly members?: readonly string[] | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur la configuration réseau d'une machine. */
export interface NetCondition {
  readonly net: {
    /** Interface (par défaut : n'importe laquelle sauf lo). */
    readonly iface?: string | undefined;
    /** Adresse en notation CIDR (`192.168.10.12/24`). */
    readonly ip?: string | undefined;
    readonly up?: boolean | undefined;
    readonly gateway?: string | undefined;
    /** Serveur DNS présent dans /etc/resolv.conf. */
    readonly dns?: string | undefined;
    /** La configuration (adresse, passerelle) est écrite dans /etc/network/interfaces. */
    readonly persistent?: boolean | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur une tâche planifiée par cron. */
export interface CronCondition {
  readonly cron: {
    /** Propriétaire de la table (par défaut : root, /etc/crontab et /etc/cron.d compris). */
    readonly user?: string | undefined;
    /** Expression régulière sur la commande. */
    readonly matches: string;
    /** Planification attendue (`30 2 * * 1-5`), espaces normalisés. */
    readonly schedule?: string | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur un travail programmé par `at`. */
export interface AtCondition {
  readonly at: {
    readonly matches: string;
    readonly user?: string | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur un paquet Debian. */
export interface PackageCondition {
  readonly package: {
    readonly name: string;
    /** Par défaut : installé. */
    readonly installed?: boolean | undefined;
    /** Plus aucune mise à jour en attente. */
    readonly upToDate?: boolean | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur un processus en cours. */
export interface ProcessCondition {
  readonly process: {
    /** Expression régulière sur la ligne de commande. */
    readonly matches: string;
    /** Par défaut : le processus tourne. */
    readonly running?: boolean | undefined;
    readonly user?: string | undefined;
    /** Priorité minimale (valeur nice), pour un processus ralenti avec renice. */
    readonly niceAtLeast?: number | undefined;
    readonly machine?: string | undefined;
  };
}

/** Condition sur un fichier : existence, contenu, droits, propriétaire. */
export interface FileCondition {
  readonly file: {
    readonly path: string;
    readonly exists?: boolean | undefined;
    readonly contains?: string | undefined;
    readonly matches?: string | undefined;
    readonly mode?: string | undefined;
    readonly owner?: string | undefined;
    readonly group?: string | undefined;
    /** Le chemin est un lien symbolique vers cette cible (absolue ou relative au lien). */
    readonly linkTo?: string | undefined;
    readonly machine?: string | undefined;
  };
}

/** Toutes les sous-conditions doivent être vraies. */
export interface AllCondition {
  readonly all: readonly Condition[];
}

/** Au moins une sous-condition doit être vraie. */
export interface AnyCondition {
  readonly any: readonly Condition[];
}

/** La sous-condition doit être fausse. */
export interface NotCondition {
  readonly not: Condition;
}

/** Condition de réussite d'un objectif (docs/04-moteur-missions.md). */
export type Condition =
  | CommandCondition
  | ServiceCondition
  | DiskCondition
  | LvmCondition
  | UserCondition
  | GroupCondition
  | NetCondition
  | CronCondition
  | AtCondition
  | PackageCondition
  | ProcessCondition
  | FileCondition
  | AllCondition
  | AnyCondition
  | NotCondition;

/** Expression régulière valide (vérifiée à la compilation du contenu). */
const regexSchema = z
  .string()
  .min(1)
  .refine((source) => {
    try {
      new RegExp(source);
      return true;
    } catch {
      return false;
    }
  }, 'expression régulière invalide');

/** Machine visée (par défaut : celle de l'étape). */
const machineRef = slugSchema.optional();

/** Taille (`5G`, `500M`). */
const sizeText = z
  .string()
  .regex(/^\d+(?:[.,]\d+)?\s*[KMGT]?$/i)
  .optional();

/** Adresse IPv4. */
const ipv4 = z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}$/);

/** Liste de noms. */
const names = z.array(z.string().min(1)).min(1).optional();

/** Schéma d'une condition (union par clé unique, récursive). */
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ command: z.strictObject({ matches: regexSchema, machine: machineRef }) }),
    z.strictObject({
      service: z.strictObject({
        name: z.string().min(1),
        state: z.enum(['active', 'inactive', 'failed']).optional(),
        enabled: z.boolean().optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      disk: z.strictObject({
        mount: z.string().startsWith('/'),
        mounted: z.boolean().optional(),
        usageBelow: z.number().min(0).max(100).optional(),
        device: z.string().min(1).optional(),
        fstype: z.string().min(1).optional(),
        minSize: sizeText,
        persistent: z.boolean().optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      lvm: z.strictObject({
        vg: z.string().min(1),
        pvs: names,
        lv: z.string().min(1).optional(),
        minSize: sizeText,
        machine: machineRef,
      }),
    }),
    z.strictObject({
      user: z.strictObject({
        name: z.string().min(1),
        exists: z.boolean().optional(),
        groups: names,
        notGroups: names,
        primaryGroup: z.string().min(1).optional(),
        shell: z.string().startsWith('/').optional(),
        home: z.string().startsWith('/').optional(),
        locked: z.boolean().optional(),
        hasPassword: z.boolean().optional(),
        mustChangePassword: z.boolean().optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      group: z.strictObject({
        name: z.string().min(1),
        exists: z.boolean().optional(),
        members: names,
        machine: machineRef,
      }),
    }),
    z.strictObject({
      net: z.strictObject({
        iface: z.string().min(1).optional(),
        ip: z
          .string()
          .regex(/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/)
          .optional(),
        up: z.boolean().optional(),
        gateway: ipv4.optional(),
        dns: ipv4.optional(),
        persistent: z.boolean().optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      cron: z.strictObject({
        user: z.string().min(1).optional(),
        matches: regexSchema,
        schedule: z.string().min(1).optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      at: z.strictObject({
        matches: regexSchema,
        user: z.string().min(1).optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      package: z.strictObject({
        name: z.string().min(1),
        installed: z.boolean().optional(),
        upToDate: z.boolean().optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      process: z.strictObject({
        matches: regexSchema,
        running: z.boolean().optional(),
        user: z.string().min(1).optional(),
        niceAtLeast: z.number().int().min(-20).max(19).optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({
      file: z.strictObject({
        path: z.string().startsWith('/'),
        exists: z.boolean().optional(),
        contains: z.string().optional(),
        matches: regexSchema.optional(),
        mode: z
          .string()
          .regex(/^[0-7]{3,4}$/)
          .optional(),
        owner: z.string().optional(),
        group: z.string().optional(),
        linkTo: z.string().min(1).optional(),
        machine: machineRef,
      }),
    }),
    z.strictObject({ all: z.array(conditionSchema).min(1) }),
    z.strictObject({ any: z.array(conditionSchema).min(1) }),
    z.strictObject({ not: conditionSchema }),
  ]),
);

/** Objectif affiché au joueur dans la fenêtre de mission. */
export const objectiveSchema = z.strictObject({
  id: slugSchema,
  label: z.string().min(3),
  when: conditionSchema,
});

/** Objectif de mission. */
export type Objective = z.infer<typeof objectiveSchema>;
