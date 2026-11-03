import type {
  Assignment,
  ListItem,
  Pipeline,
  Redirection,
  Script,
  SimpleCommand,
  Word,
} from './ast';
import { BashSyntaxError, tokenize, type Token } from './lexer';

/** Opérateurs qui terminent une commande simple. */
const COMMAND_TERMINATORS = new Set(['|', '&&', '||', ';', '&', '(', ')']);

/** Erreur « symbole inattendu » de bash. */
function unexpected(token: Token | undefined): BashSyntaxError {
  const symbol = token === undefined ? 'newline' : token.type === 'op' ? token.value : 'mot';
  return new BashSyntaxError(`bash: erreur de syntaxe près du symbole inattendu « ${symbol} »`);
}

/** Erreur de fin de ligne prématurée (opérateur en fin de ligne). */
function prematureEnd(): BashSyntaxError {
  return new BashSyntaxError('bash: erreur de syntaxe : fin de fichier prématurée');
}

/** Lit une redirection à partir de son opérateur. */
function parseRedirection(
  op: string,
  next: Token | undefined,
): { redirection: Redirection; consumed: number } | null {
  const dup = /^(\d*)>&(\d+)$/.exec(op);
  if (dup) {
    return {
      redirection: { type: 'dup', fd: Number(dup[1] || '1'), to: Number(dup[2]) },
      consumed: 1,
    };
  }
  const file = /^(\d*)(>>|>|<)$/.exec(op);
  const both = op === '&>' || op === '&>>';
  if (!file && !both) return null;
  if (next?.type !== 'word') throw unexpected(next);
  if (both) {
    return { redirection: { type: 'both', append: op === '&>>', target: next.word }, consumed: 2 };
  }
  const symbol = (file?.[2] ?? '>') as '>' | '>>' | '<';
  const fd = file?.[1] ? Number(file[1]) : symbol === '<' ? 0 : 1;
  return { redirection: { type: 'file', fd, op: symbol, target: next.word }, consumed: 2 };
}

/** Reconnaît une affectation `NOM=valeur`. */
function asAssignment(word: Word): Assignment | null {
  const [first, ...rest] = word.parts;
  if (first?.type !== 'literal' || first.quoted) return null;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(first.value);
  if (!match) return null;
  const head = match[2] ?? '';
  return {
    name: match[1] ?? '',
    value: { parts: head ? [{ type: 'literal', value: head, quoted: false }, ...rest] : rest },
  };
}

/** Vrai si le mot est exactement le littéral non protégé donné. */
function isBareWord(token: Token | undefined, value: string): boolean {
  if (token?.type !== 'word') return false;
  const [part, ...rest] = token.word.parts;
  return rest.length === 0 && part?.type === 'literal' && !part.quoted && part.value === value;
}

/**
 * Analyse une ligne de commande en liste de pipelines.
 *
 * @param line - Ligne saisie par le joueur.
 * @returns L'arbre syntaxique.
 * @throws {BashSyntaxError} Avec le message de bash en cas d'erreur de syntaxe.
 */
export function parse(line: string): Script {
  const tokens = tokenize(line);
  let pos = 0;
  const peek = () => tokens[pos];

  const parseSimple = (): SimpleCommand => {
    const assignments: Assignment[] = [];
    const words: Word[] = [];
    const redirections: Redirection[] = [];
    const first = peek();
    let lastEnd = first?.start ?? 0;
    while (pos < tokens.length) {
      const token = tokens[pos];
      if (!token) break;
      if (token.type === 'op') {
        if (COMMAND_TERMINATORS.has(token.value)) break;
        const parsed = parseRedirection(token.value, tokens[pos + 1]);
        if (!parsed) throw unexpected(token);
        redirections.push(parsed.redirection);
        lastEnd = tokens[pos + parsed.consumed - 1]?.end ?? lastEnd;
        pos += parsed.consumed;
        continue;
      }
      const assignment = words.length === 0 ? asAssignment(token.word) : null;
      if (assignment) assignments.push(assignment);
      else words.push(token.word);
      lastEnd = token.end ?? lastEnd;
      pos++;
    }
    if (assignments.length + words.length + redirections.length === 0) throw unexpected(peek());
    return {
      type: 'simple',
      assignments,
      words,
      redirections,
      source: line.slice(first?.start ?? 0, lastEnd).trim(),
    };
  };

  const parsePipeline = (): Pipeline => {
    let negated = false;
    if (isBareWord(peek(), '!')) {
      negated = true;
      pos++;
    }
    const commands = [parseSimple()];
    while (peek()?.type === 'op' && (peek() as { value: string }).value === '|') {
      pos++;
      if (pos >= tokens.length) throw prematureEnd();
      commands.push(parseSimple());
    }
    return { negated, commands };
  };

  const items: ListItem[] = [];
  let connector: ListItem['connector'] = ';';
  while (pos < tokens.length) {
    const startToken = peek();
    const pipeline = parsePipeline();
    const endToken = tokens[pos - 1];
    const source = line.slice(startToken?.start ?? 0, endToken?.end ?? line.length).trim();
    items.push({ connector, pipeline, source });
    const next = peek();
    if (next === undefined) break;
    if (next.type !== 'op') throw unexpected(next);
    if (next.value === '&') {
      pos++;
      items[items.length - 1] = { connector, pipeline, source, background: true };
      connector = ';';
      continue;
    }
    if (next.value === ';') {
      pos++;
      connector = ';';
    } else if (next.value === '&&' || next.value === '||') {
      pos++;
      if (pos >= tokens.length) throw prematureEnd();
      connector = next.value;
    } else {
      throw unexpected(next);
    }
  }
  return { items };
}
