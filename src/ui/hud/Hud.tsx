import { useEffect, useState } from 'react';
import { xpProgress } from '@engine/progression/levels';
import { useGameStore } from '@core/store/use-game-store';
import { useUiServices } from '../hooks/game-services';
import { levelTitle, STRINGS } from '../strings/fr';
import styles from './Hud.module.css';

/** Durée d'affichage du rappel des contrôles (ms). */
const CONTROLS_HINT_MS = 12_000;

/**
 * HUD d'exploration (docs/08) : carte joueur avec niveau, titre et barre d'XP animée,
 * et invite d'interaction contextuelle (cliquable au toucher).
 *
 * @returns Le HUD.
 */
export function Hud() {
  const name = useGameStore((s) => s.player.name);
  const xp = useGameStore((s) => s.progression.xp);
  const prompt = useGameStore((s) => s.ui.interactionPrompt);
  const busy = useGameStore((s) => s.ui.inputMode === 'ui');
  const { bus } = useUiServices();
  const progress = xpProgress(xp);
  // Rappel des contrôles à l'arrivée, effacé après quelques secondes.
  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowControls(false), CONTROLS_HINT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={styles['hud']}>
      <div className={styles['card']}>
        <div className={styles['avatar']} aria-hidden="true">
          {(name || STRINGS.hud.playerFallback).slice(0, 1)}
        </div>
        <div className={styles['info']}>
          <p className={styles['name']}>
            {name || STRINGS.hud.playerFallback}{' '}
            <span className={styles['level']}>{STRINGS.hud.level(progress.level)}</span>
          </p>
          <p className={styles['title']}>{levelTitle(progress.level)}</p>
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
      </div>
      {showControls && !busy && !prompt && (
        <p className={styles['controls']} role="note">
          {STRINGS.controlsHint}
        </p>
      )}
      {prompt && !busy && (
        <button
          type="button"
          className={styles['prompt']}
          onClick={() => bus.emit({ type: 'world/interact', targetId: prompt.targetId })}
        >
          <kbd>{STRINGS.hud.interactKey}</kbd> {STRINGS.hud.interact(prompt.label)}
        </button>
      )}
    </div>
  );
}
