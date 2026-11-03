/** Erreur dans une expression arithmétique (message de bash). */
export class ArithError extends Error {
  override readonly name = 'ArithError';
}

/** Jeton d'expression arithmétique. */
type ArithToken =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'op'; readonly value: string };

/** Opérateurs binaires et leur priorité (plus grand = plus prioritaire). */
const BINARY: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '**': 7,
};

/** Découpe l'expression en nombres, opérateurs et parenthèses. */
function lex(expression: string, vars: Readonly<Record<string, string>>): ArithToken[] {
  const tokens: ArithToken[] = [];
  const re = /\s*(?:(\d+)|\$?([A-Za-z_][A-Za-z0-9_]*)|(\*\*|&&|\|\||==|!=|<=|>=|[-+*/%()<>!]))/y;
  let index = 0;
  while (index < expression.length) {
    if (/^\s*$/.test(expression.slice(index))) break;
    re.lastIndex = index;
    const match = re.exec(expression);
    if (!match)
      throw new ArithError(
        `erreur de syntaxe dans l'expression (le symbole erroné est « ${expression.slice(index).trim()} »)`,
      );
    index = re.lastIndex;
    if (match[1] !== undefined) tokens.push({ kind: 'num', value: Number(match[1]) });
    else if (match[2] !== undefined) {
      const raw = vars[match[2]] ?? '';
      tokens.push({ kind: 'num', value: raw.trim() === '' ? 0 : Math.trunc(Number(raw)) || 0 });
    } else tokens.push({ kind: 'op', value: match[3] ?? '' });
  }
  return tokens;
}

/**
 * Évalue une expression arithmétique entière comme `$(( ))` (division tronquée,
 * comparaisons valant 0 ou 1).
 *
 * @param expression - Texte entre `$((` et `))`.
 * @param vars - Variables du shell (les noms peuvent être écrits avec ou sans `$`).
 * @returns La valeur entière.
 * @throws {ArithError} Si l'expression est invalide ou divise par zéro.
 */
export function evaluateArithmetic(
  expression: string,
  vars: Readonly<Record<string, string>>,
): number {
  const tokens = lex(expression, vars);
  if (tokens.length === 0) return 0;
  let pos = 0;
  const syntax = () =>
    new ArithError(
      `erreur de syntaxe : opérande attendu (le symbole erroné est « ${expression.trim()} »)`,
    );

  const primary = (): number => {
    const token = tokens[pos++];
    if (!token) throw syntax();
    if (token.kind === 'num') return token.value;
    if (token.value === '(') {
      const value = binary(0);
      if (tokens[pos]?.value !== ')') throw syntax();
      pos++;
      return value;
    }
    if (token.value === '-') return -primary();
    if (token.value === '+') return primary();
    if (token.value === '!') return primary() === 0 ? 1 : 0;
    throw syntax();
  };

  const apply = (op: string, a: number, b: number): number => {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
      case '%':
        if (b === 0) throw new ArithError('division par 0 (le symbole erroné est « 0 »)');
        return op === '/' ? Math.trunc(a / b) : a % b;
      case '**':
        return a ** b;
      case '<':
        return Number(a < b);
      case '<=':
        return Number(a <= b);
      case '>':
        return Number(a > b);
      case '>=':
        return Number(a >= b);
      case '==':
        return Number(a === b);
      case '!=':
        return Number(a !== b);
      case '&&':
        return Number(a !== 0 && b !== 0);
      default:
        return Number(a !== 0 || b !== 0);
    }
  };

  const binary = (minPrecedence: number): number => {
    let left = primary();
    for (;;) {
      const token = tokens[pos];
      const precedence = token?.kind === 'op' ? BINARY[token.value] : undefined;
      if (token?.kind !== 'op' || precedence === undefined || precedence < minPrecedence)
        return left;
      pos++;
      // ** est associatif à droite, les autres à gauche.
      const right = binary(token.value === '**' ? precedence : precedence + 1);
      left = apply(token.value, left, right);
    }
  };

  const result = binary(0);
  if (pos < tokens.length) throw syntax();
  return result;
}
