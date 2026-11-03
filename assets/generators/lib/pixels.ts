/**
 * Outils des générateurs d'assets : toile de pixels RGBA et encodeur PNG minimal
 * (zlib de Node, aucune dépendance). Les générateurs dessinent pixel par pixel, comme
 * dans un éditeur, pour un rendu net et reproductible.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';

/** Couleur RGBA (composantes de 0 à 255). */
export type Rgba = readonly [number, number, number, number];

/**
 * Convertit `#rrggbb` (ou `#rrggbbaa`) en RGBA.
 *
 * @param hex - Couleur hexadécimale.
 * @returns La couleur.
 */
export function rgba(hex: string): Rgba {
  const h = hex.replace('#', '');
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 255];
}

/**
 * Mélange une couleur vers une autre (`t` = 0 : la première, 1 : la seconde).
 *
 * @param a - Couleur de départ.
 * @param b - Couleur d'arrivée.
 * @param t - Proportion.
 * @returns La couleur `#rrggbb`.
 */
export function mix(a: string, b: string, t: number): string {
  const ca = rgba(a);
  const cb = rgba(b);
  const c = [0, 1, 2].map((i) => Math.round((ca[i] ?? 0) * (1 - t) + (cb[i] ?? 0) * t));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Assombrit une couleur (ombre teintée vers le bleu nuit, plus vivante que le noir). */
export function shade(hex: string, t: number): string {
  return mix(hex, '#141a2a', t);
}

/** Éclaircit une couleur (lumière légèrement chaude). */
export function light(hex: string, t: number): string {
  return mix(hex, '#fff6e0', t);
}

/** Toile de pixels RGBA. */
export class Canvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  /** Couleur d'un pixel (transparent hors de la toile). */
  get(x: number, y: number): Rgba {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0, this.data[i + 3] ?? 0];
  }

  /** Pose un pixel (mélange alpha si la couleur est translucide). */
  px(x: number, y: number, color: string | Rgba): this {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    const c = typeof color === 'string' ? rgba(color) : color;
    const i = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    const a = c[3] / 255;
    if (a >= 1) {
      this.data.set(c, i);
      return this;
    }
    const under = this.get(x, y);
    const outA = a + (under[3] / 255) * (1 - a);
    for (let k = 0; k < 3; k++) {
      const v = ((c[k] ?? 0) * a + (under[k] ?? 0) * (under[3] / 255) * (1 - a)) / (outA || 1);
      this.data[i + k] = Math.round(v);
    }
    this.data[i + 3] = Math.round(outA * 255);
    return this;
  }

  /** Rectangle plein, bornes incluses. */
  rect(x0: number, y0: number, x1: number, y1: number, color: string | Rgba): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, color);
    return this;
  }

  /** Ligne horizontale. */
  hline(x0: number, x1: number, y: number, color: string | Rgba): this {
    return this.rect(x0, y, x1, y, color);
  }

  /** Ligne verticale. */
  vline(x: number, y0: number, y1: number, color: string | Rgba): this {
    return this.rect(x, y0, x, y1, color);
  }

  /** Ellipse pleine (centre, rayons), avec un filtre facultatif par pixel. */
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string | Rgba,
    keep: (x: number, y: number) => boolean = () => true,
  ): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && keep(x, y)) this.px(x, y, color);
      }
    }
    return this;
  }

  /** Vrai si le pixel est (au moins en partie) opaque. */
  filled(x: number, y: number): boolean {
    return this.get(x, y)[3] > 0;
  }

  /**
   * Contour : chaque pixel transparent voisin d'un pixel opaque prend la couleur donnée
   * (contour « pixel art » d'un sprite).
   */
  outline(color: string): this {
    const marks: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.filled(x, y)) continue;
        if (
          this.filled(x - 1, y) ||
          this.filled(x + 1, y) ||
          this.filled(x, y - 1) ||
          this.filled(x, y + 1)
        )
          marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.px(x, y, color);
    return this;
  }

  /** Copie une autre toile à la position donnée (pixels transparents ignorés). */
  paste(src: Canvas, ox: number, oy: number): this {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(x, y);
        if (c[3] > 0) this.px(ox + x, oy + y, c);
      }
    }
    return this;
  }

  /** Copie retournée horizontalement. */
  flipped(): Canvas {
    const out = new Canvas(this.width, this.height);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) out.px(this.width - 1 - x, y, this.get(x, y));
    return out;
  }

  /** Encode la toile en PNG. */
  toPng(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }

  /** Écrit la toile en PNG (dossiers créés au besoin). */
  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, this.toPng());
  }
}

/** Table CRC-32 des blocs PNG. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 d'un tampon. */
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Bloc PNG (longueur, type, données, CRC). */
function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 4), body, crc]);
}

/**
 * Encode une image RGBA 8 bits en PNG (filtre « aucun », compression zlib maximale).
 *
 * @param width - Largeur.
 * @param height - Hauteur.
 * @param rgbaData - Pixels, 4 octets chacun.
 * @returns Le fichier PNG.
 */
export function encodePng(width: number, height: number, rgbaData: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgbaData.buffer, rgbaData.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

/**
 * Générateur pseudo-aléatoire à graine (mulberry32) : les assets générés sont
 * identiques d'une exécution à l'autre.
 *
 * @param seed - Graine.
 * @returns Une fonction qui renvoie un nombre dans [0, 1[.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
