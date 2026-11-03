import { strerror, type Errno } from '@sims/shared/errors';
import { readFile } from '@sims/shared/fs';
import type { CommandEnv } from '../command';

/** Texte d'une entrée (fichier ou entrée standard) lu par une commande de filtre. */
export interface InputText {
  /** Nom affiché (`-` pour l'entrée standard). */
  readonly name: string;
  readonly content: string;
}

/**
 * Lit les fichiers donnés en opérandes, ou l'entrée standard s'il n'y en a pas
 * (comportement des filtres : cat, head, wc, grep, sort…).
 *
 * @param env - Environnement de la commande.
 * @param operands - Noms de fichiers (`-` = entrée standard).
 * @param command - Nom de la commande, pour les messages d'erreur.
 * @returns Les textes lus et les messages d'erreur.
 */
export function readInputs(
  env: CommandEnv,
  operands: readonly string[],
  command: string,
): { inputs: InputText[]; stderr: string } {
  const inputs: InputText[] = [];
  let stderr = '';
  for (const operand of operands.length ? operands : ['-']) {
    if (operand === '-') {
      inputs.push({ name: '-', content: env.stdin });
      continue;
    }
    const read = readFile(env.machine, env.resolve(operand), env.user);
    if (read.ok) inputs.push({ name: operand, content: read.value });
    else stderr += `${command}: ${operand}: ${strerror(read.error)}\n`;
  }
  return { inputs, stderr };
}

/**
 * Message d'erreur au format coreutils : `cmd: action 'fichier': raison`.
 *
 * @param command - Nom de la commande.
 * @param action - Action ratée (« impossible de supprimer »).
 * @param operand - Fichier tel que tapé.
 * @param error - Code errno.
 * @returns La ligne d'erreur, avec fin de ligne.
 */
export function fsError(command: string, action: string, operand: string, error: Errno): string {
  return `${command}: ${action} '${operand}': ${strerror(error)}\n`;
}

/**
 * Message « opérande manquant » de coreutils.
 *
 * @param command - Nom de la commande.
 * @param what - Variante (« opérande manquant », « opérande de fichier manquant »).
 * @returns Les deux lignes d'erreur.
 */
export function missingOperand(command: string, what = 'opérande manquant'): string {
  return `${command}: ${what}\nSaisissez « ${command} --help » pour plus d'informations.\n`;
}

/**
 * Découpe un texte en lignes, sans la ligne vide finale due au dernier saut de ligne.
 *
 * @param text - Texte.
 * @returns Les lignes.
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * Recompose des lignes en texte terminé par un saut de ligne.
 *
 * @param lines - Lignes.
 * @returns Le texte.
 */
export function joinLines(lines: readonly string[]): string {
  return lines.length ? `${lines.join('\n')}\n` : '';
}
