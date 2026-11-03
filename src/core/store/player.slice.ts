import type { Facing, Pronouns } from '../model';
import type { SliceCreator } from './types';

/** Apparence choisie à la création du personnage (indices dans les palettes). */
export interface Appearance {
  readonly hair: number;
  readonly hairColor: number;
  readonly skin: number;
  readonly outfit: number;
}

/** Tranche `player` : identité et position du joueur. */
export interface PlayerState {
  readonly name: string;
  readonly pronouns: Pronouns;
  readonly appearance: Appearance;
  /** Zone courante (identifiant de `content/zones`). */
  readonly zoneId: string;
  /** Position en pixels dans la carte de la zone. */
  readonly position: { readonly x: number; readonly y: number };
  readonly facing: Facing;
}

/** Actions de la tranche `player`. */
export interface PlayerActions {
  /** Enregistre le prénom, les pronoms et, si fournie, l'apparence. */
  setPlayerIdentity(identity: { name: string; pronouns: Pronouns; appearance?: Appearance }): void;
  /** Déplace le joueur (changement de zone ou sauvegarde de position). */
  setPlayerLocation(location: { zoneId: string; x: number; y: number; facing?: Facing }): void;
}

/**
 * État initial du joueur : arrivée dans le bureau de la DSI.
 *
 * @returns Un nouvel état de la tranche `player`.
 */
export function initialPlayerState(): PlayerState {
  return {
    name: '',
    pronouns: 'iel',
    appearance: { hair: 0, hairColor: 0, skin: 0, outfit: 0 },
    zoneId: 'salle-serveurs',
    position: { x: 0, y: 0 },
    facing: 'down',
  };
}

/** Fabrique de la tranche `player`. */
export const createPlayerSlice: SliceCreator<{ player: PlayerState } & PlayerActions> = (set) => ({
  player: initialPlayerState(),
  setPlayerIdentity: ({ name, pronouns, appearance }) =>
    set((s) => {
      s.player.name = name;
      s.player.pronouns = pronouns;
      if (appearance) s.player.appearance = appearance;
    }),
  setPlayerLocation: ({ zoneId, x, y, facing }) =>
    set((s) => {
      s.player.zoneId = zoneId;
      s.player.position = { x, y };
      if (facing) s.player.facing = facing;
    }),
});
