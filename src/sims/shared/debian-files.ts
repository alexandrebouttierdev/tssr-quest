/**
 * Contenus de fichiers de base d'une Debian 12 fraîchement installée.
 * Les textes reprennent ceux de Debian (licences libres) ; seuls les noms de machine,
 * adresses et comptes sont propres à LabCorp.
 */

/** Paramètres réseau utilisés dans les fichiers générés. */
export interface NetworkFileParams {
  readonly hostname: string;
  readonly domain: string;
  readonly address: string;
  readonly prefix: number;
  readonly gateway: string;
  readonly dnsServers: readonly string[];
  readonly iface: string;
}

/** Contenu de /etc/os-release pour Debian 12. */
export const OS_RELEASE = `PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
NAME="Debian GNU/Linux"
VERSION_ID="12"
VERSION="12 (bookworm)"
VERSION_CODENAME=bookworm
ID=debian
HOME_URL="https://www.debian.org/"
SUPPORT_URL="https://www.debian.org/support"
BUG_REPORT_URL="https://bugs.debian.org/"
`;

/** Message du jour par défaut de Debian. */
export const MOTD = `
The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
`;

/** Dépôts APT de Debian 12. */
export const SOURCES_LIST = `deb http://deb.debian.org/debian/ bookworm main non-free-firmware
deb-src http://deb.debian.org/debian/ bookworm main non-free-firmware

deb http://security.debian.org/debian-security bookworm-security main non-free-firmware
deb-src http://security.debian.org/debian-security bookworm-security main non-free-firmware

# bookworm-updates, to get updates before a point release is made;
# see https://www.debian.org/doc/manuals/debian-reference/ch02.en.html#_updates_and_backports
deb http://deb.debian.org/debian/ bookworm-updates main non-free-firmware
deb-src http://deb.debian.org/debian/ bookworm-updates main non-free-firmware
`;

/** Fichier /etc/sudoers par défaut (le groupe sudo a tous les droits). */
export const SUDOERS = `#
# This file MUST be edited with the 'visudo' command as root.
#
Defaults	env_reset
Defaults	mail_badpass
Defaults	secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Defaults	use_pty

# User privilege specification
root	ALL=(ALL:ALL) ALL

# Allow members of group sudo to execute any command
%sudo	ALL=(ALL:ALL) ALL

@includedir /etc/sudoers.d
`;

/** /etc/crontab de Debian 12. */
export const CRONTAB = `# /etc/crontab: system-wide crontab
# Unlike any other crontab you don't have to run the \`crontab'
# command to install the new version when you edit this file
# and files in /etc/cron.d. These files also have username fields,
# that none of the other crontabs do.

SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Example of job definition:
# .---------------- minute (0 - 59)
# |  .------------- hour (0 - 23)
# |  |  .---------- day of month (1 - 31)
# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...
# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat
# |  |  |  |  |
# *  *  *  *  * user-name command to be executed
17 *	* * *	root	cd / && run-parts --report /etc/cron.hourly
25 6	* * *	root	test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }
47 6	* * 7	root	test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }
52 6	1 * *	root	test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.monthly; }
#
`;

/** ~/.bashrc minimal (version abrégée de /etc/skel/.bashrc). */
export const BASHRC = `# ~/.bashrc: executed by bash(1) for non-login shells.

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

HISTCONTROL=ignoreboth
HISTSIZE=1000
HISTFILESIZE=2000

alias ls='ls --color=auto'
alias ll='ls -l'
`;

/** ~/.profile de /etc/skel. */
export const PROFILE = `# ~/.profile: executed by the command interpreter for login shells.

# if running bash
if [ -n "$BASH_VERSION" ]; then
    # include .bashrc if it exists
    if [ -f "$HOME/.bashrc" ]; then
	. "$HOME/.bashrc"
    fi
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/bin" ] ; then
    PATH="$HOME/bin:$PATH"
fi
`;

/**
 * Contenu de /etc/hosts.
 *
 * @param params - Paramètres réseau.
 * @returns Le texte du fichier.
 */
export function hostsFile(params: NetworkFileParams): string {
  return `127.0.0.1	localhost
127.0.1.1	${params.hostname}.${params.domain}	${params.hostname}

# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`;
}

/**
 * Contenu de /etc/network/interfaces (configuration statique ifupdown).
 *
 * @param params - Paramètres réseau.
 * @returns Le texte du fichier.
 */
export function interfacesFile(params: NetworkFileParams): string {
  return `# This file describes the network interfaces available on your system
# and how to activate them. For more information, see interfaces(5).

source /etc/network/interfaces.d/*

# The loopback network interface
auto lo
iface lo inet loopback

# The primary network interface
allow-hotplug ${params.iface}
iface ${params.iface} inet static
	address ${params.address}/${params.prefix}
	gateway ${params.gateway}
`;
}

/**
 * Contenu de /etc/resolv.conf.
 *
 * @param params - Paramètres réseau.
 * @returns Le texte du fichier.
 */
export function resolvConf(params: NetworkFileParams): string {
  return `domain ${params.domain}\nsearch ${params.domain}\n${params.dnsServers
    .map((s) => `nameserver ${s}`)
    .join('\n')}\n`;
}

/** Comptes système d'une Debian 12 minimale : nom, uid, gid, gecos, home, shell. */
export const SYSTEM_ACCOUNTS: readonly (readonly [
  string,
  number,
  number,
  string,
  string,
  string,
])[] = [
  ['root', 0, 0, 'root', '/root', '/bin/bash'],
  ['daemon', 1, 1, 'daemon', '/usr/sbin', '/usr/sbin/nologin'],
  ['bin', 2, 2, 'bin', '/bin', '/usr/sbin/nologin'],
  ['sys', 3, 3, 'sys', '/dev', '/usr/sbin/nologin'],
  ['sync', 4, 65534, 'sync', '/bin', '/bin/sync'],
  ['games', 5, 60, 'games', '/usr/games', '/usr/sbin/nologin'],
  ['man', 6, 12, 'man', '/var/cache/man', '/usr/sbin/nologin'],
  ['lp', 7, 7, 'lp', '/var/spool/lpd', '/usr/sbin/nologin'],
  ['mail', 8, 8, 'mail', '/var/mail', '/usr/sbin/nologin'],
  ['news', 9, 9, 'news', '/var/spool/news', '/usr/sbin/nologin'],
  ['proxy', 13, 13, 'proxy', '/bin', '/usr/sbin/nologin'],
  ['www-data', 33, 33, 'www-data', '/var/www', '/usr/sbin/nologin'],
  ['backup', 34, 34, 'backup', '/var/backups', '/usr/sbin/nologin'],
  ['list', 38, 38, 'Mailing List Manager', '/var/list', '/usr/sbin/nologin'],
  ['_apt', 42, 65534, '', '/nonexistent', '/usr/sbin/nologin'],
  ['nobody', 65534, 65534, 'nobody', '/nonexistent', '/usr/sbin/nologin'],
  ['systemd-network', 998, 998, 'systemd Network Management', '/', '/usr/sbin/nologin'],
  ['messagebus', 100, 107, '', '/nonexistent', '/usr/sbin/nologin'],
  ['sshd', 101, 65534, '', '/run/sshd', '/usr/sbin/nologin'],
];

/** Groupes système d'une Debian 12 minimale : nom et gid. */
export const SYSTEM_GROUPS: readonly (readonly [string, number])[] = [
  ['root', 0],
  ['daemon', 1],
  ['bin', 2],
  ['sys', 3],
  ['adm', 4],
  ['tty', 5],
  ['disk', 6],
  ['lp', 7],
  ['mail', 8],
  ['news', 9],
  ['uucp', 10],
  ['man', 12],
  ['proxy', 13],
  ['kmem', 15],
  ['dialout', 20],
  ['cdrom', 24],
  ['floppy', 25],
  ['tape', 26],
  ['sudo', 27],
  ['audio', 29],
  ['dip', 30],
  ['www-data', 33],
  ['backup', 34],
  ['operator', 37],
  ['list', 38],
  ['shadow', 42],
  ['utmp', 43],
  ['video', 44],
  ['plugdev', 46],
  ['staff', 50],
  ['games', 60],
  ['users', 100],
  ['messagebus', 107],
  ['systemd-journal', 999],
  ['systemd-network', 998],
  ['nogroup', 65534],
];

/** Exécutables présents dans /usr/bin (pour `which`, `ls /usr/bin`, la complétion). */
export const USR_BIN = [
  'apropos',
  'apt',
  'apt-get',
  'awk',
  'basename',
  'bash',
  'cat',
  'chage',
  'chgrp',
  'chmod',
  'chown',
  'clear',
  'cp',
  'crontab',
  'curl',
  'cut',
  'date',
  'df',
  'diff',
  'dirname',
  'dpkg',
  'du',
  'echo',
  'egrep',
  'env',
  'false',
  'file',
  'find',
  'free',
  'grep',
  'groups',
  'gunzip',
  'gzip',
  'head',
  'hostname',
  'id',
  'ip',
  'journalctl',
  'kill',
  'killall',
  'less',
  'ln',
  'locate',
  'ls',
  'lsblk',
  'man',
  'mkdir',
  'more',
  'mount',
  'mv',
  'nano',
  'nice',
  'nohup',
  'passwd',
  'ping',
  'printf',
  'ps',
  'pwd',
  'renice',
  'rm',
  'rmdir',
  'sed',
  'sh',
  'sleep',
  'sort',
  'ss',
  'stat',
  'su',
  'sudo',
  'systemctl',
  'tail',
  'tar',
  'tee',
  'test',
  'top',
  'touch',
  'tr',
  'true',
  'umount',
  'uname',
  'uniq',
  'unzip',
  'uptime',
  'vi',
  'vim',
  'wc',
  'whatis',
  'which',
  'who',
  'whoami',
  'xargs',
  'zip',
] as const;

/** Exécutables présents dans /usr/sbin. */
export const USR_SBIN = [
  'adduser',
  'blkid',
  'chpasswd',
  'cron',
  'fdisk',
  'groupadd',
  'groupdel',
  'ifdown',
  'ifup',
  'logrotate',
  'lvcreate',
  'lvextend',
  'mkfs.ext4',
  'pvcreate',
  'reboot',
  'resize2fs',
  'service',
  'shutdown',
  'sshd',
  'useradd',
  'userdel',
  'usermod',
  'vgcreate',
  'visudo',
] as const;
