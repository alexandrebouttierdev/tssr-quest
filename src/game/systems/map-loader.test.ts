import { describe, expect, it } from 'vitest';
import { collisionGrid, objectsOfType, parseTiledMap } from './map-loader';
import { findPath } from './pathfinding';
import mapText from '../../../content/maps/salle-serveurs.tmj?raw';

const raw: unknown = JSON.parse(mapText);

describe('lecture des cartes Tiled', () => {
  const map = parseTiledMap(raw);

  it('lit la carte de la salle serveurs et ses calques', () => {
    expect([map.width, map.height, map.tileSize]).toEqual([36, 22, 16]);
    expect([...map.tileLayers.keys()]).toEqual(['sol', 'murs', 'mobilier-bas', 'mobilier-haut']);
    expect(map.properties['zoneId']).toBe('salle-serveurs');
  });

  it('trouve le point de départ, le PNJ et les lumières', () => {
    expect(objectsOfType(map, 'entites', 'spawn')[0]?.properties['id']).toBe('depart');
    expect(objectsOfType(map, 'entites', 'npc')[0]?.properties).toEqual({
      npcId: 'hugo',
      facing: 'left',
    });
    expect(objectsOfType(map, 'lumieres', 'light').length).toBeGreaterThan(4);
    expect(objectsOfType(map, 'absent', 'x')).toEqual([]);
  });

  it('construit une grille de collisions où murs et baies bloquent', () => {
    const grid = collisionGrid(map, [{ x: 32, y: 11 }]);

    expect(grid[0]?.[0]).toBe(true);
    expect(grid[3]?.[17]).toBe(false);
    expect(grid[5]?.[3]).toBe(true);
    expect(grid[4]?.[3]).toBe(false);
    expect(grid[11]?.[32]).toBe(true);
  });

  it('permet de rejoindre Hugo depuis le point de départ', () => {
    const grid = collisionGrid(map);

    expect(findPath(grid, { x: 17, y: 3 }, { x: 31, y: 12 })).not.toBeNull();
  });

  it('refuse une carte qui ne respecte pas les conventions', () => {
    expect(() => parseTiledMap({ width: 50 })).toThrow(/Carte Tiled invalide/);
    const base = raw as { layers: { name: string; data?: number[] }[] };
    expect(() =>
      parseTiledMap({ ...base, layers: base.layers.filter((l) => l.name !== 'murs') }),
    ).toThrow('Calque de tuiles manquant : murs');
    expect(() =>
      parseTiledMap({ ...base, layers: base.layers.filter((l) => l.name !== 'zones') }),
    ).toThrow("Calque d'objets manquant : zones");
    expect(() =>
      parseTiledMap({
        ...base,
        layers: base.layers.map((l) => (l.name === 'sol' ? { ...l, data: [1] } : l)),
      }),
    ).toThrow('Calque sol : taille incohérente');
  });
});
