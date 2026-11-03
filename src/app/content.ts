import { loadContent, type ContentIndex } from '@content/loader';

/**
 * Charge le contenu compilé par `npm run content:build`. L'import passe par
 * `import.meta.glob` pour que le typage et le lint ne dépendent pas du fichier généré.
 *
 * @returns Le contenu indexé, ou `null` s'il n'a pas été compilé.
 */
export function loadGeneratedContent(): ContentIndex | null {
  const modules = import.meta.glob<{ default: unknown }>('../content/generated/content.json', {
    eager: true,
  });
  const module = Object.values(modules)[0];
  return module ? loadContent(module.default) : null;
}
