import { describe, expect, it } from 'vitest';
import { BashSyntaxError } from './lexer';
import type { SimpleCommand, Subshell } from './ast';
import { parse } from './parser';

/** Première commande du premier pipeline, supposée simple. */
const simple = (line: string, index = 0): SimpleCommand => {
  const cmd = parse(line).items[0]?.pipeline.commands[index];
  if (cmd?.type !== 'simple') throw new Error('commande simple attendue');
  return cmd;
};

/** Texte brut d'un mot sans expansion. */
const text = (w: { parts: readonly { type: string; value?: string; name?: string }[] }) =>
  w.parts.map((p) => (p.type === 'literal' ? p.value : `$${p.name}`)).join('');

describe('parser Bash', () => {
  it('produit une commande simple', () => {
    const cmd = simple('ls -l /var');
    expect(cmd.words.map(text)).toEqual(['ls', '-l', '/var']);
    expect(cmd.source).toBe('ls -l /var');
  });

  it('produit un pipeline', () => {
    const script = parse('cat f | grep x | wc -l');

    expect(
      script.items[0]?.pipeline.commands.map((c) => text((c as SimpleCommand).words[0]!)),
    ).toEqual(['cat', 'grep', 'wc']);
  });

  it('produit une liste avec ses connecteurs', () => {
    const script = parse('a && b || c; d');

    expect(script.items.map((i) => i.connector)).toEqual([';', '&&', '||', ';']);
  });

  it('accepte un point-virgule final et une ligne vide', () => {
    expect(parse('ls;').items).toHaveLength(1);
    expect(parse('   ').items).toHaveLength(0);
  });

  it('lit les redirections', () => {
    const cmd = simple('cmd > out 2>> err < in 2>&1 &> all');

    expect(
      cmd?.redirections.map((r) =>
        r.type === 'dup' ? `${r.fd}>&${r.to}` : r.type === 'both' ? '&>' : `${r.fd}${r.op}`,
      ),
    ).toEqual(['1>', '2>>', '0<', '2>&1', '&>']);
  });

  it('lit les affectations en tête de commande', () => {
    const cmd = simple('A=1 B=x cmd C=2');

    expect(cmd.assignments.map((a) => `${a.name}=${text(a.value)}`)).toEqual(['A=1', 'B=x']);
    expect(cmd.words.map(text)).toEqual(['cmd', 'C=2']);
  });

  it('accepte une affectation seule', () => {
    const cmd = simple('NOM=hugo');

    expect(cmd?.assignments).toHaveLength(1);
    expect(cmd?.words).toHaveLength(0);
  });

  it('lit une négation de pipeline', () => {
    expect(parse('! false').items[0]?.pipeline.negated).toBe(true);
  });

  it.each([
    ['| ls', '|'],
    ['ls | | wc', '|'],
    ['ls && ; x', ';'],
    [';', ';'],
    ['ls > ;', ';'],
  ])('refuse « %s » avec le symbole inattendu « %s »', (line, token) => {
    expect(() => parse(line)).toThrow(`erreur de syntaxe près du symbole inattendu « ${token} »`);
  });

  it('signale une redirection sans cible en fin de ligne', () => {
    expect(() => parse('ls >')).toThrow('« newline »');
  });

  it('signale une ligne qui se termine par un opérateur', () => {
    expect(() => parse('ls |')).toThrow(BashSyntaxError);
    expect(() => parse('ls &&')).toThrow('fin de fichier prématurée');
  });

  it('marque les pipelines lancés en arrière-plan avec &', () => {
    const script = parse('sleep 10 & echo ok');

    expect(script.items.map((i) => [i.source, i.background ?? false])).toEqual([
      ['sleep 10', true],
      ['echo ok', false],
    ]);
  });

  it('lit un sous-shell, ses redirections, et refuse une parenthèse non fermée', () => {
    const sub = parse('(crontab -l; echo "x") | crontab -').items[0]?.pipeline
      .commands[0] as Subshell;
    expect(sub).toMatchObject({ type: 'subshell', body: 'crontab -l; echo "x"' });
    const redirected = parse('(cd /tmp; ls) > liste.txt').items[0]?.pipeline
      .commands[0] as Subshell;
    expect(redirected.redirections).toHaveLength(1);
    expect(() => parse('(ls')).toThrow(BashSyntaxError);
    expect(() => parse('()')).toThrow(BashSyntaxError);
    expect(() => parse('(ls) pwd')).toThrow(BashSyntaxError);
  });
});
