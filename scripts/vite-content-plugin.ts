/**
 * Plugin Vite : recompile le contenu quand un fichier de `content/` change en
 * développement, puis recharge la page (docs/02, « Pipeline de contenu »).
 *
 * La compilation tourne dans un sous-processus (`tsx`) : la configuration Vite est
 * chargée sans les alias d'import du projet.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Racine du projet. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Dossier du contenu surveillé. */
const CONTENT_DIR = join(ROOT, 'content');

/**
 * Crée le plugin de rechargement à chaud du contenu.
 *
 * @returns Le plugin Vite.
 */
export function contentPlugin(): Plugin {
  const rebuild = (): boolean => {
    const result = spawnSync('npx', ['tsx', 'scripts/build-content.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    return result.status === 0;
  };
  return {
    name: 'tssr-quest-content',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(CONTENT_DIR);
      server.watcher.on('change', (file) => {
        if (file.startsWith(CONTENT_DIR) && rebuild()) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
