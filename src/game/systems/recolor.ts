/**
 * Recoloration de sprites par palette (docs/07 : personnages recolorés à la volée).
 * Fonctions pures sur des tableaux de pixels RGBA.
 */

/** Correspondance couleur source → couleur cible (entiers 0xRRGGBB). */
export type ColorMap = ReadonlyMap<number, number>;

/** Couleurs du personnage de base (reference/sprites/personnage_technicien.png). */
export const BASE_COLORS = {
  outfit: 0x3d7be0,
  outfitShade: 0x2a58a8,
  hair: 0x3a2418,
  skin: 0xf0c39b,
  skinShade: 0xd39a72,
} as const;

/**
 * Lit une couleur `#rrggbb`.
 *
 * @param hex - Couleur CSS.
 * @returns L'entier 0xRRGGBB.
 */
export function parseHex(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/**
 * Assombrit une couleur (pour les ombres d'une teinte).
 *
 * @param color - Couleur 0xRRGGBB.
 * @param factor - Facteur de 0 (noir) à 1 (identique).
 * @returns La couleur assombrie.
 */
export function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

/**
 * Construit la table de recoloration d'un PNJ à partir de sa palette.
 *
 * @param palette - Couleurs de cheveux, peau et tenue (`#rrggbb`).
 * @returns La correspondance des couleurs du sprite de base.
 */
export function paletteColorMap(palette: { hair: string; skin: string; outfit: string }): ColorMap {
  const outfit = parseHex(palette.outfit);
  const skin = parseHex(palette.skin);
  return new Map([
    [BASE_COLORS.outfit, outfit],
    [BASE_COLORS.outfitShade, shade(outfit, 0.72)],
    [BASE_COLORS.hair, parseHex(palette.hair)],
    [BASE_COLORS.skin, skin],
    [BASE_COLORS.skinShade, shade(skin, 0.82)],
  ]);
}

/**
 * Remplace les couleurs d'un tableau de pixels RGBA (en place).
 *
 * @param pixels - Données RGBA (ImageData.data).
 * @param map - Correspondance des couleurs.
 */
export function recolorPixels(pixels: Uint8ClampedArray, map: ColorMap): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const color = ((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0);
    const target = map.get(color);
    if (target === undefined) continue;
    pixels[i] = (target >> 16) & 255;
    pixels[i + 1] = (target >> 8) & 255;
    pixels[i + 2] = target & 255;
  }
}
