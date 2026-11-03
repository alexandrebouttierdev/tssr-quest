import { listDir } from '@sims/shared/fs';
import { resolveUserPath } from '@sims/shared/path';
import type { Machine } from '@sims/shared/types';
import type { BashCommand } from './command';

/**
 * Propositions d'autocomplétion (touche Tab) pour la saisie en cours : noms de
 * commandes pour le premier mot, chemins de fichiers ensuite.
 *
 * @param machine - Machine et session courante.
 * @param partial - Ligne saisie jusqu'au curseur.
 * @param commands - Commandes connues.
 * @returns Les mots complets possibles pour le dernier mot (dossiers suivis de `/`).
 */
export function completeBash(
  machine: Machine,
  partial: string,
  commands: Readonly<Record<string, BashCommand>>,
): string[] {
  const words = partial.split(/\s+/);
  const current = words.at(-1) ?? '';
  const isFirst = words.length === 1 || (words.length === 2 && words[0] === 'sudo');
  if (isFirst && !current.includes('/')) {
    return Object.keys(commands)
      .filter((name) => name.startsWith(current) && /^[a-z]/.test(name))
      .sort();
  }
  const slash = current.lastIndexOf('/');
  const dirPart = slash >= 0 ? current.slice(0, slash + 1) : '';
  const prefix = current.slice(slash + 1);
  const { cwd, env, user } = machine.session;
  const dir = resolveUserPath(dirPart || '.', cwd, env['HOME'] ?? '/');
  const listing = listDir(machine, dir, user);
  if (!listing.ok) return [];
  return listing.value
    .filter((e) => e.name.startsWith(prefix) && (prefix.startsWith('.') || !e.name.startsWith('.')))
    .map((e) => dirPart + e.name + (e.node.type === 'dir' ? '/' : ''));
}
