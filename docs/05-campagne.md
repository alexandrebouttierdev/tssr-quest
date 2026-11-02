# 05 — Campagne : le programme TSSR chapitre par chapitre

La campagne suit le calendrier de la formation TSSR de l'ENI École Informatique (promo 2026-2027) : **18 chapitres**, un par module, 24 semaines de cours. Chaque point du programme correspond au moins à une mission. Chaque chapitre se termine par une épreuve notée sur 20 et un badge.

Les modules *Automatisation et IA*, *Services cloud* et *Supervision* n'ont pas de détail dans le programme reçu : leur contenu est **proposé** et sera ajusté à réception du support de cours.

Convention d'identifiant : `<chapitre>.<slug>`. Les étapes sont notées : 💬 dialogue, ☑ choix, ⌨ saisie, ↕ ordre, 🔗 association, 🖥 terminal, 📝 éditeur, 🕸 schéma réseau, 🔌 baie, 🗂 annuaire, 🎫 ticketing, ☁ virtualisation, 🧱 matrice de flux, 💾 sauvegarde, 📜 script.

## Fil rouge : l'héritage de Gégé

L'ancien administrateur, Gégé, est parti précipitamment. Au fil des chapitres, le joueur trouve des indices : post-its de mots de passe (ch. 1), un compte `gege_admin` jamais désactivé (ch. 3 et 9), une tâche cron étrange qui contacte une IP inconnue (ch. 5), un port de switch dans un VLAN fantôme (ch. 8), une règle de pare-feu « temporaire » de 2019 (ch. 17). Au chapitre 17, M. Leroy et le joueur reconstituent la porte dérobée ; la finale (ch. 18) se joue la nuit où quelqu'un tente de s'en servir. Ton : enquête légère, sans paranoïa ni violence ; la morale est la bonne gestion des départs et des accès.

## Chapitre 1 — Microsoft 365

*Module ENI : Microsoft 365 – Outils collaboratifs · 5 au 9 octobre 2026 · Zones : accueil, open space · Mentor : Martine*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `m365.premier-jour` | Premier jour | Découverte de l'environnement M365, portail, MFA | 💬 ☑ ⌨ |
| `m365.installation` | Le poste de la stagiaire | Installation et paramétrage de Microsoft 365 sur un poste | ↕ ☑ |
| `m365.word-rapport` | Le rapport de la compta | Word : styles, sommaire automatique, en-têtes | ☑ ↕ |
| `m365.excel-budget` | Le tableau de Nadia | Excel : formules, références absolues, filtres, tableau croisé | ⌨ ☑ |
| `m365.outlook` | Outlook fait des siennes | Utilisation et dépannage d'Outlook : boîte pleine, profil, règles, calendrier partagé | 🎫 ☑ |
| `m365.teams` | La réunion de 14 h | Teams : équipes, canaux, réunions, partage | ☑ ↕ |
| `m365.onedrive` | Le fichier qui a disparu | OneDrive : synchronisation, conflits, historique des versions, partage par lien | ☑ ⌨ |
| `m365.epreuve` | **Épreuve** : matinée M365 | 5 tickets mixtes en une matinée de jeu | 🎫 ☑ ⌨ |

Fil rouge : sous le clavier de l'accueil, un post-it signé « G. » avec un mot de passe Wi-Fi.

## Chapitre 2 — Bases des réseaux

*Module ENI : Bases des réseaux · 12 au 16 octobre 2026 · Zone : local technique · Mentor : Inès*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `reseau.osi` | La tour des sept couches | Modèle OSI, encapsulation, protocoles et équipements par couche | ↕ 🔗 ☑ |
| `reseau.unites` | Bits, octets et débits | Unités informatiques : bit, octet, Ko/Kio, Mb/s vs Mo/s, temps de transfert | ⌨ ☑ |
| `reseau.adressage` | Le plan d'adressage | IPv4, classes historiques, masque, CIDR, réseau, broadcast, plages privées | ⌨ ⌨ ⌨ |
| `reseau.sous-reseaux` | Découper le réseau | Sous-réseaux, nombre d'hôtes, VLSM simple | ⌨ ☑ |
| `reseau.ipv6` | Le futur est déjà là | Bases d'IPv6 : notation, abréviation, lien local | ⌨ ☑ |
| `reseau.communication` | Qui parle à qui | Communication : MAC, ARP, trame, paquet, segment, TCP/UDP, ports, poignée de main | ↕ ☑ 🕸 |
| `reseau.commandes` | Premières commandes | ipconfig, ping, tracert, arp -a, nslookup, netstat | 🖥 (cmd) |
| `reseau.epreuve` | **Épreuve** : l'open space est coupé | Diagnostic couche par couche, câble, IP, passerelle, DNS | 🔌 🖥 ☑ |

## Chapitre 3 — Systèmes clients Microsoft

*Modules ENI : Systèmes clients Microsoft (1/2 et 2/2) · 19 au 30 octobre 2026 · Zones : salle de formation, atelier, open space · Mentor : Lucas*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `clients.materiel` | Visite de l'atelier | Présentation du matériel : composants, POST, ESD | ☑ ↕ |
| `clients.vmware-ws` | Le labo virtuel | Initiation VMware Workstation : VM, modes réseau NAT, pont, hôte seul | ☁ ☑ |
| `clients.ecosysteme` | Quelle édition ? | Écosystème Microsoft : éditions, licences, cycle de vie | ☑ |
| `clients.installation` | Installer Windows 11 | Installation : partitionnement, compte local ou domaine, OOBE | ↕ ☑ |
| `clients.tour-horizon` | Tour du propriétaire | Gestionnaire des tâches, services, observateur d'événements | ☑ 🖥 |
| `clients.powershell-intro` | La console bleue | Ligne de commande et introduction à PowerShell | 🖥 (cmd, powershell) |
| `clients.stockage` | Le disque plein | Gestion du stockage : partitions, GPT/MBR, formats, extension, diskpart | 🖥 ☑ |
| `clients.utilisateurs` | Comptes locaux | Utilisateurs et groupes locaux, UAC | 🖥 ☑ |
| `clients.ntfs` | Le dossier interdit | Permissions NTFS, héritage, droits effectifs, icacls | 🗂 🖥 ☑ |
| `clients.partages` | Partager sans risque | Réseau, partages, profil réseau, pare-feu Windows | 🖥 ☑ |
| `clients.distance` | Dépannage à distance | Bureau à distance, assistance rapide | ☑ ↕ |
| `clients.pilotes-imprimantes` | L'imprimante fantôme | Pilotes, gestionnaire de périphériques, file d'impression | 🖥 ☑ |
| `clients.epreuve` | **Épreuve** : cinq postes pour lundi | Préparation complète de postes pour une équipe | 🖥 🗂 ☑ |

Fil rouge : un compte local `gege_admin` présent sur tous les postes, membre des Administrateurs.

## Chapitre 4 — Utilisation de GNU/Linux

*Module ENI : Utilisation d'une distribution GNU/Linux · 2 au 6 novembre 2026 · Zone : salle de formation · Mentor : Hugo*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `linux.decouverte` | Pourquoi Linux ? | Caractéristiques, distributions, logiciel libre | ☑ |
| `linux.connexion` | Première connexion | Connexion à un terminal, TTY, SSH, syntaxe des commandes, le shell Bash | 🖥 |
| `linux.aide` | RTFM | man, --help, apropos, whatis | 🖥 |
| `linux.arborescence` | Chasse au trésor | Arborescence FHS : /etc, /var, /home, /usr, /tmp… | 🖥 ☑ |
| `linux.fichiers` | Le grand rangement | mkdir, cp, mv, rm, ln, chemins absolus et relatifs, jokers | 🖥 |
| `linux.regex` | Le détective des logs | Expressions régulières, grep, egrep | 🖥 ⌨ |
| `linux.recherche` | Où est passé le fichier ? | find, locate, which | 🖥 |
| `linux.vim` | Survivre à vim | Modes, édition, sauvegarde, quitter | 📝 |
| `linux.processus` | Tuyauterie | Processus (ps, top, kill), redirections, pipelines | 🖥 |
| `linux.archives` | Les cartons | Archivage et compression : tar, gzip, zip | 🖥 |
| `linux.epreuve` | **Épreuve** : le rapport perdu | Retrouver un fichier, extraire des chiffres d'un journal, archiver le résultat | 🖥 📝 |

## Chapitre 5 — Administration de GNU/Linux

*Modules ENI : Administration d'une distribution GNU/Linux (1/2 et 2/2) · 9 au 20 novembre 2026 · Zone : salle serveurs · Mentor : Hugo*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `linux-admin.installer-debian` | Installer Debian | Installation : partitionnement, paquets, premier démarrage | ↕ ☑ |
| `linux-admin.paquets` | Mises à jour en retard | apt, dépôts, sources.list, dpkg | 🖥 |
| `linux-admin.boot` | Le serveur ne boote plus | GRUB, systemd, cibles, services, journal du démarrage | 🖥 ☑ |
| `linux-admin.comptes` | Nouveaux arrivants | Utilisateurs, groupes, mots de passe, chage, sudo | 🖥 |
| `linux-admin.droits` | Qui a le droit ? | chmod, chown, umask, setgid sur dossier partagé, sticky bit | 🖥 |
| `linux-admin.disque` | Le nouveau disque | fdisk, mkfs, mount, fstab, LVM | 🖥 📝 |
| `linux-admin.ip-fixe` | Adresse fixe | Configuration IP : ip, /etc/network/interfaces, resolv.conf | 🖥 📝 |
| `linux-admin.processus` | Le serveur rame | Mémoire, processus, priorités, signaux | 🖥 |
| `linux-admin.cron` | Les tâches de nuit | Planification : cron, at, timers systemd | 🖥 📝 |
| `linux-admin.intranet-down` | L'intranet est tombé | Journalisation : journalctl, /var/log, disque plein | 🖥 ☑ |
| `linux-admin.epreuve-serveur-web` | **Épreuve** : le serveur intranet | Installer et configurer un serveur web de A à Z, comptes, droits, sauvegarde planifiée | 🖥 📝 ☑ |

Fil rouge : une tâche cron de l'utilisateur `gege` contacte toutes les nuits une adresse IP externe.

## Chapitre 6 — Mise en situation : systèmes clients

*Module ENI : Mise en situation professionnelle – systèmes clients · 23 au 27 novembre 2026 · Zone : salle de réunion · Mentor : Sophie*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `msp1.cahier-des-charges` | Le brief | Lecture d'un cahier des charges : antenne de 10 postes à Rennes | 💬 ☑ |
| `msp1.plan` | Le plan d'adressage | Bases réseaux appliquées | ⌨ 🕸 |
| `msp1.postes` | Les postes | Windows, comptes, partages, NTFS | 🖥 🗂 |
| `msp1.serveur-linux` | Le serveur de fichiers | Administration Linux appliquée | 🖥 📝 |
| `msp1.soutenance` | **Épreuve** : la soutenance | Présentation des choix en dialogue, questions du jury | 💬 ☑ |

## Chapitre 7 — ITIL et gestion de parc

*Modules ENI : Sensibilisation ITIL et gestion de parc (1/2 et 2/2) · 30 novembre au 11 décembre 2026 · Zone : accueil et centre de services · Mentors : Martine, Mme Garnier*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `itil.principes` | Parler ITIL | Principes, vocabulaire : incident, demande, problème, changement, SLA, CMDB | ☑ 🔗 |
| `itil.centre-support` | Les niveaux de support | Centre de support, N1/N2/N3, escalade, base de connaissances | ↕ ☑ |
| `itil.gestion-parc` | Le parc et le support | Gestion de parc au service du support | ☑ 🎫 |
| `itil.communication` | L'utilisateur furieux | Communication verbale et non verbale, reformulation, ton | 💬 |
| `glpi.presentation` | Découvrir GLPI | Présentation de GLPI, configuration générale | 🎫 ☑ |
| `glpi.entites` | Nantes et Rennes | Notion d'entité | 🎫 |
| `glpi.utilisateurs` | Qui fait quoi | Utilisateurs, groupes, profils | 🎫 |
| `glpi.parc` | L'inventaire | Gestion du parc informatique : matériels, logiciels, contrats | 🎫 |
| `glpi.assistance` | Le ticket parfait | Assistance aux utilisateurs : création, qualification, suivi, solution | 🎫 |
| `glpi.plugins` | Étendre GLPI | Plugins | 🎫 ☑ |
| `itil.epreuve` | **Épreuve** : lundi matin au support | 10 tickets à trier, prioriser, traiter, escalader | 🎫 💬 |

## Chapitre 8 — Infrastructures réseaux

*Modules ENI : Les infrastructures réseaux (1/2 et 2/2) · 14 au 25 décembre 2026 · Zones : local technique, agence de Rennes · Mentor : Inès*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `infra.intro` | La carte du réseau | Introduction au réseau d'entreprise | 🕸 ☑ |
| `infra.switch` | Le switch | Équipements de couche 2, table MAC, accès console | 🖥 (ios) |
| `infra.vlan` | Séparer les flux | VLAN, ports access et trunk | 🖥 🕸 |
| `infra.port-security` | Le port piraté | Sécurité des ports des switchs | 🖥 |
| `infra.wifi` | Le Wi-Fi des visiteurs | Wi-Fi : SSID, WPA2/WPA3, canaux, isolation | ☑ 🕸 |
| `infra.routeur` | Le routeur | Équipements de couche 3, interfaces, routage statique | 🖥 🕸 |
| `infra.rip` | Les routes apprises | RIPv2 | 🖥 |
| `infra.inter-vlan` | Les VLAN se parlent | Routage inter-VLAN (router on a stick) | 🖥 🕸 |
| `infra.acl` | Filtrer | ACL de routeur standard et étendues | 🖥 |
| `infra.nat` | Sortir sur Internet | NAT statique et PAT | 🖥 |
| `infra.sauvegarde-config` | Ne rien perdre | Sauvegarder et restaurer les configurations | 🖥 |
| `infra.epreuve` | **Épreuve** : Rennes rejoint le réseau | Câbler et configurer l'agence de Rennes de bout en bout | 🔌 🖥 🕸 |

Fil rouge : à Rennes, le port 24 du switch est dans un VLAN 666 qui n'existe dans aucune documentation.

**Pendant l'interruption (28 décembre au 1er janvier)** : événement optionnel « Astreinte du réveillon », trois incidents de révision à résoudre avant minuit.

## Chapitre 9 — Services réseau en environnement Microsoft

*Modules ENI : Services réseau en environnement Microsoft (1/2 et 2/2) · 4 au 15 janvier 2027 · Zone : salle serveurs · Mentors : Élodie, Nadia*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `win-srv.presentation` | Windows Server | Présentation, rôles et fonctionnalités | ☑ |
| `win-srv.disques` | Les disques du serveur | Gestion des disques durs | 🖥 ☑ |
| `win-srv.sam` | Avant le domaine | Utilisateurs et groupes de la base SAM | 🖥 |
| `win-srv.adds` | Le domaine lab.local | Installation ADDS, promotion du contrôleur | ↕ 🗂 |
| `win-srv.ou-comptes` | Ranger l'annuaire | OU, comptes, groupes | 🗂 🖥 (powershell) |
| `win-srv.agdlp` | Le dossier Compta | Serveur de fichiers, AGDLP, droits effectifs | 🗂 |
| `win-srv.impression` | Le serveur d'impression | Ressources réseau : impression | 🗂 ☑ |
| `win-srv.gpo` | Les stratégies | GPO : lecteurs, fond d'écran, restrictions, gpupdate, gpresult | 🗂 🖥 |
| `win-srv.appliance` | La passerelle | Routage et NAT avec une appliance de sécurité | 🧱 🕸 |
| `win-srv.dhcp` | Les adresses automatiques | DHCP : étendues, exclusions, réservations, options | 🗂 🖥 |
| `win-srv.dns` | Les noms | DNS : zones, enregistrements, redirecteurs | 🗂 🖥 |
| `win-srv.epreuve` | **Épreuve** : 15 arrivées lundi | Comptes, groupes, droits, GPO, postes en DHCP, noms DNS | 🗂 🖥 ☑ |

Fil rouge : le compte de domaine `gege_admin` est toujours actif, dernier accès il y a trois jours.

## Chapitre 10 — Mise en situation : services réseau

*Module ENI : Mise en situation professionnelle – services réseau · 18 au 22 janvier 2027 · Zone : salle de réunion · Mentor : Sophie*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `msp2.cahier-des-charges` | Le nouveau site | Cahier des charges : agence de Rennes autonome | 💬 ☑ |
| `msp2.microsoft` | Le contrôleur de l'agence | Services réseau Microsoft appliqués | 🗂 🖥 |
| `msp2.linux` | Les services Linux | Services réseau sous Linux (DHCP, DNS ou web selon le cours) | 🖥 📝 |
| `msp2.soutenance` | **Épreuve** : la recette | Tests de recette et soutenance | 🕸 💬 ☑ |

## Chapitre 11 — Scripting Bash

*Module ENI : Initiation au scripting Bash · 25 au 29 janvier 2027 · Zone : salle de formation · Mentor : Yanis*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `bash.algo` | Penser en étapes | Algorithmique : séquence, condition, boucle (puzzle de blocs) | ↕ |
| `bash.variables` | Mon premier script | Variables, paramètres, lecture | 📜 |
| `bash.enchainement` | Et si ça échoue ? | Enchaînement de commandes : ; && \|\| et codes de retour | 📜 🖥 |
| `bash.conditions` | Le gardien | Conditions et tests | 📜 |
| `bash.boucles` | La photocopieuse | Boucles for, while | 📜 |
| `bash.fonctions` | Ne pas se répéter | Fonctions | 📜 |
| `bash.epreuve` | **Épreuve** : 30 comptes depuis un CSV | Script complet testé sur des cas réels | 📜 🖥 |

## Chapitre 12 — PowerShell

*Module ENI : Initiation à PowerShell · 1er au 5 février 2027 · Zone : salle de formation · Mentor : Yanis*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `ps.core` | PowerShell Core | Découverte, verbe-nom, Get-Help, Get-Command, Get-Member | 🖥 |
| `ps.structure` | Le pipeline d'objets | Structure des commandes, pipeline, filtres | 🖥 |
| `ps.proprietes-calculees` | Les colonnes sur mesure | Propriétés calculées | 🖥 |
| `ps.parametres` | Bien demander | Passage de paramètres | 🖥 📜 |
| `ps.variables` | Ranger les résultats | Variables, tableaux, hashtables | 📜 |
| `ps.controle` | Décider et répéter | Structures de contrôle | 📜 |
| `ps.erreurs` | Quand ça casse | Gestion des erreurs : try, catch, finally, ErrorAction | 📜 |
| `ps.epreuve` | **Épreuve** : les comptes fantômes | Rapport CSV des comptes inactifs depuis 90 jours | 📜 🗂 |

## Chapitre 13 — Automatisation et IA appliquées au support et au MCO

*Module ENI : Automatisation et IA appliquées au support et au MCO · 8 au 12 février 2027 · Zone : NOC · Mentor : Camille · contenu proposé*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `auto.taches` | Les corvées du lundi | Automatiser des tâches répétitives : tâches planifiées, scripts | 📜 🖥 |
| `auto.ia-tickets` | L'assistant de tri | Utiliser une IA pour qualifier et résumer des tickets | 🎫 ☑ |
| `auto.ia-procedure` | La procédure express | Faire rédiger une procédure, la vérifier, la corriger | ☑ 📝 |
| `auto.ia-danger` | La commande de trop | Repérer une commande dangereuse ou fausse proposée par une IA | ☑ 🖥 |
| `auto.epreuve` | **Épreuve** : MCO automatisé | Chaîne d'automatisation vérifiée de bout en bout | 📜 ☑ |

## Chapitre 14 — Virtualisation de serveurs

*Module ENI : Virtualisation de serveurs · 15 au 19 février 2027 · Zone : datacenter · Mentor : Théo*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `virt.presentation` | Pourquoi virtualiser | Présentation, hyperviseurs type 1 et 2 | ☑ |
| `virt.vsphere` | Les briques vSphere | Composantes : ESXi, vCenter | 🔗 ☁ |
| `virt.reseau` | Le réseau virtuel | vSwitch, groupes de ports, VLAN | ☁ |
| `virt.stockage` | Le stockage | Datastores, VMFS, NFS, iSCSI, provisionnement | ☁ ☑ |
| `virt.datacenter` | Le datacenter | Clusters, vMotion, HA, snapshots, modèles | ☁ |
| `virt.epreuve` | **Épreuve** : la grande migration | Migrer trois serveurs physiques en VM | ☁ ☑ |

## Chapitre 15 — Services cloud

*Module ENI : Services Cloud · 22 au 26 février 2027 · Zone : console cloud · Mentor : Théo · contenu proposé*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `cloud.modeles` | Les nuages | IaaS, PaaS, SaaS, cloud public, privé, hybride | 🔗 ☑ |
| `cloud.responsabilite` | Qui est responsable ? | Modèle de responsabilité partagée | ☑ |
| `cloud.vm` | Ma première VM cloud | Déploiement, réseau, accès sécurisé | ☁ |
| `cloud.couts` | La facture surprise | Coûts, dimensionnement, extinction | ⌨ ☑ |
| `cloud.epreuve` | **Épreuve** : l'intranet hybride | Choix argumenté et déploiement | ☁ 💬 |

## Chapitre 16 — Sauvegarde et restauration

*Module ENI : Sauvegarde et restauration · 1er au 5 mars 2027 · Zone : datacenter · Mentor : Théo*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `backup.enjeux` | Ce qu'on ne peut pas perdre | Concepts, enjeux, RPO, RTO | ☑ ⌨ |
| `backup.types` | Mardi, 14 h | Complète, incrémentale, différentielle : quels jeux pour restaurer ? | 💾 ↕ |
| `backup.stockage` | Où ranger ? | Stocker les sauvegardes : 3-2-1, hors ligne, immuable | 💾 ☑ |
| `backup.vm` | Sauvegarder les VM | Sauvegarde de machines virtuelles | 💾 ☁ |
| `backup.supervision` | Le job en échec | Superviser les sauvegardes, tester les restaurations | 💾 🖥 |
| `backup.epreuve` | **Épreuve** : le rançongiciel | Isoler, identifier le bon jeu, restaurer, rendre compte | 💾 🖥 💬 |

## Chapitre 17 — Réseau et sécurité

*Modules ENI : Réseau et Sécurité (1/2 et 2/2) · 8 au 19 mars 2027 · Zones : SOC, domicile de la télétravailleuse · Mentor : M. Leroy*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `secu.acces` | Qui entre ? | Sécuriser les accès réseau | ☑ 🕸 |
| `secu.pare-feu` | Le pare-feu | Pare-feu, règles, ordre, refus par défaut | 🧱 |
| `secu.matrice` | La matrice de flux | Matrice de flux | 🧱 |
| `secu.exposer` | Publier l'intranet | Exposer des services vers l'extérieur | 🧱 🕸 |
| `secu.dmz` | La zone tampon | DMZ | 🕸 🧱 |
| `secu.proxy` | Le proxy | Proxy, filtrage, journalisation | 🧱 ☑ |
| `secu.teletravail` | Chez Léa, à Vitré | Collaborateurs et télétravail : VPN client, MFA | 🧱 ☑ |
| `secu.vpn-sites` | Nantes – Rennes | Relier des sites distants de manière sécurisée : VPN site à site | 🧱 🕸 |
| `secu.certificats` | Le cadenas | Authentifier et sécuriser les échanges : certificats | 🖥 ☑ |
| `secu.pki` | La PKI maison | Infrastructure de clés, autorité interne | 🗂 🖥 |
| `secu.certificats-publics` | Le certificat public | Certificats publics, Let's Encrypt | 🖥 |
| `secu.logs` | Tout centraliser | Centraliser les informations de journalisation | 🖥 📝 |
| `secu.epreuve` | **Épreuve** : l'intranet nomade | Ouvrir l'intranet aux commerciaux nomades sans faille | 🧱 🕸 🖥 |

Fil rouge : la règle « TEMP Gégé 2019 » autorise tout depuis une IP externe vers le serveur de fichiers. Avec M. Leroy, le joueur reconstitue la porte dérobée.

## Chapitre 18 — Supervision

*Module ENI : Supervision · 22 au 26 mars 2027 · Zone : NOC · Mentor : Camille · contenu proposé*

| Id | Mission | Notions | Étapes |
| --- | --- | --- | --- |
| `sup.principes` | Voir avant que ça casse | Principes de la supervision, indicateurs, seuils | ☑ |
| `sup.snmp-agents` | Les sondes | SNMP, agents, découverte | 🖥 ☑ |
| `sup.tableaux` | Le mur d'écrans | Tableaux de bord, alertes, escalade | ☑ 🎫 |
| `finale.nuit-astreinte` | **Finale** : la nuit d'astreinte | Incident majeur multi-domaines : alerte, diagnostic réseau, compte compromis, restauration, communication | 🖥 🗂 🧱 💾 💬 |

Après la finale : écran de fin, attestation de fin d'alternance, statistiques de partie, crédits. Un mode « après-jeu » laisse rejouer toutes les missions en mode Examen.

## Quêtes secondaires (sélection)

| Id | Quête | Zone | Notions |
| --- | --- | --- | --- |
| `sq.cafe` | Le café connecté | Open space | VLAN IoT, isolation |
| `sq.plante` | La plante de la compta | Open space | Gag, réputation |
| `sq.retrogaming` | Le PC de 2003 | Atelier | Historique, BIOS, IDE |
| `sq.postits` | Les post-its de Gégé | Partout | Fil rouge, mots de passe |
| `sq.formateur` | Les défis du formateur | Salle de formation | Révision du module de la semaine |
| `sq.rennes-pluie` | Il pleut sur Rennes | Agence de Rennes | Onduleur, coupure électrique |
| `sq.vim-exit` | Je suis coincé dans vim | Salle serveurs | Gag, `:q!` |
| `sq.badge` | Le badge perdu | Accueil | Gestion des accès, révocation |

## Équilibrage indicatif

| Chapitres | Missions principales | Durée de jeu estimée |
| --- | --- | --- |
| 1 à 6 | 56 | 12 à 16 h |
| 7 à 12 | 54 | 14 à 18 h |
| 13 à 18 | 39 | 10 à 14 h |
| **Total** | **≈ 149** + 40 secondaires | **≈ 40 à 50 h** |
