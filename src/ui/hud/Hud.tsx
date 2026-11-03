import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { xpProgress } from '@engine/progression/levels';
import type { ActiveObjective } from '@engine/tickets/ticket-board';
import { useGameStore } from '@core/store/use-game-store';
import { Icon } from '../components/Icon';
import { Portrait } from '../components/Portrait';
import { useUiServices } from '../hooks/game-services';
import { levelTitle, PRIORITY_LABELS, STRINGS } from '../strings/fr';
import { formatGameDay, formatGameTime } from './format';
import styles from './Hud.module.css';

/** Durée d'affichage du rappel des contrôles (ms). */
const CONTROLS_HINT_MS = 12_000;

/** Durée d'affichage d'un gain d'XP au-dessus de la barre (ms). */
const XP_GAIN_MS = 1_800;

/** Carte joueur : portrait, nom, niveau, grade, barre d'XP et gains animés. */
function PlayerCard() {
  const name = useGameStore((s) => s.player.name) || STRINGS.hud.playerFallback;
  const xp = useGameStore((s) => s.progression.xp);
  const progress = xpProgress(xp);
  const previous = useRef(xp);
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null);

  useEffect(() => {
    const delta = xp - previous.current;
    previous.current = xp;
    if (delta <= 0) return;
    setGain({ amount: delta, key: Date.now() });
    const timer = window.setTimeout(() => setGain(null), XP_GAIN_MS);
    return () => window.clearTimeout(timer);
  }, [xp]);

  return (
    <section className={styles['player']} aria-label={name}>
      <div className={styles['avatar']}>
        <Portrait id="joueur" name={name} size={96} className={styles['avatarImage']} />
      </div>
      <div className={styles['identity']}>
        <p className={styles['name']}>
          <span>{name}</span>
          <span className={styles['level']}>{STRINGS.hud.level(progress.level)}</span>
        </p>
        <p className={styles['grade']}>{levelTitle(progress.level)}</p>
        <div
          className={styles['bar']}
          role="progressbar"
          aria-label="XP"
          aria-valuemin={0}
          aria-valuemax={progress.needed || 1}
          aria-valuenow={progress.needed ? progress.current : 1}
          aria-valuetext={STRINGS.hud.xp(progress.current, progress.needed)}
        >
          <div
            className={styles['fill']}
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
        <p className={styles['xp']}>{STRINGS.hud.xp(progress.current, progress.needed)}</p>
      </div>
      <AnimatePresence>
        {gain && (
          <motion.span
            key={gain.key}
            className={styles['gain']}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            role="status"
          >
            {STRINGS.hud.xpGain(gain.amount)}
          </motion.span>
        )}
      </AnimatePresence>
    </section>
  );
}

/** État en haut à droite : heure de jeu, tickets ouverts, alertes. */
function StatusBar({ tickets, alerts }: { tickets: number; alerts: number }) {
  const { clock } = useUiServices();
  const [now, setNow] = useState(() => clock());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock()), 5_000);
    return () => window.clearInterval(timer);
  }, [clock]);
  const time = formatGameTime(now);
  const day = formatGameDay(now);

  return (
    <section className={styles['status']} aria-label={STRINGS.hud.status}>
      <div className={styles['clock']} aria-label={STRINGS.hud.time(time, day)}>
        <span className={styles['time']} aria-hidden="true">
          {time}
        </span>
        <span className={styles['day']} aria-hidden="true">
          {day}
        </span>
      </div>
      <div className={styles['stat']} title={STRINGS.hud.tickets(tickets)}>
        <Icon name="ticket" />
        <span aria-hidden="true">{tickets}</span>
        <span className="visually-hidden">{STRINGS.hud.tickets(tickets)}</span>
      </div>
      <div
        className={styles['stat']}
        data-alert={alerts > 0 ? 'true' : undefined}
        title={STRINGS.hud.alerts(alerts)}
      >
        <Icon name="alert" />
        <span aria-hidden="true">{alerts}</span>
        <span className="visually-hidden">{STRINGS.hud.alerts(alerts)}</span>
      </div>
    </section>
  );
}

/** Objectif actif en bas à gauche : mission en cours, ou prochain ticket. */
function ObjectiveCard({ objective }: { objective: ActiveObjective | null }) {
  if (!objective) {
    return (
      <section className={styles['objective']} aria-label={STRINGS.hud.objective}>
        <p className="eyebrow">{STRINGS.hud.objective}</p>
        <p className={styles['objectiveTitle']}>{STRINGS.hud.noObjective}</p>
        <p className={styles['objectiveDetail']}>{STRINGS.hud.noObjectiveHint}</p>
      </section>
    );
  }
  if (objective.kind === 'ticket') {
    const t = objective.ticket;
    return (
      <section className={styles['objective']} aria-label={STRINGS.hud.objective}>
        <p className={styles['objectiveEyebrow']}>
          <Icon name="target" size={14} />
          <span>{STRINGS.hud.objectiveTicket(t.number)}</span>
          <span className={styles['priority']} data-priority={t.priority}>
            {PRIORITY_LABELS[t.priority]}
          </span>
        </p>
        <p className={styles['objectiveTitle']}>{t.title}</p>
        <p className={styles['objectiveDetail']}>
          <Icon name="chat" size={14} /> {STRINGS.hud.goTo(t.giverName, t.zoneName)}
        </p>
      </section>
    );
  }
  const ratio = objective.total > 0 ? objective.done / objective.total : 0;
  return (
    <section className={styles['objective']} aria-label={STRINGS.hud.objective}>
      <p className={styles['objectiveEyebrow']}>
        <Icon name="target" size={14} />
        <span>
          {objective.ticketNumber !== null
            ? STRINGS.hud.objectiveTicket(objective.ticketNumber)
            : STRINGS.hud.objective}
        </span>
        <span>· {STRINGS.hud.stepProgress(objective.stepIndex, objective.stepCount)}</span>
      </p>
      <p className={styles['objectiveTitle']}>{objective.title}</p>
      {objective.goal && <p className={styles['objectiveDetail']}>{objective.goal}</p>}
      {objective.total > 0 && (
        <div className={styles['objectiveProgress']}>
          <div className={styles['segments']} aria-hidden="true">
            {Array.from({ length: objective.total }, (_, i) => (
              <span key={i} data-done={i < objective.done ? 'true' : undefined} />
            ))}
          </div>
          <span
            className={styles['objectiveCount']}
            data-complete={ratio === 1 ? 'true' : undefined}
          >
            {STRINGS.hud.objectivesDone(objective.done, objective.total)}
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * HUD d'exploration (docs/08) : carte joueur en haut à gauche, heure, tickets et
 * alertes en haut à droite, objectif actif en bas à gauche, invite d'interaction
 * contextuelle en bas au centre. Compact, translucide, il s'efface pendant les
 * dialogues et les missions.
 *
 * @returns Le HUD.
 */
export function Hud() {
  const prompt = useGameStore((s) => s.ui.interactionPrompt);
  const busy = useGameStore((s) => s.ui.inputMode === 'ui');
  const dialogueOpen = useGameStore((s) => s.ui.dialogue !== null);
  const progress = useGameStore((s) => s.progress);
  const progression = useGameStore((s) => s.progression);
  const inventory = useGameStore((s) => s.inventory);
  const missionRun = useGameStore((s) => s.missionRun);
  const { bus, ticketBoard } = useUiServices();
  const board = useMemo(
    () => ticketBoard({ progress, progression, inventory, missionRun }),
    [ticketBoard, progress, progression, inventory, missionRun],
  );

  // Rappel des contrôles à l'arrivée, effacé après quelques secondes.
  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowControls(false), CONTROLS_HINT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={styles['hud']}>
      <PlayerCard />
      <StatusBar tickets={board.open.length} alerts={board.alerts} />
      {!dialogueOpen && <ObjectiveCard objective={board.objective} />}
      <AnimatePresence>
        {showControls && !busy && !prompt && (
          <motion.p
            key="controls"
            className={styles['controls']}
            role="note"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {STRINGS.controlsHint}
          </motion.p>
        )}
        {prompt && !busy && (
          <motion.button
            key={`prompt-${prompt.targetId}`}
            type="button"
            className={styles['prompt']}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
            onClick={() => bus.emit({ type: 'world/interact', targetId: prompt.targetId })}
          >
            <kbd className="kbd">{STRINGS.hud.interactKey}</kbd>{' '}
            {STRINGS.hud.interact(prompt.label)}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
