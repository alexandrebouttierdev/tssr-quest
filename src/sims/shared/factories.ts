import { seedFromString } from '@core/random/rng';
import {
  BASHRC,
  CRONTAB,
  hostsFile,
  interfacesFile,
  MOTD,
  OS_RELEASE,
  PROFILE,
  resolvConf,
  SOURCES_LIST,
  SUDOERS,
  SYSTEM_ACCOUNTS,
  SYSTEM_GROUPS,
  USR_BIN,
  USR_SBIN,
  type NetworkFileParams,
} from './debian-files';
import { diskForPath } from './disks';
import { fileSize } from './node-size';
import { dirname, isInside, normalizePath } from './path';
import { PACKAGE_CATALOG } from './package-catalog';
import { seedPackageFiles } from './packages';
import { SERVICE_CATALOG } from './service-catalog';
import { failureLogLines, serviceProcesses, startLogLines } from './services';
import { parseSize } from './size';
import type {
  Disk,
  FileNode,
  FsNode,
  Group,
  LogLine,
  Machine,
  PackageState,
  Process,
  ServiceActiveState,
  AptSuite,
  ServiceFailure,
  ServiceState,
  UserAccount,
} from './types';

/** Date par défaut des machines : mardi 3 novembre 2026, 9 h 26, heure de Paris. */
export const DEFAULT_NOW = Date.UTC(2026, 10, 3, 8, 26, 0);

/** Fichier, dossier ou lien décrit par une mission. */
export interface FileSpec {
  readonly type?: 'file' | 'dir' | 'symlink';
  readonly content?: string;
  /** Taille déclarée (`18G`) pour un gros fichier dont le contenu n'importe pas. */
  readonly size?: string | number;
  readonly owner?: string;
  readonly group?: string;
  /** Mode octal (`"0640"`, `"2775"`) ou nombre. */
  readonly mode?: string | number;
  readonly target?: string;
  readonly mtime?: number;
}

/** Compte utilisateur décrit par une mission. */
export interface UserSpec {
  readonly name: string;
  readonly password?: string;
  readonly groups?: readonly string[];
  readonly gecos?: string;
  readonly shell?: string;
  readonly uid?: number;
}

/** Disque décrit par une mission : capacité et occupation totale voulue. */
export interface DiskSpec {
  readonly mount: string;
  readonly size: string | number;
  readonly used: string | number;
  readonly device?: string;
  readonly fstype?: string;
}

/** Service décrit par une mission. */
export interface ServiceSpec {
  readonly state: ServiceActiveState;
  readonly enabled?: boolean;
  readonly failure?: 'no-space-left' | 'port-in-use' | null;
}

/** Paquets décrits par une mission. */
export interface PackagesSpec {
  /** Paquets installés en plus de la base (leurs dépendances suivent). */
  readonly install?: readonly string[];
  /** Mises à jour publiées sur les miroirs, pas encore vues par `apt update`. */
  readonly updates?: Readonly<
    Record<string, { readonly version: string; readonly suite?: AptSuite }>
  >;
  /** Paquets dont la configuration a été interrompue (`dpkg --configure -a`). */
  readonly halfConfigured?: readonly string[];
}

/** Options de `createDebianServer`. */
export interface DebianServerOptions {
  readonly hostname?: string;
  readonly domain?: string;
  /** Date courante de la simulation (ms). */
  readonly now?: number;
  readonly users?: readonly (string | UserSpec)[];
  /** Groupes supplémentaires et leurs membres. */
  readonly groups?: Readonly<Record<string, readonly string[]>>;
  /** Comptes ajoutés au groupe sudo. */
  readonly sudoers?: readonly string[];
  readonly session?: { readonly user: string; readonly cwd?: string };
  readonly disks?: readonly DiskSpec[];
  /** Fichiers à créer (ou à supprimer avec `null`). */
  readonly files?: Readonly<Record<string, FileSpec | null>>;
  /** Services à ajouter, modifier, ou retirer avec `null`. */
  readonly services?: Readonly<Record<string, ServiceSpec | null>>;
  /** État des paquets : installés en plus, mises à jour publiées, dpkg interrompu. */
  readonly packages?: PackagesSpec;
  readonly network?: {
    readonly address?: string;
    readonly prefix?: number;
    readonly gateway?: string;
    readonly dns?: readonly string[];
    readonly iface?: string;
    /** Interface désactivée au démarrage. */
    readonly down?: boolean;
    /** Adresse obtenue par DHCP. */
    readonly dhcp?: boolean;
    /** Pas de passerelle par défaut (configuration incomplète). */
    readonly noGateway?: boolean;
    /** Autres hôtes du réseau local qui répondent. */
    readonly neighbors?: readonly { readonly address: string; readonly name?: string }[];
  };
  readonly rootPassword?: string;
  /** Processus supplémentaires (programme qui s'emballe, script oublié…). */
  readonly processes?: readonly {
    readonly user: string;
    readonly command: string;
    readonly cpu?: number;
    readonly rss?: number;
  }[];
}

/** Services présents par défaut (actifs et activés). */
const DEFAULT_SERVICES = ['ssh', 'cron', 'rsyslog'] as const;

/** Groupes ajoutés au premier compte par l'installateur Debian. */
const INSTALLER_GROUPS = ['cdrom', 'floppy', 'audio', 'dip', 'video', 'plugdev', 'users', 'netdev'];

/** Lit un mode octal écrit en texte (`"0640"`) ou déjà numérique. */
function parseMode(mode: string | number | undefined, fallback: number): number {
  if (mode === undefined) return fallback;
  if (typeof mode === 'number') return mode;
  if (!/^[0-7]{3,4}$/.test(mode)) throw new Error(`Mode invalide : « ${mode} »`);
  return parseInt(mode, 8);
}

/**
 * UUID stable d'un périphérique (même résultat pour `blkid` et `/etc/fstab`).
 *
 * @param hostname - Nom de la machine.
 * @param device - Périphérique (`/dev/sda1`).
 * @returns Un UUID au format 8-4-4-4-12.
 */
export function deviceUuid(hostname: string, device: string): string {
  const hex = [0, 1, 2, 3]
    .map((i) => seedFromString(`${hostname}:${device}:${i}`).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Adresse MAC VMware (préfixe 00:0c:29) dérivée du nom de la machine. */
function macFor(hostname: string): string {
  const hex = seedFromString(hostname).toString(16).padStart(8, '0');
  return `00:0c:29:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
}

/** Empreinte de mot de passe à l'allure yescrypt (purement décorative). */
function fakeHash(user: string, password: string): string {
  const alphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let seed = seedFromString(`${user}:${password}`);
  let out = '';
  for (let i = 0; i < 65; i++) {
    seed = Math.imul(seed ^ (seed >>> 13), 0x5bd1e995) >>> 0;
    out += alphabet[seed % alphabet.length];
  }
  return `$y$j9T$${out.slice(0, 22)}$${out.slice(22, 65)}`;
}

/**
 * Construit le contenu de /etc/passwd à partir des comptes.
 *
 * @param machine - Machine simulée.
 * @returns Le texte du fichier.
 */
export function renderPasswd(machine: Pick<Machine, 'users' | 'groups'>): string {
  return Object.values(machine.users)
    .map((u) => {
      const gid = machine.groups[u.group]?.gid ?? u.uid;
      return `${u.name}:x:${u.uid}:${gid}:${u.gecos}:${u.home}:${u.shell}`;
    })
    .join('\n')
    .concat('\n');
}

/**
 * Construit le contenu de /etc/group à partir des groupes.
 *
 * @param machine - Machine simulée.
 * @returns Le texte du fichier.
 */
export function renderGroup(machine: Pick<Machine, 'groups'>): string {
  return Object.values(machine.groups)
    .map((g) => `${g.name}:x:${g.gid}:${g.members.join(',')}`)
    .join('\n')
    .concat('\n');
}

/**
 * Construit le contenu de /etc/shadow (dates en jours depuis 1970).
 *
 * @param machine - Machine simulée.
 * @param now - Date courante (ms).
 * @returns Le texte du fichier.
 */
export function renderShadow(machine: Pick<Machine, 'users'>, now: number): string {
  const day = Math.floor(now / 86_400_000) - 30;
  return Object.values(machine.users)
    .map((u) => {
      const hash =
        u.password === null
          ? u.uid < 1000 && u.uid !== 0
            ? '*'
            : '!'
          : fakeHash(u.name, u.password);
      return `${u.name}:${u.locked ? '!' : ''}${hash}:${day}:0:99999:7:::`;
    })
    .join('\n')
    .concat('\n');
}

/** Nœud dossier. */
function dir(owner: string, group: string, mode: number, mtime: number): FsNode {
  return { type: 'dir', owner, group, mode, mtime };
}

/** Nœud fichier. */
function file(
  owner: string,
  group: string,
  mode: number,
  mtime: number,
  content: string,
): FileNode {
  return { type: 'file', owner, group, mode, mtime, content };
}

/** Nœud lien symbolique. */
function link(target: string, mtime: number): FsNode {
  return { type: 'symlink', owner: 'root', group: 'root', mode: 0o777, mtime, target };
}

/**
 * Construit l'état des paquets : tout le dépôt simulé, la base et les paquets des
 * services installés (avec leurs dépendances, marquées « automatique »).
 *
 * @param spec - Paquets demandés par la mission.
 * @param servicePackages - Paquets qui fournissent les services présents.
 * @returns Les paquets indexés par nom.
 */
function buildPackages(
  spec: PackagesSpec | undefined,
  servicePackages: readonly string[],
): Record<string, PackageState> {
  const packages: Record<string, PackageState> = {};
  for (const def of Object.values(PACKAGE_CATALOG)) {
    packages[def.name] = {
      name: def.name,
      version: def.version,
      description: def.description,
      installed: def.base === true,
    };
  }
  const install = (name: string, auto: boolean): void => {
    const p = packages[name];
    if (!p) throw new Error(`Paquet inconnu : ${name}`);
    if (p.installed) return;
    packages[name] = { ...p, installed: true, ...(auto ? { auto: true } : {}) };
    PACKAGE_CATALOG[name]?.depends.forEach((d) => install(d, true));
  };
  [...servicePackages, ...(spec?.install ?? [])].forEach((n) => install(n, false));
  for (const [name, update] of Object.entries(spec?.updates ?? {})) {
    const p = packages[name];
    if (!p) throw new Error(`Paquet inconnu : ${name}`);
    packages[name] = {
      ...p,
      update: { version: update.version, suite: update.suite ?? 'bookworm-security' },
    };
  }
  for (const name of spec?.halfConfigured ?? []) {
    const p = packages[name];
    if (p) packages[name] = { ...p, installed: true, halfConfigured: true };
  }
  return packages;
}

/**
 * Crée un serveur Debian 12 réaliste : arborescence FHS, comptes système, services
 * par défaut (ssh, cron, rsyslog), disque, réseau. Les missions le personnalisent
 * par les options (comptes, fichiers, disques, services en panne…).
 *
 * @param options - Personnalisation de la machine.
 * @returns Une machine immuable et sérialisable.
 * @throws {Error} Si un service n'est pas au catalogue ou si la session vise un compte inconnu.
 * @example
 * const srv = createDebianServer({ hostname: 'srv-web01', users: ['hugo'], sudoers: ['hugo'] });
 */
export function createDebianServer(options: DebianServerOptions = {}): Machine {
  const now = options.now ?? DEFAULT_NOW;
  const hostname = options.hostname ?? 'srv-debian';
  const domain = options.domain ?? 'lab.local';
  const bootTime = now - 12 * 86_400_000 - 3 * 3_600_000;
  const installTime = now - 30 * 86_400_000;

  // --- Comptes et groupes -------------------------------------------------------------
  const groups: Record<string, Group> = Object.fromEntries(
    SYSTEM_GROUPS.map(([name, gid]) => [name, { name, gid, members: [] as string[] }]),
  );
  groups['netdev'] = { name: 'netdev', gid: 106, members: [] };
  groups['crontab'] = { name: 'crontab', gid: 101, members: [] };
  const users: Record<string, UserAccount> = Object.fromEntries(
    SYSTEM_ACCOUNTS.map(([name, uid, gid, gecos, home, shell]) => [
      name,
      {
        name,
        uid,
        group: SYSTEM_GROUPS.find(([, g]) => g === gid)?.[0] ?? 'nogroup',
        home,
        shell,
        gecos,
        password: name === 'root' ? (options.rootPassword ?? 'root') : null,
        locked: false,
      },
    ]),
  );
  const addMember = (groupName: string, user: string) => {
    const group = groups[groupName];
    if (!group) throw new Error(`Groupe inconnu : ${groupName}`);
    if (!group.members.includes(user))
      groups[groupName] = { ...group, members: [...group.members, user] };
  };
  const specs: UserSpec[] = (options.users ?? []).map((u) =>
    typeof u === 'string' ? { name: u } : u,
  );
  let nextUid = 1000;
  for (const [index, spec] of specs.entries()) {
    const uid = spec.uid ?? nextUid;
    nextUid = Math.max(nextUid, uid) + 1;
    groups[spec.name] = { name: spec.name, gid: uid, members: [] };
    users[spec.name] = {
      name: spec.name,
      uid,
      group: spec.name,
      home: `/home/${spec.name}`,
      shell: spec.shell ?? '/bin/bash',
      gecos: `${spec.gecos ?? spec.name},,,`,
      password: spec.password ?? spec.name,
      locked: false,
    };
    if (index === 0) INSTALLER_GROUPS.forEach((g) => addMember(g, spec.name));
  }
  let nextGid = 1100;
  for (const [name, members] of Object.entries(options.groups ?? {})) {
    if (!groups[name]) groups[name] = { name, gid: nextGid++, members: [] };
    members.forEach((m) => addMember(name, m));
  }
  for (const spec of specs) spec.groups?.forEach((g) => addMember(g, spec.name));
  for (const name of options.sudoers ?? []) addMember('sudo', name);

  // --- Services et paquets --------------------------------------------------------------
  const serviceSpecs: Record<string, ServiceSpec> = Object.fromEntries(
    DEFAULT_SERVICES.map((name): [string, ServiceSpec] => [
      name,
      { state: 'active', enabled: true },
    ]),
  );
  for (const [name, spec] of Object.entries(options.services ?? {})) {
    if (spec === null) delete serviceSpecs[name];
    else serviceSpecs[name] = spec;
  }
  const packages = buildPackages(
    options.packages,
    Object.keys(serviceSpecs).map((name) => {
      const pkg = SERVICE_CATALOG[name]?.package.name;
      if (!pkg) throw new Error(`Service inconnu : ${name}`);
      return pkg;
    }),
  );

  // --- Système de fichiers ---------------------------------------------------------------
  const fs: Record<string, FsNode> = {};
  const t = installTime;
  const rootDirs: [string, number][] = [
    ['/', 0o755],
    ['/boot', 0o755],
    ['/dev', 0o755],
    ['/etc', 0o755],
    ['/etc/apt', 0o755],
    ['/etc/cron.d', 0o755],
    ['/etc/cron.daily', 0o755],
    ['/etc/cron.hourly', 0o755],
    ['/etc/cron.monthly', 0o755],
    ['/etc/cron.weekly', 0o755],
    ['/etc/logrotate.d', 0o755],
    ['/etc/network', 0o755],
    ['/etc/network/interfaces.d', 0o755],
    ['/etc/skel', 0o755],
    ['/etc/ssh', 0o755],
    ['/etc/sudoers.d', 0o750],
    ['/etc/systemd', 0o755],
    ['/etc/systemd/system', 0o755],
    ['/home', 0o755],
    ['/media', 0o755],
    ['/mnt', 0o755],
    ['/opt', 0o755],
    ['/proc', 0o555],
    ['/root', 0o700],
    ['/run', 0o755],
    ['/run/lock', 0o1777],
    ['/srv', 0o755],
    ['/sys', 0o555],
    ['/tmp', 0o1777],
    ['/usr', 0o755],
    ['/usr/bin', 0o755],
    ['/usr/lib', 0o755],
    ['/usr/lib64', 0o755],
    ['/usr/lib/systemd', 0o755],
    ['/usr/lib/systemd/system', 0o755],
    ['/usr/local', 0o755],
    ['/usr/local/bin', 0o755],
    ['/usr/local/sbin', 0o755],
    ['/usr/sbin', 0o755],
    ['/usr/share', 0o755],
    ['/usr/share/doc', 0o755],
    ['/usr/share/man', 0o755],
    ['/var', 0o755],
    ['/var/backups', 0o755],
    ['/var/cache', 0o755],
    ['/var/lib', 0o755],
    ['/var/local', 0o2775],
    ['/var/log', 0o755],
    ['/var/log/apt', 0o755],
    ['/var/log/installer', 0o755],
    ['/var/log/private', 0o700],
    ['/var/opt', 0o755],
    ['/var/spool', 0o755],
    ['/var/spool/cron', 0o755],
    ['/var/tmp', 0o1777],
  ];
  for (const [path, mode] of rootDirs) fs[path] = dir('root', 'root', mode, t);
  fs['/var/log/journal'] = dir('root', 'systemd-journal', 0o2755, t);
  fs['/var/mail'] = dir('root', 'mail', 0o2775, t);
  fs['/var/spool/cron/crontabs'] = dir('root', 'crontab', 0o1730, t);
  for (const [path, target] of [
    ['/bin', 'usr/bin'],
    ['/sbin', 'usr/sbin'],
    ['/lib', 'usr/lib'],
    ['/lib64', 'usr/lib64'],
    ['/var/run', '/run'],
    ['/var/lock', '/run/lock'],
  ] as const) {
    fs[path] = link(target, t);
  }
  for (const name of USR_BIN)
    fs[`/usr/bin/${name}`] = { ...file('root', 'root', 0o755, t, ''), size: 142_312 };
  for (const name of USR_SBIN)
    fs[`/usr/sbin/${name}`] = { ...file('root', 'root', 0o755, t, ''), size: 98_520 };
  // sudo et passwd sont setuid root : c'est ce qui leur permet d'agir en root.
  fs['/usr/bin/sudo'] = { ...file('root', 'root', 0o4755, t, ''), size: 281_624 };
  fs['/usr/bin/passwd'] = { ...file('root', 'root', 0o4755, t, ''), size: 68_248 };

  const iface = options.network?.iface ?? 'ens33';
  const address = options.network?.address ?? '192.168.10.20';
  const prefix = options.network?.prefix ?? 24;
  const gateway = options.network?.gateway ?? '192.168.10.254';
  const dnsServers = options.network?.dns ?? ['192.168.10.1'];
  const net: NetworkFileParams = { hostname, domain, address, prefix, gateway, dnsServers, iface };

  const etc = (path: string, content: string, mode = 0o644, group = 'root') => {
    fs[path] = file('root', group, mode, t, content);
  };
  // Périphériques spéciaux utiles aux redirections (2>/dev/null…).
  for (const device of ['null', 'zero', 'random', 'urandom', 'tty'])
    fs[`/dev/${device}`] = file('root', device === 'tty' ? 'tty' : 'root', 0o666, t, '');
  etc('/etc/hostname', `${hostname}\n`);
  etc('/etc/hosts', hostsFile(net));
  etc('/etc/os-release', OS_RELEASE);
  etc('/etc/debian_version', '12.7\n');
  etc('/etc/issue', 'Debian GNU/Linux 12 \\n \\l\n\n');
  etc('/etc/motd', MOTD);
  etc('/etc/timezone', 'Europe/Paris\n');
  etc('/etc/resolv.conf', resolvConf(net));
  etc('/etc/network/interfaces', interfacesFile(net));
  etc('/etc/apt/sources.list', SOURCES_LIST);
  etc('/etc/sudoers', SUDOERS, 0o440);
  etc('/etc/crontab', CRONTAB);
  etc('/etc/skel/.bashrc', BASHRC);
  etc('/etc/skel/.profile', PROFILE);
  etc(
    '/etc/ssh/sshd_config',
    'Include /etc/ssh/sshd_config.d/*.conf\n\nKbdInteractiveAuthentication no\nUsePAM yes\nX11Forwarding yes\nPrintMotd no\nAcceptEnv LANG LC_*\nSubsystem\tsftp\t/usr/lib/openssh/sftp-server\n',
  );
  fs['/root/.bashrc'] = file('root', 'root', 0o644, t, BASHRC);
  fs['/root/.profile'] = file('root', 'root', 0o644, t, PROFILE);
  for (const spec of specs) {
    const home = `/home/${spec.name}`;
    // Debian 12 crée les dossiers personnels en 0700 (DIR_MODE de adduser.conf).
    fs[home] = dir(spec.name, spec.name, 0o700, t);
    fs[`${home}/.bashrc`] = file(spec.name, spec.name, 0o644, t, BASHRC);
    fs[`${home}/.profile`] = file(spec.name, spec.name, 0o644, t, PROFILE);
  }

  // Unités systemd et fichiers propres aux services installés.
  for (const name of Object.keys(serviceSpecs)) {
    const def = SERVICE_CATALOG[name];
    if (!def) continue;
    fs[`/usr/lib/systemd/system/${name}.service`] = file(
      'root',
      'root',
      0o644,
      t,
      `[Unit]\nDescription=${def.description}\nAfter=network.target\n\n[Service]\nExecStart=${def.execStart}\n\n[Install]\nWantedBy=multi-user.target\n`,
    );
  }
  const varLog = (path: string, content: string, group = 'adm', mode = 0o640) => {
    fs[path] = file('root', group, mode, now - 60_000, content);
  };
  varLog('/var/log/syslog', '');
  varLog('/var/log/auth.log', '');
  varLog('/var/log/kern.log', '');
  varLog('/var/log/dpkg.log', '', 'root', 0o644);
  varLog('/var/log/alternatives.log', '', 'root', 0o644);
  varLog('/var/log/apt/history.log', '', 'root', 0o644);
  varLog('/var/log/apt/term.log', '', 'adm', 0o640);
  varLog('/var/log/lastlog', '', 'utmp', 0o664);
  varLog('/var/log/wtmp', '', 'utmp', 0o664);
  varLog('/var/log/btmp', '', 'utmp', 0o660);
  varLog('/var/log/faillog', '', 'root', 0o644);
  if (serviceSpecs['apache2']) {
    fs['/etc/apache2'] = dir('root', 'root', 0o755, t);
    etc(
      '/etc/apache2/apache2.conf',
      'ServerRoot "/etc/apache2"\nDefaultRuntimeDir ${APACHE_RUN_DIR}\nPidFile ${APACHE_PID_FILE}\nTimeout 300\nKeepAlive On\nUser ${APACHE_RUN_USER}\nGroup ${APACHE_RUN_GROUP}\nErrorLog ${APACHE_LOG_DIR}/error.log\nLogLevel warn\nIncludeOptional mods-enabled/*.load\nIncludeOptional mods-enabled/*.conf\nInclude ports.conf\nIncludeOptional conf-enabled/*.conf\nIncludeOptional sites-enabled/*.conf\n',
    );
    etc(
      '/etc/apache2/ports.conf',
      'Listen 80\n\n<IfModule ssl_module>\n\tListen 443\n</IfModule>\n',
    );
    fs['/var/log/apache2'] = dir('root', 'adm', 0o750, t);
    varLog('/var/log/apache2/access.log', '');
    varLog('/var/log/apache2/error.log', '');
    fs['/var/www'] = dir('root', 'root', 0o755, t);
    fs['/var/www/html'] = dir('root', 'root', 0o755, t);
    fs['/var/www/html/index.html'] = file(
      'root',
      'root',
      0o644,
      t,
      '<!DOCTYPE html>\n<html lang="fr">\n<head><meta charset="utf-8"><title>Intranet LabCorp</title></head>\n<body><h1>Intranet LabCorp</h1><p>Bienvenue sur l\'intranet.</p></body>\n</html>\n',
    );
  }

  // Fichiers des paquets installés (programmes, documentation, configuration).
  seedPackageFiles(fs, packages, t);

  // Fichiers propres à la mission.
  for (const [rawPath, spec] of Object.entries(options.files ?? {})) {
    const path = normalizePath(rawPath);
    if (spec === null) {
      for (const p of Object.keys(fs)) if (isInside(p, path)) delete fs[p];
      continue;
    }
    const owner = spec.owner ?? 'root';
    const ownerHome = users[owner]?.home;
    for (let parent = dirname(path); !fs[parent]; parent = dirname(parent)) {
      // Un dossier intermédiaire créé dans le dossier personnel appartient à son titulaire.
      const inHome = ownerHome !== undefined && owner !== 'root' && isInside(parent, ownerHome);
      fs[parent] = inHome
        ? dir(owner, users[owner]?.group ?? owner, 0o755, t)
        : dir('root', 'root', 0o755, t);
    }
    const group = spec.group ?? users[owner]?.group ?? 'root';
    const mtime = spec.mtime ?? now - 3_600_000;
    if (spec.type === 'dir') {
      fs[path] = dir(owner, group, parseMode(spec.mode, 0o755), mtime);
    } else if (spec.type === 'symlink') {
      fs[path] = { ...link(spec.target ?? '/', mtime), owner, group };
    } else {
      fs[path] = {
        ...file(owner, group, parseMode(spec.mode, 0o644), mtime, spec.content ?? ''),
        ...(spec.size !== undefined ? { size: parseSize(spec.size) } : {}),
      };
    }
  }

  // --- Disques ------------------------------------------------------------------------
  const diskSpecs: DiskSpec[] = [
    { mount: '/', size: '20G', used: '3.2G', device: '/dev/sda1' },
    ...(options.disks ?? []).filter((d) => d.mount !== '/'),
  ];
  const customRoot = options.disks?.find((d) => d.mount === '/');
  if (customRoot) diskSpecs[0] = { device: '/dev/sda1', ...customRoot };
  let nextDevice = 3;
  const realDisks: Disk[] = diskSpecs.map((d) => ({
    device: d.device ?? `/dev/sda${nextDevice++}`,
    mount: normalizePath(d.mount),
    fstype: d.fstype ?? 'ext4',
    size: parseSize(d.size),
    baseUsed: parseSize(d.used),
  }));
  const virtualDisks: Disk[] = [
    { device: 'udev', mount: '/dev', fstype: 'devtmpfs', size: parseSize('962M'), baseUsed: 0 },
    {
      device: 'tmpfs',
      mount: '/run',
      fstype: 'tmpfs',
      size: parseSize('197M'),
      baseUsed: parseSize('592K'),
    },
    { device: 'tmpfs', mount: '/dev/shm', fstype: 'tmpfs', size: parseSize('984M'), baseUsed: 0 },
    { device: 'tmpfs', mount: '/run/lock', fstype: 'tmpfs', size: parseSize('5M'), baseUsed: 0 },
  ];
  const ordered = [
    virtualDisks[0],
    virtualDisks[1],
    realDisks[0],
    virtualDisks[2],
    virtualDisks[3],
    ...realDisks.slice(1),
  ].filter((d): d is Disk => d !== undefined);
  // L'occupation demandée inclut les fichiers simulés : on retire leur taille de la part fixe.
  const probe = { disks: ordered, fs } as unknown as Machine;
  const fileBytes = new Map<Disk, number>();
  for (const [path, node] of Object.entries(fs)) {
    if (node.type !== 'file') continue;
    const disk = diskForPath(probe, path);
    if (disk) fileBytes.set(disk, (fileBytes.get(disk) ?? 0) + fileSize(node));
  }
  const disks = ordered.map((d) => ({
    ...d,
    baseUsed: Math.max(0, d.baseUsed - (fileBytes.get(d) ?? 0)),
  }));
  const fstab = [
    '# /etc/fstab: static file system information.',
    '#',
    "# Use 'blkid' to print the universally unique identifier for a",
    '# device; this may be used with UUID= as a more robust way to name devices',
    '# that works even if disks are added and removed. See fstab(5).',
    '#',
    '# systemd generates mount units based on this file, see systemd.mount(5).',
    "# Please run 'systemctl daemon-reload' after making changes here.",
    '#',
    '# <file system> <mount point>   <type>  <options>       <dump>  <pass>',
    ...realDisks.flatMap((d) => [
      `# ${d.mount} was on ${d.device} during installation`,
      `UUID=${deviceUuid(hostname, d.device)} ${d.mount.padEnd(15)} ${d.fstype.padEnd(7)} ${
        d.mount === '/' ? 'errors=remount-ro' : 'defaults         '
      } 0       ${d.mount === '/' ? 1 : 2}`,
    ]),
  ].join('\n');
  if (!options.files?.['/etc/fstab'])
    fs['/etc/fstab'] = file('root', 'root', 0o644, t, `${fstab}\n`);

  // --- Processus, services et journaux ----------------------------------------------------
  const processes: Process[] = [
    {
      pid: 1,
      ppid: 0,
      user: 'root',
      command: '/sbin/init',
      cpu: 0,
      rss: 12_288,
      vsz: 167_740,
      tty: '?',
      stat: 'Ss',
      start: bootTime,
    },
    {
      pid: 2,
      ppid: 0,
      user: 'root',
      command: '[kthreadd]',
      cpu: 0,
      rss: 0,
      vsz: 0,
      tty: '?',
      stat: 'S',
      start: bootTime,
    },
    {
      pid: 248,
      ppid: 1,
      user: 'root',
      command: '/lib/systemd/systemd-journald',
      cpu: 0,
      rss: 15_360,
      vsz: 48_444,
      tty: '?',
      stat: 'Ss',
      start: bootTime,
    },
    {
      pid: 271,
      ppid: 1,
      user: 'root',
      command: '/lib/systemd/systemd-udevd',
      cpu: 0,
      rss: 6_912,
      vsz: 25_492,
      tty: '?',
      stat: 'Ss',
      start: bootTime,
    },
    {
      pid: 512,
      ppid: 1,
      user: 'root',
      command: '/sbin/agetty -o -p -- \\u --noclear - linux',
      cpu: 0,
      rss: 1_920,
      vsz: 5_880,
      tty: 'tty1',
      stat: 'Ss+',
      start: bootTime,
    },
  ];
  const services: Record<string, ServiceState> = {};
  const logs: Record<string, LogLine[]> = {};
  let pid = 600;
  for (const [name, spec] of Object.entries(serviceSpecs)) {
    const def = SERVICE_CATALOG[name];
    if (!def) continue;
    const enabled = spec.enabled ?? true;
    const startedAt = bootTime + 4_000;
    if (spec.state === 'active') {
      processes.push(...serviceProcesses(def, pid, startedAt));
      services[name] = {
        name,
        description: def.description,
        state: 'active',
        enabled,
        failure: null,
        mainPid: pid,
        since: startedAt,
        ports: def.ports,
      };
      logs[name] = startLogLines(def, startedAt);
      pid += 20;
    } else {
      let failure: ServiceFailure | null = null;
      if (spec.failure === 'no-space-left') failure = { kind: 'no-space-left', path: '/var' };
      if (spec.failure === 'port-in-use')
        failure = { kind: 'port-in-use', port: def.ports[0] ?? 80 };
      const since = spec.state === 'failed' ? now - 72 * 60_000 : startedAt;
      services[name] = {
        name,
        description: def.description,
        state: spec.state,
        enabled,
        failure,
        mainPid: null,
        since,
        ports: def.ports,
      };
      logs[name] =
        spec.state === 'failed' && failure ? failureLogLines(def, failure, since, pid + 3) : [];
      pid += 20;
    }
  }

  // --- Session ----------------------------------------------------------------------------
  const sessionUser = options.session?.user ?? specs[0]?.name ?? 'root';
  const account = users[sessionUser];
  if (!account) throw new Error(`Compte inconnu pour la session : ${sessionUser}`);
  const cwd = options.session?.cwd ?? account.home;
  const isRoot = sessionUser === 'root';
  processes.push(
    {
      pid: 1180,
      ppid: 600,
      user: 'root',
      command: `sshd: ${sessionUser} [priv]`,
      cpu: 0,
      rss: 10_752,
      vsz: 17_548,
      tty: '?',
      stat: 'Ss',
      start: now - 300_000,
    },
    {
      pid: 1186,
      ppid: 1180,
      user: sessionUser,
      command: `sshd: ${sessionUser}@pts/0`,
      cpu: 0,
      rss: 6_400,
      vsz: 17_808,
      tty: '?',
      stat: 'S',
      start: now - 300_000,
    },
    {
      pid: 1187,
      ppid: 1186,
      user: sessionUser,
      command: '-bash',
      cpu: 0,
      rss: 5_120,
      vsz: 8_572,
      tty: 'pts/0',
      stat: 'Ss',
      start: now - 300_000,
    },
  );

  let extraPid = 1500;
  for (const extra of options.processes ?? []) {
    processes.push({
      pid: extraPid,
      ppid: 1,
      user: extra.user,
      command: extra.command,
      cpu: extra.cpu ?? 0,
      rss: extra.rss ?? 4096,
      vsz: (extra.rss ?? 4096) * 3,
      tty: '?',
      stat: (extra.cpu ?? 0) > 50 ? 'R' : 'S',
      start: now - 5 * 3_600_000,
    });
    extraPid += 37;
  }

  const machine: Machine = {
    hostname,
    os: 'debian',
    fs,
    users,
    groups,
    services,
    packages,
    processes,
    interfaces: [
      { name: 'lo', mac: '00:00:00:00:00:00', ipv4: '127.0.0.1/8', up: true, mtu: 65536 },
      {
        name: iface,
        mac: macFor(hostname),
        ipv4: `${address}/${prefix}`,
        up: options.network?.down !== true,
        mtu: 1500,
        ...(options.network?.dhcp ? { dhcp: true } : {}),
      },
    ],
    routes: [
      ...(options.network?.noGateway ? [] : [{ destination: 'default', gateway, device: iface }]),
      { destination: `${networkAddress(address, prefix)}/${prefix}`, gateway: null, device: iface },
    ],
    dns: { servers: dnsServers, search: [domain] },
    // Hôtes du site qui répondent : la passerelle, les serveurs DNS, ceux de la mission.
    neighbors: [
      { address: gateway, name: 'routeur', mac: macFor(`gw-${gateway}`) },
      ...dnsServers.map((ip, i) => ({
        address: ip,
        name: i === 0 ? 'srv-dc01' : `srv-dc0${i + 1}`,
        mac: macFor(`dns-${ip}`),
      })),
      ...(options.network?.neighbors ?? []).map((n) => ({
        address: n.address,
        ...(n.name ? { name: n.name } : {}),
        mac: macFor(`n-${n.address}`),
      })),
    ].filter((n, i, all) => all.findIndex((m) => m.address === n.address) === i),
    disks,
    logs,
    crontabs: {},
    session: {
      user: sessionUser,
      cwd,
      previousCwd: null,
      sudoAuthenticated: false,
      lastExitCode: 0,
      env: {
        HOME: account.home,
        USER: sessionUser,
        LOGNAME: sessionUser,
        SHELL: account.shell,
        PATH: isRoot
          ? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
          : '/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games',
        PWD: cwd,
        LANG: 'fr_FR.UTF-8',
        TERM: 'xterm-256color',
        HOSTNAME: hostname,
      },
    },
    history: [],
    bootTime,
    nextPid: 2200,
    // La base de locate est reconstruite chaque nuit par cron.daily (vers 6 h 25).
    locateDbTime: now - 3 * 3_600_000,
  };
  return syncAccountFiles(machine, now);
}

/**
 * Réécrit /etc/passwd, /etc/group et /etc/shadow d'après les comptes de la machine
 * (à appeler après useradd, usermod, groupadd…).
 *
 * @param machine - Machine simulée.
 * @param now - Date courante (ms).
 * @returns La machine avec des fichiers de comptes cohérents.
 */
export function syncAccountFiles(machine: Machine, now: number): Machine {
  const fs: Record<string, FsNode> = { ...machine.fs };
  fs['/etc/passwd'] = file('root', 'root', 0o644, now, renderPasswd(machine));
  fs['/etc/group'] = file('root', 'root', 0o644, now, renderGroup(machine));
  fs['/etc/shadow'] = file('root', 'shadow', 0o640, now, renderShadow(machine, now));
  return { ...machine, fs };
}

/**
 * Adresse réseau d'une adresse IPv4 et de son préfixe.
 *
 * @param address - Adresse IPv4 (`192.168.10.20`).
 * @param prefix - Longueur du préfixe (`24`).
 * @returns L'adresse du réseau (`192.168.10.0`).
 */
export function networkAddress(address: string, prefix: number): string {
  const value = address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const net = (value & mask) >>> 0;
  return [24, 16, 8, 0].map((shift) => (net >>> shift) & 255).join('.');
}
