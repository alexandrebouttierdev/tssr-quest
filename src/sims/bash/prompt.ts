import type { Machine } from '@sims/shared/types';

/**
 * Invite Bash de Debian : `utilisateur@machine:dossier$` (ou `#` pour root),
 * le dossier personnel étant abrégé en `~`.
 *
 * @param machine - Machine et session courante.
 * @returns L'invite, sans espace finale.
 */
export function bashPrompt(machine: Machine): string {
  const { user, cwd, env } = machine.session;
  const home = env['HOME'] ?? '';
  const shown =
    home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
  return `${user}@${machine.hostname}:${shown}${user === 'root' ? '#' : '$'}`;
}
