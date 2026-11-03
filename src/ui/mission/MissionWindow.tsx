import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { MissionRunView } from '@core/store/mission-run.slice';
import { useGameStore } from '@core/store/use-game-store';
import { SimpleMarkdown } from '../components/SimpleMarkdown';
import { useUiServices } from '../hooks/game-services';
import { FEEDBACK_TEXT, PRIORITY_LABELS, STRINGS } from '../strings/fr';
import styles from './MissionWindow.module.css';
import { ChoiceStepView, InputStepView, OrderingStepView } from './steps';
import { Terminal } from './Terminal/Terminal';
import { VimEditor } from './VimEditor/VimEditor';

/**
 * Fenêtre de mission (docs/08) : en-tête du ticket, objectifs, indices, fiche, et le
 * composant de l'étape en cours (terminal, choix, saisie, ordre).
 *
 * @returns La fenêtre, ou rien hors mission.
 */
export function MissionWindow() {
  const run = useGameStore((s) => s.missionRun);
  if (!run || run.phase !== 'step' || !run.step) return null;
  // Une clé par étape : la confirmation de sortie et la fiche se referment à chaque étape.
  return <MissionStep key={`${run.missionId}-${run.stepIndex}`} run={run} />;
}

/** Contenu de la fenêtre pour l'étape en cours. */
function MissionStep({ run }: { run: MissionRunView }) {
  const { bus, complete, sheet } = useUiServices();
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (run.stepCompleted && run.step?.type !== 'terminal') continueRef.current?.focus();
  }, [run.stepCompleted, run.step?.type]);

  const step = run.step;
  if (!step) return null;
  const submit = (payload: unknown) => bus.emit({ type: 'mission/step-input', payload });
  const hintsLeft = run.hintCount - run.hints.length;
  const sheetData = run.sheet ? sheet(run.sheet) : undefined;
  const last = run.stepIndex === run.stepCount - 1;
  const feedbackText = run.feedback
    ? (run.feedback.text ?? (run.feedback.code ? FEEDBACK_TEXT[run.feedback.code] : ''))
    : '';

  return (
    <div className={styles['backdrop']}>
      <motion.section
        className={styles['window']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-title"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.33, 1, 0.68, 1] }}
      >
        <header className={styles['header']}>
          <h2 id="mission-title" className={styles['title']}>
            {run.ticket && <span>{STRINGS.mission.ticket(run.ticket.number)} · </span>}
            {run.title}
          </h2>
          {run.ticket && (
            <span className={styles['priority']} data-priority={run.ticket.priority}>
              {PRIORITY_LABELS[run.ticket.priority]}
            </span>
          )}
        </header>
        <div className={styles['content']}>
          <aside className={styles['side']}>
            <p className={styles['stepCount']}>
              {STRINGS.mission.step(run.stepIndex, run.stepCount)}
            </p>
            {(step.type === 'terminal' || step.type === 'editor') && (
              <p className={styles['goal']}>{step.goal}</p>
            )}
            {(step.type === 'editor' || (step.type === 'terminal' && step.editor)) && (
              <p className={styles['goal']}>{STRINGS.editor.hint}</p>
            )}
            {run.objectives.length > 0 && (
              <>
                <h3 className={styles['subtitle']}>{STRINGS.mission.objectives}</h3>
                <ul className={styles['objectives']}>
                  {run.objectives.map((o) => (
                    <li key={o.id} className={o.done ? styles['done'] : undefined}>
                      <span aria-hidden="true">{o.done ? '[x]' : '[ ]'}</span> {o.label}
                      <span className="visually-hidden">
                        {' '}
                        ({o.done ? STRINGS.mission.objectiveDone : STRINGS.mission.objectiveTodo})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {run.hints.length > 0 && (
              <>
                <h3 className={styles['subtitle']}>{STRINGS.mission.hints}</h3>
                <ol className={styles['hints']}>
                  {run.hints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </>
            )}
            <p className={styles['feedback']} data-kind={run.feedback?.kind} aria-live="polite">
              {feedbackText}
            </p>
            <div className={styles['actions']}>
              <button
                type="button"
                onClick={() => bus.emit({ type: 'mission/hint-requested' })}
                disabled={hintsLeft === 0 || run.stepCompleted}
              >
                {STRINGS.mission.hint} {STRINGS.mission.hintsLeft(hintsLeft)}
              </button>
              {sheetData && (
                <button type="button" onClick={() => setSheetOpen(true)}>
                  {STRINGS.mission.sheet}
                </button>
              )}
              {!confirmQuit ? (
                <button type="button" onClick={() => setConfirmQuit(true)}>
                  {STRINGS.mission.quit}
                </button>
              ) : (
                <span className={styles['confirm']}>
                  {STRINGS.mission.quitConfirm}
                  <button type="button" onClick={() => bus.emit({ type: 'mission/abandon' })}>
                    {STRINGS.mission.quit}
                  </button>
                  <button type="button" onClick={() => setConfirmQuit(false)} autoFocus>
                    {STRINGS.sheets.close}
                  </button>
                </span>
              )}
            </div>
            {run.stepCompleted && (
              <button
                ref={continueRef}
                type="button"
                className={styles['primary']}
                onClick={() => bus.emit({ type: 'mission/continue' })}
              >
                {last ? STRINGS.mission.finish : STRINGS.mission.continue}
              </button>
            )}
          </aside>
          <div className={styles['main']}>
            {step.type === 'editor' && (
              <VimEditor view={step.editor} onKey={(key) => submit({ key })} />
            )}
            {step.type === 'terminal' && step.editor && (
              <VimEditor view={step.editor} onKey={(key) => submit({ key })} />
            )}
            {step.type === 'terminal' && !step.editor && (
              <Terminal
                prompt={step.prompt}
                lines={step.lines}
                hint={STRINGS.terminal.welcome}
                onSubmit={(line) => submit({ line })}
                onComplete={complete}
              />
            )}
            {step.type === 'choice' && (
              <ChoiceStepView step={step} onSubmit={submit} disabled={run.stepCompleted} />
            )}
            {step.type === 'input' && (
              <InputStepView step={step} onSubmit={submit} disabled={run.stepCompleted} />
            )}
            {step.type === 'ordering' && (
              <OrderingStepView step={step} onSubmit={submit} disabled={run.stepCompleted} />
            )}
            {step.type === 'dialogue' && <p>{STRINGS.mission.dialogueStep}</p>}
          </div>
        </div>
        {sheetOpen && sheetData && (
          <div
            className={styles['sheet']}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
          >
            <h3 id="sheet-title">
              {STRINGS.sheets.title} — {sheetData.title}
            </h3>
            <SimpleMarkdown text={sheetData.body} />
            <button
              type="button"
              className={styles['primary']}
              onClick={() => setSheetOpen(false)}
              autoFocus
            >
              {STRINGS.sheets.close}
            </button>
          </div>
        )}
      </motion.section>
    </div>
  );
}
