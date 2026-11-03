import type { SaveStorage } from './save-manager';

/**
 * Stockage clé/valeur en mémoire, utilisé par les tests et comme repli quand
 * IndexedDB est indisponible (navigation privée de certains navigateurs).
 *
 * @returns Un stockage vide, propre à cet appel.
 */
export function createMemoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    del: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...data.keys()]),
  };
}
