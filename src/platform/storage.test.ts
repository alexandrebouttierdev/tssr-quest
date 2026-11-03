import { describe, expect, it } from 'vitest';
import {
  compressText,
  createIndexedDbStorage,
  decompressText,
  type KeyValueBackend,
} from './storage';

/** Back-end en mémoire qui imite idb-keyval (valeurs binaires ou texte). */
function memoryBackend(): KeyValueBackend & { raw: Map<string, unknown> } {
  const raw = new Map<string, unknown>();
  return {
    raw,
    get: (key) => Promise.resolve(raw.get(key)),
    set: (key, value) => {
      raw.set(key, value);
      return Promise.resolve();
    },
    del: (key) => {
      raw.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...raw.keys()]),
  };
}

describe('compression des sauvegardes', () => {
  it("compresse puis décompresse un texte à l'identique", async () => {
    const text = JSON.stringify({ message: 'Toujours les journaux. '.repeat(50), accents: 'éèàç' });

    const compressed = await compressText(text);
    const restored = await decompressText(compressed);

    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.byteLength).toBeLessThan(text.length);
    expect(restored).toBe(text);
  });
});

describe('stockage IndexedDB', () => {
  it('stocke les valeurs compressées et les relit en texte', async () => {
    const backend = memoryBackend();
    const storage = createIndexedDbStorage(backend);

    await storage.set('k', 'valeur');

    expect(backend.raw.get('k')).toBeInstanceOf(Uint8Array);
    expect(await storage.get('k')).toBe('valeur');
  });

  it('relit une valeur stockée en texte brut (navigateur sans compression)', async () => {
    const backend = memoryBackend();
    backend.raw.set('k', 'brut');
    const storage = createIndexedDbStorage(backend);

    expect(await storage.get('k')).toBe('brut');
  });

  it('renvoie undefined pour une clé absente ou une valeur inattendue', async () => {
    const backend = memoryBackend();
    backend.raw.set('nombre', 42);
    const storage = createIndexedDbStorage(backend);

    expect(await storage.get('absente')).toBeUndefined();
    expect(await storage.get('nombre')).toBeUndefined();
  });

  it('liste et supprime les clés', async () => {
    const storage = createIndexedDbStorage(memoryBackend());
    await storage.set('a', '1');
    await storage.set('b', '2');

    await storage.del('a');

    expect(await storage.keys()).toEqual(['b']);
  });
});
