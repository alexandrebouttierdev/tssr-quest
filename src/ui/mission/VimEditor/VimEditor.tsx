import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { EditorView } from '@core/store/mission-run.slice';
import { STRINGS } from '../../strings/fr';
import styles from './VimEditor.module.css';

/** Nombre de lignes affichées (complétées par des « ~ » comme dans vim). */
const VISIBLE_ROWS = 18;

/** Traduit un événement clavier en touche pour l'éditeur. */
export function keyFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): string | null {
  if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) return 'Ctrl+c';
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const special = [
    'Escape',
    'Enter',
    'Backspace',
    'Tab',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ];
  if (special.includes(event.key)) return event.key;
  return [...event.key].length === 1 ? event.key : null;
}

/**
 * Éditeur vim (docs/08) : texte, curseur, « ~ » après la fin du fichier, ligne d'état,
 * et touches rapides (Échap, :wq, :q!) pour le toucher.
 *
 * @param props - Vue de l'éditeur et envoi des touches.
 * @returns L'éditeur.
 */
export function VimEditor({ view, onKey }: { view: EditorView; onKey: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const start = Math.max(
    0,
    Math.min(view.cursor.row - VISIBLE_ROWS + 3, view.lines.length - VISIBLE_ROWS),
  );
  const shown = view.lines.slice(start, start + VISIBLE_ROWS);
  const width = String(view.lines.length).length;
  const status =
    view.mode === 'command'
      ? `:${view.commandLine}`
      : view.mode === 'search'
        ? `/${view.commandLine}`
        : (view.message ?? '');
  const sendAll = (keys: readonly string[]) => {
    keys.forEach(onKey);
    ref.current?.focus();
  };

  return (
    <div className={styles['vim']}>
      <div
        ref={ref}
        className={styles['screen']}
        role="textbox"
        aria-multiline="true"
        aria-label={STRINGS.editor.label(view.fileName)}
        tabIndex={0}
        onKeyDown={(event) => {
          const key = keyFromEvent(event);
          event.stopPropagation();
          if (key === null) return;
          event.preventDefault();
          onKey(key);
        }}
      >
        {shown.map((line, i) => {
          const row = start + i;
          const onCursor = row === view.cursor.row;
          const col = Math.min(view.cursor.col, line.length);
          return (
            <div key={row} className={styles['line']}>
              {view.number && (
                <span className={styles['number']}>{String(row + 1).padStart(width + 1)} </span>
              )}
              {onCursor ? (
                <>
                  {line.slice(0, col)}
                  <span className={styles['cursor']} data-mode={view.mode}>
                    {line[col] ?? ' '}
                  </span>
                  {line.slice(col + 1)}
                </>
              ) : (
                line || ' '
              )}
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, VISIBLE_ROWS - shown.length) }, (_, i) => (
          <div key={`tilde-${i}`} className={styles['tilde']}>
            ~
          </div>
        ))}
      </div>
      <div className={styles['status']} data-error={view.messageIsError} aria-live="polite">
        <span>{status}</span>
        <span className={styles['position']}>
          {view.cursor.row + 1},{view.cursor.col + 1}
        </span>
      </div>
      <div className={styles['keys']} role="toolbar" aria-label={STRINGS.editor.keys}>
        <button type="button" onClick={() => sendAll(['Escape'])}>
          {STRINGS.editor.escape}
        </button>
        <button type="button" onClick={() => sendAll(['i'])}>
          i
        </button>
        <button type="button" onClick={() => sendAll(['Escape', ':', 'w', 'q', 'Enter'])}>
          :wq
        </button>
        <button type="button" onClick={() => sendAll(['Escape', ':', 'q', '!', 'Enter'])}>
          :q!
        </button>
      </div>
    </div>
  );
}
