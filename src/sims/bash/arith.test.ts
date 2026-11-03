import { describe, expect, it } from 'vitest';
import { ArithError, evaluateArithmetic } from './arith';

describe('arithmétique $(( ))', () => {
  it.each([
    ['1 + 2', 3],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['7 / 2', 3],
    ['-7 / 2', -3],
    ['7 % 3', 1],
    ['2 ** 10', 1024],
    ['-(3)', -3],
    ['10 - 2 - 3', 5],
    ['3 > 2', 1],
    ['3 == 4', 0],
    ['1 && 0', 0],
    ['0 || 5', 1],
    ['! 0', 1],
    ['', 0],
  ])('calcule %s = %d', (expr, value) => {
    expect(evaluateArithmetic(expr, {})).toBe(value);
  });

  it('lit les variables, avec ou sans $', () => {
    expect(evaluateArithmetic('n + $m * 2', { n: '1', m: '3' })).toBe(7);
  });

  it('considère une variable vide ou absente comme 0', () => {
    expect(evaluateArithmetic('x + 1', {})).toBe(1);
  });

  it('refuse la division par zéro', () => {
    expect(() => evaluateArithmetic('1 / 0', {})).toThrow('division par 0');
  });

  it('refuse une expression mal formée', () => {
    expect(() => evaluateArithmetic('1 +', {})).toThrow(ArithError);
    expect(() => evaluateArithmetic('(1', {})).toThrow(ArithError);
    expect(() => evaluateArithmetic('1 2', {})).toThrow(ArithError);
  });
});
