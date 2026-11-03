# 10 — Conventions de code

## Langue

| Élément | Langue | Exemple |
| --- | --- | --- |
| Identifiants (variables, fonctions, types, fichiers) | Anglais | `missionRunner`, `evaluateCondition` |
| Commentaires et TSDoc | **Français** | `/** Évalue une condition sur l'état courant de la machine. */` |
| Noms de tests (`describe`, `it`) | **Français** | `it('refuse un mot de passe trop court')` |
| Messages de commit | **Français** (Conventional Commits) | `feat(ios): ajoute la commande show vlan brief` |
| Textes vus par le joueur | **Français** | Dans `content/` et `src/ui/strings/` |
| Documentation (`docs/`, README) | **Français** | — |
| Sorties des simulateurs | Celle du vrai système | `Active: failed (Result: exit-code)` |

Pourquoi des identifiants en anglais : ils s'alignent sur les API (Phaser, React, DOM, Node), évitent les accents dans le code et restent lisibles par la communauté open source. Tout ce qui *explique* est en français.

## Documentation du code

- **TSDoc obligatoire** sur tout export : description, `@param`, `@returns`, `@throws`, `@example` quand c'est utile.
- Les commentaires expliquent le **pourquoi** (règle métier, choix technique, piège), pas le quoi évident.
- Chaque dossier de `src/` a un `README.md` court : rôle, dépendances autorisées, points d'entrée.
- Les règles métier issues du programme TSSR citent leur notion : `// AGDLP : les droits se posent sur le groupe domaine local, jamais sur le compte.`

```ts
/**
 * Calcule la priorité d'un ticket à partir de son urgence et de son impact,
 * selon la matrice ITIL utilisée dans le chapitre 7.
 *
 * @param urgency - Urgence déclarée par le demandeur (1 = très haute, 5 = très basse).
 * @param impact - Impact estimé sur l'activité (1 = majeur, 5 = mineur).
 * @returns La priorité de 1 (critique) à 5 (très basse).
 * @example
 * computePriority(1, 2); // 1
 */
export function computePriority(urgency: Level, impact: Level): Level {
  // Matrice simplifiée et symétrique du jeu : moyenne arrondie vers le haut.
  // À aligner sur la matrice vue en cours avant la publication du chapitre 7.
  return Math.ceil((urgency + impact) / 2) as Level;
}
```

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- Pas de `any`. Pas de `as` sauf commentaire justificatif. `unknown` + Zod aux frontières (YAML, sauvegardes, entrées joueur).
- Types de données immuables : `readonly` partout dans les états de simulateurs.
- Unions discriminées pour les événements, les étapes, les conditions ; `switch` exhaustif avec `assertNever`.
- Fonctions pures dans `src/sims` et `src/engine` ; les classes sont réservées à Phaser (`Scene`, `GameObject`) et aux gestionnaires à cycle de vie (`AudioManager`).
- Imports avec alias : `@core/…`, `@engine/…`, `@sims/…`, `@content/…`, `@game/…`, `@ui/…`.

## Dépendances entre dossiers

| Dossier | Peut importer |
| --- | --- |
| `core` | rien d'autre dans `src` |
| `sims` | `core` |
| `content` | `core` |
| `engine` | `core`, `sims`, `content` |
| `game` | `core`, `engine` (lecture), `content` |
| `ui` | `core`, `engine` (lecture), `content`, `sims` (types seulement) |
| `app` | tout |

Vérifié par la règle ESLint `import/no-restricted-paths`.

## React

- Composants fonctionnels, un composant par fichier, nom en PascalCase.
- État global via `useGameStore(selector)` avec sélecteurs fins ; état local avec `useState` / `useReducer`.
- Aucune logique de jeu dans les composants : ils affichent et émettent des événements.
- Styles : CSS Modules + variables CSS de `src/ui/styles/tokens.css`.
- Accessibilité : rôles ARIA, labels, focus géré à l'ouverture et à la fermeture des fenêtres.

## Phaser

- Une scène = un fichier ; logique extraite dans `src/game/systems` (fonctions testables).
- Pas d'accès au DOM depuis Phaser ; pas de `window` global hors `bridge.ts`.
- Les clés d'assets sont des constantes typées (`src/game/keys.ts`), jamais des chaînes libres.
- Nettoyage systématique des abonnements au store à la destruction de la scène.

## Nommage des fichiers

| Type | Format |
| --- | --- |
| Module TS | `kebab-case.ts` |
| Composant React | `PascalCase.tsx` (dossier du même nom si styles ou sous-composants) |
| Scène Phaser | `PascalCaseScene.ts` |
| Tranche du store | `nom.slice.ts` |
| Test | `même-nom.test.ts(x)` |
| Mission | `slug.mission.yaml` |
| Dialogue | `npc-id.dialogue.yaml` |

## Git

- Branche principale `main`, protégée. Travail sur des branches `feat/…`, `fix/…`, `content/…`.
- Conventional Commits en français : `feat`, `fix`, `content`, `test`, `docs`, `refactor`, `perf`, `chore`, `style`, `ci`.
- Portée = dossier ou simulateur : `feat(bash): …`, `content(chap-05): …`, `fix(ui/terminal): …`.
- Une pull request = un sujet, avec la case « Définition de terminé » de `CLAUDE.md` cochée.
- Tags `vX.Y.Z` à chaque jalon publié ; `CHANGELOG.md` généré.
