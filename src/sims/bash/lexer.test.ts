import { describe, expect, it } from 'vitest';
import { BashSyntaxError, tokenize } from './lexer';

/** Représentation compacte des jetons pour les assertions. */
function kinds(line: string): string[] {
  return tokenize(line).map((t) => (t.type === 'word' ? 'mot' : t.value));
}

describe('lexer Bash', () => {
  it('découpe les mots sur les espaces', () => {
    expect(kinds('ls  -l   /var')).toEqual(['mot', 'mot', 'mot']);
  });

  it('reconnaît les opérateurs', () => {
    expect(kinds('a | b && c || d ; e')).toEqual([
      'mot',
      '|',
      'mot',
      '&&',
      'mot',
      '||',
      'mot',
      ';',
      'mot',
    ]);
  });

  it('reconnaît les redirections, avec ou sans espace', () => {
    expect(kinds('a >out 2>>err <in 2>&1 &>all')).toEqual([
      'mot',
      '>',
      'mot',
      '2>>',
      'mot',
      '<',
      'mot',
      '2>&1',
      '&>',
      'mot',
    ]);
  });

  it('garde les guillemets simples littéraux', () => {
    const [token] = tokenize("'$HOME et *'");

    expect(token).toMatchObject({
      type: 'word',
      word: { parts: [{ type: 'literal', value: '$HOME et *', quoted: true }] },
    });
  });

  it('développe les variables entre guillemets doubles', () => {
    const [token] = tokenize('"x=$HOME/${USER}!"');

    expect(token?.type === 'word' && token.word.parts).toEqual([
      { type: 'literal', value: 'x=', quoted: true },
      { type: 'param', name: 'HOME', quoted: true },
      { type: 'literal', value: '/', quoted: true },
      { type: 'param', name: 'USER', quoted: true },
      { type: 'literal', value: '!', quoted: true },
    ]);
  });

  it('reconnaît les paramètres spéciaux et positionnels', () => {
    const [token] = tokenize('$?$1$#$@');

    expect(
      token?.type === 'word' && token.word.parts.map((p) => p.type === 'param' && p.name),
    ).toEqual(['?', '1', '#', '@']);
  });

  it('traite un $ isolé comme un caractère', () => {
    const [token] = tokenize('a$ b');

    expect(token?.type === 'word' && token.word.parts).toEqual([
      { type: 'literal', value: 'a$', quoted: false },
    ]);
  });

  it('protège le caractère qui suit une barre oblique inverse', () => {
    const [token] = tokenize('a\\ b\\*');

    expect(token?.type === 'word' && token.word.parts).toEqual([
      { type: 'literal', value: 'a', quoted: false },
      { type: 'literal', value: ' ', quoted: true },
      { type: 'literal', value: 'b', quoted: false },
      { type: 'literal', value: '*', quoted: true },
    ]);
  });

  it('lit les substitutions de commande imbriquées', () => {
    const [token] = tokenize('$(echo $(whoami))');

    expect(token?.type === 'word' && token.word.parts).toEqual([
      { type: 'command', source: 'echo $(whoami)', quoted: false },
    ]);
  });

  it("lit les accents graves et l'arithmétique", () => {
    const tokens = tokenize('`date` $((1 + 2))');

    expect(tokens.map((t) => t.type === 'word' && t.word.parts[0])).toEqual([
      { type: 'command', source: 'date', quoted: false },
      { type: 'arith', expression: '1 + 2', quoted: false },
    ]);
  });

  it('ignore un commentaire en début de mot', () => {
    expect(kinds('ls # liste')).toEqual(['mot']);
    expect(kinds('echo a#b')).toEqual(['mot', 'mot']);
  });

  it('signale un guillemet non refermé', () => {
    expect(() => tokenize('echo "abc')).toThrow(BashSyntaxError);
    expect(() => tokenize("echo 'abc")).toThrow(/« ' » correspondant/);
  });

  it('signale une substitution non refermée', () => {
    expect(() => tokenize('echo $(ls')).toThrow(BashSyntaxError);
    expect(() => tokenize('echo `ls')).toThrow(BashSyntaxError);
    expect(() => tokenize('echo ${HOME')).toThrow(BashSyntaxError);
  });

  it('accepte les échappements dans les guillemets doubles', () => {
    const [token] = tokenize('"a\\"b\\$c\\d"');

    expect(
      token?.type === 'word' &&
        token.word.parts.map((p) => p.type === 'literal' && p.value).join(''),
    ).toBe('a"b$c\\d');
  });
});
