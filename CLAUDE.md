# CLAUDE.md — Règles de travail pour TSSR Quest

Ce fichier est lu par Claude Code au début de chaque session. Il prime sur les habitudes par défaut.

## Le projet en une phrase

RPG 2D pixel art en navigateur (React + Phaser + TypeScript) qui fait pratiquer tout le programme du titre TSSR à travers des missions jouées dans des simulateurs (Bash, PowerShell, Cisco IOS, Active Directory, GLPI…). Jeu **100 % en français**.

## Documents de référence

Avant toute tâche, lire le ou les documents concernés dans `docs/` :

- Architecture et arborescence : `docs/02-architecture.md` (fait foi pour l'emplacement de chaque fichier)
- Simulateurs : `docs/03-simulateurs.md`
- Format des missions : `docs/04-moteur-missions.md`
- Contenu des chapitres : `docs/05-campagne.md`
- Tests : `docs/09-tests-qualite.md`
- Conventions : `docs/10-conventions-code.md`
- Ordre de construction : `docs/11-roadmap.md`

Si une décision contredit un document, mettre à jour le document dans le même commit et le signaler.

## Commandes

```bash
npm install            # dépendances
npm run dev            # serveur de dev Vite (http://localhost:5173)
npm run build          # build de production dans dist/
npm run preview        # sert le build
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run format         # Prettier
npm test               # Vitest en mode run
npm run test:watch     # Vitest en mode watch
npm run test:coverage  # couverture (seuils dans vitest.config.ts)
npm run test:content   # validation de tout le contenu YAML + rejeu des solutions
npm run test:e2e       # Playwright
npm run content:build  # compile content/**/*.yaml en JSON typé
```

## Règles non négociables

1. **TypeScript strict** partout (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Pas de `any` ; `unknown` + validation Zod aux frontières.
2. **Commentaires et documentation en français** : TSDoc sur toute fonction, classe, type exporté ; commentaires de bloc pour expliquer le *pourquoi*. Les identifiants de code restent en anglais (voir `docs/10-conventions-code.md`).
3. **Tout texte vu par le joueur est en français** et vit dans `content/` ou `src/ui/strings/`, jamais en dur dans la logique.
4. **Tests unitaires obligatoires** pour tout code de `src/core`, `src/engine`, `src/sims`, `src/content`. Un bug corrigé = un test qui le reproduit d'abord.
5. **Les simulateurs et le moteur ne dépendent ni de Phaser ni de React ni du DOM.** Ce sont des modules TypeScript purs, testables dans Node.
6. **Chaque mission a une solution de référence** (`solution:` dans son YAML) rejouée par `npm run test:content`. Une mission non résolvable ne passe pas la CI.
7. **Phaser ne touche jamais au DOM de l'interface, React ne touche jamais au canvas.** Ils communiquent par le store Zustand et le bus d'événements (`src/core/events`).
8. Pas de nouvelle dépendance sans justification dans le message de commit ; préférer le code maison pour les simulateurs.
9. Accessibilité : toute fenêtre React est utilisable au clavier, focus visible, contrastes AA.
10. Performance : 60 i/s sur un portable moyen, < 5 Mo au premier chargement hors musique.

## Définition de « terminé »

Une tâche est terminée quand :

- [ ] le code compile (`npm run typecheck`) et passe le lint ;
- [ ] les tests unitaires existent, passent, et la couverture du dossier touché reste au-dessus du seuil ;
- [ ] `npm run test:content` passe si du contenu a changé ;
- [ ] les commentaires TSDoc en français sont présents ;
- [ ] la doc concernée dans `docs/` est à jour ;
- [ ] le commit suit Conventional Commits, message en français (`feat(bash): ajoute la commande chmod`).

## Façon de travailler

- Avancer par petites étapes vérifiables, dans l'ordre de `docs/11-roadmap.md`.
- Écrire d'abord les types et les tests d'un module, puis l'implémentation (TDD encouragé pour `src/sims` et `src/engine`).
- Après chaque étape : lancer `npm run typecheck && npm test`, puis résumer en 3 lignes ce qui a été fait et ce qui reste.
- En cas de doute sur une règle de jeu ou un contenu pédagogique, poser la question plutôt que d'inventer.
- Exactitude technique : les sorties de commandes simulées doivent ressembler fidèlement à celles d'une Debian 12, d'un Windows 11 / Windows Server 2022, d'un Cisco IOS 15. En cas de doute, rester sobre plutôt que faux.

## Ce qu'il ne faut pas faire

- Copier des logos, interfaces graphiques ou textes protégés de Microsoft, Cisco, VMware, GLPI ou de l'ENI.
- Ajouter de l'anglais dans l'interface (sauf sorties de commandes réelles qui sont en anglais sur les vrais systèmes).
- Mettre de la logique de jeu dans les composants React ou dans les scènes Phaser : elle va dans `src/engine`.
- Générer du contenu de mission « au kilomètre » sans solution de référence ni relecture.
