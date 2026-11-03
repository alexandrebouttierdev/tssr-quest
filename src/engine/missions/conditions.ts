import type { Condition } from '@content/schemas';
import { diskUsagePercent } from '@sims/shared/disks';
import { normalizePath } from '@sims/shared/path';
import type { Machine } from '@sims/shared/types';

/** État du monde sur lequel les conditions sont évaluées. */
export interface ConditionWorld {
  readonly machines: Readonly<Record<string, Machine>>;
  /** Machine par défaut (celle de l'étape). */
  readonly defaultMachine?: string | undefined;
}

/** Machine visée par une condition. */
function target(world: ConditionWorld, machine: string | undefined): Machine | undefined {
  const id = machine ?? world.defaultMachine;
  return id === undefined ? undefined : world.machines[id];
}

/**
 * Évalue une condition de réussite sur l'état des simulateurs. La réussite porte sur
 * l'état, pas sur le texte tapé : toutes les façons correctes de faire sont acceptées.
 *
 * @param condition - Condition issue du YAML de la mission.
 * @param world - Machines de la mission.
 * @returns Vrai si la condition est remplie.
 */
export function evaluateCondition(condition: Condition, world: ConditionWorld): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, world));
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, world));
  if ('not' in condition) return !evaluateCondition(condition.not, world);
  if ('command' in condition) {
    const machine = target(world, condition.command.machine);
    const regex = new RegExp(condition.command.matches);
    return machine?.history.some((record) => record.ok && regex.test(record.command)) ?? false;
  }
  if ('service' in condition) {
    const { name, state, enabled } = condition.service;
    const service = target(world, condition.service.machine)?.services[name];
    if (!service) return false;
    return (
      (state === undefined || service.state === state) &&
      (enabled === undefined || service.enabled === enabled)
    );
  }
  if ('disk' in condition) {
    const machine = target(world, condition.disk.machine);
    const disk = machine?.disks.find((d) => d.mount === normalizePath(condition.disk.mount));
    if (!machine || !disk) return false;
    return diskUsagePercent(machine, disk) < condition.disk.usageBelow;
  }
  const spec = condition.file;
  const node = target(world, spec.machine)?.fs[normalizePath(spec.path)];
  if (spec.exists === false) return node === undefined;
  if (!node) return false;
  if (spec.mode !== undefined && (node.mode & 0o7777) !== parseInt(spec.mode, 8)) return false;
  if (spec.owner !== undefined && node.owner !== spec.owner) return false;
  if (spec.group !== undefined && node.group !== spec.group) return false;
  if (spec.contains !== undefined || spec.matches !== undefined) {
    if (node.type !== 'file') return false;
    if (spec.contains !== undefined && !node.content.includes(spec.contains)) return false;
    if (spec.matches !== undefined && !new RegExp(spec.matches, 'm').test(node.content))
      return false;
  }
  return true;
}
