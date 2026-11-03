import type Phaser from 'phaser';
import type { Facing } from '@core/model';
import {
  directionFromKeys,
  facingFromVector,
  RUN_FACTOR,
  WALK_SPEED,
  type DirectionKeys,
} from '../systems/movement';
import type { GridPoint } from '../systems/pathfinding';
import { Character } from './Character';

/** Joueur : clavier en 8 directions, course avec Maj, déplacement au clic par chemin. */
export class Player extends Character {
  private path: GridPoint[] = [];
  private onArrive: (() => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, facing: Facing = 'down') {
    super(scene, x, y, texture, facing);
    this.setCollideWorldBounds(true);
  }

  /**
   * Suit un chemin de cases, puis appelle `onArrive` à la dernière.
   *
   * @param path - Cases à parcourir.
   * @param onArrive - Action à l'arrivée (parler au PNJ…).
   */
  followPath(path: GridPoint[], onArrive: (() => void) | null): void {
    this.path = [...path];
    this.onArrive = onArrive;
    if (path.length === 0) this.arrive();
  }

  /** Arrête tout déplacement. */
  halt(): void {
    this.path = [];
    this.onArrive = null;
    this.setVelocity(0, 0);
    this.animate(false);
  }

  /**
   * Met à jour la vitesse à chaque image.
   *
   * @param keys - Touches de direction.
   * @param running - Maj enfoncée.
   * @param tileSize - Taille d'une case (pour suivre le chemin).
   * @param deltaMs - Durée de l'image (ms), pour ne pas dépasser un point de passage.
   */
  step(keys: DirectionKeys, running: boolean, tileSize: number, deltaMs: number): void {
    const speed = WALK_SPEED * (running ? RUN_FACTOR : 1);
    let dir = directionFromKeys(keys);
    if (dir.x !== 0 || dir.y !== 0) {
      this.path = [];
      this.onArrive = null;
    } else if (this.path.length > 0) {
      const next = this.path[0];
      if (next) {
        const tx = next.x * tileSize + tileSize / 2;
        const ty = next.y * tileSize + tileSize - 3;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const distance = Math.hypot(dx, dy);
        // Arrivé si l'on atteindrait le point pendant cette image (même à faible fréquence).
        if (distance <= Math.max(1.5, (speed * deltaMs) / 1000)) {
          this.setPosition(tx, ty);
          this.path.shift();
          if (this.path.length === 0) {
            this.arrive();
            return;
          }
        } else {
          dir = { x: dx / distance, y: dy / distance };
        }
      }
    }
    this.setVelocity(dir.x * speed, dir.y * speed);
    this.facing = facingFromVector(dir, this.facing);
    this.animate(dir.x !== 0 || dir.y !== 0);
    this.anims.timeScale = running ? RUN_FACTOR : 1;
    this.syncDepth();
  }

  /** Fin du chemin. */
  private arrive(): void {
    this.setVelocity(0, 0);
    this.animate(false);
    const callback = this.onArrive;
    this.onArrive = null;
    callback?.();
  }
}
