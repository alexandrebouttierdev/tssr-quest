/**
 * Génère les portraits pixel art des PNJ et du joueur (public/sprites/portraits/<id>.png).
 *
 * Chaque fichier contient trois portraits de 48 × 48 côte à côte, dans l'ordre des
 * expressions du contenu : neutre, content, inquiet. Les couleurs et les traits
 * (coiffure, barbe, lunettes) viennent de content/npcs/*.npc.yaml ; le joueur garde la
 * palette du sprite de base.
 *
 * Utilisation : npx tsx assets/generators/portraits.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { Canvas, light, mix, shade } from './lib/pixels';

/** Taille d'un portrait (px). */
export const PORTRAIT_SIZE = 48;

/** Expressions, dans l'ordre des colonnes du fichier. */
export const MOODS = ['neutre', 'content', 'inquiet'] as const;

/** Expression d'un portrait. */
export type Mood = (typeof MOODS)[number];

/** Coiffures disponibles. */
export type HairStyle = 'court' | 'long' | 'boucle' | 'chignon' | 'rase';

/** Apparence d'un personnage. */
export interface Look {
  readonly hair: string;
  readonly skin: string;
  readonly outfit: string;
  readonly style: HairStyle;
  readonly beard: boolean;
  readonly glasses: boolean;
}

/** Couleur du contour (bleu nuit, plus doux que le noir). */
const OUTLINE = '#0d1118';
const EYE_WHITE = '#f4f1ea';
const PUPIL = '#1d2230';

/** Dessine la masse arrière des cheveux longs (derrière le buste). */
function hairBack(c: Canvas, look: Look): void {
  if (look.style !== 'long') return;
  c.ellipse(24, 24, 14, 17, look.hair, (_x, y) => y >= 12);
  c.rect(11, 24, 15, 40, look.hair);
  c.rect(33, 24, 37, 40, shade(look.hair, 0.2));
}

/** Buste : épaules, col, badge d'entreprise. */
function torso(c: Canvas, look: Look): void {
  const base = look.outfit;
  c.ellipse(24, 52, 19, 16, base, (_x, y) => y >= 35);
  // Volume : ombre côté droit, lumière sur l'épaule gauche.
  c.ellipse(24, 52, 19, 16, shade(base, 0.28), (x, y) => y >= 35 && x >= 31);
  c.ellipse(24, 52, 19, 16, light(base, 0.18), (x, y) => y >= 36 && y <= 38 && x <= 16);
  // Col en V de la chemise.
  const shirt = mix(base, '#e9eef3', 0.75);
  for (let y = 35; y <= 41; y++) {
    const half = Math.max(0, 41 - y) >> 1;
    c.hline(24 - half - 1, 24 + half, y, shirt);
  }
  // Cou.
  c.rect(20, 30, 27, 36, shade(look.skin, 0.22));
  c.hline(20, 27, 30, shade(look.skin, 0.35));
  // Badge d'entreprise et son cordon.
  c.vline(19, 38, 42, '#5fb6e0');
  c.vline(29, 38, 41, '#5fb6e0');
  c.rect(29, 41, 33, 46, '#e6edf3');
  c.hline(29, 33, 41, '#5fb6e0');
  c.rect(30, 43, 31, 44, '#9fb0c2');
}

/** Tête : visage, oreilles, joues. */
function head(c: Canvas, look: Look): void {
  const skin = look.skin;
  c.ellipse(13.5, 23, 2.2, 3.2, shade(skin, 0.12));
  c.ellipse(34.5, 23, 2.2, 3.2, shade(skin, 0.25));
  c.ellipse(24, 20.5, 10.5, 12, skin);
  c.ellipse(24, 26, 8.5, 7.5, skin);
  // Ombre douce du côté droit et sous la mâchoire.
  c.ellipse(24, 20.5, 10.5, 12, shade(skin, 0.16), (x, y) => x >= 30 && y >= 14);
  c.ellipse(24, 26, 8.5, 7.5, shade(skin, 0.16), (x) => x >= 30);
  c.hline(20, 28, 33, shade(skin, 0.2));
  // Pommettes.
  c.px(18, 27, mix(skin, '#e0524a', 0.22)).px(19, 27, mix(skin, '#e0524a', 0.15));
  c.px(29, 27, mix(skin, '#e0524a', 0.22)).px(30, 27, mix(skin, '#e0524a', 0.15));
}

/** Yeux, sourcils, nez et bouche selon l'expression. */
function face(c: Canvas, look: Look, mood: Mood): void {
  const brow = shade(look.hair, 0.15);
  const eye = (x: number) => {
    c.rect(x, 22, x + 2, 23, EYE_WHITE);
    c.rect(x + 1, 22, x + 2, 23, PUPIL);
    c.px(x + 1, 22, '#5d6b85');
  };
  if (mood === 'content') {
    // Yeux plissés par le sourire.
    for (const x of [18, 27]) {
      c.hline(x, x + 2, 22, PUPIL);
      c.px(x, 23, shade(look.skin, 0.3)).px(x + 2, 23, shade(look.skin, 0.3));
    }
  } else {
    eye(18);
    eye(27);
  }
  if (mood === 'inquiet') {
    c.px(17, 20, brow).px(18, 19, brow).px(19, 19, brow).px(20, 18, brow);
    c.px(27, 18, brow).px(28, 19, brow).px(29, 19, brow).px(30, 20, brow);
  } else {
    c.hline(17, 20, 19, brow);
    c.hline(27, 30, 19, brow);
  }
  // Nez.
  c.px(24, 24, shade(look.skin, 0.18)).px(24, 25, shade(look.skin, 0.28));
  c.px(25, 26, shade(look.skin, 0.32)).px(23, 26, shade(look.skin, 0.2));
  // Bouche.
  const lip = mix(shade(look.skin, 0.45), '#a8403a', 0.3);
  if (mood === 'content') {
    c.px(20, 28, lip).px(28, 28, lip).hline(21, 27, 29, lip);
    c.hline(22, 26, 30, mix(lip, '#f4f1ea', 0.6));
  } else if (mood === 'inquiet') {
    c.hline(22, 26, 30, lip).px(21, 31, lip).px(27, 31, lip);
  } else {
    c.hline(21, 27, 29, lip);
  }
}

/** Barbe et moustache, sans couvrir la bouche. */
function beard(c: Canvas, look: Look): void {
  if (!look.beard) return;
  const color = look.hair;
  c.ellipse(24, 27, 9.5, 7.5, color, (x, y) => y >= 26 || x <= 15 || x >= 33);
  c.ellipse(24, 27, 9.5, 7.5, shade(color, 0.25), (x, y) => y >= 26 && x >= 30);
  c.hline(20, 28, 27, color);
  // La bouche reste visible au milieu de la barbe.
  c.hline(21, 27, 29, mix(shade(look.skin, 0.45), '#a8403a', 0.3));
  c.hline(22, 26, 30, shade(color, 0.1));
}

/** Cheveux devant le visage, selon la coiffure. */
function hairFront(c: Canvas, look: Look): void {
  const h = look.hair;
  const hl = light(h, 0.25);
  const dk = shade(h, 0.25);
  switch (look.style) {
    case 'rase':
      c.ellipse(24, 15, 11, 8.5, mix(h, look.skin, 0.45), (_x, y) => y <= 15);
      return;
    case 'boucle': {
      for (const [x, y, r] of [
        [15, 13, 4],
        [20, 9, 4.5],
        [27, 9, 4.5],
        [33, 13, 4],
        [24, 7, 4],
        [13, 18, 3],
        [35, 18, 3],
        [18, 14, 3.5],
        [30, 14, 3.5],
      ] as const) {
        c.ellipse(x, y, r, r, h);
        c.px(x - 1, y - 1, hl);
      }
      c.ellipse(24, 12, 10, 6, h, (_x, y) => y <= 15);
      return;
    }
    case 'court':
    case 'long':
    case 'chignon': {
      c.ellipse(24, 15, 11.5, 9.5, h, (_x, y) => y <= 16);
      c.ellipse(24, 15, 11.5, 9.5, dk, (x, y) => y <= 16 && x >= 31);
      // Frange irrégulière et pattes.
      for (const x of [15, 16, 17, 20, 21, 25, 26, 27, 31, 32]) c.px(x, 17, h);
      for (const x of [16, 21, 26, 31]) c.px(x, 18, h);
      c.rect(13, 15, 14, 21, h);
      c.rect(34, 15, 35, 21, dk);
      // Reflet.
      c.hline(18, 23, 9, hl);
      c.hline(17, 20, 10, hl);
      if (look.style === 'chignon') {
        c.ellipse(24, 6, 4.5, 4, h);
        c.px(22, 4, hl).px(23, 4, hl);
      }
      if (look.style === 'long') {
        c.rect(12, 16, 14, 30, h);
        c.rect(34, 16, 36, 30, dk);
      }
    }
  }
}

/** Lunettes fines aux verres légèrement teintés. */
function glasses(c: Canvas, look: Look): void {
  if (!look.glasses) return;
  const frame = '#2a2f3a';
  for (const x0 of [16, 26]) {
    c.hline(x0, x0 + 5, 20, frame).hline(x0, x0 + 5, 24, frame);
    c.vline(x0, 20, 24, frame).vline(x0 + 5, 20, 24, frame);
    c.rect(x0 + 1, 21, x0 + 4, 23, '#a8e4f540');
  }
  c.hline(22, 25, 21, frame);
}

/**
 * Dessine un portrait.
 *
 * @param look - Apparence.
 * @param mood - Expression.
 * @returns Une toile de 48 × 48.
 */
export function drawPortrait(look: Look, mood: Mood): Canvas {
  const c = new Canvas(PORTRAIT_SIZE, PORTRAIT_SIZE);
  hairBack(c, look);
  torso(c, look);
  head(c, look);
  face(c, look, mood);
  beard(c, look);
  hairFront(c, look);
  glasses(c, look);
  return c.outline(OUTLINE);
}

/**
 * Feuille des trois expressions d'un personnage (144 × 48).
 *
 * @param look - Apparence.
 * @returns La toile.
 */
export function drawPortraitSheet(look: Look): Canvas {
  const sheet = new Canvas(PORTRAIT_SIZE * MOODS.length, PORTRAIT_SIZE);
  MOODS.forEach((mood, i) => sheet.paste(drawPortrait(look, mood), i * PORTRAIT_SIZE, 0));
  return sheet;
}

/** Apparence du joueur : la palette du sprite de base (docs/07). */
export const PLAYER_LOOK: Look = {
  hair: '#3a2418',
  skin: '#f0c39b',
  outfit: '#3d7be0',
  style: 'court',
  beard: false,
  glasses: false,
};

/** Fiche PNJ lue dans le contenu (champs utiles au portrait). */
interface NpcFile {
  readonly id: string;
  readonly palette?: { hair: string; skin: string; outfit: string };
  readonly portrait?: { hair?: HairStyle; beard?: boolean; glasses?: boolean };
}

/** Génère tous les portraits dans `outDir`. */
function main(): void {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const npcDir = join(root, 'content/npcs');
  const outDir = join(root, 'public/sprites/portraits');
  drawPortraitSheet(PLAYER_LOOK).save(join(outDir, 'joueur.png'));
  for (const file of readdirSync(npcDir).filter((f) => f.endsWith('.npc.yaml'))) {
    const npc = parse(readFileSync(join(npcDir, file), 'utf8')) as NpcFile;
    const look: Look = {
      hair: npc.palette?.hair ?? PLAYER_LOOK.hair,
      skin: npc.palette?.skin ?? PLAYER_LOOK.skin,
      outfit: npc.palette?.outfit ?? PLAYER_LOOK.outfit,
      style: npc.portrait?.hair ?? 'court',
      beard: npc.portrait?.beard ?? false,
      glasses: npc.portrait?.glasses ?? false,
    };
    drawPortraitSheet(look).save(join(outDir, `${npc.id}.png`));
    console.log(`Portrait : ${npc.id}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
