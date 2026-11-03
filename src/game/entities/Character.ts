import Phaser from 'phaser';
import type { Facing } from '@core/model';
import { idleFrame, registerCharacterAnims, walkAnimKey } from '../animations/characters';

/**
 * Personnage du monde (joueur ou PNJ) : sprite 16 × 24 posé par les pieds, ombre portée,
 * animations de marche dans les quatre directions et respiration au repos.
 */
export class Character extends Phaser.Physics.Arcade.Sprite {
  /** Orientation courante. */
  facing: Facing;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly textureKey: string;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, facing: Facing) {
    super(scene, x, y, texture, idleFrame(facing));
    this.textureKey = texture;
    this.facing = facing;
    registerCharacterAnims(scene.anims, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Seuls les pieds entrent en collision : le haut du corps peut passer devant un mur.
    body.setSize(10, 6).setOffset(3, 18);
    this.shadow = scene.add.ellipse(x, y - 1, 11, 4, 0x000000, 0.35);
    this.syncDepth();
  }

  /** Joue la marche ou l'image de repos selon le mouvement. */
  animate(moving: boolean): void {
    if (moving) this.anims.play(walkAnimKey(this.textureKey, this.facing), true);
    else {
      this.anims.stop();
      this.setFrame(idleFrame(this.facing));
    }
  }

  /** Tourne le personnage vers un point. */
  face(x: number, y: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    this.facing =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.animate(false);
  }

  /** Profondeur selon la position verticale (les personnages du bas passent devant). */
  syncDepth(): void {
    this.setDepth(10 + this.y);
    this.shadow.setPosition(this.x, this.y - 1).setDepth(9 + this.y);
  }

  override destroy(fromScene?: boolean): void {
    this.shadow.destroy();
    super.destroy(fromScene);
  }
}
