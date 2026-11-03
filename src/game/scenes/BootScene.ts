import Phaser from 'phaser';

/** Première scène : rien à charger, on passe au préchargement (docs/02). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.scene.start('preload');
  }
}
