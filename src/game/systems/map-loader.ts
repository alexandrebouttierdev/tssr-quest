import { z } from 'zod';
import type { CollisionGrid } from './pathfinding';

/** Propriété personnalisée Tiled. */
const propertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown(),
});

/** Objet d'un calque d'objets. */
const objectSchema = z.object({
  id: z.number(),
  name: z.string().default(''),
  type: z.string().default(''),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  properties: z.array(propertySchema).default([]),
});

/** Calque Tiled (tuiles ou objets). */
const layerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tilelayer'),
    name: z.string(),
    width: z.number(),
    height: z.number(),
    data: z.array(z.number()),
  }),
  z.object({ type: z.literal('objectgroup'), name: z.string(), objects: z.array(objectSchema) }),
]);

/** Sous-ensemble du format JSON de Tiled (`.tmj`) utilisé par le jeu (docs/06). */
const tiledMapSchema = z.object({
  width: z.number().int().positive().max(40),
  height: z.number().int().positive().max(25),
  tilewidth: z.literal(16),
  tileheight: z.literal(16),
  properties: z.array(propertySchema).default([]),
  tilesets: z
    .array(
      z.object({
        firstgid: z.number(),
        name: z.string(),
        tiles: z
          .array(
            z.object({
              id: z.number(),
              properties: z.array(propertySchema).default([]),
              animation: z
                .array(z.object({ tileid: z.number(), duration: z.number().positive() }))
                .optional(),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
  layers: z.array(layerSchema),
});

/** Objet de carte avec ses propriétés à plat. */
export interface MapObject {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** Animation d'une tuile : images (identifiants globaux) et durée de chacune. */
export interface TileAnimation {
  readonly gids: readonly number[];
  readonly durations: readonly number[];
}

/** Carte lue et vérifiée. */
export interface ParsedMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly properties: Readonly<Record<string, unknown>>;
  /** Noms des tuiles bloquantes (identifiants globaux). */
  readonly collidingGids: ReadonlySet<number>;
  /** Images du jeu de tuiles utilisées comme sprites (propriété `sprite`), par nom. */
  readonly sprites: ReadonlyMap<string, number>;
  /** Animations de tuiles (format Tiled), par identifiant global de la première image. */
  readonly animations: ReadonlyMap<number, TileAnimation>;
  readonly tileLayers: ReadonlyMap<string, readonly number[]>;
  readonly objectLayers: ReadonlyMap<string, readonly MapObject[]>;
}

/** Calques de tuiles obligatoires (docs/06, « Calques »). */
export const REQUIRED_TILE_LAYERS = ['sol', 'murs', 'mobilier-bas', 'mobilier-haut'] as const;

/** Calques d'objets obligatoires. */
export const REQUIRED_OBJECT_LAYERS = ['lumieres', 'entites', 'zones'] as const;

/** Met les propriétés Tiled à plat. */
function flatten(properties: readonly z.infer<typeof propertySchema>[]): Record<string, unknown> {
  return Object.fromEntries(properties.map((p) => [p.name, p.value]));
}

/**
 * Lit une carte Tiled exportée en JSON et vérifie les conventions du jeu
 * (tuiles de 16 px, 40 × 25 au plus, calques obligatoires).
 *
 * @param raw - JSON de la carte.
 * @returns La carte lue.
 * @throws {Error} Si la carte ne respecte pas les conventions.
 */
export function parseTiledMap(raw: unknown): ParsedMap {
  const result = tiledMapSchema.safeParse(raw);
  if (!result.success)
    throw new Error(
      `Carte Tiled invalide : ${result.error.issues[0]?.path.join('.')} ${result.error.issues[0]?.message ?? ''}`,
    );
  const map = result.data;
  const tileLayers = new Map<string, number[]>();
  const objectLayers = new Map<string, MapObject[]>();
  for (const layer of map.layers) {
    if (layer.type === 'tilelayer') {
      if (layer.data.length !== map.width * map.height)
        throw new Error(`Calque ${layer.name} : taille incohérente`);
      tileLayers.set(layer.name, layer.data);
    } else {
      objectLayers.set(
        layer.name,
        layer.objects.map((o) => ({ ...o, properties: flatten(o.properties) })),
      );
    }
  }
  for (const name of REQUIRED_TILE_LAYERS)
    if (!tileLayers.has(name)) throw new Error(`Calque de tuiles manquant : ${name}`);
  for (const name of REQUIRED_OBJECT_LAYERS)
    if (!objectLayers.has(name)) throw new Error(`Calque d'objets manquant : ${name}`);
  const collidingGids = new Set<number>();
  const animations = new Map<number, TileAnimation>();
  const sprites = new Map<string, number>();
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles) {
      const sprite = flatten(tile.properties)['sprite'];
      if (typeof sprite === 'string') sprites.set(sprite, tile.id);
      if (flatten(tile.properties)['collides'] === true)
        collidingGids.add(tileset.firstgid + tile.id);
      if (tile.animation && tile.animation.length > 1) {
        animations.set(tileset.firstgid + tile.id, {
          gids: tile.animation.map((f) => tileset.firstgid + f.tileid),
          durations: tile.animation.map((f) => f.duration),
        });
      }
    }
  }
  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    properties: flatten(map.properties),
    collidingGids,
    sprites,
    animations,
    tileLayers,
    objectLayers,
  };
}

/**
 * Grille de collisions de la carte : une case est bloquée si une tuile de n'importe
 * quel calque est marquée `collides`, ou si elle est occupée (PNJ).
 *
 * @param map - Carte lue.
 * @param occupied - Cases occupées en plus (coordonnées de cases).
 * @returns La grille `[y][x]`.
 */
export function collisionGrid(
  map: ParsedMap,
  occupied: readonly { x: number; y: number }[] = [],
): CollisionGrid {
  const grid: boolean[][] = Array.from({ length: map.height }, () =>
    Array<boolean>(map.width).fill(false),
  );
  for (const data of map.tileLayers.values()) {
    data.forEach((gid, index) => {
      if (map.collidingGids.has(gid)) {
        const row = grid[Math.floor(index / map.width)];
        if (row) row[index % map.width] = true;
      }
    });
  }
  for (const p of occupied) {
    const row = grid[p.y];
    if (row && p.x >= 0 && p.x < map.width) row[p.x] = true;
  }
  return grid;
}

/**
 * Objets d'un type donné dans un calque.
 *
 * @param map - Carte lue.
 * @param layer - Nom du calque d'objets.
 * @param type - Type d'objet (`npc`, `spawn`, `light`…).
 * @returns Les objets correspondants.
 */
export function objectsOfType(map: ParsedMap, layer: string, type: string): MapObject[] {
  return (map.objectLayers.get(layer) ?? []).filter((o) => o.type === type);
}
