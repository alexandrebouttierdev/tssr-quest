import type { MachineSpec } from '@content/schemas';
import { createDebianServer, type DebianServerOptions } from '@sims/shared/factories';
import type { Machine } from '@sims/shared/types';

/** Retire récursivement les clés à `undefined` (objets issus de Zod). */
function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, compact(v)]),
    ) as T;
  }
  return value;
}

/**
 * Construit une machine simulée à partir de sa description YAML.
 *
 * @param spec - Description de la machine dans la mission.
 * @param now - Date de la simulation (ms).
 * @returns La machine de départ.
 */
export function buildMachine(spec: MachineSpec, now: number): Machine {
  // Zod type les champs facultatifs en « T | undefined » ; `compact` retire ces undefined,
  // ce qui rend la description conforme aux options de la fabrique.
  const { base: _base, ...rest } = compact(spec);
  const options = { ...rest, now } as DebianServerOptions;
  return createDebianServer(options);
}
