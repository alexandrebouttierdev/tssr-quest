import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { tokenize } from './lexer';
import { ExpansionError, expandToString, expandWords, type ExpandEnv } from './expand';
import type { Word } from './ast';

const machine = debianServer({ files: { '/srv/a.log': {}, '/srv/b.log': {} } });

/** Environnement d'expansion de test. */
function env(overrides: Partial<ExpandEnv> = {}): ExpandEnv {
  return {
    machine,
    user: 'hugo',
    cwd: '/srv',
    home: '/home/hugo',
    vars: { HOME: '/home/hugo', USER: 'hugo', VIDE: '', DEUX: 'un deux' },
    lastStatus: 3,
    pid: 1187,
    substitute: (source) => (source === 'whoami' ? 'hugo\n' : `[${source}]`),
    ...overrides,
  };
}

/** Mots d'une ligne. */
function words(line: string): Word[] {
  return tokenize(line).flatMap((t) => (t.type === 'word' ? [t.word] : []));
}

/** Développe une ligne entière. */
function expand(line: string, e = env()): string[] {
  return expandWords(words(line), e);
}

describe('expansion des mots', () => {
  it('développe les variables', () => {
    expect(expand('echo $USER ${HOME}/x')).toEqual(['echo', 'hugo', '/home/hugo/x']);
  });

  it('développe les paramètres spéciaux', () => {
    expect(expand('$? $$ $# $0')).toEqual(['3', '1187', '0', 'bash']);
  });

  it('découpe une variable non protégée et garde une variable protégée entière', () => {
    expect(expand('$DEUX "$DEUX"')).toEqual(['un', 'deux', 'un deux']);
  });

  it('supprime un mot vide non protégé mais garde ""', () => {
    expect(expand('a $VIDE "" b')).toEqual(['a', '', 'b']);
  });

  it('développe le tilde en début de mot seulement', () => {
    expect(expand('~ ~/notes a~ "~"')).toEqual(['/home/hugo', '/home/hugo/notes', 'a~', '~']);
  });

  it('développe ~utilisateur vers son dossier personnel', () => {
    expect(expand('~julie ~inconnu')).toEqual(['/home/julie', '~inconnu']);
  });

  it('développe les jokers et garde le motif sans correspondance', () => {
    expect(expand('*.log *.pdf')).toEqual(['a.log', 'b.log', '*.pdf']);
  });

  it('ne développe pas un joker protégé', () => {
    expect(expand("'*.log' \\*.log")).toEqual(['*.log', '*.log']);
  });

  it('remplace une substitution de commande sans ses fins de ligne', () => {
    expect(expand('echo $(whoami)')).toEqual(['echo', 'hugo']);
  });

  it('calcule une expression arithmétique', () => {
    expect(expand('$((2 * 21))')).toEqual(['42']);
  });

  it('gère les formes ${#X} et ${X:-défaut}', () => {
    expect(expand('${#USER} ${ABSENT:-def} ${USER:-def} ${VIDE-x} ${USER:+oui}')).toEqual([
      '4',
      'def',
      'hugo',
      'oui',
    ]);
  });

  it('refuse une substitution mal formée', () => {
    expect(() => expand('${a b}')).toThrow(ExpansionError);
    expect(() => expand('${a b}')).toThrow('bash: ${a b}: mauvaise substitution');
  });

  it('signale une erreur arithmétique', () => {
    expect(() => expand('$((1/0))')).toThrow(ExpansionError);
  });

  it('développe une valeur sans découpage ni jokers', () => {
    expect(expandToString(words('"$DEUX"*')[0]!, env())).toBe('un deux*');
  });
});
