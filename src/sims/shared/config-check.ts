/**
 * Vérification des fichiers de configuration, comme le font `apache2ctl configtest`
 * et `sshd -t` avant de (re)démarrer un service. Une configuration invalide empêche le
 * service de démarrer, avec les messages réels du programme dans le journal.
 */
import { readFile, statPath } from './fs';
import type { Machine } from './types';

/** Résultat d'une vérification. */
export interface ConfigCheck {
  readonly ok: boolean;
  /** Lignes d'erreur, telles que le programme les écrit. */
  readonly errors: readonly string[];
  /** Avertissements non bloquants (Apache : ServerName, DocumentRoot absent). */
  readonly warnings: readonly string[];
}

/** Directives Apache reconnues (cœur et modules activés sur Debian). */
const APACHE_DIRECTIVES = new Set(
  [
    'AccessFileName',
    'AddDefaultCharset',
    'AddHandler',
    'AddType',
    'Alias',
    'AllowOverride',
    'AuthName',
    'AuthType',
    'AuthUserFile',
    'CustomLog',
    'DefaultRuntimeDir',
    'DirectoryIndex',
    'DocumentRoot',
    'ErrorDocument',
    'ErrorLog',
    'Group',
    'Header',
    'HostnameLookups',
    'Include',
    'IncludeOptional',
    'KeepAlive',
    'KeepAliveTimeout',
    'Listen',
    'LogFormat',
    'LogLevel',
    'MaxKeepAliveRequests',
    'Options',
    'PidFile',
    'Redirect',
    'RedirectMatch',
    'Require',
    'RewriteCond',
    'RewriteEngine',
    'RewriteRule',
    'ServerAdmin',
    'ServerAlias',
    'ServerName',
    'ServerRoot',
    'ServerSignature',
    'ServerTokens',
    'SSLCertificateFile',
    'SSLCertificateKeyFile',
    'SSLEngine',
    'Timeout',
    'TraceEnable',
    'User',
    'Mutex',
  ].map((d) => d.toLowerCase()),
);

/** Sections Apache qui s'ouvrent et se ferment. */
const APACHE_SECTIONS = new Set([
  'virtualhost',
  'directory',
  'ifmodule',
  'files',
  'filesmatch',
  'location',
  'directorymatch',
  'ifdefine',
]);

/** Fichiers de configuration d'Apache, dans l'ordre où il les lit. */
function apacheFiles(machine: Machine): string[] {
  const enabled = Object.keys(machine.fs)
    .filter((p) => p.startsWith('/etc/apache2/sites-enabled/') && p.endsWith('.conf'))
    .sort();
  return ['/etc/apache2/apache2.conf', '/etc/apache2/ports.conf', ...enabled].filter(
    (p) => machine.fs[p] !== undefined,
  );
}

/**
 * Vérifie la configuration d'Apache (`apache2ctl configtest`).
 *
 * @param machine - Machine simulée.
 * @returns Les erreurs (bloquantes) et avertissements.
 */
export function checkApache(machine: Machine): ConfigCheck {
  const warnings: string[] = [];
  let globalServerName = false;
  for (const file of apacheFiles(machine)) {
    const read = readFile(machine, file, 'root');
    if (!read.ok) continue;
    const stack: { name: string; line: number }[] = [];
    const lines = read.value.split('\n');
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim();
      const number = index + 1;
      if (!line || line.startsWith('#')) continue;
      const close = /^<\/(\w+)\s*>$/.exec(line);
      if (close) {
        const name = (close[1] ?? '').toLowerCase();
        const open = stack.pop();
        if (!open || open.name !== name) {
          const expected = open ? `</${capitalize(open.name)}>` : 'nothing';
          return {
            ok: false,
            errors: [
              `AH00526: Syntax error on line ${number} of ${file}:`,
              `Expected ${expected} but saw </${close[1] ?? ''}>`,
            ],
            warnings,
          };
        }
        continue;
      }
      const section = /^<(\w+)(\s+[^>]*)?>$/.exec(line);
      if (section) {
        const name = (section[1] ?? '').toLowerCase();
        if (!APACHE_SECTIONS.has(name)) {
          return {
            ok: false,
            errors: [
              `AH00526: Syntax error on line ${number} of ${file}:`,
              `Invalid command '<${section[1] ?? ''}', perhaps misspelled or defined by a module not included in the server configuration`,
            ],
            warnings,
          };
        }
        stack.push({ name, line: number });
        continue;
      }
      const [directive = '', ...values] = line.split(/\s+/);
      if (!APACHE_DIRECTIVES.has(directive.toLowerCase())) {
        return {
          ok: false,
          errors: [
            `AH00526: Syntax error on line ${number} of ${file}:`,
            `Invalid command '${directive}', perhaps misspelled or defined by a module not included in the server configuration`,
          ],
          warnings,
        };
      }
      if (
        directive.toLowerCase() === 'servername' &&
        stack.length === 0 &&
        file.endsWith('apache2.conf')
      )
        globalServerName = true;
      if (directive.toLowerCase() === 'documentroot') {
        const root = (values[0] ?? '').replace(/^"|"$/g, '');
        const found = statPath(machine, root, 'root');
        if (!found.ok || found.value.node.type !== 'dir')
          warnings.push(`AH00112: Warning: DocumentRoot [${root}] does not exist`);
      }
    }
    const unclosed = stack.pop();
    if (unclosed) {
      return {
        ok: false,
        errors: [
          `AH00526: Syntax error on line ${unclosed.line} of ${file}:`,
          `<${capitalize(unclosed.name)}> was not closed.`,
        ],
        warnings,
      };
    }
  }
  if (!globalServerName) {
    warnings.push(
      "AH00558: apache2: Could not reliably determine the server's fully qualified domain name, using 127.0.1.1. Set the 'ServerName' directive globally to suppress this message",
    );
  }
  return { ok: true, errors: [], warnings };
}

/** Nom de section avec la casse d'Apache (`VirtualHost`). */
function capitalize(name: string): string {
  const known: Record<string, string> = {
    virtualhost: 'VirtualHost',
    directory: 'Directory',
    ifmodule: 'IfModule',
    files: 'Files',
    filesmatch: 'FilesMatch',
    location: 'Location',
    directorymatch: 'DirectoryMatch',
    ifdefine: 'IfDefine',
  };
  return known[name] ?? name;
}

/** Options de sshd_config reconnues, avec les valeurs permises le cas échéant. */
const SSHD_OPTIONS: Readonly<Record<string, readonly string[] | null>> = {
  include: null,
  port: null,
  listenaddress: null,
  addressfamily: ['any', 'inet', 'inet6'],
  permitrootlogin: ['yes', 'no', 'prohibit-password', 'without-password', 'forced-commands-only'],
  passwordauthentication: ['yes', 'no'],
  pubkeyauthentication: ['yes', 'no'],
  permitemptypasswords: ['yes', 'no'],
  kbdinteractiveauthentication: ['yes', 'no'],
  challengeresponseauthentication: ['yes', 'no'],
  usepam: ['yes', 'no'],
  x11forwarding: ['yes', 'no'],
  printmotd: ['yes', 'no'],
  printlastlog: ['yes', 'no'],
  tcpkeepalive: ['yes', 'no'],
  usedns: ['yes', 'no'],
  allowtcpforwarding: ['yes', 'no', 'all', 'local', 'remote'],
  acceptenv: null,
  subsystem: null,
  allowusers: null,
  allowgroups: null,
  denyusers: null,
  denygroups: null,
  maxauthtries: null,
  maxsessions: null,
  logingracetime: null,
  clientaliveinterval: null,
  clientalivecountmax: null,
  banner: null,
  authorizedkeysfile: null,
  hostkey: null,
  syslogfacility: null,
  loglevel: null,
  match: null,
};

/**
 * Vérifie /etc/ssh/sshd_config (`sshd -t`).
 *
 * @param machine - Machine simulée.
 * @returns Les erreurs, au format de sshd.
 */
export function checkSshd(machine: Machine): ConfigCheck {
  const file = '/etc/ssh/sshd_config';
  const read = readFile(machine, file, 'root');
  if (!read.ok) return { ok: true, errors: [], warnings: [] };
  const errors: string[] = [];
  let bad = 0;
  for (const [index, raw] of read.value.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [keyword = '', value = ''] = line.split(/\s+/);
    const key = keyword.toLowerCase();
    if (!(key in SSHD_OPTIONS)) {
      errors.push(`${file}: line ${index + 1}: Bad configuration option: ${keyword}`);
      bad++;
      continue;
    }
    if (key === 'port' && !(/^\d+$/.test(value) && Number(value) > 0 && Number(value) < 65536))
      return {
        ok: false,
        errors: [`${file} line ${index + 1}: Badly formatted port number.`],
        warnings: [],
      };
    const allowed = SSHD_OPTIONS[key];
    if (allowed && !allowed.includes(value.toLowerCase()))
      return {
        ok: false,
        errors: [`${file} line ${index + 1}: unsupported option "${value}".`],
        warnings: [],
      };
  }
  if (bad > 0) errors.push(`${file}: terminating, ${bad} bad configuration options`);
  return { ok: errors.length === 0, errors, warnings: [] };
}

/**
 * Vérifie la configuration d'un service, s'il en a une connue du simulateur.
 *
 * @param machine - Machine simulée.
 * @param service - Nom du service.
 * @returns Le résultat (toujours valide pour un service sans vérification).
 */
export function checkServiceConfig(machine: Machine, service: string): ConfigCheck {
  if (service === 'apache2') return checkApache(machine);
  if (service === 'ssh') return checkSshd(machine);
  return { ok: true, errors: [], warnings: [] };
}
