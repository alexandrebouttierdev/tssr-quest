/**
 * Catalogue des services connus du simulateur Debian : description systemd, paquet,
 * processus et messages de panne, tels qu'on les voit sur une Debian 12 (bookworm).
 */

/** Processus lancé par un service (le premier est le processus principal). */
export interface ServiceProcess {
  readonly user: string;
  readonly command: string;
  /** Mémoire résidente (Kio). */
  readonly rss: number;
  /** Mémoire virtuelle (Kio). */
  readonly vsz: number;
}

/** Définition d'un service du catalogue. */
export interface ServiceDefinition {
  readonly name: string;
  /** Description de l'unité (`The Apache HTTP Server`). */
  readonly description: string;
  readonly unitPath: string;
  readonly docs: readonly string[];
  /** Commande ExecStart. */
  readonly execStart: string;
  /** Identifiant du programme de démarrage dans le journal (`apachectl`). */
  readonly ident: string;
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly description: string;
  };
  readonly ports: readonly number[];
  readonly processes: readonly ServiceProcess[];
  /** Lignes écrites par le programme quand le disque est plein. */
  readonly noSpaceMessages: readonly string[];
  /** Lignes écrites par le programme quand le port est déjà pris. */
  readonly portInUseMessages: (port: number) => readonly string[];
}

/** Services disponibles, indexés par nom d'unité (sans `.service`). */
export const SERVICE_CATALOG: Readonly<Record<string, ServiceDefinition>> = {
  apache2: {
    name: 'apache2',
    description: 'The Apache HTTP Server',
    unitPath: '/lib/systemd/system/apache2.service',
    docs: ['https://httpd.apache.org/docs/2.4/'],
    execStart: '/usr/sbin/apachectl start',
    ident: 'apachectl',
    package: {
      name: 'apache2',
      version: '2.4.62-1~deb12u2',
      description: 'Apache HTTP Server',
    },
    ports: [80],
    processes: [
      { user: 'root', command: '/usr/sbin/apache2 -k start', rss: 9480, vsz: 6544 },
      { user: 'www-data', command: '/usr/sbin/apache2 -k start', rss: 4312, vsz: 1213312 },
      { user: 'www-data', command: '/usr/sbin/apache2 -k start', rss: 4312, vsz: 1213312 },
    ],
    noSpaceMessages: [
      "(28)No space left on device: AH00023: Couldn't create the proxy mutex",
      'AH00016: Configuration Failed',
    ],
    portInUseMessages: (port) => [
      `(98)Address already in use: AH00072: make_sock: could not bind to address [::]:${port}`,
      `(98)Address already in use: AH00072: make_sock: could not bind to address 0.0.0.0:${port}`,
      'no listening sockets available, shutting down',
      'AH00015: Unable to open logs',
    ],
  },
  nginx: {
    name: 'nginx',
    description: 'A high performance web server and a reverse proxy server',
    unitPath: '/lib/systemd/system/nginx.service',
    docs: ['man:nginx(8)'],
    execStart: "/usr/sbin/nginx -g 'daemon on; master_process on;'",
    ident: 'nginx',
    package: {
      name: 'nginx',
      version: '1.22.1-9+deb12u1',
      description: 'small, powerful, scalable web/proxy server',
    },
    ports: [80],
    processes: [
      {
        user: 'root',
        command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;',
        rss: 1620,
        vsz: 10364,
      },
      { user: 'www-data', command: 'nginx: worker process', rss: 3548, vsz: 11000 },
    ],
    noSpaceMessages: [
      'nginx: [emerg] write() to "/var/run/nginx.pid" failed (28: No space left on device)',
    ],
    portInUseMessages: (port) => [
      `nginx: [emerg] bind() to 0.0.0.0:${port} failed (98: Address already in use)`,
    ],
  },
  ssh: {
    name: 'ssh',
    description: 'OpenBSD Secure Shell server',
    unitPath: '/lib/systemd/system/ssh.service',
    docs: ['man:sshd(8)', 'man:sshd_config(5)'],
    execStart: '/usr/sbin/sshd -D $SSHD_OPTS',
    ident: 'sshd',
    package: {
      name: 'openssh-server',
      version: '1:9.2p1-2+deb12u3',
      description: 'secure shell (SSH) server, for secure access from remote machines',
    },
    ports: [22],
    processes: [
      {
        user: 'root',
        command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups',
        rss: 9216,
        vsz: 15432,
      },
    ],
    noSpaceMessages: ['error: Could not write pid file: No space left on device'],
    portInUseMessages: (port) => [
      `error: Bind to port ${port} on 0.0.0.0 failed: Address already in use.`,
      'fatal: Cannot bind any address.',
    ],
  },
  cron: {
    name: 'cron',
    description: 'Regular background program processing daemon',
    unitPath: '/lib/systemd/system/cron.service',
    docs: ['man:cron(8)'],
    execStart: '/usr/sbin/cron -f $EXTRA_OPTS',
    ident: 'cron',
    package: {
      name: 'cron',
      version: '3.0pl1-162',
      description: 'process scheduling daemon',
    },
    ports: [],
    processes: [{ user: 'root', command: '/usr/sbin/cron -f', rss: 2700, vsz: 6608 }],
    noSpaceMessages: ['(CRON) INFO (Cannot write pidfile: No space left on device)'],
    portInUseMessages: () => [],
  },
  mariadb: {
    name: 'mariadb',
    description: 'MariaDB 10.11.6 database server',
    unitPath: '/lib/systemd/system/mariadb.service',
    docs: ['man:mariadbd(8)', 'https://mariadb.com/kb/en/library/systemd/'],
    execStart: '/usr/sbin/mariadbd $MYSQLD_OPTS',
    ident: 'mariadbd',
    package: {
      name: 'mariadb-server',
      version: '1:10.11.6-0+deb12u1',
      description: 'MariaDB database server binaries',
    },
    ports: [3306],
    processes: [{ user: 'mysql', command: '/usr/sbin/mariadbd', rss: 98304, vsz: 1305488 }],
    noSpaceMessages: [
      '[ERROR] mariadbd: Disk full (/var/lib/mysql/ibtmp1); waiting for someone to free some space...',
      '[ERROR] Aborting',
    ],
    portInUseMessages: (port) => [
      `[ERROR] Can't start server: Bind on TCP/IP port. Got error: 98: Address already in use`,
      `[ERROR] Do you already have another server running on port: ${port} ?`,
      '[ERROR] Aborting',
    ],
  },
  rsyslog: {
    name: 'rsyslog',
    description: 'System Logging Service',
    unitPath: '/lib/systemd/system/rsyslog.service',
    docs: ['man:rsyslogd(8)', 'man:rsyslog.conf(5)', 'https://www.rsyslog.com/doc/'],
    execStart: '/usr/sbin/rsyslogd -n -iNONE',
    ident: 'rsyslogd',
    package: {
      name: 'rsyslog',
      version: '8.2302.0-1',
      description: 'reliable system and kernel logging daemon',
    },
    ports: [],
    processes: [{ user: 'root', command: '/usr/sbin/rsyslogd -n -iNONE', rss: 3840, vsz: 222220 }],
    noSpaceMessages: [
      "file '/var/log/syslog': write error - see https://www.rsyslog.com/solving-rsyslog-write-errors/ for help OS error: No space left on device",
    ],
    portInUseMessages: () => [],
  },
};
