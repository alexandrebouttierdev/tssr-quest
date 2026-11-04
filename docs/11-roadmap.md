# 11 — Roadmap

Le jeu se construit en **six phases**. Chaque phase se termine par une version jouable, publiée et taguée. Les dates sont des cibles pour un projet mené à côté de la formation ; elles sont revues à la fin de la phase 1.

| Phase | Période cible | Version | Résultat |
| --- | --- | --- | --- |
| 0 — Fondations | novembre 2026 | `v0.1.0` | Le prototype d'Hugo rejoué dans la vraie architecture |
| 1 — Tranche Linux | novembre à mi-décembre 2026 | `v0.2.0` | Chapitres 4 et 5 complets, premier lancement public |
| 2 — Rattrapage | décembre 2026 | `v0.3.0` | Chapitres 1 à 3 |
| 3 — Réseau et ITIL | janvier 2027 | `v0.4.0` | Chapitres 6 à 8, agence de Rennes |
| 4 — Microsoft et scripts | février 2027 | `v0.5.0` | Chapitres 9 à 12 |
| 5 — Infra, sécurité, finale | mars 2027 | `v1.0.0` | Chapitres 13 à 18, finale, sortie complète |

## Phase 0 — Fondations

Objectif : toutes les briques techniques en place, avec une seule mission jouable de bout en bout.

**Projet et outillage**
- [x] Initialiser Vite + React + TypeScript strict, alias d'import, ESLint, Prettier, hooks Git.
- [x] Configurer Vitest (couverture et seuils), Testing Library, Playwright, CI GitHub Actions.
- [x] Créer l'arborescence de `02-architecture.md` avec un `README.md` par dossier.

**Socle**
- [x] `core/events` : bus typé + tests.
- [x] `core/store` : store Zustand vanilla + hook React + tranches `player`, `progress`, `progression`, `ui`, `settings` + tests.
- [x] `core/random` : générateur à graine + tests.
- [x] `core/save` : sauvegarde IndexedDB, schéma Zod versionné, export/import + tests.

**Contenu**
- [x] Schémas Zod : chapitre, mission, étapes `dialogue`, `choice`, `input`, `ordering`, `terminal` ; dialogue ; PNJ ; zone.
- [x] `scripts/build-content.ts` et plugin Vite de rechargement à chaud.
- [x] `scripts/validate-content.ts` et `scripts/replay-solutions.ts`.

**Simulateur Bash (version 1)**
- [x] `sims/shared` : machine, système de fichiers avec droits, utilisateurs, services, disques, journaux, fabriques.
- [x] `sims/bash` : lexer, parser, interpréteur (pipes, redirections, `;` `&&` `||`, variables, jokers).
- [x] Commandes de la mission d'Hugo : `ls cd pwd cat systemctl journalctl df du rm sudo curl clear man aide`.

**Moteur**
- [x] `engine/missions` : runner, registre d'étapes, conditions `command`, `service`, `disk`, `file`, `all/any/not`.
- [x] `engine/dialogue` : interpréteur de nœuds, choix, effets, conditions.
- [x] `engine/progression` : XP, niveaux, compétences.

**Jeu et interface**
- [x] Phaser : `BootScene`, `PreloadScene`, `WorldScene`, chargement d'une carte Tiled (salle serveurs), joueur, collisions, caméra, un PNJ, interaction.
- [x] React : `App`, `GameCanvas`, HUD minimal (niveau, XP), `DialogueBox`, `MissionWindow`, `Terminal`.
- [x] Mission `linux-admin.intranet-down` jouable de bout en bout.

**Validation de la phase** : la mission d'Hugo fonctionne dans le navigateur, la CI est verte, couverture au-dessus des seuils.

## Phase 1 — Tranche Linux (premier lancement public)

Objectif : une démo qui donne envie, assez riche pour être partagée sur LinkedIn et testée par la promo.

**Monde**
- [ ] Cartes : bureau de la DSI, couloir, salle de formation, salle serveurs.
- [ ] PNJ : Mme Garnier, Hugo, le formateur ENI, 6 figurants avec routines.
- [ ] Lumière dynamique (Light2D), LED animées, poussière, bloom, cycle jour/nuit.
- [ ] Portes et transitions pixelisées, sons d'ambiance.

**Simulateurs**
- [x] Toutes les commandes Bash des chapitres 4 et 5 (voir `03-simulateurs.md`).
- [x] `sims/vim` et le composant `<VimEditor>`.
- [x] Conditions `user`, `net`, `cron`, contenu de fichier.

**Contenu**
- [x] Les 22 missions des chapitres 4 et 5, dialogues, fiches « À retenir ».
- [x] Épreuves notées et badges.
- [x] 3 quêtes secondaires (dont `sq.vim-exit` et `sq.formateur`).

**Interface**
- [ ] Écran titre animé, création du personnage.
- [ ] HUD complet, journal, compétences, inventaire, fiches, options, sauvegardes.
- [ ] Notifications, animation de montée de niveau.
- [ ] Contrôles mobiles, barre de touches rapides du terminal.

**Publication**
- [ ] Domaine, déploiement automatique sur le VPS, PWA.
- [ ] Page itch.io, GIF de démonstration. (README illustré ✅, publication GitHub Pages ✅)
- [ ] Session de test avec 3 à 5 apprenants, corrections.
- [ ] Post LinkedIn de lancement (voir `14-communication.md`).

**Validation de la phase** : 5 testeurs terminent le chapitre 4 sans aide extérieure ; aucune bonne réponse refusée signalée.

## Phase 2 — Rattrapage (chapitres 1 à 3)

- [ ] Simulateurs `cmd` et `powershell` (version 1), machine Windows client.
- [ ] Étapes `matching`, `patch-panel`, `diagram` (version 1 : placer, relier, adresser, tester un ping).
- [ ] Moteur réseau `sims/network` : couches 1 à 3 de base, ARP, ICMP, DNS.
- [ ] Composants `<PatchPanel>`, `<NetworkDiagram>`, `<DirectoryConsole>` (version locale : NTFS et comptes locaux).
- [ ] Cartes : accueil, open space, atelier, local technique.
- [ ] PNJ : Martine, Inès, Lucas, Nadia, Karim.
- [ ] Missions des chapitres 1 à 3 (29) et épreuves.

## Phase 3 — Réseau et ITIL (chapitres 6 à 8)

- [ ] Simulateur `ios` complet (modes, abréviations, `?`, configuration, `show`).
- [ ] Moteur réseau : VLAN, trunk, port-security, routage statique, RIPv2, inter-VLAN, ACL, NAT.
- [ ] Simulateur `ticketing` et composant `<TicketDesk>`.
- [ ] Format « mise en situation » : cahier des charges, livrables, soutenance, note.
- [ ] Cartes : salle de réunion, agence de Rennes (avec pluie), écran de transport TER.
- [ ] Réputation et tickets secondaires générés.
- [ ] Missions des chapitres 6 à 8 (28) et épreuves, événement « Astreinte du réveillon ».

## Phase 4 — Microsoft et scripts (chapitres 9 à 12)

- [ ] Simulateur `directory` complet : domaine, OU, groupes, AGDLP, GPO, DHCP, DNS Windows.
- [ ] PowerShell complet (pipeline d'objets, propriétés calculées, scripts, erreurs), cmdlets AD.
- [ ] Bash scripting (`if`, boucles, fonctions) et étape `script` avec cas de test.
- [ ] Missions des chapitres 9 à 12 (31) et épreuves.

## Phase 5 — Infrastructure, sécurité, finale (chapitres 13 à 18)

- [ ] Simulateurs `virtualization`, `firewall`, `backup` et leurs composants.
- [ ] Cartes : datacenter, NOC, SOC, domicile, console cloud.
- [ ] Missions des chapitres 13 à 18 (39), fil rouge résolu, finale.
- [ ] Écran de fin, attestation, mode après-jeu.
- [ ] Passe de finition : sons, musiques, équilibrage, accessibilité, performances.
- [ ] Lancement `v1.0.0` avant l'examen.

## Jalons de communication

Voir `14-communication.md` : un devlog toutes les deux semaines, un post à chaque fin de phase.
