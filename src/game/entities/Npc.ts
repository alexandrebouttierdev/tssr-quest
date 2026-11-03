import type Phaser from 'phaser';
import type { Facing } from '@core/model';
import { Character } from './Character';

/** État du marqueur au-dessus d'un PNJ : mission disponible (!), à débriefer (?), rien. */
export type NpcMarker = 'mission' | 'debrief' | null;

/** Images des bulles dans la feuille de sprites du décor. */
export interface NpcBubbles {
  readonly texture: string;
  readonly mission: number;
  readonly debrief: number;
  readonly key: number;
}

/**
 * PNJ immobile, avec respiration, bulle de mission (« ! » à prendre, « ? » à
 * débriefer) et bulle « E » quand le joueur peut lui parler.
 */
export class Npc extends Character {
  readonly npcId: string;
  private readonly marker: Phaser.GameObjects.Image;
  private readonly keyBubble: Phaser.GameObjects.Image;
  private readonly bubbles: NpcBubbles;
  private markerKind: NpcMarker = null;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    npcId: string,
    facing: Facing,
    bubbles: NpcBubbles,
  ) {
    super(scene, x, y, texture, facing);
    this.npcId = npcId;
    this.bubbles = bubbles;
    (this.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.marker = scene.add
      .image(x, y - 25, bubbles.texture, bubbles.mission)
      .setOrigin(0.5, 1)
      .setDepth(10_000)
      .setVisible(false);
    this.keyBubble = scene.add
      .image(x, y - 25, bubbles.texture, bubbles.key)
      .setOrigin(0.5, 1)
      .setDepth(10_001)
      .setVisible(false);
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
      targets: [this.marker, this.keyBubble],
      y: y - 27,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Affiche le bon marqueur de mission. */
  setMarker(marker: NpcMarker): void {
    this.markerKind = marker;
    this.marker.setFrame(marker === 'debrief' ? this.bubbles.debrief : this.bubbles.mission);
    this.refreshBubbles();
  }

  /** Le joueur est à portée et tourné vers ce PNJ : la bulle « E » remplace le marqueur. */
  setFocused(focused: boolean): void {
    if (focused === this.focused) return;
    this.focused = focused;
    this.refreshBubbles();
  }

  /** Une seule bulle à la fois au-dessus de la tête. */
  private refreshBubbles(): void {
    this.keyBubble.setVisible(this.focused);
    this.marker.setVisible(!this.focused && this.markerKind !== null);
  }

  override destroy(fromScene?: boolean): void {
    this.marker.destroy();
    this.keyBubble.destroy();
    super.destroy(fromScene);
  }
}
