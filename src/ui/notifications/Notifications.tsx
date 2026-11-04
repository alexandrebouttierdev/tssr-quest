import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useGameStore, useGameStoreApi } from '@core/store/use-game-store';
import { Icon, type IconName } from '../components/Icon';
import { useUiServices } from '../hooks/game-services';
import { levelTitle, STRINGS } from '../strings/fr';
import styles from './Notifications.module.css';

/** Icône de chaque type de notification. */
const ICONS: Readonly<Record<string, IconName>> = {
  success: 'check',
  warning: 'alert',
  info: 'chat',
};

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
          message:
            result.grade === undefined
              ? STRINGS.notifications.missionDone(result.xpEarned)
              : STRINGS.notifications.examDone(result.grade, result.xpEarned),
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
            layout
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={styles['icon']} aria-hidden="true">
              <Icon name={ICONS[n.kind] ?? 'chat'} size={16} />
            </span>
            <span className={styles['message']}>{n.message}</span>
            <button
              type="button"
              aria-label={STRINGS.notifications.dismiss}
              onClick={() => store.getState().dismissNotification(n.id)}
            >
              <Icon name="close" size={14} />
            </button>
            <span className={styles['timer']} aria-hidden="true" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
