import { useCallback, useEffect, useRef, useState } from 'react';
import type { DialogueView } from '@core/store/ui.slice';
import { STRINGS } from '../strings/fr';
import styles from './DialogueBox.module.css';

/** Propriétés de la boîte de dialogue. */
export interface DialogueBoxProps {
  readonly view: DialogueView;
  /** Caractères par seconde (0 : texte instantané). */
  readonly textSpeed: number;
  readonly reducedMotion: boolean;
  readonly onAdvance: () => void;
  readonly onChoose: (choiceId: string) => void;
}

/**
 * Boîte de dialogue en bas de l'écran : portrait, nom et rôle, texte progressif,
 * choix navigables au clavier, à la souris et au toucher (docs/08). Le parent lui donne
 * une `key` par réplique : l'apparition du texte repart ainsi de zéro à chaque réplique.
 *
 * @param props - Réplique et callbacks.
 * @returns La boîte de dialogue.
 */
export function DialogueBox({
  view,
  textSpeed,
  reducedMotion,
  onAdvance,
  onChoose,
}: DialogueBoxProps) {
  const instant = textSpeed <= 0 || reducedMotion;
  const [shown, setShown] = useState(instant ? view.text.length : 0);
  const choicesRef = useRef<HTMLDivElement>(null);
  const typing = shown < view.text.length;

  useEffect(() => {
    if (!typing) return;
    const timer = window.setInterval(
      () => setShown((n) => Math.min(view.text.length, n + 1)),
      1000 / textSpeed,
    );
    return () => window.clearInterval(timer);
  }, [typing, textSpeed, view.text.length]);

  useEffect(() => {
    if (!typing && view.choices.length > 0) choicesRef.current?.querySelector('button')?.focus();
  }, [typing, view.choices.length]);

  const advance = useCallback(() => {
    if (typing) setShown(view.text.length);
    else if (view.choices.length === 0) onAdvance();
  }, [typing, view.text.length, view.choices.length, onAdvance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (view.choices.length > 0 && !typing) return;
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, typing, view.choices.length]);

  const onChoicesKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight'
    )
      return;
    event.preventDefault();
    const buttons = [...(choicesRef.current?.querySelectorAll('button') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  };

  return (
    <section className={styles['box']} aria-label={STRINGS.dialogue.region} onClick={advance}>
      <div className={styles['portrait']} data-mood={view.mood ?? 'neutre'} aria-hidden="true">
        {view.speaker.slice(0, 1)}
      </div>
      <div className={styles['body']}>
        <p className={styles['name']}>
          {view.speaker}
          {view.role && <span className={styles['role']}> · {view.role}</span>}
        </p>
        <p className={styles['text']} aria-hidden="true">
          {view.text.slice(0, shown)}
        </p>
        <p className="visually-hidden" aria-live="polite">
          {`${view.speaker} : ${view.text}`}
        </p>
        {!typing && view.choices.length > 0 && (
          <div
            ref={choicesRef}
            className={styles['choices']}
            role="group"
            aria-label={STRINGS.dialogue.choices}
            onKeyDown={onChoicesKey}
          >
            {view.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChoose(choice.id);
                }}
              >
                {choice.text}
              </button>
            ))}
          </div>
        )}
      </div>
      {!typing && view.choices.length === 0 && (
        <button
          type="button"
          className={styles['next']}
          aria-label={STRINGS.dialogue.next}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance();
          }}
        >
          ▼
        </button>
      )}
    </section>
  );
}
