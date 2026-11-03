import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TerminalLine } from '@core/store/mission-run.slice';
import { STRINGS } from '../../strings/fr';
import styles from './Terminal.module.css';

/** Propriétés du terminal générique (Bash, CMD, PowerShell, Cisco IOS). */
export interface TerminalProps {
  /** Invite affichée devant la saisie. */
  readonly prompt: string;
  /** Lignes déjà affichées (publiées par le moteur). */
  readonly lines: readonly TerminalLine[];
  /** Ligne validée par le joueur. */
  readonly onSubmit: (line: string) => void;
  /** Propositions d'autocomplétion (touche Tab). */
  readonly onComplete?: (partial: string) => readonly string[];
  /** Désactive la saisie. */
  readonly disabled?: boolean;
  /** Message affiché au-dessus de la sortie (aide du jeu). */
  readonly hint?: string;
}

/** Plus long préfixe commun d'une liste de mots. */
function commonPrefix(words: readonly string[]): string {
  if (words.length === 0) return '';
  let prefix = words[0] ?? '';
  for (const word of words) while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/**
 * Terminal : sortie défilante, invite, historique (↑ ↓), autocomplétion (Tab),
 * Ctrl+C, Ctrl+L, et barre de touches rapides pour le mobile (docs/08).
 *
 * @param props - Invite, lignes et callbacks.
 * @returns Le terminal.
 */
export function Terminal({
  prompt,
  lines,
  onSubmit,
  onComplete,
  disabled = false,
  hint,
}: TerminalProps) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [lines, suggestions]);

  const submit = (line: string) => {
    onSubmit(line);
    if (line.trim()) {
      setHistory((h) => [...h, line]);
      setCursor(history.length + 1);
    } else {
      setCursor(history.length);
    }
    setValue('');
    setSuggestions([]);
  };

  const complete = () => {
    if (!onComplete) return;
    const words = value.split(' ');
    const last = words.at(-1) ?? '';
    const candidates = onComplete(value);
    if (candidates.length === 0) return;
    const prefix = commonPrefix(candidates);
    const single = candidates.length === 1;
    const completed = single ? `${prefix}${prefix.endsWith('/') ? '' : ' '}` : prefix;
    if (completed.length > last.length || single)
      setValue([...words.slice(0, -1), completed].join(' '));
    setSuggestions(single ? [] : candidates);
  };

  const recall = (delta: number) => {
    const next = Math.min(history.length, Math.max(0, cursor + delta));
    setCursor(next);
    setValue(history[next] ?? '');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Le terminal garde ses touches : rien ne doit remonter jusqu'au monde.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      submit(value);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      recall(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      recall(1);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      complete();
    } else if (event.ctrlKey && (event.key === 'c' || event.key === 'C')) {
      event.preventDefault();
      setValue('');
      setSuggestions([]);
    } else if (event.ctrlKey && (event.key === 'l' || event.key === 'L')) {
      event.preventDefault();
      submit('clear');
    }
  };

  const insert = (text: string) => {
    setValue((v) => v + text);
    inputRef.current?.focus();
  };

  return (
    <div className={styles['terminal']}>
      <div
        ref={outputRef}
        className={styles['output']}
        role="log"
        aria-label={STRINGS.terminal.output}
        aria-live="polite"
        onClick={() => inputRef.current?.focus()}
      >
        {hint && <p className={styles['hint']}>{hint}</p>}
        {lines.map((line, index) => (
          <div key={index} className={styles[line.kind]}>
            {line.text || ' '}
          </div>
        ))}
        {suggestions.length > 0 && (
          <div className={styles['suggestions']}>{suggestions.join('  ')}</div>
        )}
      </div>
      <div className={styles['line']}>
        <label htmlFor="terminal-input" className={styles['prompt']}>
          {prompt}
        </label>
        <input
          ref={inputRef}
          id="terminal-input"
          className={styles['input']}
          aria-label={STRINGS.terminal.label}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className={styles['keys']} role="toolbar" aria-label={STRINGS.terminal.keys}>
        <button type="button" onClick={complete}>
          {STRINGS.terminal.tab}
        </button>
        <button type="button" onClick={() => recall(-1)}>
          {STRINGS.terminal.up}
        </button>
        <button type="button" onClick={() => setValue('')}>
          {STRINGS.terminal.ctrlC}
        </button>
        {['|', '-', '/', '~', '>'].map((k) => (
          <button key={k} type="button" onClick={() => insert(k)}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
