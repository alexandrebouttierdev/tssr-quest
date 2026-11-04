import type {
  Condition,
  DiskCondition,
  GroupCondition,
  LvmCondition,
  NetCondition,
  ProcessCondition,
  UserCondition,
} from '@content/schemas';
import { parseCrontab, readCrontab } from '@sims/shared/cron';
import { diskUsagePercent } from '@sims/shared/disks';
import { maskToPrefix, nameservers, readInterfaces, type IfaceStanza } from '@sims/shared/network';
import { normalizePath } from '@sims/shared/path';
import { parseSize } from '@sims/shared/size';
import {
  canonicalPath,
  EXTENT,
  readFstab,
  resolveSpec,
  storageOf,
  vgExtents,
} from '@sims/shared/storage';
import type { CronEntry, Machine } from '@sims/shared/types';

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

/** Lit un fichier ordinaire, ou `null`. */
function fileText(machine: Machine, path: string): string | null {
  const node = machine.fs[path];
  return node?.type === 'file' ? node.content : null;
}

/** Taille d'une condition (`5G`) ; une marge de 2 % absorbe les arrondis de LVM et d'ext4. */
function atLeast(bytes: number, required: string | undefined): boolean {
  return required === undefined || bytes >= parseSize(required) * 0.98;
}

/** Compte et appartenances. */
function checkUser(machine: Machine, spec: UserCondition['user']): boolean {
  const account = machine.users[spec.name];
  if (spec.exists === false) return account === undefined;
  if (!account) return false;
  const memberOf = (group: string) =>
    account.group === group || (machine.groups[group]?.members.includes(spec.name) ?? false);
  return (
    (spec.groups ?? []).every(memberOf) &&
    !(spec.notGroups ?? []).some(memberOf) &&
    (spec.primaryGroup === undefined || account.group === spec.primaryGroup) &&
    (spec.shell === undefined || account.shell === spec.shell) &&
    (spec.home === undefined || account.home === normalizePath(spec.home)) &&
    (spec.locked === undefined || account.locked === spec.locked) &&
    (spec.hasPassword === undefined || (account.password !== null) === spec.hasPassword) &&
    (spec.mustChangePassword === undefined ||
      (account.lastChange === 0) === spec.mustChangePassword)
  );
}

/** Groupe et membres. */
function checkGroup(machine: Machine, spec: GroupCondition['group']): boolean {
  const group = machine.groups[spec.name];
  if (spec.exists === false) return group === undefined;
  if (!group) return false;
  return (spec.members ?? []).every(
    (member) => group.members.includes(member) || machine.users[member]?.group === spec.name,
  );
}

/** Adresse déclarée dans une stance de /etc/network/interfaces (avec `netmask` éventuel). */
function stanzaAddress(stanza: IfaceStanza): string | null {
  const address = stanza.options['address'];
  if (!address) return null;
  if (address.includes('/')) return address;
  const prefix = maskToPrefix(stanza.options['netmask'] ?? '');
  return prefix === null ? null : `${address}/${prefix}`;
}

/** Configuration réseau, éventuellement rendue permanente. */
function checkNet(machine: Machine, spec: NetCondition['net']): boolean {
  const candidates = machine.interfaces.filter((i) =>
    spec.iface === undefined ? i.name !== 'lo' : i.name === spec.iface,
  );
  const live = candidates.some(
    (i) =>
      (spec.ip === undefined || i.ipv4 === spec.ip) && (spec.up === undefined || i.up === spec.up),
  );
  if (!live) return false;
  if (
    spec.gateway !== undefined &&
    !machine.routes.some((r) => r.destination === 'default' && r.gateway === spec.gateway)
  )
    return false;
  if (spec.dns !== undefined && !nameservers(machine).includes(spec.dns)) return false;
  if (spec.persistent === true) {
    const { stanzas, auto, hotplug } = readInterfaces(machine);
    const declared = stanzas.some(
      (stanza) =>
        candidates.some((i) => i.name === stanza.name) &&
        (auto.includes(stanza.name) || hotplug.includes(stanza.name)) &&
        (spec.ip === undefined ||
          (stanza.method === 'static' && stanzaAddress(stanza) === spec.ip)) &&
        (spec.gateway === undefined || stanza.options['gateway'] === spec.gateway),
    );
    if (!declared) return false;
  }
  return true;
}

/** Tâches cron d'un compte : sa table, plus /etc/crontab et /etc/cron.d pour les champs « utilisateur ». */
function cronEntries(machine: Machine, user: string): CronEntry[] {
  const own = parseCrontab(readCrontab(machine, user) ?? '');
  const systemFiles = [
    '/etc/crontab',
    ...Object.keys(machine.fs).filter((p) => p.startsWith('/etc/cron.d/')),
  ];
  const system = systemFiles.flatMap((path) =>
    parseCrontab(fileText(machine, path) ?? '').flatMap((entry) => {
      // Format système : planification, utilisateur, commande.
      const [owner = '', ...command] = entry.command.split(/\s+/);
      return owner === user ? [{ schedule: entry.schedule, command: command.join(' ') }] : [];
    }),
  );
  return [...own, ...system];
}

/** Point de montage. */
function checkDisk(machine: Machine, spec: DiskCondition['disk']): boolean {
  const mount = normalizePath(spec.mount);
  const disk = machine.disks.find((d) => d.mount === mount);
  if (spec.mounted === false) return disk === undefined;
  if (!disk) return false;
  if (spec.usageBelow !== undefined && diskUsagePercent(machine, disk) >= spec.usageBelow)
    return false;
  if (spec.device !== undefined && resolveSpec(machine, spec.device) !== disk.device) return false;
  if (spec.fstype !== undefined && disk.fstype !== spec.fstype) return false;
  const fsSize = storageOf(machine).signatures[disk.device]?.size ?? disk.size;
  if (!atLeast(fsSize, spec.minSize)) return false;
  if (spec.persistent !== undefined) {
    const declared = readFstab(machine).entries.some(
      (e) =>
        e.dir === mount &&
        !e.options.split(',').includes('noauto') &&
        resolveSpec(machine, e.spec) === disk.device,
    );
    if (declared !== spec.persistent) return false;
  }
  return true;
}

/** Groupe et volumes LVM. */
function checkLvm(machine: Machine, spec: LvmCondition['lvm']): boolean {
  const storage = storageOf(machine);
  const vg = storage.vgs.find((v) => v.name === spec.vg);
  if (!vg) return false;
  if (!(spec.pvs ?? []).every((pv) => vg.pvs.includes(canonicalPath(machine, pv)))) return false;
  if (spec.lv === undefined) return atLeast(vgExtents(machine, vg).total * EXTENT, spec.minSize);
  const lv = storage.lvs.find((l) => l.vg === spec.vg && l.name === spec.lv);
  return lv !== undefined && atLeast(lv.extents * EXTENT, spec.minSize);
}

/** Processus en cours. */
function checkProcess(machine: Machine, spec: ProcessCondition['process']): boolean {
  const regex = new RegExp(spec.matches);
  const found = machine.processes.some(
    (p) =>
      regex.test(p.command) &&
      (spec.user === undefined || p.user === spec.user) &&
      (spec.niceAtLeast === undefined || (p.nice ?? 0) >= spec.niceAtLeast),
  );
  return found === (spec.running ?? true);
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
    return machine !== undefined && checkDisk(machine, condition.disk);
  }
  if ('lvm' in condition) {
    const machine = target(world, condition.lvm.machine);
    return machine !== undefined && checkLvm(machine, condition.lvm);
  }
  if ('user' in condition) {
    const machine = target(world, condition.user.machine);
    return machine !== undefined && checkUser(machine, condition.user);
  }
  if ('group' in condition) {
    const machine = target(world, condition.group.machine);
    return machine !== undefined && checkGroup(machine, condition.group);
  }
  if ('net' in condition) {
    const machine = target(world, condition.net.machine);
    return machine !== undefined && checkNet(machine, condition.net);
  }
  if ('cron' in condition) {
    const machine = target(world, condition.cron.machine);
    if (!machine) return false;
    const regex = new RegExp(condition.cron.matches);
    const schedule = condition.cron.schedule?.trim().split(/\s+/).join(' ');
    return cronEntries(machine, condition.cron.user ?? 'root').some(
      (e) => regex.test(e.command) && (schedule === undefined || e.schedule === schedule),
    );
  }
  if ('at' in condition) {
    const machine = target(world, condition.at.machine);
    const regex = new RegExp(condition.at.matches);
    return (
      machine?.atJobs?.some(
        (job) =>
          regex.test(job.commands) &&
          (condition.at.user === undefined || job.user === condition.at.user),
      ) ?? false
    );
  }
  if ('package' in condition) {
    const pkg = target(world, condition.package.machine)?.packages[condition.package.name];
    const installed = pkg?.installed ?? false;
    if (installed !== (condition.package.installed ?? true)) return false;
    return condition.package.upToDate !== true || (pkg !== undefined && pkg.update === undefined);
  }
  if ('process' in condition) {
    const machine = target(world, condition.process.machine);
    return machine !== undefined && checkProcess(machine, condition.process);
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
