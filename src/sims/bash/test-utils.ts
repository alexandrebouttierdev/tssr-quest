/**
 * Outils de test du simulateur Bash (docs/09-tests-qualite.md) : exécuter une ligne
 * sur une machine avec une horloge fixe et un aléatoire à graine.
 */
import { createRng } from '@core/random/rng';
import type { Machine, SimContext } from '@sims/shared/types';
import { ALL_BASH_COMMANDS } from './commands/registry';
import { runLine as run } from './interpreter';

/** Date fixe des tests : mardi 3 novembre 2026, 9 h 31 min 44 s à Paris. */
export const TEST_NOW = new Date(Date.UTC(2026, 10, 3, 8, 31, 44));

/**
 * Contexte de simulation déterministe.
 *
 * @param now - Date simulée.
 * @returns Le contexte.
 */
export function testContext(now: Date = TEST_NOW): SimContext {
  return { rng: createRng(42), now };
}

/** Résultat simplifié d'une ligne exécutée en test. */
export interface LineResult {
  readonly state: Machine;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly effects: readonly { type: string }[];
}

/**
 * Exécute une ligne Bash sur une machine de test.
 *
 * @param machine - Machine de départ.
 * @param line - Ligne de commande.
 * @param now - Date simulée.
 * @returns Nouvel état, sorties et code de retour.
 */
export function runLine(machine: Machine, line: string, now: Date = TEST_NOW): LineResult {
  const result = run(machine, line, testContext(now), ALL_BASH_COMMANDS);
  return {
    state: result.machine,
    stdout: result.output
      .filter((o) => o.stream === 'stdout')
      .map((o) => o.text)
      .join(''),
    stderr: result.output
      .filter((o) => o.stream === 'stderr')
      .map((o) => o.text)
      .join(''),
    exitCode: result.exitCode,
    effects: result.effects,
  };
}

/**
 * Exécute plusieurs lignes à la suite et renvoie le résultat de la dernière.
 *
 * @param machine - Machine de départ.
 * @param lines - Lignes à exécuter dans l'ordre.
 * @returns Le résultat de la dernière ligne (avec l'état cumulé).
 */
export function runLines(machine: Machine, lines: readonly string[]): LineResult {
  let state = machine;
  let last: LineResult = { state, stdout: '', stderr: '', exitCode: 0, effects: [] };
  for (const line of lines) {
    last = runLine(state, line);
    state = last.state;
  }
  return last;
}
