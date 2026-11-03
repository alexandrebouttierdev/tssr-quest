# 03 — Les simulateurs

Les simulateurs sont le cœur du jeu. Ce sont des modules TypeScript purs, sans Phaser ni React, qui modélisent un système avec un **état** et des **commandes** qui le lisent ou le modifient. Ils sont testés en profondeur.

Objectif : être **fidèles sur ce que le programme TSSR enseigne**, pas complets. Une commande hors programme peut répondre « commande non disponible dans cette simulation » plutôt que d'être mal imitée.

## Principes communs

1. **État sérialisable.** Tout l'état d'un simulateur est un objet JSON (pas de classes dans l'état), pour la sauvegarde et les tests.
2. **Commandes pures.** Une commande reçoit l'état et ses arguments, renvoie un nouvel état et une sortie. Pas d'effet de bord caché.
3. **Déterminisme.** Le hasard (latences de ping, PID) vient d'un générateur à graine fourni dans le contexte.
4. **Journal des actions.** Chaque commande exécutée est ajoutée à un historique (`history`) que les conditions de mission peuvent lire.
5. **Sorties réalistes.** Les sorties imitent Debian 12, Windows 11 / Server 2022 et Cisco IOS 15, en anglais quand le vrai système est en anglais, en français quand il l'est (Windows FR).
6. **Erreurs pédagogiques.** Une erreur affiche le vrai message du système ; l'explication pédagogique vient de la mission, pas du simulateur.

## Interface commune

```ts
/** Contexte fourni à chaque exécution de commande. */
export interface SimContext {
  /** Générateur pseudo-aléatoire à graine, pour des sorties reproductibles. */
  readonly rng: Rng;
  /** Horloge simulée (date affichée par `date`, horodatage des journaux). */
  readonly now: Date;
}

/** Résultat d'une ligne de commande exécutée. */
export interface ExecResult<TState> {
  /** Nouvel état de la machine après la commande. */
  readonly state: TState;
  /** Texte écrit sur la sortie standard. */
  readonly stdout: string;
  /** Texte écrit sur la sortie d'erreur. */
  readonly stderr: string;
  /** Code de retour (0 = succès). */
  readonly exitCode: number;
  /** Effets particuliers pour l'interface (effacer l'écran, ouvrir vim…). */
  readonly effects?: readonly SimEffect[];
  /** Sorties standard et d'erreur entremêlées dans l'ordre d'écriture. */
  readonly output?: readonly { stream: 'stdout' | 'stderr'; text: string }[];
}

/** Un simulateur en mode ligne de commande. */
export interface CommandLineSimulator<TState> {
  readonly id: 'bash' | 'cmd' | 'powershell' | 'ios';
  /** Invite affichée avant la saisie (ex. `hugo@srv-web01:~$`). */
  prompt(state: TState): string;
  /** Exécute une ligne complète saisie par le joueur. */
  exec(state: TState, line: string, ctx: SimContext): ExecResult<TState>;
  /** Propositions d'autocomplétion pour la saisie en cours. */
  complete(state: TState, partial: string): readonly string[];
  /** Message d'accueil affiché à l'ouverture de la session (bannière SSH). */
  banner(state: TState, ctx: SimContext): string;
}
```

## `sims/shared` : la machine virtuelle commune

Modèle partagé par Bash, CMD et PowerShell (et lu par les simulateurs réseau et AD).

```ts
/** Une machine simulée : poste client, serveur Linux ou Windows. */
export interface Machine {
  readonly hostname: string;
  readonly os: 'debian' | 'windows-client' | 'windows-server';
  readonly fs: FileSystem;                  // arbre de fichiers
  readonly users: Record<string, UserAccount>;
  readonly groups: Record<string, Group>;
  readonly services: Record<string, ServiceState>;  // apache2, ssh, cron, dhcpd, spooler…
  readonly packages: Record<string, PackageState>;  // installé, version
  readonly processes: readonly Process[];
  readonly interfaces: readonly NetInterface[];     // nom, MAC, IP, masque, passerelle, état
  readonly routes: readonly Route[];
  readonly dns: { readonly servers: readonly string[]; readonly search: readonly string[] };
  readonly disks: readonly Disk[];                  // partitions, systèmes de fichiers, montage
  readonly logs: Record<string, readonly LogLine[]>; // par unité / fichier
  readonly crontabs: Record<string, readonly CronEntry[]>;
  readonly session: { readonly user: string; readonly cwd: string; readonly env: Record<string, string> };
}
```

**Système de fichiers** : un objet JSON `chemin absolu → nœud` (pas de `Map`, pour rester sérialisable), avec des nœuds `file`, `dir`, `symlink` avec propriétaire, groupe, mode (bits rwx + setuid, setgid, sticky), taille « déclarée » (un fichier de 18 Go n'a pas besoin de 18 Go de contenu), contenu texte optionnel, dates. Les droits sont vérifiés pour toute lecture, écriture, exécution, traversée.

**Organisation** : `types.ts` (types de la machine), `path.ts`, `permissions.ts` (règles POSIX, sticky bit), `fs.ts` (lecture, écriture, création, suppression avec codes errno), `errors.ts` (messages `strerror` en français), `disks.ts` (occupation = part fixe + taille des fichiers simulés), `services.ts` et `service-catalog.ts` (unités systemd, pannes réévaluées à chaque démarrage : disque plein, port occupé), `journal.ts`, `debian-files.ts` (contenus de base) et `factories.ts`.

**Fabriques** : `createDebianServer(options)`, `createWindowsClient(options)` produisent une machine de base réaliste (arborescence FHS, comptes système, services par défaut). Les missions la personnalisent dans leur `state`.

## `sims/bash`

### Architecture

```
bash/
├── lexer.ts          # découpe : mots, guillemets simples et doubles, échappements, opérateurs
├── parser.ts         # AST : pipelines, listes (; && ||), redirections (> >> < 2> 2>&1), affectations
├── expand.ts         # $VAR, ${VAR}, $?, ~, globbing (* ? [abc]), substitution $(…) simple
├── interpreter.ts    # exécute l'AST : pipes via chaînes de texte, codes de retour, redirections
├── scripting.ts      # if, for, while, case, fonctions, test / [ ] / [[ ]] (chapitre 11)
├── commands/         # une commande = un fichier + son test
│   ├── ls.ts  ls.test.ts
│   └── …
├── completion.ts
└── index.ts          # implémente CommandLineSimulator<Machine>
```

Chaque commande implémente :

```ts
export interface BashCommand {
  readonly name: string;
  /** Résumé affiché par `aide` et `whatis`. */
  readonly summary: string;
  /** Page de manuel simplifiée, en français, affichée par `man`. */
  readonly manual: string;
  /** Commande interne du shell (`cd`, `export`) : `sudo` ne peut pas la lancer. */
  readonly builtin?: boolean;
  /** `env` regroupe la machine, le compte effectif, le dossier courant, stdin, le contexte et `runAs` (pour sudo). */
  run(args: readonly string[], env: CommandEnv): CommandOutcome;
}
```

`CommandOutcome` renvoie la machine modifiée, `stdout`, `stderr`, le code de retour et un drapeau `ok` : une commande informative dont le code est non nul (`systemctl status` d'un service en échec renvoie 3) reste « réussie » pour les conditions de mission.

Fichiers réels : `ast.ts`, `lexer.ts`, `parser.ts`, `expand.ts`, `glob.ts`, `arith.ts`, `interpreter.ts`, `options.ts` (analyse façon getopt), `format.ts` (droits, colonnes, tableaux), `journal-view.ts`, `prompt.ts`, `completion.ts`, `simulator.ts` (`bashSimulator`), `commands/registry.ts`, `test-utils.ts`.

L'exécution en arrière-plan (`&`) et le mot de passe de `sudo` arrivent en phase 1 ; en phase 0, `sudo` ne demande pas de mot de passe.

Les pages `man` sont **en français et simplifiées** (exception assumée à la fidélité, c'est un outil pédagogique), avec la mention « page simplifiée TSSR Quest ».

### Commandes par chapitre

| Chapitre | Commandes |
| --- | --- |
| 4 — Utilisation | `ls cd pwd mkdir rmdir touch cp mv rm ln cat less more head tail wc echo printf man help apropos whatis which type clear history file stat du df find locate grep egrep sed (s///) cut sort uniq tr tee ps top kill killall jobs bg fg nohup tar gzip gunzip zip unzip vim nano(redirigé vers vim avec message) whoami id who date uname hostname exit` |
| 5 — Administration | `sudo su apt apt-get dpkg systemctl journalctl service useradd usermod userdel groupadd groupdel passwd chage chmod chown chgrp umask fdisk lsblk blkid mkfs.ext4 mount umount pvcreate vgcreate lvcreate lvextend resize2fs ip ifup ifdown ping ss free uptime nice renice crontab at logrotate (simulé) tail -f (instantané) reboot shutdown` |
| 11 — Scripting | `bash script.sh`, `./script.sh`, `chmod +x`, `read`, `test`, `[ ]`, `[[ ]]`, `$(( ))`, `for`, `while`, `until`, `case`, `function`, `return`, `exit`, `shift`, `$1…$9 $# $@` |
| 17 — Sécurité | `ssh` (vers une autre machine du scénario), `ssh-keygen`, `openssl` (sous-commandes `req`, `x509 -text`), `curl`, `nc` (simplifié), `iptables`/`nft` (lecture) |

### Points de fidélité importants

- `rm` sans droits : `rm: impossible de supprimer 'x': Permission non accordée`.
- `systemctl restart` sans sudo : `Failed to restart x.service: Interactive authentication required.`
- `sudo` demande le mot de passe la première fois (saisie masquée) si la mission le prévoit (phase 1).
- Une redirection (`sudo echo x > /etc/f`) est faite par le shell avec les droits de l'utilisateur, pas par sudo : « Permission non accordée ».
- Le journal système n'est lisible que par root et les membres de `adm` ou `systemd-journal` (`journalctl` affiche sinon l'avertissement réel) ; `systemctl status` n'affiche alors pas les lignes de journal.
- `df -h`, `free -h`, `ip a`, `ss -tlnp` : formats identiques à Debian 12.
- Tâches de fond : `&`, `jobs`, `fg`, `bg`, `kill %N` ; `sleep N &`, `tail -f &`, `ping &` et `yes &` restent actifs (la fin d'un `sleep` est annoncée « Fini » à la commande suivante).
- Archives simulées : le contenu d'un `.tar`, `.gz` ou `.zip` est conservé (JSON derrière un marqueur), avec des tailles réalistes.
- Les services ont des dépendances et des causes d'échec simulées (disque plein, port déjà utilisé, fichier de config invalide) qui apparaissent dans `systemctl status` et `journalctl -u`.
- `apache2ctl configtest`, `sshd -t` : valident les fichiers de configuration modifiés dans vim.

## `sims/cmd` et `sims/powershell`

Partagent la machine Windows de `sims/shared`.

**CMD** (chapitres 2 et 3) : `ipconfig (/all /release /renew /flushdns) ping tracert nslookup arp -a netstat -ano hostname whoami net user net localgroup net use net share dir cd md rd copy move del type cls echo shutdown gpupdate gpresult /r sfc /scannow chkdsk (simulé) diskpart (sous-ensemble) icacls`.

**PowerShell** (chapitres 3 et 12) : moteur à **pipeline d'objets**.

```
powershell/
├── parser.ts          # cmdlets, paramètres nommés et positionnels, pipeline, scriptblocks, variables
├── objects.ts         # objets PS : propriétés, méthodes, formatage tableau / liste
├── formatting.ts      # Format-Table, Format-List, sortie par défaut
├── cmdlets/           # Get-ChildItem, Get-Process, Get-Service, Get-LocalUser, Get-NetIPAddress,
│                      # Get-ADUser, New-ADUser, Get-ADGroupMember, Get-Help, Get-Command, Get-Member,
│                      # Where-Object, Select-Object (avec propriétés calculées @{n=…;e={…}}),
│                      # Sort-Object, Measure-Object, ForEach-Object, Export-Csv, Import-Csv,
│                      # Set-Location, New-Item, Remove-Item, Test-Connection, Restart-Service…
└── scripting.ts       # if, foreach, while, switch, function, param(), try/catch/finally, $Error
```

Les alias courants (`ls`, `dir`, `cd`, `cat`, `gci`, `?`, `%`) sont pris en charge.

## `sims/ios` : Cisco IOS

```
ios/
├── modes.ts           # user >, privileged #, (config)#, (config-if)#, (config-vlan)#, (config-router)#, (config-line)#
├── running-config.ts  # modèle de configuration : interfaces, VLAN, routes, ACL, NAT, lignes, mots de passe
├── render-config.ts   # show running-config fidèle à partir du modèle
├── commands/          # enable, configure terminal, interface, switchport mode access/trunk,
│                      # switchport access vlan, switchport trunk allowed vlan, switchport port-security…,
│                      # vlan, name, ip address, no shutdown, ip route, router rip, version 2, network,
│                      # ip access-list, access-list, ip access-group, ip nat inside/outside,
│                      # ip nat inside source …, encapsulation dot1Q, hostname, banner motd,
│                      # line console/vty, password, login, enable secret, service password-encryption,
│                      # copy running-config startup-config, write memory, copy tftp, reload,
│                      # show running-config, show ip interface brief, show vlan brief,
│                      # show interfaces trunk, show mac address-table, show ip route,
│                      # show access-lists, show ip nat translations, show port-security, ping, traceroute
├── abbreviations.ts   # « conf t », « sh ip int br », « no shut » : préfixes non ambigus
└── help.ts            # « ? » contextuel
```

Fidélité : abréviations par préfixe non ambigu, `% Invalid input detected at '^' marker.` avec le chapeau au bon endroit, `% Incomplete command.`, aide `?` par mode.

## `sims/network` : le moteur réseau

Le moteur qui fait « vivre » les topologies : il calcule ce qui se passe quand une trame ou un paquet circule.

```ts
/** Topologie d'une mission : équipements et câbles. */
export interface Topology {
  readonly devices: Record<string, Device>;   // pc, server, switch, router, firewall, ap, cloud
  readonly links: readonly Link[];            // extrémités (équipement + port), type de câble, état
}
```

- **Couche 1** : câble droit, croisé, console ; état up/down ; auto-MDIX activable.
- **Couche 2** : apprentissage des MAC par port, inondation, VLAN par port, trunk 802.1Q, port-security (violation → shutdown).
- **Couche 3** : ARP, table de routage (connecté, statique, RIPv2 simplifié avec convergence en quelques « tours »), passerelle par défaut, inter-VLAN sur sous-interfaces.
- **Filtrage et traduction** : ACL standard et étendues (ordre, deny implicite), NAT statique et PAT.
- **Services** : DHCP (DORA animable), DNS (résolution par zones), réponses ICMP.
- **Trace** : `simulatePacket(topology, src, dst, proto)` renvoie la liste des sauts avec la décision à chaque équipement. Elle alimente `ping`, `tracert`, et l'animation des paquets dans `<NetworkDiagram>`.

Les simulateurs `ios`, `cmd` et `bash` lisent la topologie de la mission pour répondre à `ping`, `tracert`, `nslookup`.

## `sims/directory` : Active Directory et GPO

- Arbre du domaine (`lab.local`) : OU imbriquées, comptes utilisateurs et ordinateurs, groupes (globaux, domaine local, universels ; sécurité ou distribution).
- Attributs utiles : `sAMAccountName`, UPN, nom complet, description, état (actif, désactivé, verrouillé), « changer le mot de passe à la prochaine ouverture ».
- Calcul des **appartenances effectives** (groupes imbriqués) et des **droits effectifs** sur un partage (NTFS ∩ partage), pour vérifier AGDLP.
- GPO : objets avec paramètres (mappage de lecteurs, fond d'écran, restrictions, stratégie de mots de passe), liens sur OU, héritage, blocage, filtrage de sécurité. `gpresult /r` calcule le résultat pour un utilisateur sur un poste.
- Base SAM locale pour le chapitre 9 (comptes locaux d'un serveur) et le chapitre 3 (comptes locaux d'un client).
- DHCP et DNS Windows : étendues, exclusions, réservations, options (003, 006, 015) ; zones directes et inverses, enregistrements A, CNAME, PTR, MX, redirecteurs.

## `sims/ticketing` : outil de ticketing type GLPI

- Entités, utilisateurs, groupes, profils.
- Parc : ordinateurs, moniteurs, imprimantes, logiciels, licences, liens avec les utilisateurs.
- Tickets : type (incident, demande), catégorie, urgence × impact = priorité (matrice ITIL), statut (nouveau, en cours, en attente, résolu, clos), suivi, tâches, solution, satisfaction.
- SLA : délais de prise en charge et de résolution.
- « Plugins » : activation de modules simulés (inventaire automatique, formulaires).

Inspiré de GLPI pour le vocabulaire et le fonctionnement, avec une interface propre au jeu.

## `sims/virtualization` : vSphere simplifié

- Hôtes ESXi (CPU, RAM, cartes réseau), cluster, vCenter.
- VM : création (assistant), ressources, disques (thin, thick), carte réseau sur un groupe de ports, snapshot, clone, modèle.
- Réseau : vSwitch standard, groupes de ports, VLAN ID, uplinks.
- Stockage : datastores VMFS, NFS, iSCSI ; capacité et provisionnement.
- Fonctions de cluster : vMotion (prérequis vérifiés), HA (redémarrage en cas de panne d'hôte simulée).

## `sims/firewall`

- Zones (LAN, DMZ, WAN, VPN), objets (hôtes, réseaux, services).
- Règles ordonnées, première correspondance, refus par défaut.
- Matrice de flux : le joueur remplit des lignes (source, destination, port, protocole, action, justification) ; le moteur teste une liste de flux attendus et interdits.
- NAT de publication (port forwarding), proxy, VPN site à site et client (état up/down, paramètres phase 1/2 simplifiés).
- Journal des connexions acceptées et refusées, consultable.

## `sims/backup`

- Jobs : type (complète, incrémentale, différentielle), planification, rétention, cible (NAS, bande, cloud, copie hors ligne).
- Chaîne de restauration : calcule quels jeux sont nécessaires pour restaurer à une date.
- Vérification de la règle 3-2-1, alertes d'échec, tests de restauration.
- Sauvegarde de VM (instantanés, application-consistent ou crash-consistent, vulgarisé).

## `sims/vim`

Éditeur modal minimal pour les fichiers de configuration :

- Modes normal, insertion, commande.
- Déplacements `h j k l`, `0 $ gg G`, `w b`, recherche `/motif` et `n`.
- Édition : `i a o O x dd yy p u`, `:w :q :wq :q! :x`, `:set number`.
- Quitter vim est une quête à part entière, et une fiche.
- Implémentation : `src/sims/vim/vim.ts` (état immuable, une touche à la fois, effets `write`/`quit`) ; l'écriture se fait avec les droits du compte de la session (`E45` en lecture seule, `E212` si l'écriture échoue). `vim fichier` dans un terminal de mission ouvre `<VimEditor>` à la place du terminal jusqu'à `:q`.

## Tests des simulateurs

Voir `09-tests-qualite.md`. Chaque commande a au minimum : un cas nominal, un cas d'erreur de syntaxe, un cas de droits insuffisants (quand c'est pertinent), un test de sortie formatée (instantané).
