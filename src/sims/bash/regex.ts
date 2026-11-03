/**
 * Traduction des expressions régulières POSIX (BRE de grep, ERE de grep -E et sed -E)
 * vers les expressions régulières JavaScript.
 */

/** Classes POSIX et leur équivalent dans une classe de caractères JavaScript. */
const POSIX_CLASSES: Readonly<Record<string, string>> = {
  alpha: 'a-zA-ZÀ-ÿ',
  digit: '0-9',
  alnum: 'a-zA-Z0-9À-ÿ',
  upper: 'A-ZÀ-Þ',
  lower: 'a-zß-ÿ',
  space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t',
  punct: '!-/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
};

/**
 * Convertit une expression POSIX en source d'expression JavaScript.
 *
 * @param pattern - Motif tel que tapé.
 * @param extended - Vrai pour une ERE (grep -E) ; faux pour une BRE (grep).
 * @returns La source JavaScript.
 * @throws {SyntaxError} Si le motif est invalide.
 */
export function posixToJs(pattern: string, extended: boolean): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? '';
    if (c === '[') {
      const end = pattern.indexOf(
        ']',
        pattern[i + 1] === ']' || pattern[i + 1] === '^' ? i + 2 : i + 1,
      );
      if (end < 0) throw new SyntaxError('[ sans ] correspondant');
      let body = pattern.slice(i + 1, end);
      body = body.replace(/\[:(\w+):\]/g, (_m, name: string) => POSIX_CLASSES[name] ?? '');
      out += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
      continue;
    }
    if (c === '\\') {
      const next = pattern[++i] ?? '';
      if (next === '<' || next === '>') out += '\\b';
      else if (!extended && '(){}|+?'.includes(next)) out += next;
      else if ('wWsSbB'.includes(next)) out += `\\${next}`;
      else if (/\d/.test(next)) out += `\\${next}`;
      else out += next.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      continue;
    }
    if (!extended && '(){}|+?'.includes(c)) {
      out += `\\${c}`;
      continue;
    }
    out += c;
  }
  // Valide la traduction (lève SyntaxError sinon).
  new RegExp(out);
  return out;
}
