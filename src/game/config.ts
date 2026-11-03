import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH } from '@platform/viewport';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { WorldScene } from './scenes/WorldScene';

/**
 * Configuration Phaser (docs/07) : 480 × 270 en pixel art net, zoom entier géré par
 * `GameCanvas`, physique Arcade sans gravité.
 *
 * @param parent - Élément HTML qui accueille le canevas.
 * @param zoom - Zoom entier initial.
 * @returns La configuration du jeu.
 */
export function createGameConfig(parent: HTMLElement, zoom: number): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#0e1116',
    scale: { mode: Phaser.Scale.NONE, zoom, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    input: { keyboard: { target: window }, touch: true },
    banner: false,
    scene: [BootScene, PreloadScene, WorldScene],
  };
}
