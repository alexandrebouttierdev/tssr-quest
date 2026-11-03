import type { Facing } from '@core/model';

/** Touches de direction enfoncées. */
export interface DirectionKeys {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/** Vecteur de déplacement. */
export interface Vector {
  readonly x: number;
  readonly y: number;
}

/** Vitesse de marche (docs/06). */
export const WALK_SPEED = 80;

/** Multiplicateur de course avec Maj. */
export const RUN_FACTOR = 1.6;

/**
 * Direction de déplacement (8 directions) à partir des touches, normalisée pour que
 * la diagonale ne soit pas plus rapide.
 *
 * @param keys - Touches enfoncées.
 * @returns Le vecteur unitaire (ou nul).
 */
export function directionFromKeys(keys: DirectionKeys): Vector {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

/**
 * Orientation du personnage pour un déplacement (l'horizontal l'emporte en diagonale).
 *
 * @param v - Vecteur de déplacement.
 * @param current - Orientation actuelle (gardée à l'arrêt).
 * @returns La nouvelle orientation.
 */
export function facingFromVector(v: Vector, current: Facing): Facing {
  if (v.x === 0 && v.y === 0) return current;
  if (Math.abs(v.x) >= Math.abs(v.y)) return v.x > 0 ? 'right' : 'left';
  return v.y > 0 ? 'down' : 'up';
}

/** Cible avec laquelle le joueur peut interagir. */
export interface InteractionTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Cible d'interaction la plus proche, à portée et plutôt devant le joueur.
 *
 * @param player - Position et orientation du joueur.
 * @param targets - Cibles du monde.
 * @param range - Portée en pixels.
 * @returns La cible, ou `null`.
 */
export function findInteractionTarget(
  player: { x: number; y: number; facing: Facing },
  targets: readonly InteractionTarget[],
  range = 22,
): InteractionTarget | null {
  const ahead: Record<Facing, Vector> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const dir = ahead[player.facing];
  let best: { target: InteractionTarget; score: number } | null = null;
  for (const target of targets) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > range) continue;
    // Une cible derrière le joueur est pénalisée mais reste accessible au contact.
    const facingBonus = distance === 0 ? 0 : (dx * dir.x + dy * dir.y) / distance;
    const score = distance - facingBonus * 8;
    if (!best || score < best.score) best = { target, score };
  }
  return best?.target ?? null;
}
