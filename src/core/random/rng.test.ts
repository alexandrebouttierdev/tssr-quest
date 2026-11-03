import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from './rng';

describe('générateur pseudo-aléatoire à graine', () => {
  it('produit la même suite pour la même graine', () => {
    const a = createRng(42);
    const b = createRng(42);

    const suiteA = [a.next(), a.next(), a.next()];
    const suiteB = [b.next(), b.next(), b.next()];

    expect(suiteA).toEqual(suiteB);
  });

  it('produit des suites différentes pour des graines différentes', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(a.next()).not.toBe(b.next());
  });

  it('renvoie des nombres dans [0, 1[', () => {
    const rng = createRng(7);

    const values = Array.from({ length: 1000 }, () => rng.next());

    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('tire des entiers bornes incluses', () => {
    const rng = createRng(3);

    const values = new Set(Array.from({ length: 500 }, () => rng.int(1, 3)));

    expect([...values].sort()).toEqual([1, 2, 3]);
  });

  it('refuse un intervalle vide', () => {
    const rng = createRng(3);

    expect(() => rng.int(5, 2)).toThrow(RangeError);
  });

  it("choisit un élément d'un tableau", () => {
    const rng = createRng(9);
    const items = ['a', 'b', 'c'];

    const picked = rng.pick(items);

    expect(items).toContain(picked);
  });

  it('refuse de choisir dans un tableau vide', () => {
    const rng = createRng(9);

    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("mélange sans modifier le tableau d'origine et garde les mêmes éléments", () => {
    const rng = createRng(11);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];

    const shuffled = rng.shuffle(items);

    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });

  it('expose son état pour reprendre la suite plus tard', () => {
    const rng = createRng(5);
    rng.next();
    const saved = rng.state;

    const expected = rng.next();
    const resumed = createRng(saved);

    expect(resumed.next()).toBe(expected);
  });

  it('dérive une graine stable depuis un texte', () => {
    expect(seedFromString('linux-admin.intranet-down')).toBe(
      seedFromString('linux-admin.intranet-down'),
    );
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
    expect(Number.isInteger(seedFromString('xyz'))).toBe(true);
  });
});
