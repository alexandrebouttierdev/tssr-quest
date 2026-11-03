import { createStore, del, get, keys, set } from 'idb-keyval';
import type { SaveStorage } from '@core/save';

/** Accès clé/valeur bas niveau (idb-keyval en jeu, mémoire en test). */
export interface KeyValueBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<IDBValidKey[]>;
}

/** Vrai si le navigateur sait compresser en gzip nativement. */
function canCompress(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/** Lit entièrement un flux d'octets. */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Compresse un texte en gzip (CompressionStream).
 *
 * @param text - Texte à compresser (JSON de sauvegarde).
 * @returns Les octets compressés.
 */
export async function compressText(text: string): Promise<Uint8Array> {
  const input = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return readAll(input);
}

/**
 * Décompresse des octets gzip en texte UTF-8.
 *
 * @param bytes - Octets produits par `compressText`.
 * @returns Le texte d'origine.
 */
export async function decompressText(bytes: Uint8Array): Promise<string> {
  const output = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await readAll(output));
}

/**
 * Back-end idb-keyval sur une base dédiée au jeu.
 *
 * @returns L'accès à la base IndexedDB `tssr-quest`.
 */
export function idbBackend(): KeyValueBackend {
  const store = createStore('tssr-quest', 'saves');
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    keys: () => keys(store),
  };
}

/**
 * Stockage des sauvegardes dans IndexedDB, compressé en gzip quand le navigateur
 * le permet (docs/02, section Sauvegarde).
 *
 * @param backend - Accès clé/valeur ; IndexedDB par défaut.
 * @returns Un stockage compatible avec `createSaveManager`.
 */
export function createIndexedDbStorage(backend: KeyValueBackend = idbBackend()): SaveStorage {
  return {
    async get(key) {
      const value = await backend.get(key);
      if (typeof value === 'string') return value;
      if (value instanceof Uint8Array) return decompressText(value);
      return undefined;
    },
    async set(key, value) {
      await backend.set(key, canCompress() ? await compressText(value) : value);
    },
    del: (key) => backend.del(key),
    async keys() {
      return (await backend.keys()).map(String);
    },
  };
}
