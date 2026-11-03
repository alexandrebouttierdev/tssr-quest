import { ArithError, evaluateArithmetic } from './arith';
import type { Word, WordPart } from './ast';
import { expandGlob, hasGlob } from './glob';
import type { Machine } from '@sims/shared/types';

/** Erreur d'expansion (message de bash prêt à afficher). */
export class ExpansionError extends Error {
  override readonly name = 'ExpansionError';
}

/** Contexte d'expansion. */
export interface ExpandEnv {
  readonly machine: Machine;
  readonly user: string;
  readonly cwd: string;
  /** Dossier personnel du compte de la session (pour `~`). */
  readonly home: string;
  readonly vars: Readonly<Record<string, string>>;
  /** Code de retour précédent (`$?`). */
  readonly lastStatus: number;
  /** PID du shell (`$$`). */
  readonly pid: number;
  /** Exécute une substitution de commande et renvoie sa sortie standard. */
  substitute(source: string): string;
}

/** Morceau de texte d'un champ, protégé ou non. */
interface Segment {
  readonly text: string;
  readonly quoted: boolean;
}

/** Valeur d'un paramètre `$nom` ou `${…}`. */
function paramValue(name: string, env: ExpandEnv): string {
  switch (name) {
    case '?':
      return String(env.lastStatus);
    case '$':
      return String(env.pid);
    case '#':
      return '0';
    case '0':
      return 'bash';
    case '@':
    case '*':
    case '!':
    case '-':
      return '';
  }
  if (/^[1-9]$/.test(name)) return '';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return env.vars[name] ?? '';
  const length = /^#([A-Za-z_][A-Za-z0-9_]*)$/.exec(name);
  if (length) return String((env.vars[length[1] ?? ''] ?? '').length);
  const op = /^([A-Za-z_][A-Za-z0-9_]*)(:?)([-+=])(.*)$/s.exec(name);
  if (op) {
    const [, variable = '', colon, kind, word = ''] = op;
    const value = env.vars[variable];
    const unset = value === undefined || (colon === ':' && value === '');
    if (kind === '+') return unset ? '' : word;
    return unset ? word : value;
  }
  throw new ExpansionError(`bash: \${${name}}: mauvaise substitution`);
}

/** Valeur textuelle d'un morceau d'expansion (variable, substitution, calcul). */
function partValue(part: Exclude<WordPart, { type: 'literal' }>, env: ExpandEnv): string {
  if (part.type === 'param') return paramValue(part.name, env);
  if (part.type === 'command') return env.substitute(part.source).replace(/\n+$/, '');
  try {
    return String(evaluateArithmetic(part.expression, env.vars));
  } catch (error) {
    if (error instanceof ArithError)
      throw new ExpansionError(`bash: ${part.expression} : ${error.message}`);
    throw error;
  }
}

/** Développe le tilde d'un premier morceau littéral non protégé. */
function expandTilde(parts: readonly WordPart[], env: ExpandEnv): WordPart[] {
  const [first, ...rest] = parts;
  if (first?.type !== 'literal' || first.quoted || !first.value.startsWith('~')) return [...parts];
  const match = /^~([a-z_][a-z0-9_-]*)?(?=\/|$)/.exec(first.value);
  if (!match) return [...parts];
  const userName = match[1];
  const home = userName === undefined ? env.home : env.machine.users[userName]?.home;
  if (home === undefined) return [...parts];
  const tail = first.value.slice(match[0].length);
  return [
    { type: 'literal', value: home, quoted: true },
    ...(tail ? [{ type: 'literal' as const, value: tail, quoted: false }] : []),
    ...rest,
  ];
}

/** Découpe un mot en champs (segments), en appliquant le découpage IFS. */
function toFields(
  word: Word,
  env: ExpandEnv,
  split: boolean,
): { segments: Segment[]; keep: boolean }[] {
  const fields: { segments: Segment[]; keep: boolean }[] = [];
  let current: { segments: Segment[]; keep: boolean } = { segments: [], keep: false };
  for (const part of expandTilde(word.parts, env)) {
    if (part.type === 'literal') {
      current.segments.push({ text: part.value, quoted: part.quoted });
      if (part.quoted) current.keep = true;
      continue;
    }
    const value = partValue(part, env);
    if (part.quoted || !split) {
      current.segments.push({ text: value, quoted: true });
      current.keep = true;
      continue;
    }
    const pieces = value.split(/[ \t\n]+/);
    pieces.forEach((piece, index) => {
      if (index > 0) {
        fields.push(current);
        current = { segments: [], keep: false };
      }
      if (piece !== '') {
        current.segments.push({ text: piece, quoted: false });
        current.keep = true;
      }
    });
  }
  fields.push(current);
  return fields.filter((f) => f.keep || f.segments.some((s) => s.text !== ''));
}

/**
 * Développe une liste de mots en arguments : tilde, paramètres, substitutions,
 * arithmétique, découpage des expansions non protégées, puis jokers.
 *
 * @param words - Mots de la commande.
 * @param env - Contexte d'expansion.
 * @returns Les arguments finaux.
 * @throws {ExpansionError} Si une substitution est mal formée.
 */
export function expandWords(words: readonly Word[], env: ExpandEnv): string[] {
  const result: string[] = [];
  for (const word of words) {
    for (const field of toFields(word, env, true)) {
      const text = field.segments.map((s) => s.text).join('');
      const pattern = field.segments
        .map((s) => (s.quoted ? s.text.replace(/[\\*?[\]]/g, '\\$&') : s.text))
        .join('');
      if (field.segments.some((s) => !s.quoted) && hasGlob(pattern)) {
        const matches = expandGlob(pattern, env);
        if (matches.length > 0) {
          result.push(...matches);
          continue;
        }
      }
      result.push(text);
    }
  }
  return result;
}

/**
 * Développe un mot en une seule chaîne, sans découpage ni jokers (valeur d'affectation).
 *
 * @param word - Mot à développer.
 * @param env - Contexte d'expansion.
 * @returns Le texte obtenu.
 */
export function expandToString(word: Word, env: ExpandEnv): string {
  return toFields(word, env, false)
    .flatMap((f) => f.segments.map((s) => s.text))
    .join('');
}
