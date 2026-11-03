import { describe, expect, it } from 'vitest';
import { parseOptions } from './options';

const SPEC = {
  name: 'ls',
  short: 'lahd',
  long: { all: 'a', 'human-readable': 'h' },
  withValue: 'n',
};

describe('analyse des options', () => {
  it('sépare options courtes regroupées et opérandes', () => {
    const result = parseOptions(['-la', '/var', '-h'], SPEC);

    expect(result.ok && [...result.flags].sort()).toEqual(['a', 'h', 'l']);
    expect(result.ok && result.operands).toEqual(['/var']);
  });

  it('accepte les options longues', () => {
    const result = parseOptions(['--all', '--human-readable'], SPEC);

    expect(result.ok && [...result.flags].sort()).toEqual(['a', 'h']);
  });

  it('lit une option avec valeur, collée ou séparée', () => {
    const a = parseOptions(['-n', '5'], SPEC);
    const b = parseOptions(['-n20'], SPEC);

    expect(a.ok && a.values.get('n')).toBe('5');
    expect(b.ok && b.values.get('n')).toBe('20');
  });

  it("s'arrête aux options après --", () => {
    const result = parseOptions(['--', '-l'], SPEC);

    expect(result.ok && result.operands).toEqual(['-l']);
  });

  it('considère un tiret seul comme un opérande', () => {
    const result = parseOptions(['-'], SPEC);

    expect(result.ok && result.operands).toEqual(['-']);
  });

  it('refuse une option courte inconnue avec le message de getopt', () => {
    const result = parseOptions(['-z'], SPEC);

    expect(result).toEqual({
      ok: false,
      message: "ls: option invalide -- 'z'\nSaisissez « ls --help » pour plus d'informations.\n",
    });
  });

  it('refuse une option longue inconnue', () => {
    const result = parseOptions(['--bavard'], SPEC);

    expect(!result.ok && result.message).toContain('ls: option non reconnue « --bavard »');
  });

  it('refuse une option qui attend une valeur absente', () => {
    const result = parseOptions(['-n'], SPEC);

    expect(!result.ok && result.message).toContain("ls: l'option requiert un argument -- 'n'");
  });
});
