/**
 * Génère la carte Tiled de la salle serveurs (content/maps/salle-serveurs.tmj).
 *
 * La carte est décrite en ASCII ci-dessous puis convertie au format JSON de Tiled,
 * avec les calques de docs/06 (sol, murs, mobilier-bas, mobilier-haut, lumieres,
 * entites, zones). Elle reste éditable dans Tiled ensuite.
 *
 * Utilisation : npx tsx assets/generators/maps/salle-serveurs.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Indices des tuiles du jeu de tuiles « salle serveurs » (reference/README.md). */
const T = {
  floor: 0,
  perforated: 1,
  wallTop: 2,
  wallFace: 3,
  rackTopA: 4,
  rackBottomA: 5,
  rackTopB: 6,
  rackBottomB: 7,
  desk1: 8,
  desk2: 9,
  cabinet: 10,
  door: 11,
  plant: 12,
  ac: 13,
  extinguisher: 14,
  stripe: 15,
} as const;

/** Tuiles qui bloquent le passage. */
const COLLIDES = [
  T.wallTop,
  T.wallFace,
  T.rackBottomA,
  T.rackBottomB,
  T.desk1,
  T.desk2,
  T.cabinet,
  T.door,
  T.plant,
  T.ac,
  T.extinguisher,
];

/**
 * Plan de la salle (36 × 22) :
 *  # dessus de mur · = face de mur · D porte · E extincteur · . sol · : sol perforé (allée froide)
 *  r/R baie (haut/bas, états A et B alternés) · W poste · N armoire réseau · P plante · C climatisation · S bande de sécurité
 */
const PLAN = [
  '####################################',
  '#=======E========D==========E======#',
  '#P..............SSS............CC.P#',
  '#..................................#',
  '#..rrrrrrrrrr........rrrrrrrrrrr...#',
  '#..RRRRRRRRRR........RRRRRRRRRRR...#',
  '#..::::::::::........:::::::::::...#',
  '#..::::::::::........:::::::::::...#',
  '#..rrrrrrrrrr........rrrrrrrrrrr...#',
  '#..RRRRRRRRRR........RRRRRRRRRRR...#',
  '#..................................#',
  '#.............................WW.N.#',
  '#..................................#',
  '#..rrrrrrrrrr........rrrrrrrrrrr...#',
  '#..RRRRRRRRRR........RRRRRRRRRRR...#',
  '#..::::::::::........:::::::::::...#',
  '#..::::::::::........:::::::::::...#',
  '#..rrrrrrrrrr........rrrrrrrrrrr...#',
  '#..RRRRRRRRRR........RRRRRRRRRRR...#',
  '#..................................#',
  '#P...............................P.#',
  '####################################',
];

const WIDTH = PLAN[0]!.length;
const HEIGHT = PLAN.length;

/** Identifiant global Tiled (0 = vide, sinon indice + 1). */
const gid = (tile: number | null): number => (tile === null ? 0 : tile + 1);

const sol: number[] = [];
const murs: number[] = [];
const bas: number[] = [];
const haut: number[] = [];
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const c = PLAN[y]![x]!;
    // Alternance A/B des LED selon la colonne : les baies ne clignotent pas toutes ensemble.
    const ledB = x % 3 === 0;
    sol.push(gid(c === ':' ? T.perforated : c === 'S' ? T.stripe : T.floor));
    murs.push(
      gid(
        c === '#'
          ? T.wallTop
          : c === '='
            ? T.wallFace
            : c === 'D'
              ? T.door
              : c === 'E'
                ? T.extinguisher
                : null,
      ),
    );
    bas.push(
      gid(
        c === 'R'
          ? ledB
            ? T.rackBottomB
            : T.rackBottomA
          : c === 'W'
            ? x % 2 === 0
              ? T.desk1
              : T.desk2
            : c === 'N'
              ? T.cabinet
              : c === 'P'
                ? T.plant
                : c === 'C'
                  ? T.ac
                  : null,
      ),
    );
    haut.push(gid(c === 'r' ? (ledB ? T.rackTopB : T.rackTopA) : null));
  }
}

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
/** Objet ponctuel au centre d'une tuile. */
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
  x: tx * 16 + 8,
  y: ty * 16 + 8,
  width: 0,
  height: 0,
  rotation: 0,
  visible: true,
  point: true,
  properties,
});

const lights = [
  ...[5, 12, 24, 30].flatMap((x) => [
    point('plafonnier', 'light', x, 6, [
      prop('color', '#a8e4f5'),
      prop('radius', 72),
      prop('intensity', 0.55),
      prop('flicker', false),
    ]),
  ]),
  ...[5, 12, 24, 30].map((x) =>
    point('plafonnier', 'light', x, 15, [
      prop('color', '#a8e4f5'),
      prop('radius', 72),
      prop('intensity', 0.55),
      prop('flicker', x === 24),
    ]),
  ),
  point('ecran', 'light', 30, 11, [
    prop('color', '#2fbf71'),
    prop('radius', 28),
    prop('intensity', 0.7),
    prop('flicker', false),
  ]),
  point('veilleuse-porte', 'light', 17, 2, [
    prop('color', '#f2b54a'),
    prop('radius', 40),
    prop('intensity', 0.5),
    prop('flicker', false),
  ]),
];

const entities = [
  point('depart', 'spawn', 17, 3, [prop('id', 'depart')]),
  point('hugo', 'npc', 32, 11, [prop('npcId', 'hugo'), prop('facing', 'left')]),
  point('porte-couloir', 'door', 17, 1, [
    prop('to', 'dsi'),
    prop('spawn', 'depart'),
    prop('requires', ''),
  ]),
];

const zones = [
  {
    id: nextId++,
    name: 'clim',
    type: 'zone',
    x: 32,
    y: 32,
    width: 32 * 16 - 64,
    height: 18 * 16,
    rotation: 0,
    visible: true,
    properties: [prop('ambience', 'amb-ventilation'), prop('dust', true)],
  },
];

const tileLayer = (id: number, name: string, data: number[]) => ({
  id,
  name,
  type: 'tilelayer',
  data,
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
  tilewidth: 16,
  tileheight: 16,
  nextlayerid: 8,
  nextobjectid: nextId,
  properties: [prop('zoneId', 'salle-serveurs'), prop('ambient', 0.9)],
  tilesets: [
    {
      firstgid: 1,
      name: 'salle-serveurs',
      image: '../tilesets/tile-salle-serveurs.png',
      imagewidth: 128,
      imageheight: 32,
      columns: 8,
      tilecount: 16,
      tilewidth: 16,
      tileheight: 16,
      margin: 0,
      spacing: 0,
      tiles: COLLIDES.map((id) => ({ id, properties: [prop('collides', true)] })),
    },
  ],
  layers: [
    tileLayer(1, 'sol', sol),
    tileLayer(2, 'murs', murs),
    tileLayer(3, 'mobilier-bas', bas),
    tileLayer(4, 'mobilier-haut', haut),
    objectLayer(5, 'lumieres', lights),
    objectLayer(6, 'entites', entities),
    objectLayer(7, 'zones', zones),
  ],
};

const out = fileURLToPath(new URL('../../../content/maps/salle-serveurs.tmj', import.meta.url));
writeFileSync(out, `${JSON.stringify(map, null, 1)}\n`);
console.log(`Carte écrite : ${out} (${WIDTH} × ${HEIGHT})`);
