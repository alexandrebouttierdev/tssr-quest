/**
 * Dépôt APT simulé : les paquets Debian 12 (bookworm) que le simulateur sait installer.
 *
 * Les versions et descriptions reprennent celles de l'archive Debian ; les descriptions
 * restent en anglais, comme sur un vrai système sans fichiers de traduction.
 */

import type { AptSuite } from './types';

/** Fichier (ou dossier) installé par un paquet. */
export interface PackageFile {
  readonly path: string;
  readonly type: 'file' | 'dir';
  readonly mode: number;
  readonly content?: string;
  /** Taille déclarée (octets) d'un binaire. */
  readonly size?: number;
  readonly owner?: string;
  readonly group?: string;
  /** Fichier de configuration : conservé par `apt remove`, supprimé par `apt purge`. */
  readonly config?: boolean;
}

/** Paquet du dépôt. */
export interface PackageDefinition {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly section: string;
  readonly priority: 'required' | 'important' | 'standard' | 'optional';
  /** Paquet essentiel : APT refuse de l'enlever. */
  readonly essential?: boolean;
  /** Taille une fois installé (Kio). */
  readonly installedSize: number;
  /** Taille du .deb à télécharger (octets). */
  readonly downloadSize: number;
  readonly depends: readonly string[];
  readonly suite: AptSuite;
  /** Programmes installés dans /usr/bin. */
  readonly bin?: readonly string[];
  /** Programmes installés dans /usr/sbin. */
  readonly sbin?: readonly string[];
  /** Service systemd fourni (clé de `SERVICE_CATALOG`). */
  readonly service?: string;
  /** Autres fichiers installés. */
  readonly files?: readonly PackageFile[];
  /** Présent sur le serveur de base après l'installation de Debian. */
  readonly base?: boolean;
}

/** Raccourci de déclaration d'un paquet. */
function pkg(
  name: string,
  version: string,
  description: string,
  details: Omit<PackageDefinition, 'name' | 'version' | 'description' | 'suite' | 'priority'> & {
    readonly suite?: AptSuite;
    readonly priority?: PackageDefinition['priority'];
  },
): PackageDefinition {
  return { name, version, description, suite: 'bookworm', priority: 'optional', ...details };
}

/** Raccourci pour un fichier de configuration. */
function conf(path: string, content: string): PackageFile {
  return { path, type: 'file', mode: 0o644, content, config: true };
}

/** Raccourci pour un dossier. */
function folder(path: string, mode = 0o755, owner = 'root', group = 'root'): PackageFile {
  return { path, type: 'dir', mode, owner, group };
}

const APACHE_CONF = `ServerRoot "/etc/apache2"
DefaultRuntimeDir \${APACHE_RUN_DIR}
PidFile \${APACHE_PID_FILE}
Timeout 300
KeepAlive On
User \${APACHE_RUN_USER}
Group \${APACHE_RUN_GROUP}
ErrorLog \${APACHE_LOG_DIR}/error.log
LogLevel warn
IncludeOptional mods-enabled/*.load
IncludeOptional mods-enabled/*.conf
Include ports.conf
IncludeOptional conf-enabled/*.conf
IncludeOptional sites-enabled/*.conf
`;

const APACHE_PORTS = `Listen 80

<IfModule ssl_module>
\tListen 443
</IfModule>
`;

const APACHE_DEFAULT_SITE = `<VirtualHost *:80>
\tServerAdmin webmaster@localhost
\tDocumentRoot /var/www/html

\tErrorLog \${APACHE_LOG_DIR}/error.log
\tCustomLog \${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
`;

/** Page d'accueil posée par le paquet apache2 (version courte). */
export const APACHE_DEFAULT_PAGE = `<!DOCTYPE html>
<html>
<head><title>Apache2 Debian Default Page: It works</title></head>
<body>
<h1>It works!</h1>
<p>This is the default welcome page used to test the correct operation of the Apache2 server after installation on Debian systems.</p>
</body>
</html>
`;

const NGINX_DEFAULT_SITE = `server {
\tlisten 80 default_server;
\tlisten [::]:80 default_server;
\troot /var/www/html;
\tindex index.html index.htm index.nginx-debian.html;
\tserver_name _;
\tlocation / {
\t\ttry_files $uri $uri/ =404;
\t}
}
`;

/** Tous les paquets du dépôt simulé, indexés par nom. */
export const PACKAGE_CATALOG: Readonly<Record<string, PackageDefinition>> = Object.fromEntries(
  [
    // --- Système de base ---------------------------------------------------------------
    pkg('apt', '2.6.1', 'commandline package manager', {
      section: 'admin',
      priority: 'important',
      installedSize: 4_266,
      downloadSize: 1_404_416,
      depends: ['dpkg'],
      bin: ['apt', 'apt-get'],
      base: true,
    }),
    pkg('bash', '5.2.15-2+b7', 'GNU Bourne Again SHell', {
      section: 'shells',
      priority: 'required',
      essential: true,
      installedSize: 7_164,
      downloadSize: 1_490_432,
      depends: [],
      base: true,
    }),
    pkg('coreutils', '9.1-1', 'GNU core utilities', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 18_062,
      downloadSize: 2_871_296,
      depends: [],
      base: true,
    }),
    pkg('dpkg', '1.21.22', 'Debian package management system', {
      section: 'admin',
      priority: 'required',
      essential: true,
      installedSize: 6_600,
      downloadSize: 1_551_360,
      depends: [],
      bin: ['dpkg'],
      base: true,
    }),
    pkg('findutils', '4.9.0-4', 'utilities for finding files--find, xargs', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 1_660,
      downloadSize: 645_120,
      depends: [],
      base: true,
    }),
    pkg('grep', '3.8-5', 'GNU grep, egrep and fgrep', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 1_262,
      downloadSize: 302_080,
      depends: [],
      base: true,
    }),
    pkg('gzip', '1.12-1', 'GNU compression utilities', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 245,
      downloadSize: 141_312,
      depends: [],
      base: true,
    }),
    pkg('sed', '4.9-1', 'GNU stream editor for filtering/transforming text', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 885,
      downloadSize: 310_272,
      depends: [],
      base: true,
    }),
    pkg('tar', '1.34+dfsg-1.2+deb12u1', 'GNU version of the tar archiving utility', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 3_152,
      downloadSize: 924_672,
      depends: [],
      base: true,
    }),
    pkg('util-linux', '2.38.1-5+deb12u1', 'miscellaneous system utilities', {
      section: 'utils',
      priority: 'required',
      essential: true,
      installedSize: 4_822,
      downloadSize: 1_116_160,
      depends: [],
      base: true,
    }),
    pkg('systemd', '252.31-1~deb12u1', 'system and service manager', {
      section: 'admin',
      priority: 'important',
      installedSize: 11_190,
      downloadSize: 3_027_968,
      depends: [],
      bin: ['systemctl', 'journalctl'],
      base: true,
    }),
    pkg('sudo', '1.9.13p3-1+deb12u1', 'Provide limited super user privileges to specific users', {
      section: 'admin',
      installedSize: 6_199,
      downloadSize: 1_888_256,
      depends: [],
      base: true,
    }),
    pkg('procps', '2:4.0.2-3', '/proc file system utilities', {
      section: 'admin',
      priority: 'important',
      installedSize: 2_300,
      downloadSize: 727_040,
      depends: [],
      bin: ['ps', 'top', 'free', 'uptime', 'kill'],
      base: true,
    }),
    pkg('iproute2', '6.1.0-3', 'networking and traffic control tools', {
      section: 'net',
      priority: 'important',
      installedSize: 3_558,
      downloadSize: 1_068_032,
      depends: [],
      bin: ['ip', 'ss'],
      base: true,
    }),
    pkg('iputils-ping', '3:20221126-1', 'Tools to test the reachability of network hosts', {
      section: 'net',
      priority: 'important',
      installedSize: 115,
      downloadSize: 47_104,
      depends: [],
      bin: ['ping'],
      base: true,
    }),
    pkg('ifupdown', '0.8.41', 'high level tools to configure network interfaces', {
      section: 'admin',
      priority: 'important',
      installedSize: 232,
      downloadSize: 64_512,
      depends: [],
      sbin: ['ifup', 'ifdown', 'ifquery'],
      base: true,
    }),
    pkg('isc-dhcp-client', '4.4.3-P1-2', 'DHCP client for automatically obtaining an IP address', {
      section: 'net',
      priority: 'important',
      installedSize: 2_869,
      downloadSize: 1_078_272,
      depends: [],
      sbin: ['dhclient'],
      base: true,
    }),
    pkg('less', '590-2.1~deb12u2', 'pager program similar to more', {
      section: 'text',
      priority: 'important',
      installedSize: 683,
      downloadSize: 132_096,
      depends: [],
      bin: ['less'],
      base: true,
    }),
    pkg('man-db', '2.11.2-2', 'tools for reading manual pages', {
      section: 'doc',
      priority: 'standard',
      installedSize: 2_851,
      downloadSize: 1_388_544,
      depends: [],
      bin: ['man', 'apropos', 'whatis'],
      base: true,
    }),
    pkg('vim', '2:9.0.1378-2', 'Vi IMproved - enhanced vi editor', {
      section: 'editors',
      installedSize: 3_864,
      downloadSize: 1_543_168,
      depends: [],
      bin: ['vim'],
      base: true,
    }),
    pkg('nano', '7.2-1+deb12u1', 'small, friendly text editor inspired by Pico', {
      section: 'editors',
      priority: 'important',
      installedSize: 2_754,
      downloadSize: 689_152,
      depends: [],
      bin: ['nano'],
      base: true,
    }),
    pkg('cron', '3.0pl1-162', 'process scheduling daemon', {
      section: 'admin',
      priority: 'important',
      installedSize: 238,
      downloadSize: 75_776,
      depends: [],
      bin: ['crontab'],
      sbin: ['cron'],
      service: 'cron',
      base: true,
    }),
    pkg('rsyslog', '8.2302.0-1', 'reliable system and kernel logging daemon', {
      section: 'admin',
      priority: 'important',
      installedSize: 2_065,
      downloadSize: 704_512,
      depends: [],
      service: 'rsyslog',
      base: true,
    }),
    pkg(
      'openssh-server',
      '1:9.2p1-2+deb12u3',
      'secure shell (SSH) server, for secure access from remote machines',
      {
        section: 'net',
        installedSize: 1_879,
        downloadSize: 456_704,
        depends: ['openssh-client'],
        sbin: ['sshd'],
        service: 'ssh',
        base: true,
      },
    ),
    pkg(
      'openssh-client',
      '1:9.2p1-2+deb12u3',
      'secure shell (SSH) client, for secure access to remote machines',
      {
        section: 'net',
        priority: 'standard',
        installedSize: 5_011,
        downloadSize: 990_208,
        depends: [],
        bin: ['ssh', 'scp'],
        base: true,
      },
    ),
    pkg('curl', '7.88.1-10+deb12u8', 'command line tool for transferring data with URL syntax', {
      section: 'web',
      installedSize: 500,
      downloadSize: 315_392,
      depends: ['libcurl4'],
      bin: ['curl'],
      base: true,
    }),
    pkg(
      'libcurl4',
      '7.88.1-10+deb12u8',
      'easy-to-use client-side URL transfer library (OpenSSL flavour)',
      {
        section: 'libs',
        installedSize: 999,
        downloadSize: 390_144,
        depends: ['libssl3'],
        base: true,
      },
    ),
    pkg('openssl', '3.0.15-1~deb12u1', 'Secure Sockets Layer toolkit - cryptographic utility', {
      section: 'utils',
      installedSize: 2_280,
      downloadSize: 1_427_456,
      depends: ['libssl3'],
      bin: ['openssl'],
      base: true,
    }),
    pkg('libssl3', '3.0.15-1~deb12u1', 'Secure Sockets Layer toolkit - shared libraries', {
      section: 'libs',
      priority: 'important',
      installedSize: 6_219,
      downloadSize: 2_026_496,
      depends: [],
      base: true,
    }),
    pkg('ca-certificates', '20230311+deb12u1', 'Common CA certificates', {
      section: 'misc',
      priority: 'standard',
      installedSize: 386,
      downloadSize: 157_696,
      depends: ['openssl'],
      base: true,
    }),
    pkg('tzdata', '2025b-0+deb12u1', 'time zone and daylight-saving time data', {
      section: 'localization',
      priority: 'required',
      installedSize: 3_380,
      downloadSize: 262_144,
      depends: [],
      base: true,
    }),
    pkg('zip', '3.0-13', 'Archiver for .zip files', {
      section: 'utils',
      installedSize: 616,
      downloadSize: 234_496,
      depends: [],
      bin: ['zip'],
      base: true,
    }),
    pkg('unzip', '6.0-28', 'De-archiver for .zip files', {
      section: 'utils',
      installedSize: 529,
      downloadSize: 169_984,
      depends: [],
      bin: ['unzip'],
      base: true,
    }),
    pkg('locate', '4.9.0-4', 'maintain and query an index of a directory tree', {
      section: 'utils',
      installedSize: 263,
      downloadSize: 255_488,
      depends: ['findutils'],
      bin: ['locate', 'updatedb'],
      base: true,
    }),
    pkg('file', '1:5.44-3', 'Recognize the type of data in a file using "magic" numbers', {
      section: 'utils',
      priority: 'standard',
      installedSize: 103,
      downloadSize: 43_008,
      depends: [],
      bin: ['file'],
      base: true,
    }),

    // --- Paquets installables ----------------------------------------------------------
    pkg('apache2', '2.4.62-1~deb12u2', 'Apache HTTP Server', {
      section: 'httpd',
      installedSize: 465,
      downloadSize: 224_256,
      depends: ['apache2-bin', 'apache2-data', 'apache2-utils'],
      sbin: ['apache2ctl', 'a2ensite', 'a2dissite', 'a2enmod', 'a2dismod'],
      service: 'apache2',
      files: [
        folder('/etc/apache2'),
        conf('/etc/apache2/apache2.conf', APACHE_CONF),
        conf('/etc/apache2/ports.conf', APACHE_PORTS),
        folder('/etc/apache2/sites-available'),
        folder('/etc/apache2/sites-enabled'),
        conf('/etc/apache2/sites-available/000-default.conf', APACHE_DEFAULT_SITE),
        folder('/var/log/apache2', 0o750, 'root', 'adm'),
        folder('/var/www'),
        folder('/var/www/html'),
        {
          path: '/var/www/html/index.html',
          type: 'file',
          mode: 0o644,
          content: APACHE_DEFAULT_PAGE,
        },
      ],
    }),
    pkg('apache2-bin', '2.4.62-1~deb12u2', 'Apache HTTP Server (modules and other binary files)', {
      section: 'httpd',
      installedSize: 5_380,
      downloadSize: 1_357_824,
      depends: ['libapr1', 'libaprutil1'],
      sbin: ['apache2'],
    }),
    pkg('apache2-data', '2.4.62-1~deb12u2', 'Apache HTTP Server (common files)', {
      section: 'httpd',
      installedSize: 846,
      downloadSize: 164_864,
      depends: [],
    }),
    pkg(
      'apache2-utils',
      '2.4.62-1~deb12u2',
      'Apache HTTP Server (utility programs for web servers)',
      {
        section: 'httpd',
        installedSize: 563,
        downloadSize: 210_944,
        depends: ['libapr1', 'libaprutil1'],
        bin: ['htpasswd', 'ab'],
      },
    ),
    pkg('libapr1', '1.7.2-3+deb12u1', 'Apache Portable Runtime Library', {
      section: 'libs',
      installedSize: 289,
      downloadSize: 102_400,
      depends: [],
    }),
    pkg('libaprutil1', '1.6.3-1', 'Apache Portable Runtime Utility Library', {
      section: 'libs',
      installedSize: 286,
      downloadSize: 89_088,
      depends: ['libapr1'],
    }),
    pkg('nginx', '1.22.1-9+deb12u1', 'small, powerful, scalable web/proxy server', {
      section: 'httpd',
      installedSize: 1_276,
      downloadSize: 537_600,
      depends: ['nginx-common'],
      sbin: ['nginx'],
      service: 'nginx',
      files: [
        folder('/etc/nginx'),
        folder('/etc/nginx/sites-available'),
        folder('/etc/nginx/sites-enabled'),
        conf('/etc/nginx/sites-available/default', NGINX_DEFAULT_SITE),
        folder('/var/log/nginx', 0o755, 'root', 'adm'),
        folder('/var/www'),
        folder('/var/www/html'),
      ],
    }),
    pkg(
      'nginx-common',
      '1.22.1-9+deb12u1',
      'small, powerful, scalable web/proxy server - common files',
      {
        section: 'httpd',
        installedSize: 345,
        downloadSize: 113_664,
        depends: [],
      },
    ),
    pkg(
      'mariadb-server',
      '1:10.11.6-0+deb12u1',
      'MariaDB database server (metapackage depending on the latest version)',
      {
        section: 'database',
        installedSize: 80,
        downloadSize: 39_936,
        depends: ['mariadb-client', 'mariadb-common'],
        sbin: ['mariadbd'],
        service: 'mariadb',
        files: [
          folder('/etc/mysql'),
          conf(
            '/etc/mysql/my.cnf',
            '[client-server]\n!includedir /etc/mysql/conf.d/\n!includedir /etc/mysql/mariadb.conf.d/\n',
          ),
        ],
      },
    ),
    pkg('mariadb-client', '1:10.11.6-0+deb12u1', 'MariaDB database client binaries', {
      section: 'database',
      installedSize: 34_480,
      downloadSize: 2_983_936,
      depends: ['mariadb-common'],
      bin: ['mariadb', 'mysql'],
    }),
    pkg('mariadb-common', '1:10.11.6-0+deb12u1', 'MariaDB common configuration files', {
      section: 'database',
      installedSize: 68,
      downloadSize: 32_768,
      depends: [],
    }),
    pkg(
      'php8.2',
      '8.2.26-1~deb12u1',
      'server-side, HTML-embedded scripting language (metapackage)',
      {
        section: 'php',
        installedSize: 85,
        downloadSize: 41_984,
        depends: ['libapache2-mod-php8.2'],
      },
    ),
    pkg(
      'libapache2-mod-php8.2',
      '8.2.26-1~deb12u1',
      'server-side, HTML-embedded scripting language (Apache 2 module)',
      {
        section: 'httpd',
        installedSize: 5_118,
        downloadSize: 1_755_136,
        depends: ['apache2'],
      },
    ),
    pkg('php', '2:8.2+93', 'server-side, HTML-embedded scripting language (default)', {
      section: 'php',
      installedSize: 13,
      downloadSize: 4_096,
      depends: ['php8.2'],
    }),
    pkg('htop', '3.2.2-2', 'interactive processes viewer', {
      section: 'utils',
      installedSize: 391,
      downloadSize: 155_648,
      depends: [],
      bin: ['htop'],
    }),
    pkg('tree', '2.1.0-1', 'displays an indented directory tree, in color', {
      section: 'utils',
      installedSize: 115,
      downloadSize: 49_152,
      depends: [],
      bin: ['tree'],
    }),
    pkg('git', '1:2.39.5-0+deb12u1', 'fast, scalable, distributed revision control system', {
      section: 'vcs',
      installedSize: 39_131,
      downloadSize: 7_249_920,
      depends: [],
      bin: ['git'],
    }),
    pkg('rsync', '3.2.7-1+deb12u2', 'fast, versatile, remote (and local) file-copying tool', {
      section: 'net',
      installedSize: 784,
      downloadSize: 417_792,
      depends: [],
      bin: ['rsync'],
    }),
    pkg('net-tools', '2.10-0.1', 'NET-3 networking toolkit', {
      section: 'net',
      installedSize: 1_010,
      downloadSize: 247_808,
      depends: [],
      bin: ['netstat'],
      sbin: ['ifconfig', 'route', 'arp'],
    }),
    pkg('wget', '1.21.3-1+b2', 'retrieves files from the web', {
      section: 'web',
      priority: 'standard',
      installedSize: 3_664,
      downloadSize: 985_088,
      depends: [],
      bin: ['wget'],
    }),
    pkg('nmap', '7.93+dfsg1-1', 'The Network Mapper', {
      section: 'net',
      installedSize: 4_558,
      downloadSize: 1_916_928,
      depends: [],
      bin: ['nmap'],
    }),
    pkg('tcpdump', '4.99.3-1', 'command-line network traffic analyzer', {
      section: 'net',
      installedSize: 1_221,
      downloadSize: 492_544,
      depends: [],
      bin: ['tcpdump'],
    }),
    pkg('ufw', '0.36.2-1', 'program for managing a Netfilter firewall', {
      section: 'admin',
      installedSize: 868,
      downloadSize: 172_032,
      depends: [],
      sbin: ['ufw'],
    }),
    pkg('fail2ban', '1.0.2-2', 'ban hosts that cause multiple authentication errors', {
      section: 'net',
      installedSize: 2_209,
      downloadSize: 450_560,
      depends: [],
      bin: ['fail2ban-client'],
    }),
    pkg('lvm2', '2.03.16-2', 'Linux Logical Volume Manager', {
      section: 'admin',
      installedSize: 3_960,
      downloadSize: 1_536_000,
      depends: [],
      sbin: ['pvcreate', 'vgcreate', 'lvcreate', 'lvextend', 'pvs', 'vgs', 'lvs'],
      base: true,
    }),
  ].map((p) => [p.name, p]),
);

/** Dépôt « officiel » d'une suite, tel qu'il apparaît dans sources.list. */
export const SUITE_MIRRORS: Readonly<Record<AptSuite, readonly string[]>> = {
  bookworm: ['http://deb.debian.org/debian', 'http://ftp.fr.debian.org/debian'],
  'bookworm-updates': ['http://deb.debian.org/debian', 'http://ftp.fr.debian.org/debian'],
  'bookworm-security': [
    'http://security.debian.org/debian-security',
    'http://deb.debian.org/debian-security',
  ],
};

/** Nom d'archive affiché par `apt list` (`stable`, `stable-security`…). */
export const SUITE_ARCHIVE: Readonly<Record<AptSuite, string>> = {
  bookworm: 'stable',
  'bookworm-updates': 'stable-updates',
  'bookworm-security': 'stable-security',
};

/**
 * Fichiers installés par un paquet : programmes, fichiers propres, documentation.
 *
 * @param def - Paquet du catalogue.
 * @returns La liste ordonnée des fichiers (dossiers parents compris pour la doc).
 */
export function packageFiles(def: PackageDefinition): PackageFile[] {
  const binary = (path: string): PackageFile => ({
    path,
    type: 'file',
    mode: 0o755,
    size: Math.max(12_000, Math.round((def.installedSize * 1024) / 3)),
  });
  return [
    ...(def.bin ?? []).map((b) => binary(`/usr/bin/${b}`)),
    ...(def.sbin ?? []).map((b) => binary(`/usr/sbin/${b}`)),
    ...(def.files ?? []),
    folder(`/usr/share/doc/${def.name}`),
    {
      path: `/usr/share/doc/${def.name}/copyright`,
      type: 'file',
      mode: 0o644,
      content: `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nUpstream-Name: ${def.name}\n`,
    },
    {
      path: `/usr/share/doc/${def.name}/changelog.Debian.gz`,
      type: 'file',
      mode: 0o644,
      size: 2_048,
    },
  ];
}
