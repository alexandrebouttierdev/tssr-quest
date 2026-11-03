/**
 * Générateur pseudo-aléatoire à graine, pour des simulations reproductibles :
 * même graine, mêmes latences de ping, mêmes PID, mêmes variantes de mission.
 */
export interface Rng {
  /** État interne courant : `createRng(rng.state)` reprend la suite au même point. */
  readonly state: number;
  /** Nombre flottant dans [0, 1[. */
  next(): number;
  /**
   * Entier dans [min, max], bornes incluses.
   *
   * @throws {RangeError} Si `max < min`.
   */
  int(min: number, max: number): number;
  /**
   * Élément tiré au hasard dans un tableau non vide.
   *
   * @throws {RangeError} Si le tableau est vide.
   */
  pick<T>(items: readonly T[]): T;
  /** Copie mélangée du tableau (Fisher-Yates) ; l'original n'est pas modifié. */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * Crée un générateur mulberry32 : rapide, 32 bits, suffisant pour un jeu
 * (pas pour de la cryptographie).
 *
 * @param seed - Graine entière (les décimales sont ignorées).
 * @returns Un générateur dont la suite dépend uniquement de la graine.
 * @example
 * const rng = createRng(42);
 * rng.int(1, 6); // toujours le même résultat pour la graine 42
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new RangeError(`Intervalle vide : [${min}, ${max}]`);
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    get state() {
      return state;
    },
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('Impossible de choisir dans un tableau vide');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
  };
}

/**
 * Dérive une graine entière stable d'un texte (hachage FNV-1a 32 bits), par exemple
 * l'identifiant d'une mission, pour que chaque mission ait ses propres tirages.
 *
 * @param text - Texte quelconque.
 * @returns Un entier non signé sur 32 bits.
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
