import { checkApache, checkSshd } from '@sims/shared/config-check';
import { appendLogs } from '@sims/shared/journal';
import { SERVICE_CATALOG } from '@sims/shared/service-catalog';
import { startService } from '@sims/shared/services';
import { formatSystemdTimestamp } from '@sims/shared/time-format';
import type { Disk, Machine, Session } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { readFstab, resolveSpec } from '@sims/shared/storage';
import { mountDevice } from './disks';
import { readInterfaces } from '@sims/shared/network';
import { bringUp } from './network';

// --- Apache -----------------------------------------------------------------------------

/** Sortie de `apache2ctl configtest`. */
function configtest(machine: Machine): CommandOutcome {
  const check = checkApache(machine);
  if (!check.ok) {
    return {
      stderr: `${check.errors.join('\n')}\nAction 'configtest' failed.\nThe Apache error log may have more information.\n`,
      exitCode: 1,
      ok: true,
    };
  }
  return { stderr: `${[...check.warnings, 'Syntax OK'].join('\n')}\n`, exitCode: 0 };
}

/** Crée `apache2ctl` ou son alias `apachectl`. */
function apacheControl(name: 'apache2ctl' | 'apachectl'): BashCommand {
  return {
    name,
    summary: 'vérifie la configuration d’Apache et pilote le serveur',
    package: 'apache2',
    manual: `NOM
       ${name} - interface de contrôle du serveur Apache

SYNOPSIS
       ${name} configtest | -t      ${name} start | stop | restart | graceful

DESCRIPTION
       configtest vérifie la syntaxe de toute la configuration (apache2.conf,
       ports.conf, sites activés) sans toucher au service : « Syntax OK » ou la
       ligne fautive. À lancer avant chaque redémarrage d'Apache.`,
    run(args, env) {
      const action = args[0];
      if (action === 'configtest' || action === '-t') return configtest(env.machine);
      const verbs: Record<string, string> = {
        start: 'start',
        stop: 'stop',
        restart: 'restart',
        graceful: 'reload',
      };
      const verb = action ? verbs[action] : undefined;
      if (!verb)
        return {
          stderr: `Usage: ${name} start|stop|restart|graceful|graceful-stop|configtest|status|fullstatus|help\n`,
          exitCode: 1,
        };
      // Sur Debian, apache2ctl confie le démarrage à systemd ; il vérifie d'abord la syntaxe.
      if (verb !== 'stop' && !checkApache(env.machine).ok) {
        const failed = configtest(env.machine);
        return {
          ...failed,
          stderr: (failed.stderr ?? '').replace("'configtest'", `'${action ?? ''}'`),
        };
      }
      return env.runAs(env.user, ['systemctl', verb, 'apache2']);
    },
  };
}

/** Commande `apache2ctl`. */
export const apache2ctl = apacheControl('apache2ctl');
/** Commande `apachectl` (même programme). */
export const apachectl = apacheControl('apachectl');

/** Active ou désactive un site Apache (lien dans sites-enabled). */
function siteCommand(enable: boolean): BashCommand {
  const name = enable ? 'a2ensite' : 'a2dissite';
  return {
    name,
    summary: enable ? 'active un site Apache' : 'désactive un site Apache',
    package: 'apache2',
    manual: `NOM
       a2ensite, a2dissite - activer ou désactiver un site Apache

SYNOPSIS
       a2ensite SITE       a2dissite SITE

DESCRIPTION
       Un site est un fichier de /etc/apache2/sites-available/SITE.conf.
       L'activer crée un lien dans sites-enabled ; il faut ensuite recharger
       Apache : systemctl reload apache2.`,
    run(args, env) {
      const site = (args.find((a) => !a.startsWith('-')) ?? '').replace(/\.conf$/, '');
      if (!site) return { stderr: `${name}: Please specify a site\n`, exitCode: 1 };
      const available = `/etc/apache2/sites-available/${site}.conf`;
      const link = `/etc/apache2/sites-enabled/${site}.conf`;
      if (!env.machine.fs[available] && !(enable === false && env.machine.fs[link]))
        return { stderr: `ERROR: Site ${site} does not exist!\n`, exitCode: 1 };
      if (env.user !== 'root')
        return {
          stderr: `ERROR: Could not ${enable ? 'create' : 'remove'} ${link}: Permission non accordée\n`,
          exitCode: 1,
        };
      const enabled = env.machine.fs[link] !== undefined;
      if (enable && enabled) return { stdout: `Site ${site} already enabled\n`, exitCode: 0 };
      if (!enable && !enabled) return { stdout: `Site ${site} already disabled\n`, exitCode: 0 };
      const now = env.ctx.now.getTime();
      const fs = { ...env.machine.fs };
      if (enable)
        fs[link] = {
          type: 'symlink',
          owner: 'root',
          group: 'root',
          mode: 0o777,
          mtime: now,
          target: `../sites-available/${site}.conf`,
        };
      else delete fs[link];
      return {
        machine: { ...env.machine, fs },
        stdout: `${enable ? `Enabling site ${site}.` : `Site ${site} disabled.`}\nTo activate the new configuration, you need to run:\n  systemctl reload apache2\n`,
        exitCode: 0,
      };
    },
  };
}

/** Commande `a2ensite`. */
export const a2ensite = siteCommand(true);
/** Commande `a2dissite`. */
export const a2dissite = siteCommand(false);

// --- sshd -----------------------------------------------------------------------------

/** Commande `sshd` : seul le test de configuration (`-t`) est utile à l'administrateur. */
export const sshd: BashCommand = {
  name: 'sshd',
  summary: 'serveur SSH ; « sshd -t » vérifie sa configuration',
  package: 'openssh-server',
  manual: `NOM
       sshd - serveur OpenSSH

SYNOPSIS
       sshd -t

DESCRIPTION
       -t vérifie /etc/ssh/sshd_config sans démarrer de serveur : aucune sortie
       si tout va bien. À faire AVANT de redémarrer ssh : une erreur empêche
       le service de repartir, et l'on perd l'accès à distance.`,
  run(args, env) {
    if (!args.includes('-t') && !args.includes('-T'))
      return { stderr: 'sshd re-exec requires execution with an absolute path\n', exitCode: 1 };
    if (env.user !== 'root') {
      return {
        stderr: 'sshd: no hostkeys available -- exiting.\n',
        exitCode: 1,
      };
    }
    const check = checkSshd(env.machine);
    return check.ok
      ? { exitCode: 0 }
      : { stderr: `${check.errors.join('\n')}\n`, exitCode: 255, ok: true };
  },
};

// --- service -----------------------------------------------------------------------

/** Commande `service` : ancienne interface des scripts d'init, relayée vers systemctl. */
export const service: BashCommand = {
  name: 'service',
  summary: 'démarre, arrête ou interroge un service (ancienne interface)',
  package: 'init-system-helpers',
  manual: `NOM
       service - piloter un service (interface historique)

SYNOPSIS
       service SERVICE start|stop|restart|reload|status      service --status-all

DESCRIPTION
       Sur Debian 12, service transmet la demande à systemctl. On le croise
       encore dans les procédures : « service apache2 restart » équivaut à
       « systemctl restart apache2 ».`,
  run(args, env) {
    if (args[0] === '--status-all') {
      const lines = Object.values(env.machine.services)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ` [ ${s.state === 'active' ? '+' : '-'} ]  ${s.name}`);
      return { stdout: `${lines.join('\n')}\n`, exitCode: 0 };
    }
    const [unit, action] = args;
    if (!unit || !action)
      return {
        stderr:
          'Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]\n',
        exitCode: 1,
      };
    if (!env.machine.services[unit] && !SERVICE_CATALOG[unit])
      return { stderr: `${unit}: unrecognized service\n`, exitCode: 1 };
    return env.runAs(env.user, ['systemctl', action, unit]);
  },
};

// --- Arrêt et redémarrage ------------------------------------------------------------

/** Ligne de journal du noyau ou de systemd au démarrage. */
function bootLines(machine: Machine, now: number): Machine {
  return appendLogs(machine, 'kernel', [
    {
      time: now,
      ident: 'kernel',
      pid: 0,
      message: 'Linux version 6.1.0-26-amd64 (debian-kernel@lists.debian.org)',
    },
    {
      time: now,
      ident: 'systemd',
      pid: 1,
      message: 'Reached target multi-user.target - Multi-User System.',
    },
  ]);
}

/** Session de connexion d'origine (avant tout su ou sudo -i). */
function loginSession(session: Session): Session {
  let current = session;
  while (current.parent) current = current.parent;
  return current;
}

/**
 * Simule un redémarrage complet : seul ce qui est permanent survit (fichiers, paquets,
 * /etc/fstab, /etc/network/interfaces, services activés). Les adresses posées avec
 * `ip`, les montages hors fstab et les services seulement démarrés sont perdus.
 *
 * @param env - Environnement de la commande.
 * @returns La machine redémarrée et le récit de la console.
 */
export function rebootMachine(env: CommandEnv): { machine: Machine; notes: string } {
  const now = env.ctx.now.getTime();
  const before = env.machine;
  const login = loginSession(before.session);
  const home = before.users[login.user]?.home ?? '/';
  const { scheduledShutdown: _done, ...rest } = before;
  const session: Session = {
    ...login,
    cwd: home,
    previousCwd: null,
    jobs: [],
    sudoAuthenticated: false,
    env: { ...login.env, PWD: home },
  };
  delete (session as { pending?: unknown }).pending;
  let machine: Machine = {
    ...rest,
    bootTime: now,
    // Survivent : noyau et démons système (PID < 600) et la nouvelle connexion SSH.
    processes: before.processes.filter((p) => p.pid < 600 || SSH_SESSION_PIDS.has(p.pid)),
    services: Object.fromEntries(
      Object.entries(before.services).map(([name, s]) => [
        name,
        { ...s, state: 'inactive' as const, mainPid: null, failure: null, since: now },
      ]),
    ),
    interfaces: before.interfaces.map((i) =>
      i.name === 'lo' ? i : { ...i, up: false, ipv4: null, dhcp: false },
    ),
    routes: [],
    disks: before.disks.filter((d) => d.mount === '/' || !d.device.startsWith('/dev/')),
    session,
  };
  let notes = '';

  // Réseau : networking.service lève les interfaces « auto » et « allow-hotplug ».
  const { stanzas, auto, hotplug } = readInterfaces(machine);
  const wanted = new Set([...auto, ...hotplug]);
  for (const stanza of stanzas.filter((st) => wanted.has(st.name))) {
    const result = bringUp(machine, stanza, { ...env, machine });
    machine = result.machine ?? machine;
    if (result.exitCode !== 0)
      notes += '[FAILED] Failed to start networking.service - Raise network interfaces.\n';
  }

  // Montages : seul /etc/fstab compte. Un volume déjà monté par le bon périphérique
  // garde son occupation ; les autres sont remontés, ou échouent comme au vrai démarrage.
  for (const entry of readFstab(before).entries) {
    const options = entry.options.split(',');
    if (entry.type === 'swap' || entry.dir === '/' || options.includes('noauto')) continue;
    const device = resolveSpec(before, entry.spec);
    const kept = before.disks.find((d: Disk) => d.mount === entry.dir && d.device === device);
    if (kept) {
      machine = { ...machine, disks: [...machine.disks, kept] };
      continue;
    }
    const result = mountDevice({ ...env, machine }, machine, entry.spec, entry.dir);
    if (result.machine) {
      machine = result.machine;
      continue;
    }
    // Échec : systemd l'écrit dans le journal (priorité err) et sur la console.
    const mountUnit = `${systemdEscape(entry.dir)}.mount - ${entry.dir}`;
    const messages =
      device === null
        ? [
            `Timed out waiting for device ${systemdEscape(devicePath(entry.spec))}.device - ${devicePath(entry.spec)}.`,
            `Dependency failed for ${mountUnit}.`,
          ]
        : [`Failed to mount ${mountUnit}.`];
    machine = appendLogs(
      machine,
      'systemd',
      messages.map((message) => ({ time: now, ident: 'systemd', pid: 1, message })),
    );
    if (!options.includes('nofail'))
      notes += messages
        .map(
          (m) =>
            `${m.startsWith('Timed') ? '[ TIME ]' : m.startsWith('Dependency') ? '[DEPEND]' : '[FAILED]'} ${m}\n`,
        )
        .join('');
  }

  // Services : seuls ceux qui sont activés (systemctl enable) repartent.
  for (const s of Object.values(machine.services)) {
    if (s.enabled) machine = startService(machine, s.name, now).machine;
  }
  return { machine: bootLines(machine, now), notes };
}

/** Chemin du périphérique attendu par une ligne de fstab (`UUID=…` → /dev/disk/by-uuid/…). */
function devicePath(spec: string): string {
  const match = /^(UUID|LABEL)=["']?([^"']+)["']?$/.exec(spec);
  if (!match) return spec;
  return `/dev/disk/by-${match[1] === 'UUID' ? 'uuid' : 'label'}/${match[2] ?? ''}`;
}

/**
 * Nom d'unité systemd d'un chemin (`systemd-escape --path`) : `/srv/partage` →
 * `srv-partage`, les tirets du nom devenant `\x2d`.
 *
 * @param path - Chemin absolu.
 * @returns Le nom échappé.
 */
export function systemdEscape(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return '-';
  return trimmed
    .split('/')
    .map((part) =>
      [...part]
        .map((c) =>
          /[A-Za-z0-9:_.]/.test(c) ? c : `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
        )
        .join(''),
    )
    .join('-');
}

/** PID de la connexion SSH du joueur (sshd [priv], sshd pts/0, -bash), recréée au retour. */
const SSH_SESSION_PIDS = new Set([1180, 1186, 1187]);

/** Texte affiché quand la connexion SSH tombe puis revient après le redémarrage. */
function reconnect(
  env: CommandEnv,
  machine: Machine,
  notes: string,
  what: 'reboot' | 'power off',
): string {
  const host = env.machine.hostname;
  const stamp = formatSystemdTimestamp(env.ctx.now.getTime());
  const online = machine.interfaces.some((i) => i.name !== 'lo' && i.up && i.ipv4);
  return (
    `\nBroadcast message from root@${host} on pts/0 (${stamp}):\n\nThe system will ${what} now!\n\n` +
    `Connection to ${host} closed by remote host.\nConnection to ${host} closed.\n\n` +
    (what === 'power off'
      ? '(Le serveur est éteint. Dans ce jeu, on le rallume aussitôt depuis la console de virtualisation ; en production, éteindre un serveur coupe le service.)\n'
      : '(Redémarrage en cours… reconnexion.)\n') +
    (notes
      ? `${notes}(Sur un vrai serveur, une entrée de /etc/fstab en échec fait démarrer en mode urgence, sans réseau : il faut la console. Corrige-la avant le prochain redémarrage.)\n`
      : '') +
    (online
      ? ''
      : "(Le serveur n'a plus d'adresse IP : connexion par la console de l'hyperviseur.)\n") +
    `\nLinux ${host} 6.1.0-26-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.112-1 (2024-09-30) x86_64\n`
  );
}

/** Message de refus d'un arrêt sans les droits root. */
const POLKIT_DENIED = (verb: string) =>
  `Failed to set wall message, ignoring: Interactive authentication required.\nCall to ${verb} failed: Interactive authentication required.\n`;

/** Redémarre ou éteint immédiatement. */
function powerNow(env: CommandEnv, reboot: boolean): CommandOutcome {
  if (env.user !== 'root')
    return { stderr: POLKIT_DENIED(reboot ? 'Reboot' : 'PowerOff'), exitCode: 1 };
  const { machine, notes } = rebootMachine(env);
  return {
    machine,
    stdout: reconnect(env, machine, notes, reboot ? 'reboot' : 'power off'),
    exitCode: 0,
  };
}

/** Commande `reboot`. */
export const reboot: BashCommand = {
  name: 'reboot',
  summary: 'redémarre la machine',
  package: 'systemd-sysv',
  manual: `NOM
       reboot - redémarrer la machine

DESCRIPTION
       Au redémarrage, seul ce qui est enregistré survit : services activés
       (systemctl enable), /etc/fstab, /etc/network/interfaces. Bon test de
       fin de mission : ce qu'on a configuré tient-il après un reboot ?`,
  run: (_args, env) => powerNow(env, true),
};

/** Commande `poweroff`. */
export const poweroff: BashCommand = {
  name: 'poweroff',
  summary: 'éteint la machine',
  package: 'systemd-sysv',
  manual: 'NOM\n       poweroff - éteindre la machine',
  run: (_args, env) => powerNow(env, false),
};

/** Commande `shutdown` : arrêt ou redémarrage, immédiat ou programmé. */
export const shutdown: BashCommand = {
  name: 'shutdown',
  summary: 'arrête ou redémarre la machine, tout de suite ou plus tard',
  package: 'systemd-sysv',
  manual: `NOM
       shutdown - arrêter ou redémarrer la machine

SYNOPSIS
       shutdown [-r | -h] [now | +MINUTES | HH:MM]      shutdown -c

DESCRIPTION
       -r redémarre, -h (par défaut) éteint. Un arrêt programmé prévient les
       utilisateurs connectés ; -c l'annule. En entreprise : prévenir, programmer
       en dehors des heures de travail.

EXEMPLES
       sudo shutdown -r 23:00        sudo shutdown -c`,
  run(args, env) {
    if (env.user !== 'root') return { stderr: POLKIT_DENIED('ScheduleShutdown'), exitCode: 1 };
    if (args.includes('-c')) {
      const { scheduledShutdown: _cancelled, ...machine } = env.machine;
      return { machine, exitCode: 0 };
    }
    const reboot = args.includes('-r');
    const when = args.find((a) => !a.startsWith('-')) ?? '+1';
    if (when === 'now') return powerNow(env, reboot);
    const now = env.ctx.now.getTime();
    let at: number | null = null;
    const minutes = /^\+(\d+)$/.exec(when);
    if (minutes) at = now + Number(minutes[1]) * 60_000;
    const clock = /^(\d{1,2}):(\d{2})$/.exec(when);
    if (clock) {
      const offset = 3_600_000; // Heure d'hiver de Paris en novembre.
      const local = new Date(now + offset);
      at =
        Date.UTC(
          local.getUTCFullYear(),
          local.getUTCMonth(),
          local.getUTCDate(),
          Number(clock[1]),
          Number(clock[2]),
        ) - offset;
      if (at <= now) at += 86_400_000;
    }
    if (at === null)
      return { stderr: `Failed to parse time specification: ${when}\n`, exitCode: 1 };
    const stamp = formatSystemdTimestamp(at);
    return {
      machine: { ...env.machine, scheduledShutdown: { time: at, reboot } },
      stdout: `Shutdown scheduled for ${stamp}, use 'shutdown -c' to cancel.\n\nBroadcast message from root@${env.machine.hostname} on pts/0 (${formatSystemdTimestamp(now)}):\n\nThe system will ${reboot ? 'reboot' : 'power off'} at ${stamp}!\n\n`,
      exitCode: 0,
    };
  },
};
