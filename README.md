# TSSR Quest

> Un RPG en pixel art, jouable dans le navigateur, pour apprendre le métier de Technicien Supérieur Systèmes et Réseaux en résolvant de vrais tickets.

**TSSR Quest** suit le programme du titre professionnel TSSR tel qu'il est enseigné à l'ENI École Informatique : 18 chapitres, du support Microsoft 365 jusqu'à la supervision, en passant par Linux, Active Directory, Cisco, la virtualisation et la sécurité.

Le joueur incarne un apprenant TSSR en alternance chez **LabCorp**, une PME fictive dont le siège est à Nantes et l'agence à Rennes. Il parle aux collègues, prend des tickets, tape de vraies commandes dans des terminaux simulés, configure des switchs, crée des comptes Active Directory, restaure des sauvegardes… et gagne de l'XP jusqu'au titre de « Référent technique ».

Le jeu est **100 % en français**.

---

## Ce que contient ce dossier

Ce dépôt contient pour l'instant la **documentation de conception** du projet. Elle est écrite pour être lue par un humain **et** par Claude Code, qui s'en sert pour générer le projet étape par étape.

| Fichier | Contenu |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Règles de travail pour Claude Code : commandes, conventions, définition de « terminé » |
| [`docs/00-vision.md`](docs/00-vision.md) | Pitch, public, principes pédagogiques, ce qui rend le jeu unique |
| [`docs/01-game-design.md`](docs/01-game-design.md) | Boucle de jeu, XP, niveaux, compétences, inventaire, réputation, journée, badges |
| [`docs/02-architecture.md`](docs/02-architecture.md) | Stack, arborescence complète, couches, flux de données, scènes Phaser |
| [`docs/03-simulateurs.md`](docs/03-simulateurs.md) | Spécification des simulateurs : Bash, CMD, PowerShell, Cisco IOS, réseau, AD, GLPI, vSphere… |
| [`docs/04-moteur-missions.md`](docs/04-moteur-missions.md) | Format YAML des missions, types d'étapes, conditions, récompenses, schémas Zod |
| [`docs/05-campagne.md`](docs/05-campagne.md) | Les 18 chapitres, mission par mission, alignés sur le programme ENI |
| [`docs/06-monde-et-cartes.md`](docs/06-monde-et-cartes.md) | Zones, PNJ, conventions Tiled, transitions, cycle jour/nuit |
| [`docs/07-direction-artistique.md`](docs/07-direction-artistique.md) | Pixel art moderne : palette, lumière, particules, animations, son |
| [`docs/08-ui-hud.md`](docs/08-ui-hud.md) | HUD, menus, dialogues, fenêtres métier, accessibilité, mobile |
| [`docs/09-tests-qualite.md`](docs/09-tests-qualite.md) | Tests unitaires, tests de contenu, E2E, CI, couverture |
| [`docs/10-conventions-code.md`](docs/10-conventions-code.md) | Style de code, commentaires en français, nommage, Git |
| [`docs/11-roadmap.md`](docs/11-roadmap.md) | Jalons, tâches détaillées, critères de validation |
| [`docs/12-prompts-claude-code.md`](docs/12-prompts-claude-code.md) | Prompts à donner à Claude Code, dans l'ordre |
| [`docs/13-assets.md`](docs/13-assets.md) | Liste des assets, pipeline de génération, licences |
| [`docs/14-communication.md`](docs/14-communication.md) | Plan de communication LinkedIn, devlog, mentions légales |
| [`reference/`](reference/) | Prototypes HTML et premiers sprites issus de la phase de conception |

## Démarrer avec Claude Code

1. Décompresser ce dossier, puis l'ouvrir dans un terminal.
2. `git init && git add . && git commit -m "docs: dossier de conception initial"`
3. Lancer `claude` dans le dossier.
4. Donner le premier prompt de [`docs/12-prompts-claude-code.md`](docs/12-prompts-claude-code.md).

Claude Code lit automatiquement `CLAUDE.md` à chaque session.

## Stack prévue

React 19 + Phaser 3 · TypeScript strict · Vite · Zustand · Zod · Tiled · Vitest · Testing Library · Playwright · PWA

Phaser dessine le monde (cartes, personnages, lumières, particules). React affiche tout le reste (HUD, dialogues, terminaux, fenêtres métier, menus). Les deux partagent un même état de jeu Zustand.

## Statut

🚧 En conception. Première version jouable visée : la « tranche Linux » (chapitres 4 et 5).

## Avertissement

TSSR Quest est un projet personnel et pédagogique, réalisé par un apprenant de la promotion TSSR de l'ENI École Informatique. Il n'est ni produit, ni validé, ni soutenu officiellement par l'ENI ou par le ministère du Travail. LabCorp et tous les personnages sont fictifs. Les marques citées (Microsoft, Cisco, VMware, GLPI, Debian…) appartiennent à leurs propriétaires et ne sont mentionnées qu'à des fins d'apprentissage.

## Auteur

Alexandre Bouttier — développeur fullstack en reconversion vers l'administration systèmes et réseaux, à la recherche d'un stage TSSR.
