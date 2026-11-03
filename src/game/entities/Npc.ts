import type Phaser from 'phaser';
import type { Facing } from '@core/model';
import { Character } from './Character';

/** État du marqueur au-dessus d'un PNJ : mission disponible (!), à débriefer (?), rien. */
export type NpcMarker = 'mission' | 'debrief' | null;

/** PNJ immobile, avec respiration et marqueur de mission. */
export class Npc extends Character {
  readonly npcId: string;
  private readonly marker: Phaser.GameObjects.Container;
  private readonly markerText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    npcId: string,
    facing: Facing,
  ) {
    super(scene, x, y, texture, facing);
    this.npcId = npcId;
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    const bubble = scene.add.rectangle(0, 0, 8, 11, 0xf2b54a).setStrokeStyle(1, 0x0e1116);
    this.markerText = scene.add
      .text(0, 0, '!', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#1a1307',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.marker = scene.add.container(x, y - 30, [bubble, this.markerText]).setVisible(false);
    // Respiration : un pixel de haut en bas, lentement.
    scene.tweens.add({
      targets: this,
      scaleY: { from: 1, to: 1.04 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: this.marker,
      y: y - 32,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Affiche le bon marqueur. */
  setMarker(marker: NpcMarker): void {
    this.marker.setVisible(marker !== null);
    this.markerText.setText(marker === 'debrief' ? '?' : '!');
    this.marker.setDepth(10_000);
  }

  override destroy(fromScene?: boolean): void {
    this.marker.destroy();
    super.destroy(fromScene);
  }
}
