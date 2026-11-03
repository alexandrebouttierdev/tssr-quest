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

/** Condition sur l'occupation d'un disque (colonne Uti% de df). */
export interface DiskCondition {
  readonly disk: {
    readonly mount: string;
    readonly usageBelow: number;
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
        usageBelow: z.number().min(0).max(100),
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
