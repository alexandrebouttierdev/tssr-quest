import Phaser from 'phaser';
import { ASSET_KEYS, DEPTH } from '../keys';
import type { MapObject } from './map-loader';
import { parseHex } from './recolor';

/** Paramètres d'une source de lumière (calque `lumieres` de Tiled). */
export interface LightSpec {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly radius: number;
  readonly intensity: number;
  readonly flicker: boolean;
  /** Lumière qui pulse lentement (gyrophare, alerte). */
  readonly pulse: boolean;
}

/** Teinte d'ambiance d'une pièce (zone `ambiance` de la carte). */
export interface AmbienceSpec {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tint: number;
}

/**
 * Lit une zone d'ambiance de la carte.
 *
 * @param object - Objet `ambiance` du calque `zones`.
 * @returns La zone et sa teinte, ou `null` sans teinte valide.
 */
export function ambienceFromObject(object: MapObject): AmbienceSpec | null {
  const tint = object.properties['tint'];
  if (typeof tint !== 'string' || !/^#[0-9a-f]{6}$/i.test(tint)) return null;
  return {
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    tint: parseHex(tint),
  };
}

/**
 * Lit une lumière d'un objet Tiled, avec des valeurs par défaut raisonnables.
 *
 * @param object - Objet du calque `lumieres`.
 * @returns La lumière.
 */
export function lightFromObject(object: MapObject): LightSpec {
  const p = object.properties;
  return {
    x: object.x,
    y: object.y,
    color: typeof p['color'] === 'string' ? parseHex(p['color']) : 0xffffff,
    radius: typeof p['radius'] === 'number' ? p['radius'] : 48,
    intensity: typeof p['intensity'] === 'number' ? p['intensity'] : 0.6,
    flicker: p['flicker'] === true,
    pulse: p['pulse'] === true,
  };
}

/** Crée les petites textures d'effets (halo, poussière, LED) une seule fois par jeu. */
export function createFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(ASSET_KEYS.light)) {
    const canvas = scene.textures.createCanvas(ASSET_KEYS.light, 128, 128);
    const ctx = canvas?.getContext();
    if (canvas && ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      canvas.refresh();
    }
  }
  if (!scene.textures.exists(ASSET_KEYS.dust)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
    g.generateTexture(ASSET_KEYS.dust, 1, 1);
    g.destroy();
  }
  if (!scene.textures.exists(ASSET_KEYS.led)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 1);
    g.generateTexture(ASSET_KEYS.led, 2, 1);
    g.destroy();
  }
}

/**
 * Pose l'éclairage : une teinte multipliée par pièce (salle serveurs froide, coin pause
 * chaud), ou un voile uniforme si la carte n'en décrit pas, puis des halos additifs
 * (néons, LED, écrans, lampes) qui grésillent ou pulsent au besoin.
 *
 * @param scene - Scène du monde.
 * @param width - Largeur de la carte (px).
 * @param height - Hauteur de la carte (px).
 * @param ambient - Luminosité ambiante de 0 (nuit noire) à 1 (plein jour).
 * @param lights - Sources de lumière.
 * @param reducedMotion - Coupe le scintillement et les pulsations.
 * @param ambiences - Teintes des pièces.
 */
export function createLighting(
  scene: Phaser.Scene,
  width: number,
  height: number,
  ambient: number,
  lights: readonly LightSpec[],
  reducedMotion: boolean,
  ambiences: readonly AmbienceSpec[] = [],
): void {
  if (ambiences.length === 0) {
    const shadeValue = Math.round(255 * ambient);
    const shadeColor = Phaser.Display.Color.GetColor(
      Math.round(shadeValue * 0.82),
      Math.round(shadeValue * 0.88),
      shadeValue,
    );
    scene.add
      .rectangle(0, 0, width, height, shadeColor)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.darkness);
  }
  for (const zone of ambiences) {
    scene.add
      .rectangle(zone.x, zone.y, zone.width, zone.height, zone.tint)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.darkness);
  }
  for (const light of lights) {
    const halo = scene.add
      .image(light.x, light.y, ASSET_KEYS.light)
      .setTint(light.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(light.intensity)
      .setScale((light.radius * 2) / 128)
      .setDepth(DEPTH.glow);
    if (reducedMotion) continue;
    if (light.flicker) {
      scene.tweens.add({
        targets: halo,
        alpha: { from: light.intensity, to: light.intensity * 0.35 },
        duration: 90,
        yoyo: true,
        repeat: -1,
        repeatDelay: 2600,
        ease: 'Stepped',
      });
    }
    if (light.pulse) {
      scene.tweens.add({
        targets: halo,
        alpha: { from: light.intensity, to: light.intensity * 0.15 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}

/**
 * Poussière en suspension dans le flux de la climatisation (docs/07).
 *
 * @param scene - Scène du monde.
 * @param area - Zone d'émission.
 */
export function createDust(scene: Phaser.Scene, area: Phaser.Geom.Rectangle): void {
  scene.add
    .particles(0, 0, ASSET_KEYS.dust, {
      emitZone: { type: 'random', source: area, quantity: 1 },
      lifespan: { min: 4000, max: 8000 },
      speedX: { min: -6, max: 3 },
      speedY: { min: -4, max: 2 },
      alpha: { start: 0, end: 0, ease: (t: number) => Math.sin(t * Math.PI) * 0.35 },
      tint: [0xa8e4f5, 0xc9d1d9],
      frequency: 140,
      maxAliveParticles: 70,
    })
    .setDepth(DEPTH.glow);
}

/**
 * Applique bloom léger et vignettage sur la caméra (WebGL uniquement).
 *
 * @param scene - Scène du monde.
 * @param bloom - Réglage « bloom » des options.
 */
export function applyCameraFx(scene: Phaser.Scene, bloom: boolean): void {
  if (scene.game.renderer.type !== Phaser.WEBGL) return;
  const camera = scene.cameras.main;
  camera.postFX.clear();
  // Bloom discret : il fait baver les LED et les écrans, pas le décor.
  if (bloom) camera.postFX.addBloom(0xffffff, 1, 1, 0.5, 0.6, 4);
  // Vignettage discret : il habille les bords sans assombrir la zone de jeu.
  camera.postFX.addVignette(0.5, 0.5, 1.05, 0.08);
}
