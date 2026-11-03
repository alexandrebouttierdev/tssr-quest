import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type Phaser from 'phaser';
import { GameStoreProvider, useGameStore } from '@core/store/use-game-store';
import { DialogueBox } from '@ui/dialogue/DialogueBox';
import { UiServicesProvider } from '@ui/hooks/game-services';
import { Hud } from '@ui/hud/Hud';
import { MissionWindow } from '@ui/mission/MissionWindow';
import { Notifications } from '@ui/notifications/Notifications';
import { STRINGS } from '@ui/strings/fr';
import { TitleScreen, type NewGameIdentity } from '@ui/title/TitleScreen';
import { createGameStore } from '@core/store/create-store';
import { loadGeneratedContent } from './content';
import { installDebug } from './debug';
import { GameCanvas } from './GameCanvas';
import { createAppServices, restoreAutosave, type AppServices } from './services';

/** Boîte de dialogue reliée au store et au bus. */
function ConnectedDialogue({ services }: { services: AppServices }) {
  const view = useGameStore((s) => s.ui.dialogue);
  const textSpeed = useGameStore((s) => s.settings.textSpeed);
  const reducedMotion = useGameStore((s) => s.settings.reducedMotion);
  if (!view) return null;
  return (
    <DialogueBox
      key={`${view.nodeId}:${view.text}`}
      view={view}
      textSpeed={textSpeed}
      reducedMotion={reducedMotion}
      onAdvance={() => services.bus.emit({ type: 'dialogue/advance' })}
      onChoose={(choiceId) =>
        services.bus.emit({ type: 'dialogue/choice', nodeId: view.nodeId, choiceId })
      }
    />
  );
}

/** Applique les réglages d'accessibilité à la racine du document. */
function useAccessibilitySettings() {
  const settings = useGameStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset['textSize'] = settings.textSize;
    root.dataset['readableFont'] = String(settings.readableFont);
    root.dataset['highContrast'] = String(settings.highContrast);
  }, [settings.textSize, settings.readableFont, settings.highContrast]);
  return settings.reducedMotion;
}

/** Écran de jeu : monde Phaser et couches d'interface React. */
function GameScreen({ services }: { services: AppServices }) {
  const reducedMotion = useAccessibilitySettings();
  const gameRef = useRef<Phaser.Game | null>(null);
  const onReady = useCallback((game: Phaser.Game) => {
    gameRef.current = game;
  }, []);
  const worldServices = useMemo(
    () => ({ store: services.store, bus: services.bus, content: services.content }),
    [services],
  );
  useEffect(() => installDebug(services, () => gameRef.current), [services]);
  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <main className="screen" aria-label={STRINGS.appTitle}>
        <GameCanvas services={worldServices} onReady={onReady} />
        <Hud />
        <ConnectedDialogue services={services} />
        <MissionWindow />
        <Notifications />
      </main>
    </MotionConfig>
  );
}

/**
 * Composant racine de l'application React : charge le contenu et la sauvegarde
 * automatique, affiche l'écran titre, puis le jeu.
 *
 * @returns L'arbre complet de l'interface.
 */
export function App() {
  const content = useMemo(() => loadGeneratedContent(), []);
  const services = useMemo(() => (content ? createAppServices(content) : null), [content]);
  const [ready, setReady] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!services) return;
    let alive = true;
    void restoreAutosave(services).then((restored) => {
      if (!alive) return;
      setHasSave(restored);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [services]);

  const startNewGame = useCallback(
    (identity: NewGameIdentity) => {
      if (!services) return;
      // Nouvelle partie : on repart d'un état neuf (la sauvegarde sera remplacée).
      if (hasSave) services.store.setState(createGameStore().getState());
      services.store.getState().setPlayerIdentity({
        name: identity.name,
        pronouns: identity.pronouns,
      });
      setStarted(true);
    },
    [services, hasSave],
  );

  if (!services) return <main className="screen message">{STRINGS.contentMissing}</main>;
  if (!ready) return <main className="screen message">{STRINGS.loading}</main>;
  if (!started) {
    return (
      <TitleScreen
        hasSave={hasSave}
        savedName={services.store.getState().player.name}
        onContinue={() => setStarted(true)}
        onNewGame={startNewGame}
      />
    );
  }
  return (
    <GameStoreProvider store={services.store}>
      <UiServicesProvider services={services.ui}>
        <GameScreen services={services} />
      </UiServicesProvider>
    </GameStoreProvider>
  );
}
