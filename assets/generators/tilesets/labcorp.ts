/**
 * Génère le jeu de tuiles « LabCorp technique » (public/tilesets/tile-salle-serveurs.png)
 * et décrit chaque tuile (nom, collision, animation) pour le générateur de carte.
 *
 * Perspective 3/4 de dessus, lumière venant du haut à gauche : chaque objet montre sa
 * façade, un dessus plus clair et une ombre à droite. Les baies existent vues de face
 * et de dos (allées froides et chaudes), avec plusieurs équipements pour casser la
 * répétition. Les LED, écrans et ventilateurs sont animés (2 à 4 images).
 *
 * Utilisation : npx tsx assets/generators/tilesets/labcorp.ts
 */
import { fileURLToPath } from 'node:url';
import { Canvas, light, mix, seeded, shade } from '../lib/pixels';

/** Taille d'une tuile. */
export const TILE = 16;
/** Colonnes de la feuille. */
export const COLUMNS = 16;

/** Description d'une tuile du catalogue. */
export interface TileSpec {
  readonly name: string;
  /** Nombre d'images d'animation (1 : fixe). */
  readonly frames?: number;
  /** Durée d'une image (ms). */
  readonly duration?: number;
  readonly collides?: boolean;
  /** Dessine l'image `frame` de la tuile. */
  readonly draw: (c: Canvas, frame: number) => void;
}

// --- Palette ---------------------------------------------------------------------------
const P = {
  ink: '#0b0f15',
  floor: '#3a4655',
  floorHi: '#4a596b',
  floorLo: '#2c3541',
  cold: '#2c4760',
  coldHole: '#182a3b',
  coldHi: '#3f6587',
  hot: '#3b3a42',
  hotLo: '#302e35',
  carpet: '#3a5262',
  carpetDot: '#456173',
  wood: '#8a5f3c',
  woodHi: '#a2734b',
  woodLo: '#6a4529',
  wallTop: '#151c26',
  wallTopHi: '#202b39',
  wall: '#3e4d5e',
  wallHi: '#506274',
  wallLo: '#2f3b49',
  base: '#1f2833',
  rack: '#1a2129',
  rackFrame: '#0e1318',
  unit: '#2b3540',
  unitHi: '#3c4958',
  unitLo: '#1f272f',
  green: '#40f58e',
  greenOff: '#1a4d31',
  amber: '#ffb13d',
  amberOff: '#5a4520',
  blue: '#4db8ff',
  blueOff: '#1c3e5c',
  red: '#ff5a4f',
  white: '#e9eef3',
  metal: '#9aa6b2',
  metalHi: '#c4ced8',
  metalLo: '#6c7783',
  yellow: '#e8c547',
  screen: '#0b1a26',
  desk: '#a87a4f',
  deskHi: '#c49466',
  deskLo: '#7a5436',
  leaf: '#3a9a59',
  leafHi: '#5cc47a',
  leafLo: '#246b3d',
  pot: '#b4693f',
  potHi: '#d0834f',
} as const;

const CABLES = ['#e8c547', '#3d8bfd', '#e5534b', '#3fb950', '#f0883e', '#d0d7de'];

// --- Aides de dessin ---------------------------------------------------------------------

/** Dalle de faux plancher technique (bords biseautés, vis aux coins). */
function floorPanel(c: Canvas, base: string, hi: string, lo: string): void {
  c.rect(0, 0, 15, 15, base);
  c.hline(0, 15, 0, hi).vline(0, 0, 15, hi);
  c.hline(0, 15, 15, lo).vline(15, 0, 15, lo);
  for (const [x, y] of [
    [2, 2],
    [13, 2],
    [2, 13],
    [13, 13],
  ] as const)
    c.px(x, y, lo).px(x, y - 1, mix(hi, base, 0.5));
}

/** Mur vu de face : liseré haut, panneaux, plinthe sombre. */
function wallFace(c: Canvas, seam = false): void {
  c.rect(0, 0, 15, 15, P.wall);
  c.hline(0, 15, 0, P.wallHi).hline(0, 15, 1, mix(P.wall, P.wallHi, 0.5));
  c.rect(0, 12, 15, 13, P.wallLo);
  c.rect(0, 14, 15, 15, P.base);
  if (seam) c.vline(15, 2, 11, P.wallLo).vline(0, 2, 11, mix(P.wall, P.wallHi, 0.4));
}

/** Boîte vue de face avec dessus éclairé et côté droit dans l'ombre. */
function box(
  c: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  top = 2,
): void {
  c.rect(x0, y0, x1, y1, color);
  c.rect(x0, y0, x1, y0 + top - 1, light(color, 0.22));
  c.vline(x1, y0 + top, y1, shade(color, 0.25));
  c.hline(x0, x1, y1, shade(color, 0.35));
}

/** LED (allumée ou éteinte). */
function led(c: Canvas, x: number, y: number, on: boolean, color: string = P.green): void {
  const off =
    color === P.green
      ? P.greenOff
      : color === P.amber
        ? P.amberOff
        : color === P.blue
          ? P.blueOff
          : shade(color, 0.6);
  c.px(x, y, on ? color : off);
}

/** Cadre de baie (montants et fond). */
function rackFrame(c: Canvas, part: 'top' | 'bottom'): void {
  c.rect(0, 0, 15, 15, P.rack);
  c.vline(0, 0, 15, P.rackFrame).vline(1, 0, 15, '#232b35');
  c.vline(14, 0, 15, '#11171e').vline(15, 0, 15, P.ink);
  if (part === 'top') {
    // Toit de la baie, vu légèrement de dessus.
    c.rect(0, 0, 15, 2, '#2a3440');
    c.hline(0, 15, 0, '#3c4958');
    c.hline(1, 14, 3, P.ink);
  } else {
    c.rect(1, 13, 14, 15, P.rackFrame);
    c.hline(1, 14, 13, '#232b35');
    c.px(2, 15, P.ink).px(13, 15, P.ink);
  }
}

/** Unité serveur 1U ou 2U. */
function unit(c: Canvas, y: number, h: number, color: string = P.unit): void {
  c.rect(2, y, 13, y + h - 1, color);
  c.hline(2, 13, y, light(color, 0.18));
  c.hline(2, 13, y + h - 1, shade(color, 0.3));
}

// --- Baies ----------------------------------------------------------------------------

/** Baie de serveurs vue de face. */
function rackServer(part: 'top' | 'bottom', seed: number) {
  return (c: Canvas, frame: number) => {
    rackFrame(c, part);
    const rand = seeded(seed + frame * 97);
    const rows = part === 'top' ? [4, 7, 10, 13] : [0, 3, 6, 9];
    for (const y of rows) {
      unit(c, y, 3);
      for (let x = 4; x <= 9; x += 2) c.px(x, y + 1, P.unitLo);
      led(c, 11, y + 1, rand() > 0.25);
      led(c, 12, y + 1, rand() > 0.55, P.blue);
    }
  };
}

/** Baie de stockage : rangées de disques avec une LED chacun. */
function rackStorage(part: 'top' | 'bottom', seed: number) {
  return (c: Canvas, frame: number) => {
    rackFrame(c, part);
    const rand = seeded(seed + frame * 131);
    const rows = part === 'top' ? [4, 9] : [0, 5];
    for (const y of rows) {
      unit(c, y, 5, '#2f3a46');
      for (let x = 3; x <= 12; x += 2) {
        c.vline(x, y + 1, y + 3, '#465566');
        led(c, x, y + 1, rand() > 0.2, rand() > 0.9 ? P.amber : P.green);
      }
    }
    if (part === 'bottom') {
      unit(c, 10, 2, '#24303c');
      led(c, 12, 10, true, P.blue);
    }
  };
}

/** Baie réseau : panneaux de brassage, câbles de couleur, commutateurs. */
function rackNetwork(part: 'top' | 'bottom', seed: number) {
  return (c: Canvas, frame: number) => {
    rackFrame(c, part);
    const rand = seeded(seed + frame * 59);
    const rows = part === 'top' ? [4, 9] : [0, 6];
    for (const y of rows) {
      // Panneau de brassage : une rangée de ports.
      unit(c, y, 2, '#2a333d');
      for (let x = 3; x <= 12; x++) c.px(x, y + 1, x % 2 ? P.ink : '#3b4652');
      // Câbles qui pendent en arc.
      for (let x = 3; x <= 12; x += 2) {
        const color = CABLES[(x + y + seed) % CABLES.length] ?? P.yellow;
        c.px(x, y + 2, color).px(x, y + 3, shade(color, 0.15));
      }
      // Commutateur : beaucoup de LED qui clignotent vite.
      unit(c, y + 4, 2, '#1e2a36');
      for (let x = 3; x <= 12; x++)
        if (x % 2 === 1) led(c, x, y + 4, rand() > 0.45, rand() > 0.8 ? P.amber : P.green);
    }
  };
}

/** Châssis de lames : modules verticaux. */
function rackBlade(part: 'top' | 'bottom', seed: number) {
  return (c: Canvas, frame: number) => {
    rackFrame(c, part);
    const rand = seeded(seed + frame * 211);
    const y0 = part === 'top' ? 4 : 0;
    const y1 = part === 'top' ? 15 : 11;
    c.rect(2, y0, 13, y1, '#222b35');
    for (let x = 2; x <= 13; x += 2) {
      c.vline(x, y0 + 1, y1 - 1, '#35414f');
      c.px(x, y0 + 1, light('#35414f', 0.25));
      led(c, x, y0 + 2, rand() > 0.3, P.blue);
      if (part === 'top') led(c, x, y0 + 4, rand() > 0.6);
    }
  };
}

/** Baie vue de dos : ventilateurs, alimentations, faisceaux de câbles. */
function rackBack(part: 'top' | 'bottom', seed: number) {
  return (c: Canvas, frame: number) => {
    rackFrame(c, part);
    const rows = part === 'top' ? [4, 9] : [0, 5];
    for (const [i, y] of rows.entries()) {
      unit(c, y, 4, '#262f39');
      // Ventilateur dont les pales tournent (4 images).
      const cx = i % 2 === 0 ? 5 : 10;
      c.rect(cx - 2, y, cx + 1, y + 3, '#11161c');
      const spin = (frame + i) % 4;
      const blades =
        [
          [
            [-1, 0],
            [0, 1],
          ],
          [
            [0, 0],
            [-1, 1],
          ],
          [
            [-1, 1],
            [0, 0],
          ],
          [
            [0, 1],
            [-1, 0],
          ],
        ][spin] ?? [];
      for (const [dx, dy] of blades) c.px(cx + (dx ?? 0), y + 1 + (dy ?? 0), '#566576');
      // Bloc d'alimentation et sa LED.
      const px0 = i % 2 === 0 ? 9 : 3;
      c.rect(px0, y + 1, px0 + 3, y + 2, '#3a4552');
      led(c, px0 + 3, y + 1, true, (seed + i) % 3 === 0 ? P.amber : P.green);
    }
    // Faisceau de câbles le long du montant droit.
    for (let y = part === 'top' ? 4 : 0; y <= (part === 'top' ? 15 : 12); y++) {
      c.px(12, y, CABLES[(y + seed) % 3] ?? P.yellow).px(
        13,
        y,
        CABLES[((y + seed + 1) % 2) + 1] ?? P.blue,
      );
    }
  };
}

/** Baie presque vide : obturateurs et un serveur seul. */
function rackEmpty(part: 'top' | 'bottom') {
  return (c: Canvas) => {
    rackFrame(c, part);
    const y0 = part === 'top' ? 4 : 0;
    for (let y = y0; y <= (part === 'top' ? 15 : 11); y += 3) {
      c.hline(2, 13, y, '#232b34');
      c.px(3, y + 1, '#2d3742').px(12, y + 1, '#2d3742');
    }
    if (part === 'top') {
      unit(c, 9, 3);
      led(c, 11, 10, true);
    }
  };
}

// --- Équipements ----------------------------------------------------------------------

/** Onduleur : écran LCD, LED d'état, ouïes. */
function ups(part: 'top' | 'bottom') {
  return (c: Canvas, frame: number) => {
    box(c, 1, part === 'top' ? 1 : 0, 14, 15, '#2b3038', part === 'top' ? 3 : 0);
    if (part === 'top') {
      c.rect(3, 6, 12, 10, '#0e3b25');
      c.hline(4, 4 + ((frame * 3) % 7) + 2, 8, '#79e0a0');
      c.hline(4, 9, 7, '#3f9e66');
      led(c, 4, 12, true);
      led(c, 6, 12, frame % 2 === 0, P.amber);
      c.hline(9, 12, 12, '#454c56');
    } else {
      for (let y = 2; y <= 11; y += 2) c.hline(3, 12, y, '#1d2127');
      c.rect(1, 13, 14, 15, '#1d2127');
      c.hline(3, 12, 13, P.yellow);
    }
  };
}

/** Climatisation de précision : grilles, ventilateur, panneau de commande. */
function crac(part: 'top' | 'bottom') {
  return (c: Canvas, frame: number) => {
    box(c, 0, part === 'top' ? 1 : 0, 15, 15, '#c3cbd3', part === 'top' ? 3 : 0);
    if (part === 'top') {
      c.rect(2, 5, 9, 12, '#8d98a4');
      for (let y = 6; y <= 11; y += 2) c.hline(2, 9, y, '#6c7783');
      // Hélice qui tourne derrière la grille.
      const blade = frame % 2 === 0 ? [5, 8] : [6, 9];
      c.px(blade[0] ?? 5, 7, '#4b5560').px(blade[1] ?? 8, 10, '#4b5560');
      c.rect(11, 5, 13, 8, '#1a2a36');
      c.px(12, 6, '#5fb6e0').px(12, 7, frame % 2 ? '#5fb6e0' : '#2f6f8f');
    } else {
      for (let y = 1; y <= 11; y += 2) c.hline(2, 13, y, '#9aa5b1');
      c.rect(0, 13, 15, 15, '#7d8894');
    }
  };
}

// --- Murs -----------------------------------------------------------------------------

/** Écrans de supervision muraux (gauche, centre, droite), animés. */
function nocScreen(position: 0 | 1 | 2) {
  return (c: Canvas, frame: number) => {
    wallFace(c);
    const x0 = position === 0 ? 1 : 0;
    const x1 = position === 2 ? 14 : 15;
    c.rect(x0, 2, x1, 11, P.ink);
    c.rect(x0 + (position === 0 ? 1 : 0), 3, x1 - (position === 2 ? 1 : 0), 10, P.screen);
    if (position === 0) {
      // Courbe de trafic qui défile.
      for (let x = 2; x <= 15; x++) {
        const y = 7 + Math.round(Math.sin((x + frame * 2) * 0.9) * 2);
        c.px(x, y, '#3ddc84');
        c.px(x, 10, '#123826');
      }
    } else if (position === 1) {
      // Carte des sites : points d'état, une alerte qui clignote.
      c.hline(1, 14, 4, '#1c3346');
      for (const [x, y] of [
        [3, 6],
        [6, 8],
        [9, 5],
        [12, 7],
      ] as const)
        c.px(x, y, '#3ddc84');
      c.px(4, 9, frame % 2 ? '#ff5a4f' : '#5a1f1b').px(7, 6, '#4db8ff');
      c.hline(3, 9, 7, '#1d4a66');
    } else {
      // Histogrammes de charge.
      for (let i = 0; i < 5; i++) {
        const h = 2 + ((i * 3 + frame * 2) % 5);
        c.rect(1 + i * 2, 10 - h, 1 + i * 2, 9, i === 3 ? '#f2b54a' : '#4db8ff');
      }
    }
    c.hline(x0, x1, 2, '#2a3644');
  };
}

const TILES: TileSpec[] = [
  // --- Sols ----------------------------------------------------------------------------
  { name: 'floor_a', draw: (c) => floorPanel(c, P.floor, P.floorHi, P.floorLo) },
  {
    name: 'floor_b',
    draw: (c) => {
      floorPanel(c, P.floor, P.floorHi, P.floorLo);
      c.px(6, 9, '#3a4654').px(7, 9, '#3a4654').px(8, 10, '#3a4654').px(9, 6, '#2f3944');
    },
  },
  {
    name: 'floor_c',
    draw: (c) => {
      floorPanel(c, P.floor, P.floorHi, P.floorLo);
      // Passe-câble discret.
      c.rect(6, 7, 9, 8, '#1d242c').hline(6, 9, 9, '#4a5868');
    },
  },
  {
    name: 'floor_d',
    draw: (c) => {
      floorPanel(c, mix(P.floor, P.floorHi, 0.15), P.floorHi, P.floorLo);
    },
  },
  {
    name: 'cold_a',
    draw: (c) => {
      floorPanel(c, P.cold, P.coldHi, '#203448');
      for (let y = 3; y <= 12; y += 3) for (let x = 3; x <= 12; x += 3) c.px(x, y, P.coldHole);
    },
  },
  {
    name: 'cold_b',
    draw: (c) => {
      floorPanel(c, P.cold, P.coldHi, '#203448');
      for (let y = 2; y <= 13; y += 2)
        for (let x = y % 4 === 0 ? 3 : 4; x <= 12; x += 2) c.px(x, y, P.coldHole);
    },
  },
  { name: 'hot', draw: (c) => floorPanel(c, P.hot, '#4a4244', P.hotLo) },
  {
    name: 'tape_h',
    draw: (c) => {
      floorPanel(c, P.floor, P.floorHi, P.floorLo);
      for (let x = 0; x < 16; x++) c.rect(x, 6, x, 9, (x >> 1) % 2 === 0 ? P.yellow : P.ink);
    },
  },
  {
    name: 'tape_v',
    draw: (c) => {
      floorPanel(c, P.floor, P.floorHi, P.floorLo);
      for (let y = 0; y < 16; y++) c.rect(6, y, 9, y, (y >> 1) % 2 === 0 ? P.yellow : P.ink);
    },
  },
  {
    name: 'carpet_a',
    draw: (c) => {
      c.rect(0, 0, 15, 15, P.carpet);
      for (let y = 1; y < 16; y += 4)
        for (let x = (y >> 2) % 2 ? 1 : 3; x < 16; x += 4) c.px(x, y, P.carpetDot);
    },
  },
  {
    name: 'carpet_b',
    draw: (c) => {
      c.rect(0, 0, 15, 15, P.carpet);
      for (let y = 1; y < 16; y += 4)
        for (let x = (y >> 2) % 2 ? 3 : 1; x < 16; x += 4) c.px(x, y, P.carpetDot);
      c.px(9, 10, '#26323f').px(10, 10, '#26323f');
    },
  },
  {
    name: 'wood_a',
    draw: (c) => {
      c.rect(0, 0, 15, 15, P.wood);
      for (const y of [3, 7, 11, 15]) c.hline(0, 15, y, P.woodLo);
      for (const [x, y] of [
        [5, 0],
        [12, 4],
        [3, 8],
        [10, 12],
      ] as const)
        c.vline(x, y, y + 2, P.woodLo);
      c.hline(0, 15, 0, P.woodHi)
        .hline(0, 15, 4, P.woodHi)
        .hline(0, 15, 8, P.woodHi)
        .hline(0, 15, 12, P.woodHi);
    },
  },
  {
    name: 'wood_b',
    draw: (c) => {
      c.rect(0, 0, 15, 15, mix(P.wood, P.woodHi, 0.2));
      for (const y of [3, 7, 11, 15]) c.hline(0, 15, y, P.woodLo);
      for (const [x, y] of [
        [9, 0],
        [2, 4],
        [13, 8],
        [6, 12],
      ] as const)
        c.vline(x, y, y + 2, P.woodLo);
      c.px(4, 9, P.woodLo).px(11, 2, P.woodHi);
    },
  },
  {
    name: 'doormat',
    draw: (c) => {
      floorPanel(c, P.floor, P.floorHi, P.floorLo);
      c.rect(1, 2, 14, 13, '#26303a');
      for (let y = 4; y <= 11; y += 2) c.hline(3, 12, y, '#323d49');
    },
  },
  {
    name: 'ramp_h',
    draw: (c) => {
      floorPanel(c, P.floor, P.floorHi, P.floorLo);
      c.rect(0, 5, 15, 10, '#3a3a2e');
      for (let x = 0; x < 16; x += 4) c.rect(x, 5, x + 1, 10, P.yellow);
      c.hline(0, 15, 5, '#c9a93a').hline(0, 15, 10, P.ink);
    },
  },
  {
    name: 'rug',
    draw: (c) => {
      c.rect(0, 0, 15, 15, '#7a3f3a');
      c.rect(1, 1, 14, 14, '#8f4c45');
      c.rect(3, 3, 12, 12, '#7a3f3a');
      c.rect(6, 6, 9, 9, '#c98f5a');
    },
  },
  // --- Détails au sol (calque « details ») ---------------------------------------------
  {
    name: 'cables_h',
    draw: (c) => {
      for (const [i, color] of ['#e8c547', '#3d8bfd', '#d0d7de'].entries()) {
        for (let x = 0; x < 16; x++) {
          const y = 6 + i * 2 + (Math.sin((x + i * 3) * 0.6) > 0.3 ? 1 : 0);
          c.px(x, y, color).px(x, y + 1, shade(color, 0.45));
        }
      }
    },
  },
  {
    name: 'cables_v',
    draw: (c) => {
      for (const [i, color] of ['#e8c547', '#3d8bfd', '#d0d7de'].entries()) {
        for (let y = 0; y < 16; y++) {
          const x = 6 + i * 2 + (Math.sin((y + i * 3) * 0.6) > 0.3 ? 1 : 0);
          c.px(x, y, color).px(x + 1, y, shade(color, 0.45));
        }
      }
    },
  },
  {
    name: 'crumbs',
    draw: (c) => {
      c.px(4, 11, '#c9a46a').px(9, 4, '#5a3d26').px(12, 12, '#c9a46a');
    },
  },
  // --- Murs ----------------------------------------------------------------------------
  {
    name: 'wall_top',
    collides: true,
    draw: (c) => {
      c.rect(0, 0, 15, 15, P.wallTop);
      c.px(4, 5, P.wallTopHi).px(11, 10, P.wallTopHi).px(7, 13, '#10161e');
    },
  },
  {
    name: 'partition',
    collides: true,
    draw: (c) => {
      // Cloison vitrée vue de dessus : montant, vitre et reflet.
      c.rect(5, 0, 10, 15, '#1e2a37');
      c.rect(6, 0, 9, 15, '#7fb3d466');
      c.vline(7, 0, 15, '#cfe8f566');
      c.vline(5, 0, 15, '#2c3a4a').vline(10, 0, 15, '#121a23');
    },
  },
  { name: 'wall', collides: true, draw: (c) => wallFace(c) },
  { name: 'wall_seam', collides: true, draw: (c) => wallFace(c, true) },
  {
    name: 'wall_vent',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(4, 3, 11, 8, '#2a3542');
      for (let y = 4; y <= 7; y++) c.hline(5, 10, y, y % 2 ? '#1b2430' : '#3a4757');
    },
  },
  {
    name: 'wall_extinguisher',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(6, 4, 9, 12, '#c8352d').vline(6, 4, 12, '#e9665e').vline(9, 5, 12, '#8f2520');
      c.rect(7, 2, 8, 3, P.ink).px(9, 2, P.ink).px(10, 3, P.ink);
      c.rect(6, 7, 9, 8, P.white);
    },
  },
  {
    name: 'wall_breaker',
    collides: true,
    draw: (c) => {
      wallFace(c);
      box(c, 3, 2, 12, 11, '#8f9aa6', 1);
      c.rect(5, 4, 10, 8, '#6c7783');
      for (let x = 5; x <= 10; x += 2) c.vline(x, 5, 7, '#2a3038');
      // Pictogramme de danger électrique.
      c.px(7, 9, P.yellow).px(8, 9, P.yellow).px(6, 10, P.yellow).px(9, 10, P.yellow);
    },
  },
  {
    name: 'wall_clock',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.ellipse(8, 6.5, 4.5, 4.5, P.ink);
      c.ellipse(8, 6.5, 3.6, 3.6, P.white);
      c.vline(8, 4, 7, P.ink).hline(8, 10, 7, P.ink);
      c.px(8, 3, '#e5534b');
    },
  },
  {
    name: 'wall_poster',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(3, 2, 12, 11, '#e6e1d4');
      c.rect(3, 2, 12, 3, '#3d8bfd');
      // Schéma de réseau : nœuds et liens.
      c.px(5, 6, '#2f6fb0').px(10, 6, '#2f6fb0').px(7, 9, '#2fbf71').px(9, 9, '#e5534b');
      c.hline(5, 10, 6, '#9aa6b2');
      c.px(6, 7, '#9aa6b2').px(8, 8, '#9aa6b2');
    },
  },
  {
    name: 'wall_sign_hv',
    collides: true,
    draw: (c) => {
      wallFace(c);
      for (let i = 0; i <= 5; i++) c.hline(8 - i, 7 + i, 3 + i, P.yellow);
      c.hline(2, 13, 9, P.ink);
      c.px(7, 5, P.ink).px(8, 6, P.ink).px(7, 7, P.ink);
    },
  },
  {
    name: 'wall_window',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(1, 2, 14, 11, '#1a2533');
      c.rect(2, 3, 13, 10, '#1c3354');
      c.rect(2, 3, 13, 5, '#24406a');
      c.px(4, 4, '#cfe0ff').px(10, 6, '#8fb4e8').px(12, 4, '#8fb4e8');
      c.vline(8, 3, 10, '#1a2533');
      // Reflet de la vitre.
      c.px(3, 9, '#cfe8f540').px(4, 8, '#cfe8f540').px(5, 7, '#cfe8f540');
      c.hline(1, 14, 11, '#5a6b7d');
    },
  },
  {
    name: 'wall_window_moon',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(1, 2, 14, 11, '#1a2533');
      c.rect(2, 3, 13, 10, '#1c3354');
      c.rect(2, 3, 13, 5, '#24406a');
      c.ellipse(11, 5, 1.6, 1.6, '#f4efd8');
      c.px(5, 4, '#cfe0ff');
      c.vline(8, 3, 10, '#1a2533');
      c.hline(1, 14, 11, '#5a6b7d');
    },
  },
  {
    name: 'wall_door',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(2, 3, 13, 15, '#2b3440');
      c.rect(3, 4, 12, 15, '#56687c');
      c.hline(3, 12, 4, '#6f849a');
      c.rect(6, 6, 9, 9, '#a8d4ee');
      c.px(11, 10, P.metalHi);
      // Panneau « sortie » au-dessus de la porte.
      c.rect(5, 0, 10, 2, '#1f8a4c').hline(6, 9, 1, '#a8f0c4');
    },
  },
  {
    name: 'wall_ac',
    collides: true,
    draw: (c) => {
      wallFace(c);
      box(c, 1, 3, 14, 8, '#e3e8ed', 1);
      c.hline(2, 13, 7, '#9aa6b2');
      c.px(12, 5, '#3ddc84');
    },
  },
  {
    name: 'wall_board_l',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(1, 2, 15, 11, '#c9ced4');
      c.rect(2, 3, 15, 10, '#f4f6f8');
      c.hline(3, 9, 5, '#3d8bfd').hline(3, 7, 7, '#9aa6b2').hline(3, 11, 9, '#9aa6b2');
      c.rect(10, 4, 12, 6, '#e5534b');
    },
  },
  {
    name: 'wall_board_r',
    collides: true,
    draw: (c) => {
      wallFace(c);
      c.rect(0, 2, 14, 11, '#c9ced4');
      c.rect(0, 3, 13, 10, '#f4f6f8');
      c.rect(2, 4, 4, 6, '#2fbf71').rect(8, 4, 10, 6, '#3d8bfd');
      c.hline(4, 8, 5, P.ink);
      c.hline(1, 10, 8, '#9aa6b2');
      c.hline(3, 12, 11, '#8f9aa6');
    },
  },
  { name: 'noc_l', collides: true, frames: 3, duration: 600, draw: nocScreen(0) },
  { name: 'noc_m', collides: true, frames: 2, duration: 700, draw: nocScreen(1) },
  { name: 'noc_r', collides: true, frames: 3, duration: 900, draw: nocScreen(2) },
  // --- Baies ---------------------------------------------------------------------------
  { name: 'rack_srv_top', collides: true, frames: 2, duration: 800, draw: rackServer('top', 1) },
  { name: 'rack_srv_bot', collides: true, frames: 2, duration: 800, draw: rackServer('bottom', 2) },
  { name: 'rack_sto_top', collides: true, frames: 2, duration: 450, draw: rackStorage('top', 3) },
  {
    name: 'rack_sto_bot',
    collides: true,
    frames: 2,
    duration: 450,
    draw: rackStorage('bottom', 4),
  },
  { name: 'rack_net_top', collides: true, frames: 3, duration: 160, draw: rackNetwork('top', 5) },
  {
    name: 'rack_net_bot',
    collides: true,
    frames: 3,
    duration: 160,
    draw: rackNetwork('bottom', 6),
  },
  { name: 'rack_bla_top', collides: true, frames: 2, duration: 650, draw: rackBlade('top', 7) },
  { name: 'rack_bla_bot', collides: true, frames: 2, duration: 650, draw: rackBlade('bottom', 8) },
  { name: 'rack_back_top', collides: true, frames: 4, duration: 90, draw: rackBack('top', 9) },
  { name: 'rack_back_bot', collides: true, frames: 4, duration: 90, draw: rackBack('bottom', 10) },
  { name: 'rack_empty_top', collides: true, draw: rackEmpty('top') },
  { name: 'rack_empty_bot', collides: true, draw: rackEmpty('bottom') },
  // --- Équipements ----------------------------------------------------------------------
  { name: 'ups_top', collides: true, frames: 4, duration: 500, draw: ups('top') },
  { name: 'ups_bot', collides: true, draw: ups('bottom') },
  { name: 'crac_top', collides: true, frames: 2, duration: 120, draw: crac('top') },
  { name: 'crac_bot', collides: true, draw: crac('bottom') },
  {
    name: 'tray_h',
    draw: (c) => {
      // Chemin de câbles aérien (au-dessus du joueur).
      c.rect(0, 9, 15, 13, '#00000033');
      c.hline(0, 15, 7, '#d4b13c').hline(0, 15, 11, '#9c8429');
      for (let x = 1; x < 16; x += 4) c.vline(x, 7, 11, '#b89a33');
      for (let x = 0; x < 16; x++) c.px(x, 8 + (x % 3 === 0 ? 1 : 0), CABLES[x % 4] ?? P.yellow);
      c.hline(0, 15, 6, '#efd26a');
    },
  },
  {
    name: 'tray_drop',
    draw: (c) => {
      c.hline(0, 15, 7, '#d4b13c').hline(0, 15, 11, '#9c8429');
      for (let x = 1; x < 16; x += 4) c.vline(x, 7, 11, '#b89a33');
      c.hline(0, 15, 6, '#efd26a');
      // Câbles qui descendent dans la baie.
      for (const [i, x] of [6, 8, 10].entries()) c.vline(x, 8, 15, CABLES[i] ?? P.yellow);
    },
  },
  {
    name: 'crash_cart',
    collides: true,
    draw: (c) => {
      box(c, 2, 8, 13, 12, '#5d6b7a', 1);
      c.vline(3, 12, 14, P.ink).vline(12, 12, 14, P.ink);
      c.px(3, 15, '#2b3440').px(12, 15, '#2b3440');
      // Portable ouvert.
      c.rect(4, 3, 11, 7, P.ink);
      c.rect(5, 4, 10, 6, '#173246');
      c.hline(5, 8, 5, '#3ddc84');
      c.hline(4, 11, 8, '#9aa6b2');
    },
  },
  {
    name: 'boxes',
    collides: true,
    draw: (c) => {
      box(c, 1, 7, 9, 15, '#b98a55', 2);
      c.vline(5, 7, 15, '#d8b07a');
      box(c, 7, 2, 14, 10, '#c99a62', 2);
      c.hline(7, 14, 6, '#e0c08a');
      c.rect(9, 7, 12, 8, '#f4efe2');
    },
  },
  {
    name: 'toolbox',
    draw: (c) => {
      box(c, 3, 9, 12, 14, '#c8352d', 2);
      c.hline(6, 9, 7, P.ink).px(6, 8, P.ink).px(9, 8, P.ink);
      c.hline(3, 12, 11, '#8f2520');
    },
  },
  {
    name: 'net_cabinet',
    collides: true,
    frames: 2,
    duration: 300,
    draw: (c, frame) => {
      box(c, 1, 1, 14, 15, '#20272f', 2);
      c.rect(3, 4, 12, 13, '#11161c');
      unit(c, 5, 2, '#2a333d');
      for (let x = 4; x <= 11; x++) led(c, x, 5, (x + frame) % 3 !== 0);
      unit(c, 9, 2, '#2a333d');
      for (let x = 4; x <= 11; x += 2) c.px(x, 11, CABLES[x % CABLES.length] ?? P.yellow);
      c.vline(13, 4, 13, '#3a4552');
    },
  },
  // --- Bureaux --------------------------------------------------------------------------
  {
    name: 'desk_back',
    collides: true,
    frames: 2,
    duration: 1200,
    draw: (c, frame) => {
      // Poste vu de dos : plateau, dos de deux écrans, lueur de l'écran.
      c.rect(0, 8, 15, 12, P.desk).hline(0, 15, 8, P.deskHi).hline(0, 15, 12, P.deskLo);
      c.vline(1, 13, 15, '#4a3424').vline(14, 13, 15, '#4a3424');
      for (const x0 of [1, 8]) {
        c.rect(x0, 1, x0 + 6, 6, '#252c35').hline(x0, x0 + 6, 1, '#39424d');
        c.rect(x0 + 2, 7, x0 + 4, 8, '#1a1f26');
        c.px(x0 + 1, 0, frame ? '#4db8ff55' : '#4db8ff33').px(x0 + 5, 0, '#4db8ff33');
      }
    },
  },
  {
    name: 'desk_front',
    collides: true,
    frames: 3,
    duration: 700,
    draw: (c, frame) => {
      // Poste vu de face : deux écrans allumés, clavier, tasse.
      c.rect(0, 8, 15, 12, P.desk).hline(0, 15, 8, P.deskHi).hline(0, 15, 12, P.deskLo);
      c.vline(1, 13, 15, '#4a3424').vline(14, 13, 15, '#4a3424');
      c.rect(1, 1, 7, 6, P.ink).rect(2, 2, 6, 5, '#0f2a1f');
      for (let y = 2; y <= 5; y++) c.hline(2, 2 + ((y * 3 + frame) % 4), y, '#3ddc84');
      c.rect(8, 1, 14, 6, P.ink).rect(9, 2, 13, 5, '#0f2236');
      for (let i = 0; i < 4; i++)
        c.vline(9 + i + (i > 1 ? 1 : 0), 5 - ((i + frame) % 3), 5, '#4db8ff');
      c.rect(4, 7, 4, 7, P.ink).rect(11, 7, 11, 7, P.ink);
      c.rect(3, 10, 9, 11, '#2b3440').hline(3, 9, 10, '#4a5868');
      c.rect(12, 9, 13, 11, P.white).px(14, 10, P.white);
    },
  },
  {
    name: 'desk_plain',
    collides: true,
    draw: (c) => {
      c.rect(0, 8, 15, 12, P.desk).hline(0, 15, 8, P.deskHi).hline(0, 15, 12, P.deskLo);
      c.vline(1, 13, 15, '#4a3424').vline(14, 13, 15, '#4a3424');
      // Papiers, carnet et plante en pot.
      c.rect(2, 9, 6, 11, '#f4f1ea').hline(3, 5, 10, '#9aa6b2');
      c.rect(8, 9, 10, 11, '#3d8bfd');
      c.rect(12, 7, 14, 10, P.pot);
      c.px(12, 5, P.leafHi).px(13, 4, P.leaf).px(14, 5, P.leafLo).px(13, 6, P.leaf);
    },
  },
  {
    name: 'chair',
    draw: (c) => {
      // Fauteuil de bureau vu de dos.
      c.rect(4, 2, 11, 9, '#2a3340').hline(4, 11, 2, '#3e4a5a');
      c.vline(11, 3, 9, '#1c232c');
      c.rect(3, 9, 12, 11, '#222a34');
      c.vline(7, 12, 13, '#1a1f26');
      c.hline(4, 11, 14, '#1a1f26');
    },
  },
  {
    name: 'plant_big',
    collides: true,
    draw: (c) => {
      c.rect(4, 11, 11, 15, P.pot).hline(4, 11, 11, P.potHi).vline(11, 12, 15, shade(P.pot, 0.25));
      c.ellipse(8, 6, 6, 5.5, P.leafLo);
      c.ellipse(7, 5, 5, 4.5, P.leaf);
      for (const [x, y] of [
        [5, 3],
        [8, 2],
        [10, 5],
        [4, 7],
        [7, 7],
      ] as const)
        c.px(x, y, P.leafHi).px(x + 1, y, P.leafHi);
    },
  },
  {
    name: 'plant_small',
    draw: (c) => {
      c.rect(5, 11, 10, 14, P.pot).hline(5, 10, 11, P.potHi);
      c.ellipse(7.5, 8, 3.5, 3.2, P.leaf);
      c.px(6, 6, P.leafHi).px(8, 7, P.leafHi).px(9, 9, P.leafLo);
    },
  },
  {
    name: 'coffee',
    collides: true,
    frames: 3,
    duration: 380,
    draw: (c, frame) => {
      // Comptoir et machine à café, avec un filet de vapeur.
      c.rect(0, 9, 15, 15, '#6a4529').hline(0, 15, 9, '#a2734b').hline(0, 15, 10, '#8a5f3c');
      box(c, 3, 2, 10, 9, '#2b3038', 1);
      c.rect(5, 4, 8, 5, '#79e0a0');
      c.rect(6, 7, 7, 8, P.white);
      const steam = [
        [5, 0],
        [6, 1],
        [5, 1],
      ][frame] ?? [5, 0];
      c.px(steam[0] ?? 5, steam[1] ?? 0, '#ffffff88').px(
        (steam[0] ?? 5) + 2,
        (steam[1] ?? 0) + 1,
        '#ffffff55',
      );
      c.rect(12, 6, 13, 9, '#e5534b');
    },
  },
  {
    name: 'water_cooler',
    collides: true,
    draw: (c) => {
      c.rect(5, 1, 10, 6, '#7fc7ee').hline(5, 10, 1, '#b8e3f7').vline(10, 2, 6, '#4a9cc8');
      box(c, 4, 7, 11, 15, '#e3e8ed', 1);
      c.px(6, 10, '#3d8bfd').px(9, 10, '#e5534b');
    },
  },
  {
    name: 'bookshelf',
    collides: true,
    draw: (c) => {
      box(c, 1, 1, 14, 15, '#6a4529', 1);
      for (const y of [5, 10]) c.hline(2, 13, y, '#4a3020');
      const books = ['#3d8bfd', '#e5534b', '#2fbf71', '#f2b54a', '#9a6bd6', '#d0d7de'];
      for (const [row, y0] of [2, 6, 11].entries())
        for (let x = 2; x <= 12; x += 2)
          c.rect(
            x,
            y0 + (x % 3 === 0 ? 1 : 0),
            x,
            y0 + 3,
            books[(x + row) % books.length] ?? P.white,
          );
    },
  },
  {
    name: 'trash',
    draw: (c) => {
      c.rect(5, 8, 10, 14, '#4a5868').hline(5, 10, 8, '#6c7c8e').vline(10, 9, 14, '#36414e');
      c.px(7, 7, '#f4f1ea').px(8, 7, '#e8c547');
    },
  },
  {
    name: 'sofa_l',
    collides: true,
    draw: (c) => {
      c.rect(1, 3, 15, 8, '#c56a3c').hline(1, 15, 3, '#e08a58');
      c.rect(1, 8, 15, 13, '#d9784a').hline(1, 15, 8, '#ec9466');
      c.rect(0, 5, 2, 14, '#a85a32');
      c.hline(1, 15, 14, '#7a3f22');
    },
  },
  {
    name: 'sofa_r',
    collides: true,
    draw: (c) => {
      c.rect(0, 3, 14, 8, '#c56a3c').hline(0, 14, 3, '#e08a58');
      c.rect(0, 8, 14, 13, '#d9784a').hline(0, 14, 8, '#ec9466');
      c.rect(13, 5, 15, 14, '#a85a32');
      c.hline(0, 14, 14, '#7a3f22');
      c.rect(4, 9, 8, 11, '#f2b54a');
    },
  },
  {
    name: 'lamp',
    collides: true,
    draw: (c) => {
      c.ellipse(8, 3.5, 4.5, 3, '#f6dfa4');
      c.hline(4, 12, 5, '#d8b46a');
      c.vline(8, 6, 13, '#3a3530');
      c.hline(5, 11, 14, '#2a2622');
    },
  },
  {
    name: 'table',
    collides: true,
    draw: (c) => {
      // Table ronde du coin pause, avec deux tasses.
      c.ellipse(8, 7, 7, 4.5, P.deskLo);
      c.ellipse(8, 6.5, 7, 4, P.desk);
      c.ellipse(7, 5.5, 4, 2, P.deskHi);
      c.vline(8, 11, 14, '#4a3424').hline(5, 11, 15, '#4a3424');
      c.rect(4, 5, 5, 6, P.white).rect(10, 6, 11, 7, '#e5534b');
    },
  },
  {
    name: 'stool',
    draw: (c) => {
      c.ellipse(8, 9, 4, 2.5, '#2f7a74');
      c.ellipse(8, 8.5, 4, 2, '#3fa39a');
      c.vline(8, 11, 14, '#2a2622').hline(6, 10, 14, '#2a2622');
    },
  },
  {
    name: 'printer',
    collides: true,
    draw: (c) => {
      box(c, 1, 5, 14, 14, '#d9dee4', 2);
      c.rect(3, 8, 12, 9, '#2b3440');
      c.rect(4, 3, 11, 6, '#f7f7f2').hline(5, 10, 4, '#9aa6b2');
      c.px(12, 11, '#3ddc84');
      c.hline(1, 14, 14, '#8f9aa6');
    },
  },
  {
    name: 'counter',
    collides: true,
    draw: (c) => {
      c.rect(0, 9, 15, 15, '#6a4529').hline(0, 15, 9, '#a2734b').hline(0, 15, 10, '#8a5f3c');
      c.rect(2, 6, 4, 9, P.white).rect(9, 7, 11, 9, '#2fbf71');
      c.vline(8, 11, 14, '#4a3020');
    },
  },
  // --- Bulles d'interaction (sprites) -----------------------------------------------------
  {
    name: 'bubble_mission',
    draw: (c) => {
      c.rect(4, 1, 11, 11, '#f2b54a').hline(5, 10, 0, '#f2b54a').hline(5, 10, 12, '#f2b54a');
      c.px(7, 13, '#f2b54a').px(8, 13, '#f2b54a').px(8, 14, '#f2b54a');
      c.rect(7, 3, 8, 7, P.ink).rect(7, 9, 8, 10, P.ink);
      c.outline('#0b0f15');
    },
  },
  {
    name: 'bubble_debrief',
    draw: (c) => {
      c.rect(4, 1, 11, 11, '#5fb6e0').hline(5, 10, 0, '#5fb6e0').hline(5, 10, 12, '#5fb6e0');
      c.px(7, 13, '#5fb6e0').px(8, 13, '#5fb6e0').px(8, 14, '#5fb6e0');
      c.hline(6, 9, 3, P.ink).px(10, 4, P.ink).px(10, 5, P.ink).px(9, 6, P.ink).px(8, 7, P.ink);
      c.rect(7, 9, 8, 10, P.ink);
      c.outline('#0b0f15');
    },
  },
  {
    name: 'bubble_key',
    draw: (c) => {
      c.rect(3, 2, 12, 12, '#e9eef3').hline(3, 12, 12, '#9aa6b2').hline(3, 12, 13, '#6c7783');
      c.hline(6, 9, 4, P.ink).vline(6, 4, 10, P.ink).hline(6, 8, 7, P.ink).hline(6, 9, 10, P.ink);
      c.outline('#0b0f15');
    },
  },
];

/** Tuile placée dans la feuille : indice de la première image. */
export interface PlacedTile extends TileSpec {
  readonly index: number;
}

/** Catalogue placé : indice de chaque tuile (les images d'animation se suivent). */
export const CATALOG: ReadonlyMap<string, PlacedTile> = (() => {
  const placed = new Map<string, PlacedTile>();
  let index = 0;
  for (const tile of TILES) {
    placed.set(tile.name, { ...tile, index });
    index += tile.frames ?? 1;
  }
  return placed;
})();

/** Nombre total d'images dans la feuille. */
export const TILE_COUNT = TILES.reduce((n, t) => n + (t.frames ?? 1), 0);

/** Lignes de la feuille. */
export const ROWS = Math.ceil(TILE_COUNT / COLUMNS);

/**
 * Indice d'une tuile du catalogue.
 *
 * @param name - Nom de la tuile.
 * @returns Son indice (première image).
 * @throws {Error} Si la tuile n'existe pas.
 */
export function tileIndex(name: string): number {
  const tile = CATALOG.get(name);
  if (!tile) throw new Error(`Tuile inconnue : ${name}`);
  return tile.index;
}

/** Dessine la feuille complète. */
export function drawTileset(): Canvas {
  const sheet = new Canvas(COLUMNS * TILE, ROWS * TILE);
  for (const tile of CATALOG.values()) {
    for (let f = 0; f < (tile.frames ?? 1); f++) {
      const c = new Canvas(TILE, TILE);
      tile.draw(c, f);
      const i = tile.index + f;
      sheet.paste(c, (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE);
    }
  }
  return sheet;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(
    new URL('../../../public/tilesets/tile-salle-serveurs.png', import.meta.url),
  );
  drawTileset().save(out);
  console.log(`Jeu de tuiles écrit : ${out} (${TILE_COUNT} images, ${COLUMNS} × ${ROWS})`);
}
