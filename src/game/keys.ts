/**
 * Clés des assets chargés par Phaser (docs/10 : jamais de chaîne libre dans les scènes).
 */
export const ASSET_KEYS = {
  tilesetServerRoom: 'tile-salle-serveurs',
  character: 'npc-technicien',
  mapServerRoom: 'map-salle-serveurs',
  light: 'fx-light',
  dust: 'fx-dust',
  led: 'fx-led',
} as const;

/** Chemins des fichiers, relatifs à la racine du site (`public/`). */
export const ASSET_PATHS = {
  [ASSET_KEYS.tilesetServerRoom]: 'tilesets/tile-salle-serveurs.png',
  [ASSET_KEYS.character]: 'sprites/characters/npc-technicien.png',
  [ASSET_KEYS.mapServerRoom]: 'maps/salle-serveurs.tmj',
} as const;

/** Nom du jeu de tuiles dans les cartes Tiled. */
export const TILESET_NAME = 'salle-serveurs';

/** Dimensions d'une image de personnage (docs/07). */
export const CHARACTER_FRAME = { width: 16, height: 24 } as const;

/** Profondeur d'affichage des couches au-dessus des personnages. */
export const DEPTH = {
  floor: 0,
  walls: 1,
  furnitureLow: 2,
  lights: 9000,
  furnitureHigh: 9100,
  darkness: 9200,
  glow: 9300,
  ui: 9500,
} as const;
