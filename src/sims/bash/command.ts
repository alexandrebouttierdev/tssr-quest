import type { SimEffect } from '@sims/shared/simulator';
import type { Machine, SimContext } from '@sims/shared/types';

/** Environnement d'exécution fourni à une commande. */
export interface CommandEnv {
  /** Machine au moment de l'exécution. */
  readonly machine: Machine;
  /** Compte effectif (root sous `sudo`). */
  readonly user: string;
  /** Répertoire courant. */
  readonly cwd: string;
  /** Variables d'environnement. */
  readonly env: Readonly<Record<string, string>>;
  /** Entrée standard (sortie de la commande précédente du pipeline, ou fichier `<`). */
  readonly stdin: string;
  /** Vrai si la sortie standard va directement au terminal (et non dans un tube ou un fichier). */
  readonly isTerminal: boolean;
  /** Contexte de simulation (horloge, aléatoire). */
  readonly ctx: SimContext;
  /** Transforme un chemin saisi en chemin absolu normalisé (gère `~`). */
  resolve(path: string): string;
  /** Exécute une autre commande sous un autre compte (utilisé par `sudo`). */
  runAs(user: string, argv: readonly string[]): CommandOutcome;
  /** Liste des commandes connues (pour `aide`, `man`, `which`, `type`). */
  readonly commands: Readonly<Record<string, BashCommand>>;
}

/** Résultat d'une commande. */
export interface CommandOutcome {
  /** Nouvelle machine, si la commande l'a modifiée. */
  readonly machine?: Machine;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode: number;
  /**
   * Vrai si la commande a été comprise et exécutée. Par défaut : `exitCode === 0`.
   * Une commande informative au code non nul (`systemctl status` d'un service arrêté)
   * renvoie `ok: true`.
   */
  readonly ok?: boolean;
  readonly effects?: readonly SimEffect[];
}

/** Une commande du simulateur Bash (un fichier par commande dans `commands/`). */
export interface BashCommand {
  readonly name: string;
  /** Résumé affiché par `aide` et `whatis`. */
  readonly summary: string;
  /** Page de manuel simplifiée, en français, affichée par `man`. */
  readonly manual: string;
  /** Commande interne du shell (`cd`, `export`) : `sudo` ne peut pas la lancer. */
  readonly builtin?: boolean;
  /** Exécute la commande. `args` ne contient pas le nom de la commande. */
  run(args: readonly string[], env: CommandEnv): CommandOutcome;
}

/**
 * Raccourci pour une commande réussie qui n'écrit que sur la sortie standard.
 *
 * @param stdout - Texte écrit.
 * @param machine - Machine modifiée, le cas échéant.
 * @returns Le résultat avec le code 0.
 */
export function success(stdout = '', machine?: Machine): CommandOutcome {
  return machine ? { stdout, exitCode: 0, machine } : { stdout, exitCode: 0 };
}

/**
 * Raccourci pour une commande en échec.
 *
 * @param stderr - Message d'erreur (une fin de ligne est ajoutée au besoin).
 * @param exitCode - Code de retour (1 par défaut).
 * @returns Le résultat en échec.
 */
export function failure(stderr: string, exitCode = 1): CommandOutcome {
  return { stderr: stderr.endsWith('\n') ? stderr : `${stderr}\n`, exitCode };
}
