import Phaser from 'phaser';
import type { Viewport } from '@platform/viewport';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { WorldScene } from './scenes/WorldScene';

/**
 * Configuration Phaser (docs/07) : pixel art net agrandi d'un facteur entier, taille
 * logique adaptée à la fenêtre par `GameCanvas`, physique Arcade sans gravité.
 *
 * @param parent - Élément HTML qui accueille le canevas.
 * @param view - Zoom entier et taille logique initiaux.
 * @returns La configuration du jeu.
 */
export function createGameConfig(
  parent: HTMLElement,
  view: Viewport,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: view.width,
    height: view.height,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0e1116',
    scale: { mode: Phaser.Scale.NONE, zoom: view.zoom, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    input: { keyboard: { target: window }, touch: true },
    banner: false,
    scene: [BootScene, PreloadScene, WorldScene],
  };
}
