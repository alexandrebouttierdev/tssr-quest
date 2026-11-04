/**
 * Génère la carte Tiled du plateau technique de LabCorp (content/maps/salle-serveurs.tmj).
 *
 * Trois ambiances sur une même carte (docs/06) :
 * - la salle serveurs : rangées de baies vues de face et de dos, allées froides et
 *   chaudes, climatisations, zone onduleurs, zone de livraison, chemins de câbles ;
 * - la salle de supervision (NOC), derrière une cloison vitrée : murs d'écrans, postes
 *   d'exploitation, le bureau d'Hugo ;
 * - le coin pause : parquet, canapé, machine à café, lumière chaude.
 *
 * Les tuiles viennent du catalogue du générateur de jeu de tuiles (noms, collisions,
 * animations). La carte reste éditable dans Tiled.
 *
 * Utilisation : npx tsx assets/generators/maps/salle-serveurs.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seeded } from '../lib/pixels';
import { CATALOG, COLUMNS, ROWS, TILE, TILE_COUNT, tileIndex } from '../tilesets/labcorp';

/** Dimensions de la carte (docs/06 : 40 × 25 au plus). */
export const WIDTH = 40;
export const HEIGHT = 24;

/** Calques de tuiles, de bas en haut. */
const LAYERS = ['sol', 'details', 'murs', 'mobilier-bas', 'mobilier-haut'] as const;
type LayerName = (typeof LAYERS)[number];

const grid: Record<LayerName, (string | null)[]> = Object.fromEntries(
  LAYERS.map((name) => [name, Array<string | null>(WIDTH * HEIGHT).fill(null)]),
) as Record<LayerName, (string | null)[]>;

/** Pose une tuile. */
function put(layer: LayerName, x: number, y: number, name: string | null): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  grid[layer][y * WIDTH + x] = name;
}

/** Remplit un rectangle (bornes incluses) avec une tuile ou un choix par case. */
function fill(
  layer: LayerName,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pick: string | ((x: number, y: number) => string | null),
): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) put(layer, x, y, typeof pick === 'string' ? pick : pick(x, y));
}

/** Objet de deux tuiles de haut : le haut passe devant le joueur, le bas derrière. */
function tall(x: number, y: number, top: string, bottom: string): void {
  put('mobilier-haut', x, y, top);
  put('mobilier-bas', x, y + 1, bottom);
}

const rand = seeded(2026);
/** Tirage pondéré, reproductible. */
const weighted = (choices: readonly [string, number][]) => (): string => {
  const total = choices.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [name, w] of choices) {
    r -= w;
    if (r <= 0) return name;
  }
  return choices[0]?.[0] ?? '';
};

// --- Structure : murs extérieurs, cloison vitrée ------------------------------------------
const PARTITION_X = 26;
const DOOR_X = 13;
fill('murs', 0, 0, WIDTH - 1, 0, 'wall_top');
fill('murs', 0, HEIGHT - 1, WIDTH - 1, HEIGHT - 1, 'wall_top');
fill('murs', 0, 0, 0, HEIGHT - 1, 'wall_top');
fill('murs', WIDTH - 1, 0, WIDTH - 1, HEIGHT - 1, 'wall_top');
// Cloison vitrée, ouverte à hauteur de l'allée chaude (y 11-12).
for (let y = 2; y <= HEIGHT - 2; y++)
  if (y !== 11 && y !== 12) put('murs', PARTITION_X, y, 'partition');

// Façade du mur du fond, pièce par pièce.
const dcWall: Record<number, string> = {
  4: 'wall_extinguisher',
  6: 'wall_breaker',
  8: 'wall_sign_hv',
  [DOOR_X]: 'wall_door',
  16: 'wall_clock',
  18: 'wall_poster',
  20: 'wall_vent',
  24: 'wall_extinguisher',
};
const nocWall: Record<number, string> = {
  27: 'wall_window_moon',
  28: 'wall_window',
  29: 'wall_board_l',
  30: 'wall_board_r',
  31: 'noc_l',
  32: 'noc_m',
  33: 'noc_r',
  34: 'noc_l',
  35: 'noc_m',
  36: 'noc_r',
  37: 'wall_ac',
  38: 'wall_window',
};
for (let x = 1; x < WIDTH - 1; x++) {
  put('murs', x, 1, dcWall[x] ?? nocWall[x] ?? (x % 5 === 0 ? 'wall_seam' : 'wall'));
}

// --- Salle serveurs ------------------------------------------------------------------------
const dcFloor = weighted([
  ['floor_a', 60],
  ['floor_d', 20],
  ['floor_b', 14],
  ['floor_c', 3],
]);
fill('sol', 1, 2, PARTITION_X - 1, HEIGHT - 2, () => dcFloor());
put('sol', DOOR_X, 2, 'doormat');
// Sous la cloison vitrée : le faux plancher continue, seuil devant la porte.
fill('sol', PARTITION_X, 1, PARTITION_X, HEIGHT - 2, 'floor_a');

/** Rangées de baies : façade visible (vers l'allée froide) ou dos (allée chaude). */
const RACK_ROWS: readonly { y: number; facing: 'front' | 'back'; kinds: string }[] = [
  { y: 5, facing: 'front', kinds: 'sssttsnnb.bbssesttsb' },
  { y: 9, facing: 'back', kinds: '' },
  { y: 13, facing: 'front', kinds: 'nnnsseetts.sbbsnssto' },
  { y: 17, facing: 'back', kinds: '' },
];
const KIND: Record<string, string> = {
  s: 'srv',
  t: 'sto',
  n: 'net',
  b: 'bla',
  e: 'empty',
  o: 'empty',
};
const rackColumns = [...Array(9).keys()]
  .map((i) => 3 + i)
  .concat([...Array(9).keys()].map((i) => 14 + i));
for (const row of RACK_ROWS) {
  for (const [i, x] of rackColumns.entries()) {
    if (row.facing === 'back') {
      const empty = rand() < 0.08;
      tall(
        x,
        row.y,
        empty ? 'rack_empty_top' : 'rack_back_top',
        empty ? 'rack_empty_bot' : 'rack_back_bot',
      );
      continue;
    }
    const code = row.kinds[i + (i >= 9 ? 1 : 0)] ?? 's';
    const kind = KIND[code] ?? 'srv';
    tall(x, row.y, `rack_${kind}_top`, `rack_${kind}_bot`);
    // Chemin de câbles aérien au-dessus des façades ; il plonge dans les baies réseau.
    put('mobilier-haut', x, row.y - 1, kind === 'net' ? 'tray_drop' : 'tray_h');
  }
  // Allées : froide devant les façades, chaude derrière les dos.
  if (row.facing === 'front') {
    const cold = weighted([
      ['cold_a', 70],
      ['cold_b', 30],
    ]);
    for (const x of rackColumns) for (const y of [row.y + 2, row.y + 3]) put('sol', x, y, cold());
  } else {
    for (const x of rackColumns) put('sol', x, row.y + 2, 'hot');
  }
}
// Le couloir central coupe les allées : rampe de câbles au sol.
put('sol', 12, 12, 'ramp_h');
put('sol', 13, 12, 'ramp_h');
fill('details', 14, 12, 18, 12, 'cables_h');
fill('details', 24, 4, 24, 10, 'cables_v');

// Climatisations de précision contre le mur du fond.
for (const x of [2, 3, 21, 22]) tall(x, 2, 'crac_top', 'crac_bot');

// Zone onduleurs, balisée au sol.
for (const x of [2, 3, 4, 5]) tall(x, 20, 'ups_top', 'ups_bot');
fill('sol', 1, 19, 7, 19, 'tape_h');
fill('sol', 7, 20, 7, 21, 'tape_v');
put('mobilier-bas', 7, 21, null);

// Zone de livraison : cartons, chariot de console, caisse à outils.
put('mobilier-bas', 16, 21, 'boxes');
put('mobilier-bas', 17, 21, 'boxes');
put('mobilier-bas', 19, 21, 'crash_cart');
put('details', 20, 21, 'toolbox');
put('mobilier-bas', 24, 21, 'net_cabinet');

// --- Salle de supervision (NOC) ---------------------------------------------------------
const carpet = weighted([
  ['carpet_a', 70],
  ['carpet_b', 30],
]);
fill('sol', PARTITION_X + 1, 2, WIDTH - 2, 14, () => carpet());
// Deux rangées de postes d'exploitation tournés vers le mur d'écrans.
for (const y of [4, 7]) {
  for (const x of [28, 29, 30, 31, 33, 34, 35, 36]) {
    put('mobilier-bas', x, y, 'desk_back');
    put('details', x, y + 1, 'chair');
  }
}
// Le bureau d'Hugo, face à la salle.
put('mobilier-bas', 31, 10, 'desk_front');
put('mobilier-bas', 32, 10, 'desk_front');
put('mobilier-bas', 33, 10, 'desk_plain');
put('details', 32, 9, 'chair');
put('mobilier-bas', 37, 10, 'net_cabinet');
put('mobilier-bas', 38, 10, 'bookshelf');
put('mobilier-bas', PARTITION_X + 1, 2, 'plant_big');
put('mobilier-bas', WIDTH - 2, 2, 'plant_big');
put('details', 37, 13, 'trash');
put('mobilier-bas', 38, 13, 'plant_big');
put('mobilier-bas', 37, 4, 'printer');
put('details', 38, 7, 'plant_small');
put('details', 28, 13, 'plant_small');

// --- Coin pause ---------------------------------------------------------------------------
const wood = weighted([
  ['wood_a', 60],
  ['wood_b', 40],
]);
fill('sol', PARTITION_X + 1, 15, WIDTH - 2, HEIGHT - 2, () => wood());
put('sol', 30, 20, 'rug');
put('sol', 31, 20, 'rug');
put('mobilier-bas', 34, 15, 'counter');
put('mobilier-bas', 35, 15, 'coffee');
put('mobilier-bas', 36, 15, 'water_cooler');
put('details', 35, 16, 'crumbs');
put('mobilier-bas', 38, 17, 'bookshelf');
put('mobilier-bas', 30, 21, 'sofa_l');
put('mobilier-bas', 31, 21, 'sofa_r');
put('mobilier-bas', 29, 21, 'lamp');
put('mobilier-bas', PARTITION_X + 1, 21, 'plant_big');
put('details', 33, 21, 'plant_small');
put('details', 38, 21, 'trash');
// Tables hautes et tabourets.
for (const [x, y] of [
  [30, 17],
  [36, 19],
] as const) {
  put('mobilier-bas', x, y, 'table');
  put('details', x - 1, y, 'stool');
  put('details', x + 1, y, 'stool');
}

// --- Objets : lumières, entités, zones --------------------------------------------------
let nextId = 1;
/** Propriété Tiled. */
const prop = (name: string, value: string | number | boolean) => ({
  name,
  type:
    typeof value === 'number'
      ? Number.isInteger(value)
        ? 'int'
        : 'float'
      : typeof value === 'boolean'
        ? 'bool'
        : 'string',
  value,
});
/** Objet ponctuel (coordonnées en tuiles, au centre par défaut). */
const point = (
  name: string,
  type: string,
  tx: number,
  ty: number,
  properties: ReturnType<typeof prop>[],
) => ({
  id: nextId++,
  name,
  type,
  x: Math.round(tx * TILE + TILE / 2),
  y: Math.round(ty * TILE + TILE / 2),
  width: 0,
  height: 0,
  rotation: 0,
  visible: true,
  point: true,
  properties,
});
/** Lumière ponctuelle. */
const lamp = (
  name: string,
  tx: number,
  ty: number,
  color: string,
  radius: number,
  intensity: number,
  extra: ReturnType<typeof prop>[] = [],
) =>
  point(name, 'light', tx, ty, [
    prop('color', color),
    prop('radius', radius),
    prop('intensity', intensity),
    prop('flicker', false),
    ...extra,
  ]);
/** Zone rectangulaire (coordonnées en tuiles). */
const area = (
  name: string,
  type: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  properties: ReturnType<typeof prop>[],
) => ({
  id: nextId++,
  name,
  type,
  x: x0 * TILE,
  y: y0 * TILE,
  width: (x1 - x0 + 1) * TILE,
  height: (y1 - y0 + 1) * TILE,
  rotation: 0,
  visible: true,
  properties,
});

const lights = [
  // Salle serveurs : néons froids au-dessus des allées (l'un grésille).
  ...[5, 10, 17, 21].flatMap((x) =>
    [7.5, 11.5, 15.5, 20].map((y) =>
      lamp('neon', x, y, '#bfe6ff', 60, 0.3, x === 17 && y === 15.5 ? [prop('flicker', true)] : []),
    ),
  ),
  // Allées froides : lueur bleutée qui remonte du faux plancher.
  ...[6, 18].flatMap((x) =>
    [7.5, 15.5].map((y) => lamp('allee-froide', x, y, '#5fb6e0', 44, 0.22)),
  ),
  // LED des façades de baies.
  ...[5, 13].flatMap((y) =>
    rackColumns.map((x) =>
      lamp('led', x, y + 0.7, (x + y) % 3 === 0 ? '#4db8ff' : '#40f58e', 10, 0.28),
    ),
  ),
  lamp('onduleurs', 3.5, 20.3, '#79e0a0', 22, 0.35),
  lamp('gyrophare', 6, 19.6, '#ff5a4f', 26, 0.4, [prop('pulse', true)]),
  lamp('sortie', DOOR_X, 1.1, '#3ddc84', 22, 0.45),
  lamp('livraison', 18, 20.5, '#ffe2b0', 40, 0.25),
  // Supervision : murs d'écrans, postes, lumière chaude.
  lamp('mur-ecrans', 32, 2.3, '#4db8ff', 64, 0.42),
  lamp('mur-ecrans', 35, 2.3, '#4db8ff', 64, 0.42),
  ...[28.5, 30.5, 33.5, 35.5].flatMap((x) =>
    [3.6, 6.6].map((y) => lamp('poste', x, y, '#6fc3ff', 16, 0.25)),
  ),
  lamp('poste-hugo', 31.5, 10.2, '#5fe0a0', 28, 0.45),
  ...[29, 35].flatMap((x) => [6, 12].map((y) => lamp('plafonnier', x, y, '#ffd59e', 64, 0.24))),
  lamp('lune', 27.5, 2.2, '#9ec9ff', 30, 0.25),
  lamp('lune', 38, 2.2, '#9ec9ff', 30, 0.2),
  // Coin pause : lampe et machine à café.
  lamp('lampadaire', 29, 20.6, '#ffcf8a', 58, 0.55),
  lamp('cafe', 35, 15.2, '#ffb36b', 24, 0.35),
];

const entities = [
  point('depart', 'spawn', DOOR_X, 2, [prop('id', 'depart')]),
  point('hugo', 'npc', 32, 11, [prop('npcId', 'hugo'), prop('facing', 'down')]),
  // Élodie, administratrice Windows, à son poste de la supervision.
  point('elodie', 'npc', 35, 8, [prop('npcId', 'elodie'), prop('facing', 'up')]),
  // M. Kerboul, le formateur ENI, en visite au coin pause (en attendant la salle de formation).
  point('formateur', 'npc', 29, 18, [prop('npcId', 'formateur'), prop('facing', 'down')]),
  point('porte-couloir', 'door', DOOR_X, 1, [
    prop('to', 'dsi'),
    prop('spawn', 'depart'),
    prop('requires', ''),
  ]),
];

const zones = [
  area('clim', 'zone', 1, 2, PARTITION_X - 1, HEIGHT - 2, [
    prop('ambience', 'amb-ventilation'),
    prop('dust', true),
  ]),
  // Teinte d'ambiance de chaque pièce (multipliée sur le décor).
  area('salle-serveurs', 'ambiance', 0, 0, PARTITION_X, HEIGHT - 1, [prop('tint', '#d6e1f0')]),
  area('supervision', 'ambiance', PARTITION_X + 1, 0, WIDTH - 1, 14, [prop('tint', '#fbf3ea')]),
  area('pause', 'ambiance', PARTITION_X + 1, 15, WIDTH - 1, HEIGHT - 1, [prop('tint', '#fff0da')]),
];

// --- Export Tiled -----------------------------------------------------------------------
/** Identifiant global Tiled (0 = vide, sinon indice + 1). */
const gid = (name: string | null): number => (name === null ? 0 : tileIndex(name) + 1);

const tileLayer = (id: number, name: LayerName) => ({
  id,
  name,
  type: 'tilelayer',
  data: grid[name].map(gid),
  width: WIDTH,
  height: HEIGHT,
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
});
const objectLayer = (id: number, name: string, objects: unknown[]) => ({
  id,
  name,
  type: 'objectgroup',
  draworder: 'topdown',
  objects,
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
});

/** Propriétés de tuiles : collisions et animations (format Tiled). */
const tileProps: unknown[] = [];
for (const tile of CATALOG.values()) {
  const frames = tile.frames ?? 1;
  for (let f = 0; f < frames; f++) {
    const entry: Record<string, unknown> = { id: tile.index + f };
    if (tile.collides) entry['properties'] = [prop('collides', true)];
    // Les bulles d'interaction servent de sprites au jeu.
    if (tile.name.startsWith('bubble_')) entry['properties'] = [prop('sprite', tile.name)];
    if (f === 0 && frames > 1) {
      entry['animation'] = [...Array(frames).keys()].map((k) => ({
        tileid: tile.index + k,
        duration: tile.duration ?? 500,
      }));
    }
    if (Object.keys(entry).length > 1) tileProps.push(entry);
  }
}

const map = {
  compressionlevel: -1,
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: WIDTH,
  height: HEIGHT,
  tilewidth: TILE,
  tileheight: TILE,
  nextlayerid: 9,
  nextobjectid: nextId,
  properties: [prop('zoneId', 'salle-serveurs'), prop('ambient', 1)],
  tilesets: [
    {
      firstgid: 1,
      name: 'salle-serveurs',
      image: '../tilesets/tile-salle-serveurs.png',
      imagewidth: COLUMNS * TILE,
      imageheight: ROWS * TILE,
      columns: COLUMNS,
      tilecount: TILE_COUNT,
      tilewidth: TILE,
      tileheight: TILE,
      margin: 0,
      spacing: 0,
      tiles: tileProps,
    },
  ],
  layers: [
    ...LAYERS.map((name, i) => tileLayer(i + 1, name)),
    objectLayer(6, 'lumieres', lights),
    objectLayer(7, 'entites', entities),
    objectLayer(8, 'zones', zones),
  ],
};

const out = fileURLToPath(new URL('../../../content/maps/salle-serveurs.tmj', import.meta.url));
// Tableaux de tuiles sur une seule ligne : fichier compact, diff lisible.
const json = JSON.stringify(map, null, 1).replace(
  /\[\n\s*(-?\d+(?:,\n\s*-?\d+)*)\n\s*\]/g,
  (_m, inner: string) => `[${inner.replace(/\s+/g, '')}]`,
);
writeFileSync(out, `${json}\n`);
console.log(`Carte écrite : ${out} (${WIDTH} × ${HEIGHT})`);
