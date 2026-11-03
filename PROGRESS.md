# PROGRESS — journal de bord de TSSR Quest

Ce fichier permet de reprendre le travail dans une nouvelle session sans rien relire d'autre.
Il est mis à jour à chaque tâche terminée.

## État actuel

- **Phase en cours** : 1 — Tranche Linux (`v0.2.0`) — phase 0 terminée et taguée `v0.1.0`
- **Dernière tâche terminée** : planification (crontab -l/-e/-r, fichier, `crontab -` ; at, atq, atrm) + sous-shells `( … )` + Ctrl+D dans le terminal
- **Prochaine action** : phase 1 — commandes du ch. 5 restantes : disques (lsblk, blkid, fdisk, mkfs.ext4, mount, umount, fstab, LVM, resize2fs), service, reboot/shutdown, apache2ctl/sshd -t ; puis conditions user/net/cron ; puis les missions des ch. 4-5

## Environnement

- **Branches** : on travaille sur `dev` (demande de l'auteur, 3 novembre 2026). `master` sert à publier : chaque push y redéploie le jeu sur GitHub Pages. Publier = fusionner `dev` dans `master`.

- Node 22, npm 10. Installer avec `npm install` (le fichier `.npmrc` active `legacy-peer-deps`, voir Décisions).
- Chromium est préinstallé dans `/opt/pw-browsers` (Playwright 1.63.0 épinglé pour lui correspondre).
- Commandes : voir `CLAUDE.md`. `npm run typecheck` vérifie `tsconfig.json` (src, tests) et `tsconfig.node.json` (scripts, configs, e2e).

## Phase 0 — Fondations (cases de docs/11-roadmap.md)

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
- [x] Commandes de la mission d'Hugo : `ls cd pwd cat systemctl journalctl df du rm sudo curl clear man aide` (+ `echo exit export true false whoami hostname help logout`).

**Moteur**
- [x] `engine/missions` : runner, registre d'étapes, conditions `command`, `service`, `disk`, `file`, `all/any/not`.
- [x] `engine/dialogue` : interpréteur de nœuds, choix, effets, conditions.
- [x] `engine/progression` : XP, niveaux, compétences.

**Jeu et interface**
- [x] Phaser : `BootScene`, `PreloadScene`, `WorldScene`, carte Tiled (salle serveurs), joueur, collisions, caméra, un PNJ, interaction.
- [x] React : `App`, `GameCanvas`, HUD minimal (niveau, XP), `DialogueBox`, `MissionWindow`, `Terminal`.
- [x] Mission `linux-admin.intranet-down` jouable de bout en bout (vérifiée dans Chromium par script Playwright).

## Phase 1 — Tranche Linux (suivi)

**Simulateurs**
- [ ] Toutes les commandes Bash des chapitres 4 et 5 — ch. 4 ✅ (fichiers, filtres, sed, recherche, info, processus et `&`, archives) ; ch. 5 ⏳ — comptes, droits, paquets (apt, dpkg), réseau (ip, ping, ss, ifup/ifdown), mémoire et priorités (free, uptime, nice, renice), planification (crontab, at) ✅
- [x] `sims/vim` et le composant `<VimEditor>` (+ étape `editor`, vim dans le terminal).
- [ ] Conditions `user`, `net`, `cron`, contenu de fichier (fichier ✅ depuis la phase 0).

**Contenu** : 22 missions ch. 4-5, épreuves, badges, 3 quêtes secondaires — à faire.
**Monde** : cartes DSI, couloir, formation ; PNJ ; Light2D ; portes et transitions ; sons — à faire.
**Interface** : écran titre ✅ (nuit, pluie, baies qui clignotent ; prénom + pronoms ; Continuer) ; rappel des contrôles en jeu ✅ ; menus, options, sauvegardes, montée de niveau, mobile — à faire.
**Publication** : GitHub Pages ✅ (`pages.yml`, https://alexandrebouttierdev.github.io/tssr-quest/ — activer *Settings → Pages → Source : GitHub Actions*) ; README illustré ✅ ; PWA, itch.io — à faire.

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
| D12 | 2026-11-03 | Ajout de `src/core/model.ts` (types partagés : compétences, services, `MissionResult`, `SoundId`…) | `core/events` et `core/store` en ont besoin et ne peuvent rien importer d'autre ; ajouté à docs/02. |
| D13 | 2026-11-03 | Le store contient la **vue** de la mission (`MissionRunView`, types dans `core`) ; l'état complet (machines simulées) reste dans le moteur | `core` ne peut pas importer les types de `sims` ; une mission interrompue reprend au début de l'étape (docs/02). |
| D14 | 2026-11-03 | Tranches ajoutées dès la phase 0 : `inventory`, `reputation`, `missionRun` (en plus de player, progress, progression, ui, settings) | Prévues par docs/02 ; nécessaires aux récompenses de la mission d'Hugo. |
| D15 | 2026-11-03 | Événements ajoutés à l'union : `dialogue/advance`, `mission/continue` | Avancer une réplique et passer à l'étape suivante sont des actions joueur à faire transiter par le bus. |
| D16 | 2026-11-03 | Compression gzip faite dans `platform/storage.ts` (octets stockés dans IndexedDB) ; l'export `.tssrsave` reste du JSON lisible | `core/save` reste pur et synchrone côté format ; l'export doit être lisible et réimportable. |
| D17 | 2026-11-03 | Une sauvegarde illisible est vue comme un emplacement vide (jamais d'exception au chargement) | Principe « l'erreur n'est jamais punitive » ; l'import de fichier, lui, signale l'erreur. |
| D18 | 2026-11-03 | Système de fichiers = objet `chemin → nœud` (et non `Map`) ; docs/09 corrigé (`state.fs['/srv/app.conf']`) | Principe « état sérialisable » de docs/03. |
| D19 | 2026-11-03 | Messages d'erreur : `strerror` glibc fr (« Aucun fichier ou dossier de ce type », « Permission non accordée »…) avec noms de fichiers entre apostrophes droites | Comportement de coreutils 9.1 en fr_FR sur Debian 12 ; cohérent avec les exemples de docs/03 et docs/09. |
| D20 | 2026-11-03 | Dossiers personnels créés en 0700 | Valeur par défaut de adduser sur Debian 12 (DIR_MODE=0700). |
| D21 | 2026-11-03 | Occupation disque = `baseUsed` (part non modélisée) + taille des fichiers simulés ; `df` simplifié sans les 5 % réservés d'ext4 | Supprimer un fichier libère réellement de la place ; sobriété plutôt que faux. |
| D22 | 2026-11-03 | Pannes de service (`no-space-left`, `port-in-use`) réévaluées à chaque démarrage | La réussite se vérifie sur l'état : le service redémarre dès que la cause disparaît, quelle que soit la méthode. |
| D23 | 2026-11-03 | Historique des commandes : champ `ok` distinct du code de retour (ex. `systemctl status` d'un service en échec renvoie 3 mais compte comme exécuté) | Les conditions `command` de docs/04 portent sur une commande « exécutée avec succès ». |
| D24 | 2026-11-03 | Règle ESLint jsdoc : TSDoc exigée sur fonctions, classes, interfaces, types et constantes exportés (pas sur les fonctions fléchées internes) | Évite de documenter chaque callback d'un objet exporté. |
| D25 | 2026-11-03 | Interface `BashCommand.run(args, env)` (env = machine, compte, cwd, stdin, ctx, `runAs`) au lieu de `run(args, io, machine, ctx)` ; docs/03 mis à jour | Un seul objet extensible ; `sudo` a besoin de relancer une commande sous root. |
| D26 | 2026-11-03 | `ExecResult.output` (sorties entremêlées) et `CommandLineSimulator.banner` ajoutés à l'interface commune | Garder l'ordre réel stdout/stderr dans le terminal ; bannière SSH réaliste. |
| D27 | 2026-11-03 | `ls` en fr_FR : format `%e %b %H:%M` (jour avant le mois, mois alignés sur 5 caractères), tri par collation française qui ignore la ponctuation | Traduction coreutils fr et strcoll de glibc. |
| D28 | 2026-11-03 | Journal lisible seulement par root, adm, systemd-journal ; la mission d'Hugo mettra hugo dans `adm` | Fidélité Debian ; un admin de LabCorp est logiquement dans `adm`, ce qui lui montre la cause dans `systemctl status`. |
| D29 | 2026-11-03 | Commandes présentes dans /usr/bin mais pas encore simulées → « commande non disponible dans cette simulation » (code 127) | Recommandation de docs/03 ; distingue d'une vraie faute de frappe (« commande introuvable »). |
| D30 | 2026-11-03 | `&` (arrière-plan) et mot de passe sudo reportés en phase 1 | Hors du périmètre de la mission d'Hugo ; noté dans docs/03. |
| D31 | 2026-11-03 | XP de mission = étapes (20 + 10 si parfaite) + `rewards.xp` (50 par défaut) | Concilie docs/01 (barème par étape) et docs/04 (`rewards.xp: 150`). |
| D32 | 2026-11-03 | Erreurs de terminal : seule une commande qui **agit** et échoue compte (lecture et exploration exclues) | « pas les commandes d'exploration » (docs/04) ; règle simple et prévisible. |
| D33 | 2026-11-03 | Le moteur publie des codes de retour (`correct`, `incorrect`…), traduits par l'interface | Règle 3 de CLAUDE.md : aucun texte joueur dans la logique. Les notifications de fin de mission/niveau sont produites par l'UI à partir des événements. |
| D34 | 2026-11-03 | `exit` dans un terminal de mission ne ferme pas la fenêtre : la session reste ouverte (code `session-kept-open`) | Évite de perdre l'état de l'étape ; on quitte par le bouton Quitter. |
| D35 | 2026-11-03 | Étape `input` avec `pattern` : champ `example` obligatoire | Il faut une réponse de référence rejouable par `test:content` (règle 6 de CLAUDE.md). |
| D36 | 2026-11-03 | Le plugin Vite de contenu lance `tsx scripts/build-content.ts` en sous-processus | La config Vite est chargée sans les alias d'import du projet. |
| D37 | 2026-11-03 | Chapitre 5 réduit à la seule mission de l'intranet en phase 0 (pas encore d'épreuve) ; `exam` rendu facultatif dans le schéma | Les 21 autres missions arrivent en phase 1. |
| D38 | 2026-11-03 | Phaser 3.90 + carte générée par script (`assets/generators/maps/salle-serveurs.ts`), jeu de tuiles intégré à la carte (pas de `.tsj` externe) | Le chargeur Tiled de Phaser ne lit pas les jeux de tuiles externes. La carte reste éditable dans Tiled. |
| D39 | 2026-11-03 | Éclairage phase 0 : voile multiplicatif + halos additifs + bloom/vignette (postFX) ; Light2D avec normal maps reporté en phase 1 | docs/07 rend Light2D optionnel en phase 1 ; rendu déjà « moderne » et léger. |
| D40 | 2026-11-03 | Polices auto-hébergées via @fontsource (Pixelify Sans, Atkinson Hyperlegible, JetBrains Mono, OFL) | Jeu jouable hors ligne (PWA), licences libres vérifiées ; nouvelle dépendance justifiée. |
| D41 | 2026-11-03 | Horloge de partie : mardi 3 novembre 2026, 9 h 26 (Paris), avançant en temps réel | Dates réalistes dans les sorties ; le cycle de journée accéléré arrive avec engine/time. |
| D42 | 2026-11-03 | Portraits des dialogues : initiale stylisée en attendant les portraits 48 × 48 (phase 1) | Les portraits ne sont pas encore dessinés. |
| D43 | 2026-11-03 | La complétion Tab ne complète que commandes et chemins (pas les sous-commandes de systemctl) | Équivalent d'un shell sans bash-completion ; amélioration prévue en phase 1. |
| D44 | 2026-11-03 | Partie restaurée depuis l'emplacement `auto` au démarrage ; pas encore d'écran titre | L'écran titre et la création du personnage sont en phase 1. |
| D45 | 2026-11-03 | Vue logique ≈ 320 × 180 (11 tuiles de haut), largeur adaptée à la fenêtre, zoom entier ; ambiance 0,9 et vignettage léger | Retour de l'auteur : « on ne voit rien ». À 480 × 270 toute la salle tenait à l'écran, personnages minuscules, image trop sombre. docs/07 mis à jour. |
| D46 | 2026-11-03 | Écran titre en React/CSS (pas de canevas) ; « Nouvelle partie » remet un état neuf, « Continuer » reprend `auto` | Règle 7 de CLAUDE.md ; remplace D44. |
| D47 | 2026-11-03 | Publication sur GitHub Pages (workflow `pages.yml`, base `/tssr-quest/` via `BASE_PATH`), avant le VPS prévu par docs/02 | Demande de l'auteur : un lien direct pour jouer. docs/02 mis à jour. |
| D48 | 2026-11-03 | APT simulé : catalogue de paquets réels de bookworm, mises à jour publiées sur une suite et révélées par `apt update` si sources.list la contient ; commandes liées à un paquet (`package`) introuvables s'il est absent | Fidélité (pas de mise à jour sans `apt update`, sources.list cassé = erreurs réelles) et missions « paquets » rejouables. |
| D49 | 2026-11-03 | Travail sur la branche `dev`, `master` réservée à la publication (déploiement Pages) | Demande de l'auteur. docs/10 mis à jour (remplace « main protégée »). |
| D50 | 2026-11-03 | Refonte graphique : assets du monde générés par du code (`assets/generators`, encodeur PNG maison, `npm run assets:build`) plutôt que dessinés à la main | Aucun outil graphique dans l'environnement ; reproductible, versionné, retouchable. Pas de dépendance ajoutée. |
| D51 | 2026-11-03 | Vue ≈ 16 × 9 tuiles (×5 en 720p, ×7 en 1080p, ×10 en 1440p) et `--screen-scale` de l'interface sur grand écran | Demande de l'auteur : personnages plus grands, interface lisible en 1080p et 1440p. docs/07 mis à jour. |
| D52 | 2026-11-03 | Carte du plateau technique recomposée (40 × 24) : salle serveurs, supervision, coin pause ; Hugo à son bureau de la supervision, même case qu'avant (32, 11) | Variété et ambiances par pièce ; les tests E2E gardent leurs coordonnées. |
| D53 | 2026-11-03 | Tickets ouverts, alertes et objectif actif calculés dans `engine/tickets/ticket-board.ts` et fournis au HUD par les services d'interface, avec l'horloge du moteur | Pas de logique dans React (règle de CLAUDE.md). |
| D54 | 2026-11-03 | Réseau de phase 1 : modèle local (interfaces, routes, voisins du LAN qui répondent, hôtes publics connus, DNS lu dans /etc/resolv.conf) dans `sims/shared/network.ts` ; le moteur de topologies reste en phase 2 | Suffit aux missions Linux (ip-fixe, diagnostic) et à APT ; extensible. |
| D55 | 2026-11-03 | `ping` en français (iputils 20221126 traduit sous Debian : « 64 octets de… temps= »), `ifupdown` et `iproute2` en anglais (non traduits), sauf les erreurs système (strerror) ; sans `-c`, 4 paquets puis « ^C » | Fidélité à une Debian 12 en fr_FR ; le terminal n'a pas de sortie continue. |
| D56 | 2026-11-03 | Numéro d'inœud de `stat` dérivé du chemin (stable) | Il changeait à chaque fichier ajouté au système simulé. |
| D57 | 2026-11-03 | `free` en français (procps-ng traduit : « utilisé, libre, tamp/cache, disponible, Échange ») ; `uptime`, `top` (1re ligne) et `renice` (util-linux, traductions dans un paquet non installé) en anglais, erreurs système en français | Fidélité à une Debian 12 en fr_FR. |
| D58 | 2026-11-03 | Tables cron dans /var/spool/cron/crontabs/<compte> (en-tête « DO NOT EDIT », mode 600, groupe crontab) ; `crontab -e` = vim sur /tmp/crontab.XXXXXX/crontab puis installation à la fermeture via `EditorHook` / `afterEdit` du simulateur ; pas de question « retry » (les modifications restent dans le fichier temporaire) | Fidèle à Debian (cron 3.0pl1) ; le terminal n'a pas d'éditeur au choix (select-editor) : vim d'office. |
| D59 | 2026-11-03 | `at` dans un paquet non installé par défaut (comme sur Debian) ; invite « at> » terminée par Ctrl+D (nouvelle touche du terminal, affichée `<EOT>`) | Pédagogie (installer l'outil) et fidélité. |
| D60 | 2026-11-03 | Sous-shells `( … )` dans le simulateur Bash (tube et redirections en sortie ; la session est rétablie) | Recette classique `(crontab -l; echo …) | crontab -`. |
| D11 | 2026-11-03 | LICENSE : MIT (code) + CC BY-NC 4.0 (contenu) | Proposition de docs/14, **à confirmer par l'auteur** avant le dépôt public. |

## Problèmes rencontrés

- Corrigé : le terminal de mission ignorait les lignes vides, ce qui bloquait les questions dont la réponse par défaut est Entrée (champs d'adduser, `[O/n]` d'APT, invite `at>`). Test ajouté (`vim-steps.test.ts`).

- Un test a échoué une fois sous `test:coverage` pendant la refonte puis est passé trois fois de suite ; cause non identifiée (probablement un minuteur des tests du HUD sous charge). À surveiller.

- **Tags non poussés** : le proxy git de la session cloud refuse `git push origin v0.1.0` (HTTP 403) alors que la branche `master` passe. Le tag annoté `v0.1.0` est sur le commit `2255fab` ; à pousser depuis un poste local : `git fetch origin && git tag -a v0.1.0 2255fab -m "Phase 0 — Fondations" && git push origin v0.1.0` (ou créer la release sur GitHub).
- Redémarrage de `WorldScene` : Phaser réutilise l'instance de scène, il faut réinitialiser les tableaux dans `create()` et préférer `keyboard.on('keydown-X')` aux écouteurs posés sur les objets `Key` (corrigé).
- `pkill -f vite` tue aussi le shell courant quand la commande contient « vite » : utiliser `ps … | awk | xargs kill`.

- npm `Cannot read properties of null (reading 'edgesOut')` en installant Vitest 4 : contourné par `legacy-peer-deps` (D4).

## Bilans de phase

### Phase 0 — Fondations (`v0.1.0`, 3 novembre 2026)

**Fait** : toutes les cases de la phase 0 de docs/11 (cochées aussi dans la roadmap).

- Outillage : Vite 8, React 19, TypeScript 6 strict, ESLint 9 (dépendances entre dossiers, TSDoc obligatoire), Prettier, hooks Git, Vitest 4 (logique + interface), Playwright, CI GitHub Actions.
- Socle : bus typé, aléatoire à graine, store Zustand + Immer (8 tranches), sauvegarde versionnée (Zod, migrations, export/import, IndexedDB gzip).
- Simulateurs : machine Debian 12 (fs avec droits POSIX, comptes, services systemd avec pannes réévaluées, disques, journaux) ; Bash (lexer, parser, expansion, interpréteur, pipes, redirections) et 21 commandes aux sorties fr_FR fidèles.
- Contenu : schémas Zod, compilation, validation croisée, rejeu des solutions ; chapitre 5 + mission `linux-admin.intranet-down`, dialogues d'Hugo, 2 fiches.
- Moteur : missions (5 types d'étapes, conditions, indices, erreurs, XP), dialogues (choix, effets, conditions), progression, orchestrateur.
- Monde : salle serveurs Tiled, joueur 8 directions + clic/A*, Hugo recoloré avec marqueur, lumière d'ambiance, LED, poussière, bloom.
- Interface : HUD, dialogues, fenêtre de mission (terminal, choix, saisie, ordre), notifications.

**Chiffres** : 550 tests unitaires et de composants, 2 tests E2E ; couverture globale 90,9 % des lignes (sims 96 %, engine > 90 %, core 99 %, content 97 %, ui 97 %) ; JS 520 Ko gzip.

**Reste / reporté** (noté dans Décisions) : écran titre et création du personnage, portraits, Light2D, sudo avec mot de passe, `&`, variantes de révision, complétion des sous-commandes — tout cela est prévu en phase 1.

**Tester le jeu** :

```bash
npm install
npm run dev            # http://localhost:5173 (compile aussi le contenu)
```

Flèches/ZQSD (ou WASD) pour marcher, Maj pour courir, clic pour aller quelque part. Va voir Hugo (le « ! » à droite de la salle), appuie sur E, puis dans le terminal : `systemctl status apache2`, `df -h`, `ls -lh /var/log`, `sudo rm /var/log/debug.log`, `sudo systemctl restart apache2`. La partie est sauvegardée automatiquement en fin de mission (IndexedDB) ; pour repartir de zéro, vider les données du site.

Vérifications : `npm run lint && npm run typecheck && npm run test:coverage && npm run test:content && npm run build && npm run test:e2e`.
