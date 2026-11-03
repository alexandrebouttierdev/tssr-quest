# PROGRESS — journal de bord de TSSR Quest

Ce fichier permet de reprendre le travail dans une nouvelle session sans rien relire d'autre.
Il est mis à jour à chaque tâche terminée.

## État actuel

- **Phase en cours** : 0 — Fondations (`v0.1.0`)
- **Dernière tâche terminée** : 0.1 — initialisation du projet
- **Prochaine action** : 0.2 — socle `core/events`, `core/random`, `core/store`

## Environnement

- Node 22, npm 10. Installer avec `npm install` (le fichier `.npmrc` active `legacy-peer-deps`, voir Décisions).
- Chromium est préinstallé dans `/opt/pw-browsers` (Playwright 1.63.0 épinglé pour lui correspondre).
- Commandes : voir `CLAUDE.md`. `npm run typecheck` vérifie `tsconfig.json` (src, tests) et `tsconfig.node.json` (scripts, configs, e2e).

## Phase 0 — Fondations (cases de docs/11-roadmap.md)

**Projet et outillage**
- [x] Initialiser Vite + React + TypeScript strict, alias d'import, ESLint, Prettier, hooks Git.
- [x] Configurer Vitest (couverture et seuils), Testing Library, Playwright, CI GitHub Actions.
- [x] Créer l'arborescence de `02-architecture.md` avec un `README.md` par dossier.

**Socle**
- [ ] `core/events` : bus typé + tests.
- [ ] `core/store` : store Zustand vanilla + hook React + tranches `player`, `progress`, `progression`, `ui`, `settings` + tests.
- [ ] `core/random` : générateur à graine + tests.
- [ ] `core/save` : sauvegarde IndexedDB, schéma Zod versionné, export/import + tests.

**Contenu**
- [ ] Schémas Zod : chapitre, mission, étapes `dialogue`, `choice`, `input`, `ordering`, `terminal` ; dialogue ; PNJ ; zone.
- [ ] `scripts/build-content.ts` et plugin Vite de rechargement à chaud.
- [ ] `scripts/validate-content.ts` et `scripts/replay-solutions.ts`.

**Simulateur Bash (version 1)**
- [ ] `sims/shared` : machine, système de fichiers avec droits, utilisateurs, services, disques, journaux, fabriques.
- [ ] `sims/bash` : lexer, parser, interpréteur (pipes, redirections, `;` `&&` `||`, variables, jokers).
- [ ] Commandes de la mission d'Hugo : `ls cd pwd cat systemctl journalctl df du rm sudo curl clear man aide`.

**Moteur**
- [ ] `engine/missions` : runner, registre d'étapes, conditions `command`, `service`, `disk`, `file`, `all/any/not`.
- [ ] `engine/dialogue` : interpréteur de nœuds, choix, effets, conditions.
- [ ] `engine/progression` : XP, niveaux, compétences.

**Jeu et interface**
- [ ] Phaser : `BootScene`, `PreloadScene`, `WorldScene`, carte Tiled (salle serveurs), joueur, collisions, caméra, un PNJ, interaction.
- [ ] React : `App`, `GameCanvas`, HUD minimal (niveau, XP), `DialogueBox`, `MissionWindow`, `Terminal`.
- [ ] Mission `linux-admin.intranet-down` jouable de bout en bout.

## Décisions

| # | Date | Décision | Raison |
| --- | --- | --- | --- |
| D1 | 2026-11-03 | **Phaser 3.90.0** (dernière 3.x) et non Phaser 4 | docs/02 impose « Phaser 3 (dernière 3.x stable) » ; Light2D et postFX y sont stables. |
| D2 | 2026-11-03 | **TypeScript 6.0** (et non 7.0) | typescript-eslint ne supporte que TS < 6.1. |
| D3 | 2026-11-03 | **ESLint 9** (et non 10) | `eslint-plugin-import` (règle `import/no-restricted-paths` exigée par docs/10) ne supporte pas ESLint 10. |
| D4 | 2026-11-03 | `.npmrc` avec `legacy-peer-deps=true` | npm 10 plante (`edgesOut`) sur les dépendances pairs optionnelles de Vitest 4 + Vite 8 ; sans effet sur le code. |
| D5 | 2026-11-03 | Ajout de `eslint-plugin-jsdoc` (règle `require-jsdoc` sur les exports de `src/`) | Fait respecter automatiquement « TSDoc sur tout export » (CLAUDE.md). |
| D6 | 2026-11-03 | `tsconfig.base.json` partagé + `tsconfig.json` (src) + `tsconfig.node.json` (scripts/configs) ; `typecheck` lance les deux | Les scripts Node et le code navigateur n'ont pas les mêmes `types`. |
| D7 | 2026-11-03 | Vitest en deux projets : `logique` (Node, `*.test.ts`) et `interface` (happy-dom, `*.test.tsx`) | Les tests logiques restent purs Node (règle 5 de CLAUDE.md). |
| D8 | 2026-11-03 | Dépendances entre dossiers : `game` et `ui` peuvent aussi importer `platform` et `audio` ; `platform` et `audio` n'importent que `core` | docs/10 ne mentionne pas ces deux dossiers ; c'est le choix le plus restrictif compatible avec docs/02. |
| D9 | 2026-11-03 | `core/save` reçoit son stockage par injection (interface `SaveStorage`), implémentée par `src/platform/storage.ts` | `core` ne peut rien importer d'autre de `src/` (docs/10) ; testable en mémoire. |
| D10 | 2026-11-03 | `src/ui` n'exécute jamais un simulateur : le terminal envoie la ligne au moteur (`mission/step-input`) et affiche la sortie publiée dans le store | docs/10 : `ui` n'importe que des **types** de `sims`. |
| D11 | 2026-11-03 | LICENSE : MIT (code) + CC BY-NC 4.0 (contenu) | Proposition de docs/14, **à confirmer par l'auteur** avant le dépôt public. |

## Problèmes rencontrés

- npm `Cannot read properties of null (reading 'edgesOut')` en installant Vitest 4 : contourné par `legacy-peer-deps` (D4).

## Bilans de phase

_(à venir)_
