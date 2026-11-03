import { SERVICE_CATALOG } from '@sims/shared/service-catalog';
import { restartService, startService, stopService } from '@sims/shared/services';
import { formatRelative, formatSystemdTimestamp } from '@sims/shared/time-format';
import type { Machine, ServiceState } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { alignTable } from '../format';
import { canReadJournal, formatLogLine } from '../journal-view';

/** Sous-commandes qui modifient l'état et demandent les droits root. */
const PRIVILEGED = new Set([
  'start',
  'stop',
  'restart',
  'reload',
  'enable',
  'disable',
  'daemon-reload',
]);

/** Nom d'unité sans le suffixe `.service`. */
function unitName(arg: string): string {
  return arg.replace(/\.service$/, '');
}

/** Bloc « status » d'un service, au format de systemd 252 (Debian 12). */
export function renderStatus(
  machine: Machine,
  service: ServiceState,
  now: number,
  withLogs: boolean,
): string {
  const def = SERVICE_CATALOG[service.name];
  const unit = `${service.name}.service`;
  const bullet = service.state === 'active' ? '●' : service.state === 'failed' ? '×' : '○';
  const enabled = service.enabled ? 'enabled' : 'disabled';
  const since = `since ${formatSystemdTimestamp(service.since)}; ${formatRelative(service.since, now)}`;
  const active =
    service.state === 'active'
      ? `active (running) ${since}`
      : service.state === 'failed'
        ? `failed (Result: exit-code) ${since}`
        : 'inactive (dead)';
  const lines = [
    `${bullet} ${unit} - ${service.description}`,
    `     Loaded: loaded (${def?.unitPath ?? `/lib/systemd/system/${unit}`}; ${enabled}; preset: enabled)`,
    `     Active: ${active}`,
  ];
  const docs = def?.docs ?? [];
  docs.forEach((doc, i) => lines.push(`${i === 0 ? '       Docs: ' : '             '}${doc}`));
  // apachectl lance Apache en mode « forking » : systemd affiche le processus de démarrage.
  const forking = def?.execStart.startsWith('/usr/sbin/apachectl') ?? false;
  if (forking && service.state !== 'inactive') {
    // Le processus de contrôle (apachectl) est celui qui écrit « Action 'start' failed. ».
    const control = [...(machine.logs[service.name] ?? [])]
      .reverse()
      .find((l) => l.message === "Action 'start' failed.");
    const pid = service.mainPid !== null ? service.mainPid - 3 : (control?.pid ?? 812);
    const status = service.state === 'failed' ? '1/FAILURE' : '0/SUCCESS';
    lines.push(
      `    Process: ${pid} ExecStart=${def?.execStart ?? ''} (code=exited, status=${status})`,
    );
  }
  if (service.state === 'active' && service.mainPid !== null) {
    const procs = machine.processes.filter(
      (p) => p.pid === service.mainPid || p.ppid === service.mainPid,
    );
    const main = procs.find((p) => p.pid === service.mainPid);
    const memory = procs.reduce((sum, p) => sum + p.rss, 0) / 1024;
    lines.push(
      `   Main PID: ${service.mainPid} (${(main?.command.split(' ')[0] ?? service.name).split('/').pop() ?? service.name})`,
      `      Tasks: ${service.name === 'apache2' ? 55 : procs.length} (limit: 2307)`,
      `     Memory: ${memory.toFixed(1)}M`,
      `        CPU: ${service.name === 'apache2' ? 41 : 12}ms`,
      `     CGroup: /system.slice/${unit}`,
      ...procs.map(
        (p, i) => `             ${i === procs.length - 1 ? '└─' : '├─'}${p.pid} ${p.command}`,
      ),
    );
  } else if (service.state === 'failed') {
    lines.push('        CPU: 24ms');
  }
  const logs = machine.logs[service.name] ?? [];
  if (withLogs && logs.length > 0) {
    lines.push('', ...logs.slice(-10).map((l) => formatLogLine(machine, l)));
  }
  return `${lines.join('\n')}\n`;
}

/** Message de refus pour un compte non root. */
function accessDenied(verb: string, unit: string): CommandOutcome {
  const target = verb === 'enable' || verb === 'disable' ? 'unit' : `${unit}.service`;
  return {
    stderr: `Failed to ${verb} ${target}: Interactive authentication required.\n`,
    exitCode: 1,
  };
}

/** Exécute une action (start, stop, restart) sur une liste d'unités. */
function changeState(env: CommandEnv, verb: string, units: readonly string[]): CommandOutcome {
  let machine = env.machine;
  let stderr = '';
  let exitCode = 0;
  const now = env.ctx.now.getTime();
  for (const unit of units) {
    if (!machine.services[unit]) {
      stderr += `Failed to ${verb} ${unit}.service: Unit ${unit}.service not found.\n`;
      exitCode = 5;
      continue;
    }
    const result =
      verb === 'stop'
        ? stopService(machine, unit, now)
        : verb === 'start'
          ? startService(machine, unit, now)
          : restartService(machine, unit, now);
    machine = result.machine;
    if (!result.ok) {
      stderr += `Job for ${unit}.service failed because the control process exited with error code.\nSee "systemctl status ${unit}.service" and "journalctl -xeu ${unit}.service" for details.\n`;
      exitCode = 1;
    }
  }
  return { machine, stderr, exitCode };
}

/** Active ou désactive le démarrage automatique. */
function setEnabled(
  env: CommandEnv,
  enable: boolean,
  units: readonly string[],
  now: boolean,
): CommandOutcome {
  let machine = env.machine;
  let stderr = '';
  for (const unit of units) {
    const service = machine.services[unit];
    if (!service) {
      return {
        machine,
        stderr: `${stderr}Failed to ${enable ? 'enable' : 'disable'} unit: Unit file ${unit}.service does not exist.\n`,
        exitCode: 1,
      };
    }
    const def = SERVICE_CATALOG[unit];
    const link = `/etc/systemd/system/multi-user.target.wants/${unit}.service`;
    if (enable && !service.enabled) stderr += `Created symlink ${link} → ${def?.unitPath ?? ''}.\n`;
    if (!enable && service.enabled) stderr += `Removed "${link}".\n`;
    machine = {
      ...machine,
      services: { ...machine.services, [unit]: { ...service, enabled: enable } },
    };
  }
  if (now) {
    const result = changeState({ ...env, machine }, enable ? 'start' : 'stop', units);
    return { ...result, stderr: stderr + (result.stderr ?? '') };
  }
  return { machine, stderr, exitCode: 0 };
}

/** Liste des services (`systemctl list-units --type=service`). */
function listUnits(machine: Machine, onlyFailed: boolean): string {
  const services = Object.values(machine.services)
    .filter((s) => s.state !== 'inactive' && (!onlyFailed || s.state === 'failed'))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const rows = [
    ['  UNIT', 'LOAD', 'ACTIVE', 'SUB', 'DESCRIPTION'],
    ...services.map((s) => [
      `${s.state === 'failed' ? '●' : ' '} ${s.name}.service`,
      'loaded',
      s.state,
      s.state === 'active' ? 'running' : 'failed',
      s.description,
    ]),
  ];
  return `${alignTable(rows, ['l', 'l', 'l', 'l', 'l']).join('\n')}

LOAD   = Reflects whether the unit definition was properly loaded.
ACTIVE = The high-level unit activation state, i.e. generalization of SUB.
SUB    = The low-level unit activation state, values depend on unit type.
${services.length} loaded units listed.
`;
}

/** Commande `systemctl` : pilote les services systemd. */
export const systemctl: BashCommand = {
  name: 'systemctl',
  summary: 'pilote les services (systemd)',
  manual: `NOM
       systemctl - piloter systemd et les services

SYNOPSIS
       systemctl COMMANDE [SERVICE]...

DESCRIPTION
       status SERVICE     état détaillé et dernières lignes du journal
       start SERVICE      démarrer
       stop SERVICE       arrêter
       restart SERVICE    redémarrer
       enable SERVICE     démarrer automatiquement au boot (--now : et tout de suite)
       disable SERVICE    ne plus démarrer au boot
       is-active SERVICE  afficher active, inactive ou failed
       is-enabled SERVICE afficher enabled ou disabled
       list-units --type=service   services chargés
       --failed           services en échec

       Les commandes qui changent l'état demandent les droits root (sudo).

EXEMPLES
       systemctl status apache2
       sudo systemctl restart apache2

À RETENIR
       Toujours lire le statut AVANT de redémarrer : le message d'erreur
       explique souvent la panne.`,
  run(args, env) {
    const options = args.filter((a) => a.startsWith('-'));
    const words = args.filter((a) => !a.startsWith('-'));
    const [verb = 'list-units', ...rest] =
      options.includes('--failed') && words.length === 0 ? ['list-units'] : words;
    const units = rest.map(unitName);
    if (PRIVILEGED.has(verb) && env.user !== 'root')
      return accessDenied(verb === 'reload' ? 'reload' : verb, units[0] ?? '');
    const now = env.ctx.now.getTime();
    switch (verb) {
      case 'status': {
        if (units.length === 0) {
          return {
            stdout: `● ${env.machine.hostname}\n    State: ${Object.values(env.machine.services).some((s) => s.state === 'failed') ? 'degraded' : 'running'}\n`,
            exitCode: 0,
          };
        }
        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        for (const unit of units) {
          const service = env.machine.services[unit];
          if (!service) {
            stderr += `Unit ${unit}.service could not be found.\n`;
            exitCode = 4;
            continue;
          }
          stdout +=
            (stdout ? '\n' : '') +
            renderStatus(env.machine, service, now, canReadJournal(env.machine, env.user));
          if (service.state !== 'active' && exitCode === 0) exitCode = 3;
        }
        return { stdout, stderr, exitCode, ok: exitCode !== 4 };
      }
      case 'start':
      case 'stop':
      case 'restart':
      case 'reload':
        if (units.length === 0) return { stderr: 'Too few arguments.\n', exitCode: 1 };
        return changeState(env, verb === 'reload' ? 'restart' : verb, units);
      case 'enable':
      case 'disable':
        if (units.length === 0) return { stderr: 'Too few arguments.\n', exitCode: 1 };
        return setEnabled(env, verb === 'enable', units, options.includes('--now'));
      case 'is-active':
      case 'is-enabled':
      case 'is-failed': {
        const lines = units.map((u) => {
          const s = env.machine.services[u];
          if (verb === 'is-enabled') return s ? (s.enabled ? 'enabled' : 'disabled') : 'not-found';
          return s ? s.state : 'inactive';
        });
        const first = env.machine.services[units[0] ?? ''];
        const okState =
          verb === 'is-enabled'
            ? first?.enabled === true
            : verb === 'is-failed'
              ? first?.state === 'failed'
              : first?.state === 'active';
        return {
          stdout: lines.map((l) => `${l}\n`).join(''),
          exitCode: okState ? 0 : verb === 'is-enabled' ? 1 : 3,
          ok: true,
        };
      }
      case 'list-units':
        return {
          stdout: listUnits(
            env.machine,
            options.includes('--failed') || options.includes('--state=failed'),
          ),
          exitCode: 0,
        };
      case 'daemon-reload':
        return { exitCode: 0 };
      default:
        return { stderr: `Unknown command verb ${verb}.\n`, exitCode: 1 };
    }
  },
};
