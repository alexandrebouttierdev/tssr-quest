/**
 * Arbre syntaxique d'une ligne de commande Bash (docs/03-simulateurs.md, `parser.ts`).
 */

/** Morceau d'un mot, avant expansion. */
export type WordPart =
  /** Texte littéral ; `quoted` empêche le découpage et les jokers. */
  | { readonly type: 'literal'; readonly value: string; readonly quoted: boolean }
  /** Paramètre : `$HOME`, `${USER}`, `$?`, `$1`, `$@`. */
  | { readonly type: 'param'; readonly name: string; readonly quoted: boolean }
  /** Substitution de commande : `$(…)` ou `` `…` ``. */
  | { readonly type: 'command'; readonly source: string; readonly quoted: boolean }
  /** Expression arithmétique : `$((…))`. */
  | { readonly type: 'arith'; readonly expression: string; readonly quoted: boolean };

/** Mot de la ligne de commande. */
export interface Word {
  readonly parts: readonly WordPart[];
}

/** Redirection d'entrée ou de sortie. */
export type Redirection =
  /** `>` (écrase), `>>` (ajoute) ou `<` (lit) vers un fichier, sur un descripteur. */
  | {
      readonly type: 'file';
      readonly fd: number;
      readonly op: '>' | '>>' | '<';
      readonly target: Word;
    }
  /** `&>` : sortie standard et d'erreur vers un fichier. */
  | { readonly type: 'both'; readonly append: boolean; readonly target: Word }
  /** `2>&1` : duplique un descripteur sur un autre. */
  | { readonly type: 'dup'; readonly fd: number; readonly to: number };

/** Affectation de variable (`NOM=valeur`). */
export interface Assignment {
  readonly name: string;
  readonly value: Word;
}

/** Commande simple : affectations, mots et redirections. */
export interface SimpleCommand {
  readonly type: 'simple';
  readonly assignments: readonly Assignment[];
  readonly words: readonly Word[];
  readonly redirections: readonly Redirection[];
  /** Texte source de la commande, pour l'historique. */
  readonly source: string;
}

/** Pipeline : commandes reliées par `|`, éventuellement niée par `!`. */
export interface Pipeline {
  readonly negated: boolean;
  readonly commands: readonly SimpleCommand[];
}

/** Élément d'une liste : le connecteur qui le précède décide s'il s'exécute. */
export interface ListItem {
  /** `;` (toujours), `&&` (si succès), `||` (si échec). Le premier élément porte `;`. */
  readonly connector: ';' | '&&' | '||';
  readonly pipeline: Pipeline;
}

/** Ligne complète : une liste de pipelines. */
export interface Script {
  readonly items: readonly ListItem[];
}
