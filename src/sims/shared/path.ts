/**
 * Manipulation de chemins POSIX, sans accès au système de fichiers.
 * Tous les chemins renvoyés sont absolus et normalisés (pas de `.`, `..`, ni `//`).
 */

/**
 * Normalise un chemin absolu : résout `.` et `..`, supprime les `/` en trop.
 * Comme sous Linux, `..` à la racine reste à la racine.
 *
 * @param path - Chemin absolu.
 * @returns Le chemin normalisé (`/` pour la racine).
 */
export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}

/**
 * Transforme un chemin saisi par le joueur en chemin absolu normalisé.
 *
 * @param input - Chemin tel que tapé (`../log`, `~/notes.txt`, `/etc`).
 * @param cwd - Répertoire courant.
 * @param home - Répertoire personnel, pour `~`.
 * @returns Le chemin absolu normalisé.
 */
export function resolveUserPath(input: string, cwd: string, home: string): string {
  if (input === '~') return normalizePath(home);
  if (input.startsWith('~/')) return normalizePath(home + input.slice(1));
  if (input.startsWith('/')) return normalizePath(input);
  return normalizePath(`${cwd}/${input}`);
}

/**
 * Répertoire parent d'un chemin absolu normalisé.
 *
 * @param path - Chemin absolu normalisé.
 * @returns Le parent (`/` pour un enfant direct de la racine et pour la racine).
 */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

/**
 * Dernier composant d'un chemin.
 *
 * @param path - Chemin absolu normalisé.
 * @returns Le nom (`/` pour la racine).
 */
export function basename(path: string): string {
  if (path === '/') return '/';
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Joint un dossier et un nom.
 *
 * @param dir - Dossier absolu normalisé.
 * @param name - Nom de l'entrée.
 * @returns Le chemin de l'entrée.
 */
export function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

/**
 * Indique si `path` est `ancestor` ou se trouve dessous.
 *
 * @param path - Chemin absolu normalisé.
 * @param ancestor - Dossier absolu normalisé.
 * @returns Vrai si `path` est dans `ancestor`.
 */
export function isInside(path: string, ancestor: string): boolean {
  if (ancestor === '/') return true;
  return path === ancestor || path.startsWith(ancestor + '/');
}
