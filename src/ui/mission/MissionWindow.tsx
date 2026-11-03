import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { MissionRunView } from '@core/store/mission-run.slice';
import { useGameStore } from '@core/store/use-game-store';
import { Icon } from '../components/Icon';
import { SimpleMarkdown } from '../components/SimpleMarkdown';
import { useUiServices } from '../hooks/game-services';
import { FEEDBACK_TEXT, PRIORITY_LABELS, STRINGS } from '../strings/fr';
import styles from './MissionWindow.module.css';
import { ChoiceStepView, InputStepView, OrderingStepView } from './steps';
import { Terminal } from './Terminal/Terminal';
import { VimEditor } from './VimEditor/VimEditor';

/**
 * Fenêtre de mission (docs/08), dans l'esprit d'un outil de gestion d'incidents :
 * en-tête du ticket (numéro, titre, priorité, étapes), description, consigne,
 * objectifs avec progression, indices et fiche mémo, et la zone de simulation de
 * l'étape en cours (terminal, éditeur, choix, saisie, ordre).
 *
 * @returns La fenêtre, ou rien hors mission.
 */
export function MissionWindow() {
  const run = useGameStore((s) => s.missionRun);
  const reducedMotion = useGameStore((s) => s.settings.reducedMotion);
  if (!run || run.phase !== 'step' || !run.step) return null;
  // Une clé par étape : la confirmation de sortie et la fiche se referment à chaque étape.
  return (
    <MissionStep
      key={`${run.missionId}-${run.stepIndex}`}
      run={run}
      reducedMotion={reducedMotion}
    />
  );
}

/** Session affichée dans la barre de titre du terminal (`hugo@srv-web01`). */
function sessionName(prompt: string, machine: string): string {
  return /^([^\s:]+@[^\s:]+)/.exec(prompt)?.[1] ?? machine;
}

/** Contenu de la fenêtre pour l'étape en cours. */
function MissionStep({ run, reducedMotion }: { run: MissionRunView; reducedMotion: boolean }) {
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
  const done = run.objectives.filter((o) => o.done).length;
  const total = run.objectives.length;
  const goal = step.type === 'terminal' || step.type === 'editor' ? step.goal : null;
  const editing = step.type === 'editor' || (step.type === 'terminal' && step.editor);

  return (
    <motion.div
      className={styles['backdrop']}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.section
        className={styles['window']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-title"
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className={styles['header']} data-priority={run.ticket?.priority}>
          <div className={styles['headings']}>
            <p className={styles['eyebrow']}>
              <Icon name="ticket" size={14} />
              {STRINGS.mission.incident}
              <span aria-hidden="true">·</span>
              {STRINGS.mission.step(run.stepIndex, run.stepCount)}
            </p>
            <h2 id="mission-title" className={styles['title']}>
              {run.ticket && (
                <span className={styles['ticketNumber']}>
                  {STRINGS.mission.ticket(run.ticket.number)}
                </span>
              )}
              {run.ticket && <span className={styles['separator']}> · </span>}
              {run.title}
            </h2>
          </div>
          <div className={styles['headerSide']}>
            {run.ticket && (
              <span className={styles['priority']} data-priority={run.ticket.priority}>
                <span className={styles['dot']} aria-hidden="true" />
                {PRIORITY_LABELS[run.ticket.priority]}
              </span>
            )}
            <ol className={styles['stepper']} aria-hidden="true">
              {Array.from({ length: run.stepCount }, (_, i) => (
                <li
                  key={i}
                  data-state={i < run.stepIndex ? 'done' : i === run.stepIndex ? 'current' : 'todo'}
                />
              ))}
            </ol>
          </div>
        </header>

        <div className={styles['content']}>
          <aside className={styles['side']}>
            {run.summary && (
              <section className={styles['block']}>
                <h3 className={styles['subtitle']}>{STRINGS.mission.description}</h3>
                <p className={styles['summary']}>{run.summary}</p>
              </section>
            )}
            {(goal || editing) && (
              <section className={styles['block']}>
                <h3 className={styles['subtitle']}>{STRINGS.mission.instructions}</h3>
                {goal && <p className={styles['goal']}>{goal}</p>}
                {editing && <p className={styles['editorHint']}>{STRINGS.editor.hint}</p>}
              </section>
            )}
            {total > 0 && (
              <section className={styles['block']}>
                <h3 className={styles['subtitle']}>
                  {STRINGS.mission.objectives}
                  <span className={styles['count']}>{STRINGS.mission.progress(done, total)}</span>
                </h3>
                <div className={styles['progress']} aria-hidden="true">
                  <div style={{ width: `${(done / total) * 100}%` }} />
                </div>
                <ul className={styles['objectives']}>
                  {run.objectives.map((o) => (
                    <li key={o.id} data-done={o.done ? 'true' : 'false'}>
                      <span className={styles['check']} aria-hidden="true">
                        {o.done && <Icon name="check" size={12} />}
                      </span>
                      <span>{o.label}</span>
                      <span className="visually-hidden">
                        {' '}
                        ({o.done ? STRINGS.mission.objectiveDone : STRINGS.mission.objectiveTodo})
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {run.hints.length > 0 && (
              <section className={styles['block']}>
                <h3 className={styles['subtitle']}>{STRINGS.mission.hints}</h3>
                <ol className={styles['hints']}>
                  {run.hints.map((h, i) => (
                    <li key={i}>
                      <Icon name="hint" size={14} />
                      <span>{h}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {!run.stepCompleted && (
              <p className={styles['feedback']} data-kind={run.feedback?.kind} aria-live="polite">
                {feedbackText}
              </p>
            )}
            <div className={styles['actions']}>
              <button
                type="button"
                className="btn"
                onClick={() => bus.emit({ type: 'mission/hint-requested' })}
                disabled={hintsLeft === 0 || run.stepCompleted}
              >
                <Icon name="hint" />
                {STRINGS.mission.hint} {STRINGS.mission.hintsLeft(hintsLeft)}
              </button>
              {sheetData && (
                <button type="button" className="btn" onClick={() => setSheetOpen(true)}>
                  <Icon name="sheet" />
                  {STRINGS.mission.sheetLong}
                </button>
              )}
              {!confirmQuit ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => setConfirmQuit(true)}
                >
                  {STRINGS.mission.quit}
                </button>
              ) : (
                <div className={styles['confirm']} role="group">
                  <p>{STRINGS.mission.quitConfirm}</p>
                  <div>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => bus.emit({ type: 'mission/abandon' })}
                    >
                      {STRINGS.mission.quit}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setConfirmQuit(false)}
                      autoFocus
                    >
                      {STRINGS.sheets.close}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
          <div className={styles['main']} aria-label={STRINGS.mission.simulation} role="region">
            {step.type === 'editor' && (
              <VimEditor view={step.editor} onKey={(key) => submit({ key })} />
            )}
            {step.type === 'terminal' && step.editor && (
              <VimEditor view={step.editor} onKey={(key) => submit({ key })} />
            )}
            {step.type === 'terminal' && !step.editor && (
              <Terminal
                title={STRINGS.terminal.title(sessionName(step.prompt, step.machine))}
                prompt={step.prompt}
                lines={step.lines}
                secret={step.secret ?? false}
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

        <AnimatePresence>
          {run.stepCompleted && (
            <motion.footer
              className={styles['complete']}
              data-kind={run.feedback?.kind ?? 'success'}
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={styles['completeIcon']} aria-hidden="true">
                <Icon name="check" size={18} />
              </span>
              <p aria-live="polite">{feedbackText}</p>
              <button
                ref={continueRef}
                type="button"
                className="btn btn-primary"
                onClick={() => bus.emit({ type: 'mission/continue' })}
              >
                {last ? STRINGS.mission.finish : STRINGS.mission.continue}
              </button>
            </motion.footer>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sheetOpen && sheetData && (
            <motion.div
              className={styles['sheet']}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sheet-title"
              initial={reducedMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
            >
              <p className={styles['sheetEyebrow']}>{STRINGS.sheets.title}</p>
              <h3 id="sheet-title">{sheetData.title}</h3>
              <SimpleMarkdown text={sheetData.body} />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSheetOpen(false)}
                autoFocus
              >
                {STRINGS.sheets.close}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}
