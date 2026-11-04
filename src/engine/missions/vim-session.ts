import type { EditorView } from '@core/store/mission-run.slice';
import { strerror } from '@sims/shared/errors';
import { readFile, statPath, writeFile } from '@sims/shared/fs';
import { dirname } from '@sims/shared/path';
import { canAccess } from '@sims/shared/permissions';
import type { Machine } from '@sims/shared/types';
import { openVim, vimKey, type VimState } from '@sims/vim';

/**
 * Ouvre vim sur un fichier d'une machine, avec les droits d'un compte (celui de la
 * session, ou root pour `sudo vim`) : fichier illisible, en lecture seule, ou nouveau.
 *
 * @param machine - Machine simulée.
 * @param path - Chemin absolu du fichier.
 * @param user - Compte qui édite (par défaut, celui de la session).
 * @returns L'état de l'éditeur.
 */
export function openEditor(
  machine: Machine,
  path: string,
  user: string = machine.session.user,
): VimState {
  const read = readFile(machine, path, user);
  if (!read.ok && read.error === 'EACCES') {
    return {
      ...openVim(path, null, true),
      message: `"${path.split('/').pop() ?? path}" [Permission refusée]`,
    };
  }
  const found = statPath(machine, path, user);
  const parent = statPath(machine, dirname(path), user);
  const writable = found.ok
    ? canAccess(machine, user, found.value.node, 'write')
    : parent.ok && canAccess(machine, user, parent.value.node, 'write');
  return openVim(path, read.ok ? read.value : null, !writable);
}

/** Résultat d'une touche : éditeur (ou `null` s'il est fermé) et machine modifiée. */
export interface EditorKeyResult {
  readonly editor: VimState | null;
  readonly machine: Machine;
}

/**
 * Applique une touche à l'éditeur et ses effets (écriture du fichier, fermeture).
 *
 * @param machine - Machine simulée.
 * @param editor - État de l'éditeur.
 * @param key - Touche.
 * @param now - Horodatage (ms).
 * @param user - Compte qui écrit le fichier (par défaut, celui de la session).
 * @returns Le nouvel éditeur et la machine.
 */
export function editorKey(
  machine: Machine,
  editor: VimState,
  key: string,
  now: number,
  user: string = machine.session.user,
): EditorKeyResult {
  let next = vimKey(editor, key);
  let current = machine;
  for (const effect of next.effects) {
    if (effect.type === 'write') {
      const written = writeFile(current, editor.path, user, effect.content, {
        now,
      });
      if (written.ok) current = written.value;
      else {
        // L'écriture échoue : vim reste ouvert et le signale (E212).
        return {
          editor: {
            ...next,
            effects: [],
            dirty: true,
            message: `"${editor.path.split('/').pop() ?? ''}" E212: Impossible d'ouvrir le fichier pour l'écriture (${strerror(written.error)})`,
            messageIsError: true,
          },
          machine: current,
        };
      }
    }
    if (effect.type === 'quit') return { editor: null, machine: current };
  }
  next = { ...next, effects: [] };
  return { editor: next, machine: current };
}

/**
 * Vue de l'éditeur pour l'interface.
 *
 * @param editor - État de l'éditeur.
 * @returns La vue.
 */
export function editorView(editor: VimState): EditorView {
  return {
    fileName: editor.path,
    lines: editor.lines,
    cursor: editor.cursor,
    mode: editor.mode,
    commandLine: editor.commandLine,
    message: editor.message,
    messageIsError: editor.messageIsError,
    number: editor.number,
  };
}
