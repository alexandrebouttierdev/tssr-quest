# 12 — Prompts pour Claude Code

Ces prompts sont à donner **dans l'ordre**, un par session ou par étape. Claude Code lit `CLAUDE.md` automatiquement ; les prompts lui demandent de lire les documents utiles avant d'agir.

Conseils d'usage :
- Lancer `claude` à la racine du projet.
- Utiliser le mode plan (`Maj+Tab` deux fois) pour les grosses étapes : Claude propose un plan, tu valides, il exécute.
- Après chaque étape : vérifier que `npm run typecheck && npm test` passe, puis committer.
- Si Claude s'éloigne de la doc, lui rappeler : « Relis docs/02-architecture.md et respecte l'arborescence. »

---

## Étape 0.1 — Initialisation du projet

```
Lis CLAUDE.md, docs/02-architecture.md, docs/09-tests-qualite.md et docs/10-conventions-code.md.

Initialise le projet TSSR Quest :
- Vite + React 19 + TypeScript en mode strict (options de CLAUDE.md), alias d'import @core, @engine, @sims, @content, @game, @ui.
- Dépendances : phaser, zustand, immer, zod, yaml, idb-keyval, motion.
- Dev : vitest, @vitest/coverage-v8, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, happy-dom, @playwright/test, eslint, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-import, prettier, simple-git-hooks, lint-staged, tsx, vite-plugin-pwa.
- Scripts npm de CLAUDE.md.
- vitest.config.ts avec les seuils de couverture de docs/09.
- eslint.config.js avec la règle de dépendances entre dossiers de docs/10.
- Arborescence complète de docs/02 avec un README.md court (en français) dans chaque dossier de src/.
- Workflow .github/workflows/ci.yml de docs/09.
- Un test minimal qui passe.

Ne crée encore aucune logique de jeu. Termine par npm run typecheck, npm run lint et npm test.
```

## Étape 0.2 — Socle : événements, store, aléatoire

```
Lis docs/02-architecture.md (sections store et bus d'événements).

Implémente en TDD, avec TSDoc en français :
1. src/core/events : bus typé (on, off, emit, once) sur l'union GameEvent.
2. src/core/random : générateur pseudo-aléatoire à graine (mulberry32), fonctions int, pick, shuffle.
3. src/core/store : store Zustand vanilla avec immer, tranches player, progress, progression, ui, settings ; hook useGameStore(selector) pour React.

Couverture ≥ 90 % sur src/core. Montre-moi les tests avant l'implémentation.
```

## Étape 0.3 — Sauvegarde

```
Implémente src/core/save selon docs/02 (section Sauvegarde) : schéma Zod versionné, emplacements auto et slot-1 à 3, migrations, export/import JSON. Abstrais IndexedDB derrière src/platform/storage.ts pour pouvoir tester avec un stockage en mémoire. Tests complets.
```

## Étape 0.4 — Machine simulée et système de fichiers

```
Lis docs/03-simulateurs.md (principes communs et sims/shared).

Implémente src/sims/shared : types Machine, FileSystem (fichiers, dossiers, liens, propriétaire, groupe, mode, taille déclarée, contenu), vérification des droits (lecture, écriture, exécution, traversée), utilisateurs et groupes, services, disques, journaux. Fabrique createDebianServer avec une arborescence FHS réaliste. Tout est immuable et sérialisable.

TDD : écris d'abord les tests des droits (propriétaire, groupe, autres, root, sticky bit), puis le code.
```

## Étape 0.5 — Interpréteur Bash

```
Implémente src/sims/bash : lexer, parser (AST), expansion, interpréteur, selon docs/03.
Gère : guillemets simples et doubles, échappements, variables, $?, ~, jokers, pipes, redirections > >> < 2> 2>&1, listes ; && ||.
Puis les commandes : ls (-l -a -h), cd, pwd, cat, echo, clear, man, aide, sudo (liste sudoers), df (-h), du (-sh), rm (-r -f), systemctl (status, start, stop, restart, enable), journalctl (-u, -xe), curl (-I).
Une commande = un fichier + un fichier de test. Sorties fidèles à Debian 12 (messages d'erreur en français comme sur une Debian en locale fr_FR).
```

## Étape 0.6 — Contenu et moteur de missions

```
Lis docs/04-moteur-missions.md.

1. src/content/schemas : schémas Zod de chapitre, mission, étapes dialogue/choice/input/ordering/terminal, conditions command/service/disk/file/all/any/not, dialogue, PNJ, zone.
2. scripts/build-content.ts, validate-content.ts, replay-solutions.ts et le plugin Vite de rechargement.
3. src/engine/missions (runner, registre d'étapes, conditions, récompenses), src/engine/dialogue, src/engine/progression.
4. Écris le contenu de la mission linux-admin.intranet-down (docs/04 donne le YAML) et le dialogue d'Hugo.

npm run test:content doit rejouer la solution et passer.
```

## Étape 0.7 — Le monde Phaser

```
Lis docs/06-monde-et-cartes.md et docs/07-direction-artistique.md.

Crée src/game : config Phaser (480x270, pixelArt, zoom entier, Arcade Physics), BootScene, PreloadScene, WorldScene, map-loader pour les calques Tiled de docs/06, Player (8 directions, course, animations), Npc, Interactable, caméra lissée, pathfinding A* (logique pure testée) pour le clic/toucher.
Utilise les sprites de reference/ (tileset_salle_serveurs.png, personnage_technicien.png) en attendant les assets définitifs, et une carte Tiled simple de la salle serveurs que tu génères en JSON.
Crée src/game/bridge.ts : le monde émet world/interact et suspend les entrées quand ui.inputMode vaut "ui".
```

## Étape 0.8 — Interface React

```
Lis docs/08-ui-hud.md.

Crée src/ui : App, GameCanvas, HUD minimal (portrait, niveau, titre, barre d'XP animée), DialogueBox (texte progressif, portrait, choix au clavier), MissionWindow (objectifs, indice, fiche, quitter), Terminal générique branché sur un CommandLineSimulator (historique, autocomplétion, barre de touches mobile). Styles en CSS Modules avec tokens. Tests Testing Library pour DialogueBox, Terminal, MissionWindow.

Objectif : la mission d'Hugo jouable de bout en bout dans le navigateur, comme dans reference/salle-pixel.html mais dans la vraie architecture.
```

## Étape 0.9 — Bilan de la phase 0

```
Fais le bilan de la phase 0 de docs/11-roadmap.md : coche ce qui est fait, liste ce qui manque, lance toute la CI en local (lint, typecheck, tests, couverture, contenu, build, e2e) et corrige ce qui échoue. Écris un test Playwright qui joue la mission d'Hugo de bout en bout.
```

---

## Prompts types pour la suite

**Ajouter une commande à un simulateur**
```
Ajoute la commande <commande> au simulateur bash, avec les options <options>, en suivant docs/03. Écris d'abord les tests (cas nominal, erreur de syntaxe, droits insuffisants, sortie formatée), puis l'implémentation. Sortie fidèle à Debian 12.
```

**Écrire une mission**
```
Écris la mission <id> du chapitre <n> décrite dans docs/05-campagne.md, au format de docs/04 : état de départ des machines, étapes, objectifs vérifiés sur l'état, 3 niveaux d'indices, solution de référence, récapitulatif, et le dialogue du mentor. Vérifie l'exactitude technique. npm run test:content doit passer.
```

**Créer une zone**
```
Crée la zone <id> de docs/06 : carte Tiled (calques et propriétés de docs/06), lumières, objets animés, PNJ placés, portes vers les zones voisines. Respecte la palette de docs/07.
```

**Relecture pédagogique**
```
Relis toutes les missions du chapitre <n> comme le ferait un formateur TSSR exigeant : exactitude des commandes et des sorties, bonnes pratiques, pièges, cohérence avec le programme ENI de docs/05. Liste les corrections, puis applique-les.
```

**Passe de finition visuelle**
```
Fais une passe « juice » sur <zone ou écran> selon docs/07 : micro-animations, particules, sons, transitions, sans dépasser le budget de performance de CLAUDE.md. Respecte prefers-reduced-motion.
```
