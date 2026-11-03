import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '@game/config';
import { provideServices, type WorldServices } from '@game/services';
import { viewportFor } from '@platform/viewport';

/**
 * Crée l'instance Phaser dans un conteneur et la détruit au démontage. React ne
 * touche jamais au canevas lui-même (règle 7 de CLAUDE.md).
 *
 * @param props - Services partagés avec le monde.
 * @returns Le conteneur du canevas.
 */
export function GameCanvas({
  services,
  onReady,
}: {
  services: WorldServices;
  onReady?: (game: Phaser.Game) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const game = new Phaser.Game(
      createGameConfig(container, viewportFor(window.innerWidth, window.innerHeight)),
    );
    provideServices(game, services);
    onReady?.(game);
    // La taille logique suit la fenêtre : le monde la remplit toujours, en zoom entier.
    const onResize = () => {
      const view = viewportFor(window.innerWidth, window.innerHeight);
      game.scale.setZoom(view.zoom);
      game.scale.resize(view.width, view.height);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      game.destroy(true);
    };
  }, [services, onReady]);

  return <div ref={containerRef} className="game-canvas" data-testid="game-canvas" />;
}
