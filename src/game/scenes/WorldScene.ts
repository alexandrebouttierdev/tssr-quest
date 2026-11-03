import Phaser from 'phaser';
import { createWorldBridge, type WorldBridge } from '../bridge';
import { Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import { ASSET_KEYS, DEPTH, TILESET_NAME } from '../keys';
import { servicesOf } from '../services';
import {
  ambienceFromObject,
  applyCameraFx,
  createDust,
  createLighting,
  lightFromObject,
  type AmbienceSpec,
} from '../systems/lighting';
import { collisionGrid, objectsOfType, parseTiledMap, type ParsedMap } from '../systems/map-loader';
import { findInteractionTarget } from '../systems/movement';
import { findPath, findPathToAdjacent, type CollisionGrid } from '../systems/pathfinding';
import { paletteColorMap, recolorPixels } from '../systems/recolor';
import { shadowRuns } from '../systems/shadows';
import { animatedGid } from '../systems/tile-animations';
import type { TileAnimation } from '../systems/map-loader';
import type { Facing } from '@core/model';

/** Touches du monde. */
interface WorldKeys {
  up: Phaser.Input.Keyboard.Key[];
  down: Phaser.Input.Keyboard.Key[];
  left: Phaser.Input.Keyboard.Key[];
  right: Phaser.Input.Keyboard.Key[];
  run: Phaser.Input.Keyboard.Key;
}

/**
 * Scène du monde : carte Tiled, joueur, PNJ, collisions, caméra, lumière, particules.
 * Aucune règle de jeu ici : les interactions partent sur le bus via le pont.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private npcs: Npc[] = [];
  private bridge!: WorldBridge;
  private keys!: WorldKeys;
  private map!: ParsedMap;
  private grid: CollisionGrid = [];
  private wasMoving = false;

  constructor() {
    super('world');
  }

  create(): void {
    // Phaser réutilise l'instance de scène à chaque redémarrage : on repart d'un état propre.
    this.npcs = [];
    this.wasMoving = false;
    const services = servicesOf(this);
    const settings = services.store.getState().settings;
    this.map = parseTiledMap(
      (this.cache.tilemap.get(ASSET_KEYS.mapServerRoom) as { data: unknown }).data,
    );
    const zoneId =
      typeof this.map.properties['zoneId'] === 'string'
        ? this.map.properties['zoneId']
        : 'salle-serveurs';
    const tilemap = this.make.tilemap({ key: ASSET_KEYS.mapServerRoom });
    const tileset = tilemap.addTilesetImage(TILESET_NAME, ASSET_KEYS.tilesetServerRoom);
    if (!tileset) throw new Error('Jeu de tuiles introuvable');
    const layers = {
      sol: tilemap.createLayer('sol', tileset)?.setDepth(DEPTH.floor),
      // Calque facultatif : câbles, chaises, petits objets posés au sol.
      details:
        tilemap.getLayerIndexByName('details') >= 0
          ? tilemap.createLayer('details', tileset)?.setDepth(DEPTH.details)
          : undefined,
      murs: tilemap.createLayer('murs', tileset)?.setDepth(DEPTH.walls),
      bas: tilemap.createLayer('mobilier-bas', tileset)?.setDepth(DEPTH.furnitureLow),
      haut: tilemap.createLayer('mobilier-haut', tileset)?.setDepth(DEPTH.furnitureHigh),
    };
    const widthPx = this.map.width * this.map.tileSize;
    const heightPx = this.map.height * this.map.tileSize;
    this.physics.world.setBounds(0, 0, widthPx, heightPx);

    // Personnages.
    const spawn = objectsOfType(this.map, 'entites', 'spawn')[0];
    const saved = services.store.getState().player;
    const start =
      saved.zoneId === zoneId && (saved.position.x > 0 || saved.position.y > 0)
        ? saved.position
        : { x: spawn?.x ?? 32, y: (spawn?.y ?? 32) + 5 };
    this.player = new Player(
      this,
      start.x,
      start.y,
      ASSET_KEYS.character,
      saved.zoneId === zoneId ? saved.facing : 'down',
    );
    const occupied: { x: number; y: number }[] = [];
    const bubbles = {
      texture: ASSET_KEYS.tileSprites,
      mission: this.map.sprites.get('bubble_mission') ?? 0,
      debrief: this.map.sprites.get('bubble_debrief') ?? 0,
      key: this.map.sprites.get('bubble_key') ?? 0,
    };
    for (const object of objectsOfType(this.map, 'entites', 'npc')) {
      const rawId = object.properties['npcId'];
      const npcId = typeof rawId === 'string' ? rawId : '';
      const facing = (object.properties['facing'] as Facing | undefined) ?? 'down';
      const texture = this.npcTexture(npcId);
      this.npcs.push(new Npc(this, object.x, object.y + 5, texture, npcId, facing, bubbles));
      occupied.push({
        x: Math.floor(object.x / this.map.tileSize),
        y: Math.floor(object.y / this.map.tileSize),
      });
    }
    this.grid = collisionGrid(this.map, occupied);
    this.drawShadows();
    for (const layer of [layers.murs, layers.bas]) {
      if (!layer) continue;
      layer.setCollisionByProperty({ collides: true });
      this.physics.add.collider(this.player, layer);
    }
    this.physics.add.collider(this.player, this.npcs);

    // Caméra : suit le joueur avec lissage, sans sortir de la carte.
    const camera = this.cameras.main;
    camera.setBounds(0, 0, widthPx, heightPx).setRoundPixels(true);
    camera.startFollow(this.player, true, 0.12, 0.12);
    camera.setDeadzone(24, 16);
    camera.setBackgroundColor('#0e1116');

    // Lumière, poussière, LED, effets de caméra.
    const ambient =
      typeof this.map.properties['ambient'] === 'number' ? this.map.properties['ambient'] : 0.9;
    createLighting(
      this,
      widthPx,
      heightPx,
      ambient,
      objectsOfType(this.map, 'lumieres', 'light').map(lightFromObject),
      settings.reducedMotion,
      objectsOfType(this.map, 'zones', 'ambiance')
        .map(ambienceFromObject)
        .filter((a): a is AmbienceSpec => a !== null),
    );
    const dustZone = objectsOfType(this.map, 'zones', 'zone').find(
      (z) => z.properties['dust'] === true,
    );
    if (dustZone && !settings.reducedMotion)
      createDust(
        this,
        new Phaser.Geom.Rectangle(dustZone.x, dustZone.y, dustZone.width, dustZone.height),
      );
    applyCameraFx(this, settings.bloom);
    // Animations du décor (LED, écrans, ventilateurs), décrites dans la carte.
    const animated: { tile: Phaser.Tilemaps.Tile; animation: TileAnimation }[] = [];
    for (const layer of Object.values(layers)) {
      layer?.forEachTile((tile) => {
        const animation = this.map.animations.get(tile.index);
        if (animation) animated.push({ tile, animation });
      });
    }
    if (!settings.reducedMotion && animated.length > 0) {
      this.time.addEvent({
        delay: 60,
        loop: true,
        callback: () => {
          const now = this.time.now;
          for (const { tile, animation } of animated) {
            const gid = animatedGid(animation, tile.x, tile.y, now);
            if (tile.index !== gid) tile.index = gid;
          }
        },
      });
    }

    // Entrées.
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Clavier indisponible');
    const K = Phaser.Input.Keyboard.KeyCodes;
    const key = (code: number) => kb.addKey(code, false);
    this.keys = {
      up: [key(K.UP), key(K.Z), key(K.W)],
      down: [key(K.DOWN), key(K.S)],
      left: [key(K.LEFT), key(K.Q), key(K.A)],
      right: [key(K.RIGHT), key(K.D)],
      run: key(K.SHIFT),
    };
    // Événements du plugin clavier : ils sont retirés à l'arrêt de la scène (pas d'écouteur fantôme).
    for (const name of ['keydown-E', 'keydown-SPACE', 'keydown-ENTER'])
      kb.on(name, () => this.tryInteract());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
      this.onPointer(pointer.worldX, pointer.worldY),
    );

    this.bridge = createWorldBridge(services, zoneId, this.npcs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.bridge.destroy());
  }

  override update(_time: number, delta: number): void {
    if (this.bridge.isInputSuspended()) {
      this.player.halt();
      this.bridge.setInteractionTarget(null);
      for (const npc of this.npcs) npc.setFocused(false);
      return;
    }
    const down = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);
    this.player.step(
      {
        up: down(this.keys.up),
        down: down(this.keys.down),
        left: down(this.keys.left),
        right: down(this.keys.right),
      },
      this.keys.run.isDown,
      this.map.tileSize,
      delta,
    );
    const target = findInteractionTarget(
      { x: this.player.x, y: this.player.y, facing: this.player.facing },
      this.npcs.map((n) => ({ id: n.npcId, x: n.x, y: n.y })),
    );
    this.bridge.setInteractionTarget(target?.id ?? null);
    for (const npc of this.npcs) npc.setFocused(npc.npcId === target?.id);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moving = body.velocity.lengthSq() > 0;
    if (this.wasMoving && !moving)
      this.bridge.savePosition(this.player.x, this.player.y, this.player.facing);
    this.wasMoving = moving;
  }

  /**
   * Ombres portées : une bande sombre sous les murs et le mobilier bloquant, plus dense
   * au contact, légèrement décalée vers la droite.
   */
  private drawShadows(): void {
    const size = this.map.tileSize;
    const graphics = this.add.graphics().setDepth(DEPTH.shadows);
    const solid = (gid: number) => this.map.collidingGids.has(gid);
    const blocked = (x: number, y: number) => this.grid[y]?.[x] ?? true;
    for (const name of ['murs', 'mobilier-bas']) {
      const data = this.map.tileLayers.get(name);
      if (!data) continue;
      for (const run of shadowRuns(data, this.map.width, solid, blocked)) {
        const x = run.x * size;
        const y = (run.y + 1) * size;
        const w = run.length * size;
        graphics.fillStyle(0x04070b, 0.36).fillRect(x + 2, y, w, 3);
        graphics.fillStyle(0x04070b, 0.18).fillRect(x + 3, y + 3, w, 3);
        if (name === 'mobilier-bas')
          graphics.fillStyle(0x04070b, 0.2).fillRect(x + w, y - size + 6, 2, size - 3);
      }
    }
  }

  /** Parle au PNJ ciblé. */
  private tryInteract(): void {
    if (this.bridge.isInputSuspended()) return;
    const target = findInteractionTarget(
      { x: this.player.x, y: this.player.y, facing: this.player.facing },
      this.npcs.map((n) => ({ id: n.npcId, x: n.x, y: n.y })),
    );
    if (!target) return;
    this.talkTo(target.id);
  }

  /** Se tourne vers le PNJ, le PNJ se tourne vers le joueur, et l'interaction part. */
  private talkTo(npcId: string): void {
    const npc = this.npcs.find((n) => n.npcId === npcId);
    if (!npc) return;
    this.player.halt();
    this.player.face(npc.x, npc.y);
    npc.face(this.player.x, this.player.y);
    this.bridge.interact(npcId);
  }

  /** Clic ou toucher : aller à la case, ou rejoindre et parler au PNJ visé. */
  private onPointer(worldX: number, worldY: number): void {
    if (this.bridge.isInputSuspended()) return;
    const size = this.map.tileSize;
    const tile = { x: Math.floor(worldX / size), y: Math.floor(worldY / size) };
    const from = { x: Math.floor(this.player.x / size), y: Math.floor((this.player.y - 2) / size) };
    const npc = this.npcs.find((n) => {
      const nx = Math.floor(n.x / size);
      const ny = Math.floor((n.y - 2) / size);
      return nx === tile.x && (ny === tile.y || ny - 1 === tile.y);
    });
    if (npc) {
      const target = { x: Math.floor(npc.x / size), y: Math.floor((npc.y - 2) / size) };
      const path = findPathToAdjacent(this.grid, from, target);
      if (path) this.player.followPath(path, () => this.talkTo(npc.npcId));
      return;
    }
    const path = findPath(this.grid, from, tile);
    if (path) this.player.followPath(path, null);
  }

  /** Texture recolorée d'un PNJ selon sa palette (créée une fois). */
  private npcTexture(npcId: string): string {
    const key = `npc-${npcId}`;
    if (this.textures.exists(key)) return key;
    const palette = servicesOf(this).content.npcs.get(npcId)?.palette;
    const source = this.textures.get(ASSET_KEYS.character).getSourceImage() as HTMLImageElement;
    if (!palette) return ASSET_KEYS.character;
    const canvas = this.textures.createCanvas(key, source.width, source.height);
    const ctx = canvas?.getContext();
    if (!canvas || !ctx) return ASSET_KEYS.character;
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, source.width, source.height);
    recolorPixels(image.data, paletteColorMap(palette));
    ctx.putImageData(image, 0, 0);
    // Découpe en images de 16 × 24, numérotées comme la feuille de sprites d'origine.
    const columns = Math.floor(source.width / 16);
    const rows = Math.floor(source.height / 24);
    for (let i = 0; i < columns * rows; i++)
      canvas.add(i, 0, (i % columns) * 16, Math.floor(i / columns) * 24, 16, 24);
    canvas.refresh();
    return key;
  }
}
