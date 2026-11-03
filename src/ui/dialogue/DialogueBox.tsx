import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { DialogueView } from '@core/store/ui.slice';
import { Portrait } from '../components/Portrait';
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

/** Taille du portrait : 48 px agrandis ×3. */
const PORTRAIT_SIZE = 144;

/**
 * Fenêtre de dialogue de RPG (docs/08) : grand portrait expressif, nom et fonction,
 * texte qui s'écrit, indicateur de suite, choix numérotés navigables au clavier
 * (flèches, chiffres, Entrée), à la souris et au toucher. Le parent lui donne une `key`
 * par réplique : l'apparition du texte repart ainsi de zéro à chaque réplique.
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
  const hasChoices = view.choices.length > 0;

  useEffect(() => {
    if (!typing) return;
    const timer = window.setInterval(
      () => setShown((n) => Math.min(view.text.length, n + 1)),
      1000 / textSpeed,
    );
    return () => window.clearInterval(timer);
  }, [typing, textSpeed, view.text.length]);

  useEffect(() => {
    if (!typing && hasChoices) choicesRef.current?.querySelector('button')?.focus();
  }, [typing, hasChoices]);

  const advance = useCallback(() => {
    if (typing) setShown(view.text.length);
    else if (!hasChoices) onAdvance();
  }, [typing, view.text.length, hasChoices, onAdvance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (hasChoices && !typing) return;
        event.preventDefault();
        advance();
        return;
      }
      // Les chiffres choisissent directement une réponse (1 = première).
      if (hasChoices && !typing && /^[1-9]$/.test(event.key)) {
        const choice = view.choices[Number(event.key) - 1];
        if (choice) {
          event.preventDefault();
          onChoose(choice.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, typing, hasChoices, view.choices, onChoose]);

  const onChoicesKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...(choicesRef.current?.querySelectorAll('button') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  };

  return (
    <motion.section
      className={styles['box']}
      aria-label={STRINGS.dialogue.region}
      onClick={advance}
      initial={reducedMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles['portraitFrame']} data-mood={view.mood ?? 'neutre'}>
        <Portrait
          id={view.npcId}
          name={view.speaker}
          mood={view.mood}
          size={PORTRAIT_SIZE}
          className={styles['portrait']}
        />
      </div>
      <div className={styles['body']}>
        <header className={styles['header']}>
          <p className={styles['name']}>{view.speaker}</p>
          {view.role && <p className={styles['role']}>{view.role}</p>}
        </header>
        <p className={styles['text']} aria-hidden="true">
          {view.text.slice(0, shown)}
          {typing && <span className={styles['caret']} />}
        </p>
        <p className="visually-hidden" aria-live="polite">
          {`${view.speaker} : ${view.text}`}
        </p>
        {!typing && hasChoices && (
          <div
            ref={choicesRef}
            className={styles['choices']}
            role="group"
            aria-label={STRINGS.dialogue.choices}
            onKeyDown={onChoicesKey}
          >
            {view.choices.map((choice, index) => (
              <motion.button
                key={choice.id}
                type="button"
                className={styles['choice']}
                initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18, delay: index * 0.05 }}
                onClick={(event) => {
                  event.stopPropagation();
                  onChoose(choice.id);
                }}
              >
                <span className={styles['choiceKey']} aria-hidden="true">
                  {index + 1}
                </span>
                <span>{choice.text}</span>
              </motion.button>
            ))}
          </div>
        )}
        {!typing && !hasChoices && (
          <button
            type="button"
            className={styles['next']}
            aria-label={STRINGS.dialogue.next}
            onClick={(e) => {
              e.stopPropagation();
              onAdvance();
            }}
          >
            <span aria-hidden="true">{STRINGS.dialogue.next}</span>
            <span className="kbd" aria-hidden="true">
              {STRINGS.dialogue.nextKey}
            </span>
            <span className={styles['chevron']} aria-hidden="true" />
          </button>
        )}
      </div>
    </motion.section>
  );
}
