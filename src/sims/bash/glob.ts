import { listDir } from '@sims/shared/fs';
import type { Machine } from '@sims/shared/types';

/** Contexte nécessaire au développement des jokers. */
export interface GlobContext {
  readonly machine: Machine;
  readonly user: string;
  readonly cwd: string;
}

/**
 * Indique si un texte contient un joker non protégé (`*`, `?`, `[`).
 *
 * @param pattern - Motif où les caractères protégés ont été échappés par `\`.
 * @returns Vrai si un développement est nécessaire.
 */
export function hasGlob(pattern: string): boolean {
  return /(^|[^\\])[*?[]/.test(pattern);
}

/**
 * Traduit un motif de shell en expression régulière ancrée. Un caractère précédé
 * de `\` est pris littéralement.
 *
 * @param pattern - Motif d'un seul composant de chemin.
 * @returns L'expression régulière correspondante.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? '';
    if (c === '\\' && i + 1 < pattern.length) {
      source += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end < 0) {
        source += '\\[';
        continue;
      }
      let body = pattern.slice(i + 1, end);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      source += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else source += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** Retire les échappements d'un motif. */
function unescape(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

/**
 * Développe un motif en chemins existants, triés, comme bash (les fichiers cachés ne
 * sont retenus que si le composant commence par un point).
 *
 * @param pattern - Motif, caractères protégés échappés par `\`.
 * @param ctx - Machine, compte et répertoire courant.
 * @returns Les chemins tels qu'ils seraient écrits (relatifs si le motif l'est).
 */
export function expandGlob(pattern: string, ctx: GlobContext): string[] {
  const absolute = pattern.startsWith('/');
  const components = pattern.split('/').filter((c) => c !== '');
  let candidates: { shown: string; real: string }[] = [
    { shown: absolute ? '/' : '', real: absolute ? '/' : ctx.cwd },
  ];
  for (const component of components) {
    const next: { shown: string; real: string }[] = [];
    for (const { shown, real } of candidates) {
      const join = (base: string, name: string) =>
        base === '' ? name : base.endsWith('/') ? base + name : `${base}/${name}`;
      if (!hasGlob(component)) {
        const name = unescape(component);
        next.push({ shown: join(shown, name), real: join(real, name) });
        continue;
      }
      const listing = listDir(ctx.machine, real, ctx.user);
      if (!listing.ok) continue;
      const regex = globToRegExp(component);
      const showHidden = component.startsWith('.');
      for (const entry of listing.value) {
        if (entry.name.startsWith('.') && !showHidden) continue;
        if (regex.test(entry.name)) next.push({ shown: join(shown, entry.name), real: entry.path });
      }
    }
    candidates = next;
  }
  return candidates
    .filter(({ real }) => listDirExists(ctx, real))
    .map((c) => c.shown)
    .sort();
}

/** Vérifie qu'un chemin construit existe vraiment (les composants littéraux ne sont pas vérifiés en route). */
function listDirExists(ctx: GlobContext, path: string): boolean {
  return ctx.machine.fs[path.replace(/\/+$/, '') || '/'] !== undefined;
}
