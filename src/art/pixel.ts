// Procedural pixel art: wizards, particles, icons and arenas. Pure canvas, no external assets.
import type { Element, WizardLook } from '../sim/types';
import { ELEMENT_INFO, MATERIAL_MAP } from '../sim/data/materials';

export const OUTLINE = 0x1a1020;

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
export function shade(c: number, f: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)) << s;
  return ch(16) | ch(8) | ch(0);
}

/** A tiny indexed pixel buffer. */
export class PixelBuf {
  w: number;
  h: number;
  px: (number | null)[];
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: number | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  circle(cx: number, cy: number, r: number, c: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  outline(c = OUTLINE) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x + 1, y) !== null || this.get(x - 1, y) !== null || this.get(x, y + 1) !== null || this.get(x, y - 1) !== null) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
  }
  toCanvas(scale = 1, alpha?: (c: number) => number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w * scale;
    cv.height = this.h * scale;
    const ctx = cv.getContext('2d')!;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (c === null) continue;
        ctx.globalAlpha = alpha ? alpha(c) : 1;
        ctx.fillStyle = hex(c);
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    return cv;
  }
}

export type Pose = 'idle0' | 'idle1' | 'cast' | 'hurt';

/** Side-view wizard facing right on a 26×34 grid. */
export function wizardBuf(look: WizardLook, pose: Pose = 'idle0'): PixelBuf {
  const b = new PixelBuf(26, 34);
  const robe = look.robe;
  const robeD = shade(robe, 0.7);
  const robeL = shade(robe, 1.25);
  const trim = look.trim;
  const skin = look.skin;
  const skinD = shade(skin, 0.8);
  const hair = look.hair;
  const lean = pose === 'hurt' ? -1 : 0;
  const bob = pose === 'idle1' ? 1 : 0;
  const top = 9 + bob;
  // robe body (trapezoid)
  for (let y = top + 6; y <= 32; y++) {
    const t = (y - (top + 6)) / (32 - (top + 6));
    const half = 3.5 + t * 4.5;
    const cx = 12 + lean * (1 - t);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const edge = x - (cx - half);
      b.set(x, y, edge < 2 ? robeD : edge > half * 2 - 2 ? robeL : robe);
    }
  }
  // hem trim & front trim
  for (let x = 4; x <= 20; x++) if (b.get(x, 32) !== null) b.set(x, 32, trim);
  for (let y = top + 7; y <= 31; y++) b.set(14 + lean, y, shade(trim, 0.9));
  // belt
  for (let x = 8; x <= 17; x++) if (b.get(x + lean, top + 12) !== null) b.set(x + lean, top + 12, shade(trim, 0.75));
  // head
  const hx = 10 + lean;
  const hy = top;
  b.rect(hx, hy, 6, 6, skin);
  b.rect(hx, hy + 4, 6, 2, skinD);
  b.set(hx + 4, hy + 2, OUTLINE); // eye
  b.set(hx + 6, hy + 3, skin); // nose
  b.rect(hx, hy, 2, 4, hair);
  // beard
  if (look.beard !== 'none') {
    const len = look.beard === 'short' ? 3 : look.beard === 'long' ? 8 : 7;
    for (let y = 0; y < len; y++) {
      const w = look.beard === 'braided' && y > 3 ? 2 : Math.max(2, 4 - Math.floor(y / 3));
      b.rect(hx + 5 - w, hy + 4 + y, w + 1, 1, y % 2 && look.beard === 'braided' ? shade(hair, 0.8) : hair);
    }
  }
  // hat
  const hatC = mix(robe, 0x000000, 0.15);
  const hatD = shade(hatC, 0.75);
  switch (look.hat) {
    case 'pointed':
      for (let y = 0; y < 8; y++) {
        const w = Math.max(1, Math.round((y + 1) * 0.9));
        b.rect(hx + 3 - Math.floor(w / 2) - Math.floor((7 - y) / 3), hy - 8 + y, w + 1, 1, y < 2 ? hatD : hatC);
      }
      b.rect(hx - 2, hy, 10, 1, hatD);
      b.rect(hx - 1, hy - 1, 8, 1, trim);
      break;
    case 'wide':
      b.rect(hx, hy - 4, 6, 4, hatC);
      b.rect(hx + 1, hy - 6, 4, 2, hatC);
      b.rect(hx - 4, hy, 14, 1, hatD);
      b.rect(hx, hy - 1, 6, 1, trim);
      break;
    case 'hood':
      b.rect(hx - 1, hy - 2, 8, 2, hatC);
      b.rect(hx - 1, hy, 2, 7, hatC);
      b.rect(hx - 2, hy - 1, 1, 8, hatD);
      b.rect(hx + 5, hy - 1, 2, 1, hatD);
      break;
    case 'crown':
      b.rect(hx, hy - 2, 6, 2, 0xd9b44a);
      b.set(hx, hy - 3, 0xd9b44a);
      b.set(hx + 2, hy - 3, 0xd9b44a);
      b.set(hx + 5, hy - 3, 0xd9b44a);
      b.set(hx + 3, hy - 1, 0xc9465a);
      b.rect(hx, hy, 2, 2, hair);
      break;
    case 'circlet':
      b.rect(hx, hy - 1, 6, 1, hair);
      b.rect(hx, hy, 6, 1, 0xc0c0d0);
      b.set(hx + 4, hy, 0x7fd8ff);
      break;
  }
  // arm + staff
  const casting = pose === 'cast';
  const sx = casting ? 21 : 20;
  const staffTop = casting ? 3 + bob : 6 + bob;
  b.line(sx, staffTop + 3, sx, 33, look.staff);
  b.line(sx + 1, staffTop + 4, sx + 1, 33, shade(look.staff, 0.7));
  b.circle(sx, staffTop + 1, 1, casting ? 0xffffff : trim);
  b.set(sx, staffTop + 1, casting ? 0xffffaa : shade(trim, 1.3));
  // sleeve reaching to staff
  const handY = casting ? top + 7 : top + 10;
  b.line(15 + lean, top + 8, sx - 1, handY, robe);
  b.line(15 + lean, top + 9, sx - 1, handY + 1, robeD);
  b.rect(sx - 1, handY, 2, 2, skin);
  b.outline();
  return b;
}

const wizCache = new Map<string, string>();
export function wizardDataUrl(look: WizardLook, scale = 4, pose: Pose = 'idle0'): string {
  const key = JSON.stringify(look) + scale + pose;
  const hit = wizCache.get(key);
  if (hit) return hit;
  const url = wizardBuf(look, pose).toCanvas(scale).toDataURL();
  wizCache.set(key, url);
  return url;
}

// ---------------- particles ----------------

export type ParticleKind = 'spark' | 'flame' | 'flake' | 'shard' | 'smoke' | 'drop' | 'rune' | 'pebble' | 'cog' | 'leaf' | 'dot' | 'ring' | 'star';

export function particleBuf(kind: ParticleKind, c: number, c2: number): PixelBuf {
  const b = new PixelBuf(9, 9);
  switch (kind) {
    case 'spark':
      b.line(4, 0, 4, 8, c);
      b.line(0, 4, 8, 4, c);
      b.set(4, 4, 0xffffff);
      b.set(3, 3, c2);
      b.set(5, 5, c2);
      break;
    case 'flame':
      b.circle(4, 5, 3, c);
      b.rect(3, 1, 3, 3, c);
      b.set(4, 0, c);
      b.circle(4, 6, 1, c2);
      break;
    case 'flake':
      b.line(4, 0, 4, 8, c);
      b.line(0, 4, 8, 4, c);
      b.line(1, 1, 7, 7, c2);
      b.line(7, 1, 1, 7, c2);
      b.set(4, 4, 0xffffff);
      break;
    case 'shard':
      b.line(2, 7, 6, 1, c);
      b.line(3, 7, 7, 1, c2);
      b.line(2, 6, 6, 0, c);
      break;
    case 'smoke':
      b.circle(4, 4, 3, c);
      b.circle(3, 3, 1, c2);
      break;
    case 'drop':
      b.circle(4, 5, 2, c);
      b.rect(4, 1, 1, 3, c);
      b.set(3, 4, c2);
      break;
    case 'rune':
      b.rect(1, 1, 7, 1, c);
      b.rect(1, 7, 7, 1, c);
      b.line(1, 1, 7, 7, c2);
      b.rect(4, 1, 1, 7, c);
      break;
    case 'pebble':
      b.rect(2, 3, 5, 4, c);
      b.rect(3, 2, 3, 6, c);
      b.set(3, 3, c2);
      break;
    case 'cog':
      b.circle(4, 4, 3, c);
      b.circle(4, 4, 1, null as unknown as number);
      b.set(4, 0, c);
      b.set(4, 8, c);
      b.set(0, 4, c);
      b.set(8, 4, c);
      b.set(4, 4, c2);
      break;
    case 'leaf':
      b.line(1, 7, 7, 1, c2);
      b.circle(4, 4, 2, c);
      b.set(6, 2, c);
      b.set(2, 6, c);
      break;
    case 'dot':
      b.circle(4, 4, 2, c);
      b.set(4, 4, c2);
      break;
    case 'ring':
      for (let a = 0; a < 24; a++) b.set(4 + Math.cos((a / 24) * Math.PI * 2) * 4, 4 + Math.sin((a / 24) * Math.PI * 2) * 4, c);
      break;
    case 'star':
      b.line(4, 1, 4, 7, c);
      b.line(1, 4, 7, 4, c);
      b.set(4, 4, c2);
      break;
  }
  return b;
}

// ---------------- icons ----------------

const iconCache = new Map<string, string>();

export function elementIconBuf(el: Element): PixelBuf {
  const { color: c, color2: c2 } = ELEMENT_INFO[el];
  const b = new PixelBuf(12, 12);
  switch (el) {
    case 'fire':
      b.circle(6, 7, 4, c);
      b.rect(5, 1, 3, 4, c);
      b.rect(3, 3, 2, 3, c);
      b.circle(6, 8, 2, c2);
      break;
    case 'frost':
      b.line(6, 0, 6, 11, c);
      b.line(1, 3, 11, 8, c);
      b.line(1, 8, 11, 3, c);
      b.circle(6, 6, 1, c2);
      break;
    case 'storm':
      b.line(7, 0, 3, 6, c2);
      b.line(3, 6, 8, 6, c2);
      b.line(8, 6, 4, 11, c2);
      b.line(8, 0, 4, 6, c);
      break;
    case 'shadow':
      b.circle(6, 6, 5, c);
      b.circle(8, 5, 4, null as unknown as number);
      b.set(3, 5, c2);
      break;
    case 'venom':
      b.circle(6, 7, 4, c);
      b.rect(6, 1, 1, 4, c);
      b.rect(5, 3, 3, 2, c);
      b.set(4, 6, c2);
      b.set(5, 8, c2);
      break;
    case 'arcane':
      b.line(6, 0, 6, 11, c);
      b.line(0, 6, 11, 6, c);
      b.line(2, 2, 10, 10, c2);
      b.line(10, 2, 2, 10, c2);
      b.circle(6, 6, 1, 0xffffff);
      break;
    case 'earth':
      b.rect(2, 5, 8, 5, c);
      b.rect(3, 3, 6, 3, c);
      b.rect(4, 2, 3, 1, c);
      b.rect(3, 7, 3, 2, c2);
      break;
    case 'chrono':
      b.rect(3, 0, 6, 1, c);
      b.rect(3, 11, 6, 1, c);
      b.line(3, 1, 6, 5, c2);
      b.line(8, 1, 6, 5, c2);
      b.line(6, 6, 3, 10, c);
      b.line(6, 6, 8, 10, c);
      b.rect(4, 9, 4, 2, c2);
      break;
    case 'life':
      b.circle(6, 5, 3, c);
      b.line(6, 7, 6, 11, c2);
      b.line(2, 9, 6, 11, c);
      b.line(10, 9, 6, 11, c);
      break;
  }
  b.outline();
  return b;
}

export function elementIcon(el: Element, scale = 2): string {
  const k = `el|${el}|${scale}`;
  let u = iconCache.get(k);
  if (!u) {
    u = elementIconBuf(el).toCanvas(scale).toDataURL();
    iconCache.set(k, u);
  }
  return u;
}

/** Material icon derived from tags + element. */
export function materialIcon(id: string, scale = 3): string {
  const k = `mat|${id}|${scale}`;
  const hit = iconCache.get(k);
  if (hit) return hit;
  const m = MATERIAL_MAP[id];
  const el = m?.element ?? 'arcane';
  const { color: c, color2: c2 } = ELEMENT_INFO[el];
  const tag = m?.tags[0] ?? 'mineral';
  const b = new PixelBuf(14, 14);
  const d = shade(c, 0.65);
  switch (tag) {
    case 'plant':
    case 'fungus':
      if (tag === 'fungus') {
        b.circle(7, 5, 4, c);
        b.rect(3, 6, 9, 2, d);
        b.rect(6, 7, 3, 5, 0xe0d0b0);
        b.set(5, 3, c2);
        b.set(8, 4, c2);
      } else {
        b.line(7, 13, 7, 4, 0x4a6a2a);
        b.circle(4, 6, 2, c);
        b.circle(10, 5, 2, c);
        b.circle(7, 3, 2, c2);
      }
      break;
    case 'mineral':
    case 'glass':
      b.line(7, 1, 3, 7, c2);
      for (let y = 1; y < 13; y++) {
        const w = y < 7 ? y : 13 - y;
        b.rect(7 - Math.floor(w / 2), y, w, 1, y < 7 ? c : d);
      }
      b.set(6, 4, 0xffffff);
      break;
    case 'beast':
    case 'draconic':
      for (let i = 0; i < 3; i++) b.circle(4 + i * 3, 6 + (i % 2) * 2, 3, i % 2 ? d : c);
      b.set(5, 5, c2);
      b.set(8, 7, c2);
      break;
    case 'feather':
      b.line(2, 12, 11, 2, 0xe8e0d0);
      for (let i = 0; i < 7; i++) {
        b.line(3 + i, 11 - i, 1 + i, 7 - i, c);
        b.line(4 + i, 11 - i, 7 + i, 12 - i, d);
      }
      break;
    case 'rune':
      b.rect(2, 2, 10, 10, 0x8a7a6a);
      b.rect(3, 3, 8, 8, 0xa89880);
      b.line(5, 4, 5, 9, c);
      b.line(5, 4, 9, 6, c);
      b.line(5, 7, 9, 9, c2);
      break;
    case 'metal':
      b.rect(2, 6, 10, 5, c);
      b.rect(3, 4, 8, 2, shade(c, 1.2));
      b.rect(3, 9, 8, 2, d);
      b.set(4, 5, 0xffffff);
      break;
    case 'celestial':
    case 'rebirth':
      b.line(7, 0, 7, 13, c2);
      b.line(0, 7, 13, 7, c2);
      b.circle(7, 7, 3, c);
      b.set(7, 7, 0xffffff);
      b.set(4, 4, c2);
      b.set(10, 10, c2);
      break;
    case 'ink':
      b.rect(4, 5, 6, 7, c);
      b.rect(5, 2, 4, 3, 0xd0c0a0);
      b.rect(5, 8, 2, 2, c2);
      break;
    case 'cloth':
      b.rect(2, 3, 10, 8, c);
      b.line(2, 5, 11, 5, c2);
      b.line(2, 8, 11, 8, d);
      break;
    case 'wood':
      b.rect(2, 4, 10, 6, 0x6a4a2a);
      b.circle(11, 7, 3, 0xa07a4a);
      b.set(11, 7, c);
      b.line(3, 6, 9, 6, c);
      break;
    default:
      b.circle(7, 7, 4, c);
  }
  b.outline();
  const u = b.toCanvas(scale).toDataURL();
  iconCache.set(k, u);
  return u;
}

/** Component icon: a rune-bound orb tinted by elements with generation pips. */
export function componentIcon(el: Element, secondary: Element | undefined, gen: number, scale = 3): string {
  const k = `cmp|${el}|${secondary}|${gen}|${scale}`;
  const hit = iconCache.get(k);
  if (hit) return hit;
  const c = ELEMENT_INFO[el].color;
  const c2 = secondary ? ELEMENT_INFO[secondary].color : ELEMENT_INFO[el].color2;
  const b = new PixelBuf(14, 14);
  b.circle(7, 6, 5, shade(c, 0.6));
  b.circle(7, 6, 4, c);
  for (let y = 3; y <= 9; y++) for (let x = 7; x <= 11; x++) if (b.get(x, y) === c) b.set(x, y, c2);
  b.set(5, 4, 0xffffff);
  b.set(6, 3, 0xffffff);
  for (let i = 0; i < Math.min(gen, 6); i++) b.set(2 + i * 2, 13, 0xd9b44a);
  b.outline();
  const u = b.toCanvas(scale).toDataURL();
  iconCache.set(k, u);
  return u;
}

export function equipIcon(slot: string, tier: number, accent: number, scale = 3): string {
  const k = `eq|${slot}|${tier}|${accent}|${scale}`;
  const hit = iconCache.get(k);
  if (hit) return hit;
  const b = new PixelBuf(14, 14);
  const wood = tier >= 3 ? 0xc0c0d0 : 0x7a5a3a;
  switch (slot) {
    case 'wand':
      b.line(2, 12, 11, 3, wood);
      b.line(3, 12, 12, 3, shade(wood, 0.7));
      b.circle(11, 3, 1, accent);
      break;
    case 'core':
      b.circle(7, 7, 4, accent);
      b.circle(7, 7, 2, 0xffffff);
      b.set(7, 7, accent);
      break;
    case 'robe':
      for (let y = 2; y < 13; y++) b.rect(7 - Math.floor(y / 3) - 2, y, Math.floor(y / 3) * 2 + 5, 1, y === 12 ? 0xd9b44a : accent);
      b.rect(5, 1, 5, 2, shade(accent, 0.8));
      break;
    case 'relic':
      b.circle(7, 8, 4, 0xd9b44a);
      b.circle(7, 8, 2, accent);
      b.line(7, 1, 7, 4, 0xa08060);
      break;
  }
  b.outline();
  const u = b.toCanvas(scale).toDataURL();
  iconCache.set(k, u);
  return u;
}

// ---------------- arenas ----------------

export interface ArenaTheme {
  wall: number;
  wall2: number;
  floor: number;
  floor2: number;
  window: number;
  glow: number;
  banner: number;
  accent: number;
  feature: 'cellar' | 'lantern' | 'ivy' | 'bells' | 'stars' | 'books' | 'spire' | 'crimson' | 'ancient';
  name: string;
}

export const ARENAS: ArenaTheme[] = [
  { name: 'The Cellar Circle', wall: 0x3a3028, wall2: 0x2a221c, floor: 0x4a3a2a, floor2: 0x3a2c20, window: 0x6a8aa8, glow: 0xffb050, banner: 0x7a5a3a, accent: 0xd9a050, feature: 'cellar' },
  { name: 'The Lantern Hall', wall: 0x4a3a30, wall2: 0x3a2a22, floor: 0x5a4030, floor2: 0x4a3224, window: 0x8ab0d8, glow: 0xffc060, banner: 0x8a2a2a, accent: 0xd9b44a, feature: 'lantern' },
  { name: 'The Ivy Cloister', wall: 0x3a4038, wall2: 0x2a302a, floor: 0x4a4a3a, floor2: 0x3a3a2c, window: 0x9ad0b0, glow: 0xfff0a0, banner: 0x2a5a3a, accent: 0x7fae6b, feature: 'ivy' },
  { name: 'The Bell Tower', wall: 0x2a3448, wall2: 0x1e2636, floor: 0x3a3a48, floor2: 0x2c2c38, window: 0x5a7ab8, glow: 0xc0d8ff, banner: 0x2a3a6e, accent: 0x6ba3c9, feature: 'bells' },
  { name: 'The Starlit Observatory', wall: 0x2a2440, wall2: 0x1c1830, floor: 0x34304a, floor2: 0x28243a, window: 0x3a2a6a, glow: 0xd0b0ff, banner: 0x4a2a7a, accent: 0x8f7ad8, feature: 'stars' },
  { name: 'The Gilded Library', wall: 0x4a3420, wall2: 0x3a2818, floor: 0x5a3a20, floor2: 0x4a2e18, window: 0xd8c080, glow: 0xffe090, banner: 0x8a6a1a, accent: 0xd9b44a, feature: 'books' },
  { name: 'The Silent Spire', wall: 0x5a5a60, wall2: 0x48484e, floor: 0x6a6a70, floor2: 0x58585e, window: 0xe0e8f0, glow: 0xffffff, banner: 0x9a5a4a, accent: 0xd97a5a, feature: 'spire' },
  { name: 'The Crimson Conclave', wall: 0x3a1a1e, wall2: 0x2a1014, floor: 0x4a2024, floor2: 0x3a181c, window: 0xd86a5a, glow: 0xff8070, banner: 0x8a1a2a, accent: 0xc9465a, feature: 'crimson' },
  { name: 'The Hall of the Ancients', wall: 0x5a5040, wall2: 0x4a4234, floor: 0x6a5e48, floor2: 0x5a5040, window: 0xfff4d0, glow: 0xfff0c0, banner: 0xf2e6c9, accent: 0xd9b44a, feature: 'ancient' },
];

export function arenaFor(tier: number): ArenaTheme {
  return ARENAS[Math.min(tier, ARENAS.length - 1)];
}

/** 320×180 pixel arena background. */
export function arenaBuf(t: ArenaTheme, seed = 1): PixelBuf {
  const W = 320;
  const H = 180;
  const b = new PixelBuf(W, H);
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // wall bricks
  for (let y = 0; y < 132; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor(y / 8);
      const off = row % 2 ? 8 : 0;
      const mortar = y % 8 === 0 || (x + off) % 16 === 0;
      const n = rnd() * 0.08;
      b.set(x, y, mortar ? shade(t.wall2, 0.8) : shade(row % 3 === 0 ? t.wall : mix(t.wall, t.wall2, 0.4), 0.95 + n));
    }
  // vignette top
  for (let y = 0; y < 30; y++) for (let x = 0; x < W; x++) b.set(x, y, shade(b.get(x, y)!, 0.55 + y / 70));
  // arched windows
  const wins = [40, 110, 210, 280];
  for (const wx of wins) {
    for (let y = 22; y < 92; y++)
      for (let x = -12; x <= 12; x++) {
        const archY = 34 - Math.sqrt(Math.max(0, 144 - x * x));
        if (y < archY + 22 - 12) continue;
        const inner = Math.abs(x) <= 10 && y > archY + 22 - 10 && y < 90;
        if (inner) {
          const pane = (Math.abs(x) % 5 === 0 || y % 10 === 0) ? shade(t.wall2, 0.6) : mix(t.window, 0x000000, 0.2 + (y - 22) / 200);
          b.set(wx + x, y, pane);
        } else b.set(wx + x, y, shade(t.wall2, 0.7));
      }
    // soft shaft of window light
    for (let y = 92; y < 132; y++)
      for (let x = -11; x <= 11; x++) {
        const px = wx + x + Math.floor((y - 92) / 4);
        const c = b.get(px, y);
        if (c !== null) b.set(px, y, mix(c, t.window, 0.07 * (1 - (y - 92) / 50)));
      }
  }
  if (t.feature === 'stars' || t.feature === 'bells')
    for (const wx of wins) for (let i = 0; i < 6; i++) b.set(wx - 8 + rnd() * 16, 40 + rnd() * 40, 0xffffff);
  // banners between windows
  for (const bx of [75, 160, 245]) {
    b.rect(bx - 7, 18, 15, 46, t.banner);
    b.rect(bx - 7, 18, 15, 2, t.accent);
    for (let x = -7; x <= 7; x++) for (let y = 0; y < 6; y++) if (Math.abs(x) + y > 7) continue; else b.set(bx + x, 64 + y, t.banner);
    b.circle(bx, 38, 4, t.accent);
    b.circle(bx, 38, 2, shade(t.banner, 0.7));
  }
  // features
  if (t.feature === 'ivy' || t.feature === 'ancient')
    for (let i = 0; i < 400; i++) {
      const x = rnd() * W;
      const y = 10 + rnd() * rnd() * 110;
      b.set(x, y, rnd() < 0.5 ? 0x3a6a2a : 0x5a8a3a);
    }
  if (t.feature === 'books') {
    for (let s = 0; s < 4; s++) {
      const y0 = 96 + s * 9;
      for (let x = 0; x < W; x++) {
        if (x > 18 && x < 62) continue;
        if (x > 258 && x < 302) continue;
        if (x > 88 && x < 232) continue;
        b.set(x, y0 + 8, 0x3a2414);
        if ((x * 7 + s * 13) % 5 !== 0) for (let y = y0; y < y0 + 8; y++) b.set(x, y, [0x8a2a2a, 0x2a4a6a, 0x5a6a2a, 0x8a6a2a, 0x4a2a5a][Math.floor((x + s * 3) / 3) % 5]);
      }
    }
  }
  if (t.feature === 'crimson' || t.feature === 'spire')
    for (const px of [20, 300]) {
      b.rect(px - 6, 0, 12, 132, shade(t.wall, 1.15));
      b.rect(px - 6, 0, 2, 132, shade(t.wall, 0.8));
    }
  // floor
  for (let y = 132; y < H; y++)
    for (let x = 0; x < W; x++) {
      const depth = (y - 132) / 48;
      const tile = (Math.floor((x - W / 2) / (12 + depth * 18) + 100) + Math.floor((y - 132) / 6)) % 2;
      b.set(x, y, shade(tile ? t.floor : t.floor2, 0.75 + depth * 0.35));
    }
  for (let x = 0; x < W; x++) b.set(x, 132, shade(t.wall2, 0.5));
  // rune circle on floor
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    b.set(160 + Math.cos(rad) * 70, 156 + Math.sin(rad) * 14, mix(t.floor, t.accent, 0.35));
    b.set(160 + Math.cos(rad) * 62, 156 + Math.sin(rad) * 12, mix(t.floor, t.accent, 0.2));
  }
  return b;
}
