import type { Facing } from '@core/model';

/** Ligne de la feuille de sprites pour chaque orientation (reference/README.md). */
export const FACING_ROW: Readonly<Record<Facing, number>> = { down: 0, left: 1, right: 2, up: 3 };

/** Images par animation de marche. */
export const WALK_FRAMES = 4;

/**
 * Clé d'animation de marche d'une texture de personnage.
 *
 * @param texture - Clé de la texture.
 * @param facing - Orientation.
 * @returns Par exemple `npc-hugo-walk-left`.
 */
export function walkAnimKey(texture: string, facing: Facing): string {
  return `${texture}-walk-${facing}`;
}

/**
 * Image de repos d'une orientation.
 *
 * @param facing - Orientation.
 * @returns L'indice de l'image dans la feuille.
 */
export function idleFrame(facing: Facing): number {
  return FACING_ROW[facing] * WALK_FRAMES;
}

/**
 * Déclare les animations de marche d'une texture de personnage.
 *
 * @param anims - Gestionnaire d'animations de la scène.
 * @param texture - Clé de la texture.
 */
export function registerCharacterAnims(
  anims: Phaser.Animations.AnimationManager,
  texture: string,
): void {
  for (const facing of Object.keys(FACING_ROW) as Facing[]) {
    const key = walkAnimKey(texture, facing);
    if (anims.exists(key)) continue;
    const start = FACING_ROW[facing] * WALK_FRAMES;
    anims.create({
      key,
      frames: anims.generateFrameNumbers(texture, { start, end: start + WALK_FRAMES - 1 }),
      frameRate: 8,
      repeat: -1,
    });
  }
}
