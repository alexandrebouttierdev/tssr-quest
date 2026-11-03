import type { Word, WordPart } from './ast';

/** Erreur de syntaxe, avec le message exact affiché par bash en fr_FR. */
export class BashSyntaxError extends Error {
  override readonly name = 'BashSyntaxError';
}

/** Jeton produit par le lexer, avec sa position dans la ligne. */
export type Token =
  | { readonly type: 'word'; readonly word: Word; readonly start?: number; readonly end?: number }
  | { readonly type: 'op'; readonly value: string; readonly start?: number; readonly end?: number };

/** Caractères qui commencent un opérateur et terminent un mot. */
const OPERATOR_CHARS = new Set(['|', '&', ';', '<', '>', '(', ')']);

/** Opérateurs reconnus, du plus long au plus court. */
const OPERATORS = ['&>>', '&&', '||', '>>', '&>', '>&', '|', '&', ';', '<', '>', '(', ')'];

/** Message bash pour un délimiteur jamais refermé. */
function eofError(delimiter: string): BashSyntaxError {
  return new BashSyntaxError(
    `bash: EOF inattendu lors de la recherche du « ${delimiter} » correspondant`,
  );
}

/**
 * Accumule les morceaux d'un mot en fusionnant les littéraux voisins de même nature.
 */
class PartsBuilder {
  readonly parts: WordPart[] = [];

  literal(value: string, quoted: boolean): void {
    const last = this.parts.at(-1);
    if (last?.type === 'literal' && last.quoted === quoted) {
      this.parts[this.parts.length - 1] = { ...last, value: last.value + value };
    } else {
      this.parts.push({ type: 'literal', value, quoted });
    }
  }

  push(part: WordPart): void {
    this.parts.push(part);
  }
}

/**
 * Cherche la parenthèse fermante qui équilibre une ouverture, en ignorant les
 * parenthèses entre guillemets.
 *
 * @returns L'index de la parenthèse fermante, ou -1.
 */
function findClosingParen(line: string, from: number): number {
  let depth = 1;
  for (let i = from; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') i++;
    else if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === '\\' ? 2 : 1;
      i = j;
    } else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Lit une expansion qui commence par `$` à la position `i`.
 *
 * @returns Le morceau lu (ou `null` pour un `$` littéral) et la position suivante.
 */
function readDollar(
  line: string,
  i: number,
  quoted: boolean,
): { part: WordPart | null; next: number } {
  const rest = line.slice(i + 1);
  if (rest.startsWith('((')) {
    const close = findClosingParen(line, i + 3);
    const end = close < 0 ? -1 : findClosingParen(line, i + 2);
    if (close < 0 || end !== close + 1) throw eofError(')');
    return {
      part: { type: 'arith', expression: line.slice(i + 3, close).trim(), quoted },
      next: end + 1,
    };
  }
  if (rest.startsWith('(')) {
    const close = findClosingParen(line, i + 2);
    if (close < 0) throw eofError(')');
    return { part: { type: 'command', source: line.slice(i + 2, close), quoted }, next: close + 1 };
  }
  if (rest.startsWith('{')) {
    const close = line.indexOf('}', i + 2);
    if (close < 0) throw eofError('}');
    return { part: { type: 'param', name: line.slice(i + 2, close), quoted }, next: close + 1 };
  }
  const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)?.[0];
  if (name) return { part: { type: 'param', name, quoted }, next: i + 1 + name.length };
  const special = rest[0];
  if (special !== undefined && /[0-9?#@*$!-]/.test(special)) {
    return { part: { type: 'param', name: special, quoted }, next: i + 2 };
  }
  return { part: null, next: i + 1 };
}

/** Lit une substitution par accents graves à partir de `i` (sur l'accent ouvrant). */
function readBacktick(line: string, i: number, quoted: boolean): { part: WordPart; next: number } {
  let j = i + 1;
  let source = '';
  while (j < line.length && line[j] !== '`') {
    if (line[j] === '\\' && line[j + 1] === '`') {
      source += '`';
      j += 2;
    } else {
      source += line[j];
      j++;
    }
  }
  if (j >= line.length) throw eofError('`');
  return { part: { type: 'command', source, quoted }, next: j + 1 };
}

/** Lit le contenu d'une chaîne entre guillemets doubles (après le guillemet ouvrant). */
function readDoubleQuoted(line: string, i: number, builder: PartsBuilder): number {
  let j = i;
  let sawContent = false;
  while (j < line.length && line[j] !== '"') {
    const c = line[j] ?? '';
    sawContent = true;
    if (c === '\\' && j + 1 < line.length && '$`"\\\n'.includes(line[j + 1] ?? '')) {
      builder.literal(line[j + 1] ?? '', true);
      j += 2;
    } else if (c === '$') {
      const { part, next } = readDollar(line, j, true);
      if (part) builder.push(part);
      else builder.literal('$', true);
      j = next;
    } else if (c === '`') {
      const { part, next } = readBacktick(line, j, true);
      builder.push(part);
      j = next;
    } else {
      builder.literal(c, true);
      j++;
    }
  }
  if (j >= line.length) throw eofError('"');
  // "" produit un mot vide, qui doit être conservé comme argument.
  if (!sawContent) builder.literal('', true);
  return j + 1;
}

/**
 * Découpe une ligne en jetons : mots (avec leurs guillemets et expansions) et
 * opérateurs (`|`, `&&`, `||`, `;`, redirections).
 *
 * @param line - Ligne saisie par le joueur.
 * @returns Les jetons dans l'ordre.
 * @throws {BashSyntaxError} Si un guillemet ou une substitution n'est pas refermé.
 */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i] ?? '';
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '\n') {
      tokens.push({ type: 'op', value: ';', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '#') break;
    const io = /^(\d+)(>>|>&\d+|>&|>|<)/.exec(line.slice(i)) ?? /^(>&\d+)/.exec(line.slice(i));
    if (io) {
      tokens.push({ type: 'op', value: io[0], start: i, end: i + io[0].length });
      i += io[0].length;
      continue;
    }
    if (OPERATOR_CHARS.has(c)) {
      const op = OPERATORS.find((o) => line.startsWith(o, i)) ?? c;
      tokens.push({ type: 'op', value: op, start: i, end: i + op.length });
      i += op.length;
      continue;
    }
    const start = i;
    const builder = new PartsBuilder();
    while (i < line.length) {
      const ch = line[i] ?? '';
      if (ch === ' ' || ch === '\t' || ch === '\n' || OPERATOR_CHARS.has(ch)) break;
      if (ch === "'") {
        const end = line.indexOf("'", i + 1);
        if (end < 0) throw eofError("'");
        builder.literal(line.slice(i + 1, end), true);
        i = end + 1;
      } else if (ch === '"') {
        i = readDoubleQuoted(line, i + 1, builder);
      } else if (ch === '\\') {
        if (i + 1 < line.length && line[i + 1] !== '\n') builder.literal(line[i + 1] ?? '', true);
        i += 2;
      } else if (ch === '$') {
        const { part, next } = readDollar(line, i, false);
        if (part) builder.push(part);
        else builder.literal('$', false);
        i = next;
      } else if (ch === '`') {
        const { part, next } = readBacktick(line, i, false);
        builder.push(part);
        i = next;
      } else {
        builder.literal(ch, false);
        i++;
      }
    }
    tokens.push({
      type: 'word',
      word: { parts: builder.parts, raw: line.slice(start, i) },
      start,
      end: i,
    });
  }
  return tokens;
}
