/**
 * Configuration Vite de TSSR Quest.
 *
 * Les alias d'import reprennent ceux de `tsconfig.base.json` : toute modification
 * doit être faite aux deux endroits (voir docs/10-conventions-code.md).
 */
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentPlugin } from './scripts/vite-content-plugin.ts';

/** Construit un chemin absolu à partir de la racine du projet. */
const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** Alias partagés entre Vite et Vitest. */
export const aliases = {
  '@core': fromRoot('./src/core'),
  '@engine': fromRoot('./src/engine'),
  '@sims': fromRoot('./src/sims'),
  '@content': fromRoot('./src/content'),
  '@game': fromRoot('./src/game'),
  '@ui': fromRoot('./src/ui'),
  '@app': fromRoot('./src/app'),
  '@platform': fromRoot('./src/platform'),
  '@audio': fromRoot('./src/audio'),
  '@tests': fromRoot('./tests'),
};

export default defineConfig({
  plugins: [react(), contentPlugin()],
  resolve: { alias: aliases },
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Phaser représente l'essentiel du paquet (≈ 520 Ko compressés, budget : 5 Mo).
    chunkSizeWarningLimit: 2000,
  },
});
