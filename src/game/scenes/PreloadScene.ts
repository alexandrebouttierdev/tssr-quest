import Phaser from 'phaser';
import { ASSET_KEYS, ASSET_PATHS, CHARACTER_FRAME } from '../keys';
import { createFxTextures } from '../systems/lighting';

/** Charge les assets du monde en affichant une barre de progression. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    const frame = this.add.rectangle(width / 2, height / 2, 162, 8).setStrokeStyle(1, 0x556273);
    const bar = this.add.rectangle(width / 2 - 80, height / 2, 1, 6, 0x2fbf71).setOrigin(0, 0.5);
    this.load.on('progress', (value: number) => bar.setSize(Math.max(1, 160 * value), 6));
    this.load.once('complete', () => {
      frame.destroy();
      bar.destroy();
    });
    // Les ressources suivent la base du site (« / » en local, « /tssr-quest/ » sur GitHub Pages).
    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.load.image(ASSET_KEYS.tilesetServerRoom, ASSET_PATHS[ASSET_KEYS.tilesetServerRoom]);
    this.load.spritesheet(ASSET_KEYS.tileSprites, ASSET_PATHS[ASSET_KEYS.tileSprites], {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet(ASSET_KEYS.character, ASSET_PATHS[ASSET_KEYS.character], {
      frameWidth: CHARACTER_FRAME.width,
      frameHeight: CHARACTER_FRAME.height,
    });
    this.load.tilemapTiledJSON(ASSET_KEYS.mapServerRoom, ASSET_PATHS[ASSET_KEYS.mapServerRoom]);
  }

  create(): void {
    createFxTextures(this);
    this.scene.start('world');
  }
}
