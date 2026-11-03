import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useGameStore, useGameStoreApi } from '@core/store/use-game-store';
import { useUiServices } from '../hooks/game-services';
import { levelTitle, STRINGS } from '../strings/fr';
import styles from './Notifications.module.css';

/** Durée d'affichage d'une notification (docs/07 : 4 s). */
const DURATION_MS = 4000;

/**
 * Notifications empilées en bas de l'écran. Elles traduisent en texte les événements
 * du moteur (mission terminée, montée de niveau) et disparaissent après 4 s.
 *
 * @returns La zone de notifications.
 */
export function Notifications() {
  const notifications = useGameStore((s) => s.ui.notifications);
  const store = useGameStoreApi();
  const { bus } = useUiServices();

  useEffect(() => {
    const offs = [
      bus.on('mission/completed', ({ result }) => {
        store.getState().pushNotification({
          message: STRINGS.notifications.missionDone(result.xpEarned),
          kind: 'success',
        });
      }),
      bus.on('progression/level-up', ({ level }) => {
        store.getState().pushNotification({
          message: STRINGS.notifications.levelUp(level, levelTitle(level)),
          kind: 'success',
        });
      }),
      bus.on('ui/notify', ({ message, kind }) => {
        store.getState().pushNotification({ message, kind });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [bus, store]);

  useEffect(() => {
    const timers = notifications.map((n) =>
      window.setTimeout(() => store.getState().dismissNotification(n.id), DURATION_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [notifications, store]);

  return (
    <div
      className={styles['stack']}
      role="status"
      aria-live="polite"
      aria-label={STRINGS.notifications.region}
    >
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            className={styles['toast']}
            data-kind={n.kind}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            <span>{n.message}</span>
            <button
              type="button"
              aria-label={STRINGS.notifications.dismiss}
              onClick={() => store.getState().dismissNotification(n.id)}
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
