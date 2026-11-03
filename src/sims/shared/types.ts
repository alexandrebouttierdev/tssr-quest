/**
 * Types de la machine virtuelle commune (docs/03-simulateurs.md, `sims/shared`).
 *
 * Tout l'état est un objet JSON immuable : pas de classe, pas de `Map`, pour pouvoir
 * le sauvegarder, le comparer et le rejouer dans les tests.
 */
import type { Rng } from '@core/random/rng';

/** Contexte fourni à chaque exécution de commande. */
export interface SimContext {
  /** Générateur pseudo-aléatoire à graine, pour des sorties reproductibles. */
  readonly rng: Rng;
  /** Horloge simulée (date affichée par `date`, horodatage des journaux). */
  readonly now: Date;
}

/** Champs communs à tous les nœuds du système de fichiers. */
interface BaseNode {
  /** Nom du propriétaire (compte de `users`). */
  readonly owner: string;
  /** Nom du groupe propriétaire (groupe de `groups`). */
  readonly group: string;
  /** Bits de droits, y compris setuid (0o4000), setgid (0o2000) et sticky (0o1000). */
  readonly mode: number;
  /** Date de dernière modification (ms depuis l'époque Unix). */
  readonly mtime: number;
}

/** Fichier ordinaire. */
export interface FileNode extends BaseNode {
  readonly type: 'file';
  /** Contenu texte (vide pour un gros fichier binaire dont seule la taille compte). */
  readonly content: string;
  /**
   * Taille déclarée en octets : un journal de 18 Go n'a pas besoin de 18 Go de contenu.
   * Absente : la taille est celle du contenu encodé en UTF-8.
   */
  readonly size?: number;
}

/** Répertoire (ses enfants sont les chemins qui le prolongent). */
export interface DirNode extends BaseNode {
  readonly type: 'dir';
}

/** Lien symbolique. */
export interface SymlinkNode extends BaseNode {
  readonly type: 'symlink';
  /** Cible telle qu'écrite (relative ou absolue). */
  readonly target: string;
}

/** Nœud du système de fichiers. */
export type FsNode = FileNode | DirNode | SymlinkNode;

/** Système de fichiers : chemin absolu normalisé → nœud. La racine est `/`. */
export type FileSystem = Readonly<Record<string, FsNode>>;

/** Compte utilisateur (local, comme dans /etc/passwd et /etc/shadow). */
export interface UserAccount {
  readonly name: string;
  readonly uid: number;
  /** Groupe principal (nom). */
  readonly group: string;
  readonly home: string;
  readonly shell: string;
  /** Champ GECOS (nom complet). */
  readonly gecos: string;
  /** Mot de passe en clair (jeu pédagogique) ; `null` si aucun mot de passe n'est défini. */
  readonly password: string | null;
  /** Compte verrouillé (`passwd -l`, `usermod -L`). */
  readonly locked: boolean;
}

/** Groupe local. */
export interface Group {
  readonly name: string;
  readonly gid: number;
  /** Membres secondaires (le groupe principal d'un compte n'y figure pas forcément). */
  readonly members: readonly string[];
}

/** État d'une unité systemd. */
export type ServiceActiveState = 'active' | 'inactive' | 'failed';

/**
 * Cause de panne simulée d'un service : elle est réévaluée à chaque démarrage,
 * le service redémarre dès que la cause a disparu.
 */
export type ServiceFailure =
  /** Le disque qui porte /var est plein. */
  | { readonly kind: 'no-space-left'; readonly path: string }
  /** Un autre service écoute déjà sur le port. */
  | { readonly kind: 'port-in-use'; readonly port: number };

/** Un service (unité systemd) de la machine. */
export interface ServiceState {
  readonly name: string;
  readonly description: string;
  readonly state: ServiceActiveState;
  readonly enabled: boolean;
  /** Cause de panne en attente ; `null` si le service peut démarrer. */
  readonly failure: ServiceFailure | null;
  /** PID principal quand le service tourne. */
  readonly mainPid: number | null;
  /** Date du dernier changement d'état (ms). */
  readonly since: number;
  /** Ports TCP écoutés quand le service est actif. */
  readonly ports: readonly number[];
}

/** Paquet Debian. */
export interface PackageState {
  readonly name: string;
  readonly version: string;
  readonly installed: boolean;
  readonly description: string;
}

/** Processus en cours. */
export interface Process {
  readonly pid: number;
  readonly ppid: number;
  readonly user: string;
  readonly command: string;
  /** Pourcentage CPU instantané. */
  readonly cpu: number;
  /** Mémoire résidente en Kio. */
  readonly rss: number;
  /** Mémoire virtuelle en Kio. */
  readonly vsz: number;
  readonly tty: string;
  readonly stat: string;
  /** Date de lancement (ms). */
  readonly start: number;
}

/** Interface réseau. */
export interface NetInterface {
  readonly name: string;
  readonly mac: string;
  /** Adresse IPv4 en notation CIDR (`192.168.10.12/24`), ou `null`. */
  readonly ipv4: string | null;
  readonly up: boolean;
  readonly mtu: number;
}

/** Route IPv4. */
export interface Route {
  /** `default` ou réseau en notation CIDR. */
  readonly destination: string;
  readonly gateway: string | null;
  readonly device: string;
}

/** Système de fichiers monté. */
export interface Disk {
  /** Périphérique (`/dev/sda1`). */
  readonly device: string;
  /** Point de montage (`/var`). */
  readonly mount: string;
  readonly fstype: string;
  /** Capacité en octets. */
  readonly size: number;
  /**
   * Octets occupés par ce qui n'est pas modélisé fichier par fichier (système, bases…).
   * L'occupation réelle = `baseUsed` + taille des fichiers simulés sous le montage.
   */
  readonly baseUsed: number;
}

/** Ligne de journal (journald). */
export interface LogLine {
  /** Horodatage (ms). */
  readonly time: number;
  /** Identifiant du programme émetteur (`systemd`, `apachectl`, `sshd`…). */
  readonly ident: string;
  readonly pid: number;
  readonly message: string;
}

/** Ligne de crontab. */
export interface CronEntry {
  /** Les cinq champs de planification (`0 3 * * *`). */
  readonly schedule: string;
  readonly command: string;
}

/** Trace d'une commande simple exécutée, lue par les conditions de mission. */
export interface CommandRecord {
  /** Commande simple après expansion (`sudo systemctl status apache2`). */
  readonly command: string;
  /** Ligne complète tapée par le joueur. */
  readonly line: string;
  readonly user: string;
  readonly cwd: string;
  readonly exitCode: number;
  /**
   * Vrai si la commande a été comprise et exécutée (même si son code de retour
   * est informatif, comme `systemctl status` d'un service arrêté qui renvoie 3).
   */
  readonly ok: boolean;
  readonly time: number;
}

/** Session ouverte sur la machine. */
export interface Session {
  readonly user: string;
  readonly cwd: string;
  /** Répertoire précédent (`cd -`). */
  readonly previousCwd: string | null;
  readonly env: Readonly<Record<string, string>>;
  /** Vrai quand `sudo` a déjà reçu le mot de passe (horodatage sudo). */
  readonly sudoAuthenticated: boolean;
  /** Code de retour de la dernière commande (`$?`). */
  readonly lastExitCode: number;
}

/** Une machine simulée : poste client, serveur Linux ou Windows. */
export interface Machine {
  readonly hostname: string;
  readonly os: 'debian' | 'windows-client' | 'windows-server';
  readonly fs: FileSystem;
  readonly users: Readonly<Record<string, UserAccount>>;
  readonly groups: Readonly<Record<string, Group>>;
  readonly services: Readonly<Record<string, ServiceState>>;
  readonly packages: Readonly<Record<string, PackageState>>;
  readonly processes: readonly Process[];
  readonly interfaces: readonly NetInterface[];
  readonly routes: readonly Route[];
  readonly dns: { readonly servers: readonly string[]; readonly search: readonly string[] };
  readonly disks: readonly Disk[];
  /** Journaux par unité (`apache2`, `ssh`) ; la clé `kernel` regroupe le noyau. */
  readonly logs: Readonly<Record<string, readonly LogLine[]>>;
  readonly crontabs: Readonly<Record<string, readonly CronEntry[]>>;
  readonly session: Session;
  /** Historique des commandes exécutées (lu par les conditions `command`). */
  readonly history: readonly CommandRecord[];
  /** Date de démarrage de la machine (ms), pour `uptime`. */
  readonly bootTime: number;
  /** Prochain PID attribué. */
  readonly nextPid: number;
}
