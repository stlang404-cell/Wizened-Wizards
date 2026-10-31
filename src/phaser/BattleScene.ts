// Phaser arena: replays a deterministic CombatResult. Visuals never decide outcomes.
import Phaser from 'phaser';
import type { CombatEvent, CombatResult, Frame } from '../sim/combat';
import type { CompiledSpell, StatusType, WizardLook } from '../sim/types';
import { arenaBuf, arenaFor, particleBuf, wizardBuf, type ParticleKind, PixelBuf, shade, hex } from '../art/pixel';
import { sfx } from '../art/audio';

export interface BattleData {
  result: CombatResult;
  spells: [CompiledSpell[], CompiledSpell[]];
  names: [string, string];
  looks: [WizardLook, WizardLook];
  tier: number;
  showDecisions: number | null; // fighter index whose decisions to show
  onEnd: () => void;
}

const W = 960;
const H = 540;
const GROUND = 430;
const sx = (x: number) => 90 + (x / 100) * 780;

interface Fx {
  until: number;
  update?: (t: number) => void;
  destroy: () => void;
}

interface Projectile {
  start: number;
  end: number;
  from: number;
  spell: CompiledSpell;
  objs: Phaser.GameObjects.GameObject[];
  offsetY: number;
  echo: boolean;
  passThrough: boolean;
  emitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  done?: boolean;
}

export class BattleScene extends Phaser.Scene {
  private d!: BattleData;
  private simT = 0;
  private speed = 1;
  private paused = false;
  private evIdx = 0;
  private ended = false;
  private sprites: Phaser.GameObjects.Image[] = [];
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  private wards: Phaser.GameObjects.Graphics[] = [];
  private hud!: Phaser.GameObjects.Graphics;
  private statusIcons: Phaser.GameObjects.Container[] = [];
  private projectiles: Projectile[] = [];
  private fx: Fx[] = [];
  private hurtUntil = [0, 0];
  private slowUntil = -1;
  private chargeEmitters: (Phaser.GameObjects.Particles.ParticleEmitter | null)[] = [null, null];
  private decisionText!: Phaser.GameObjects.Text;
  private decisionUntil = 0;
  private timeText!: Phaser.GameObjects.Text;
  private fallen = [false, false];

  constructor() {
    super('battle');
  }

  init(data: BattleData) {
    this.d = data;
    this.simT = 0;
    this.evIdx = 0;
    this.ended = false;
    this.projectiles = [];
    this.fx = [];
    this.fallen = [false, false];
  }

  setSpeed(s: number) {
    this.speed = s;
  }
  setPaused(p: boolean) {
    this.paused = p;
  }
  skipToEnd() {
    this.simT = this.d.result.duration + 0.5;
    while (this.evIdx < this.d.result.events.length) this.evIdx++;
    for (const p of this.projectiles) this.killProjectile(p);
    this.projectiles = [];
  }

  // ---------------- textures ----------------
  private tex(key: string, make: () => PixelBuf, scale = 3) {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, make().toCanvas(scale));
    return key;
  }
  private ptex(kind: ParticleKind, c: number, c2: number) {
    return this.tex(`p-${kind}-${c}-${c2}`, () => particleBuf(kind, c, c2), 2);
  }
  private lanceTex(c: number, c2: number) {
    return this.tex(`lance-${c}`, () => {
      const b = new PixelBuf(22, 6);
      for (let x = 0; x < 22; x++) {
        const h = x > 16 ? 22 - x : Math.min(2, Math.floor(x / 4));
        for (let y = 3 - h; y <= 2 + h; y++) b.set(x, y, x > 12 ? c2 : c);
      }
      b.set(21, 3, 0xffffff);
      return b;
    });
  }
  private orbTex(c: number, c2: number) {
    return this.tex(`orb-${c}-${c2}`, () => {
      const b = new PixelBuf(15, 15);
      b.circle(7, 7, 6, shade(c, 0.6));
      b.circle(7, 7, 5, c);
      b.circle(6, 6, 3, c2);
      b.set(5, 4, 0xffffff);
      b.set(4, 5, 0xffffff);
      return b;
    });
  }
  private cloudTex(c: number) {
    return this.tex(`cloud-${c}`, () => {
      const b = new PixelBuf(40, 14);
      for (const [x, y, r] of [[8, 8, 5], [16, 6, 6], [25, 7, 6], [32, 8, 5]]) b.circle(x, y, r, shade(c, 0.45));
      for (const [x, y, r] of [[14, 5, 4], [24, 5, 4]]) b.circle(x, y, r, shade(c, 0.6));
      return b;
    });
  }
  private glyphTex(c: number) {
    return this.tex(`glyph-${c}`, () => {
      const b = new PixelBuf(40, 12);
      for (let a = 0; a < 80; a++) {
        const r = (a / 80) * Math.PI * 2;
        b.set(20 + Math.cos(r) * 19, 6 + Math.sin(r) * 5, c);
        if (a % 10 === 0) b.set(20 + Math.cos(r) * 14, 6 + Math.sin(r) * 3.5, c);
      }
      b.line(8, 6, 32, 6, shade(c, 0.7));
      return b;
    });
  }

  create() {
    const d = this.d;
    const theme = arenaFor(d.tier);
    this.tex(`arena-${d.tier}`, () => arenaBuf(theme, d.tier + 7), 3);
    this.add.image(0, 0, `arena-${d.tier}`).setOrigin(0, 0);
    // candles
    for (const cx of [30, 150, 810, 930]) {
      this.add.rectangle(cx, GROUND + 30, 8, 22, 0xe8dcc0).setOrigin(0.5, 1);
      const flame = this.add.image(cx, GROUND + 4, this.ptex('flame', 0xffb050, 0xfff0a0)).setScale(1.6);
      this.tweens.add({ targets: flame, scaleY: 2, scaleX: 1.3, alpha: 0.75, duration: 180 + Math.random() * 120, yoyo: true, repeat: -1 });
      const glow = this.add.circle(cx, GROUND + 2, 26, theme.glow, 0.08);
      this.tweens.add({ targets: glow, alpha: 0.14, duration: 400, yoyo: true, repeat: -1 });
    }
    // drifting motes
    this.add.particles(0, 0, this.ptex('dot', theme.glow, 0xffffff), {
      x: { min: 0, max: W },
      y: { min: 60, max: GROUND },
      lifespan: 6000,
      speedY: { min: -8, max: -2 },
      speedX: { min: -4, max: 4 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.35, end: 0 },
      frequency: 260,
    });
    // fighters
    for (let i = 0; i < 2; i++) {
      for (const pose of ['idle0', 'idle1', 'cast', 'hurt'] as const) this.tex(`wiz${i}-${pose}-${JSON.stringify(d.looks[i])}`, () => wizardBuf(d.looks[i], pose), 4);
      this.shadows.push(this.add.ellipse(0, GROUND + 2, 90, 16, 0x000000, 0.35));
      const sp = this.add.image(0, GROUND, this.wizKey(i, 'idle0')).setOrigin(0.5, 1);
      if (i === 1) sp.setFlipX(true);
      this.sprites.push(sp);
      this.wards.push(this.add.graphics());
      this.statusIcons.push(this.add.container(0, 0));
    }
    this.hud = this.add.graphics().setDepth(50);
    const font = { fontFamily: '"Pixelify Sans", monospace', fontSize: '18px', color: '#f2e6c9', stroke: '#1a1020', strokeThickness: 4 };
    this.add.text(24, 12, d.names[0], font).setDepth(51);
    this.add.text(W - 24, 12, d.names[1], font).setOrigin(1, 0).setDepth(51);
    this.timeText = this.add.text(W / 2, 14, '0', { ...font, fontSize: '22px', color: '#d9b44a' }).setOrigin(0.5, 0).setDepth(51);
    this.decisionText = this.add
      .text(W / 2, H - 26, '', { ...font, fontSize: '15px', color: '#cfe3ff', backgroundColor: '#1a1020cc', padding: { x: 8, y: 3 } })
      .setOrigin(0.5, 1)
      .setDepth(60)
      .setAlpha(0);
    this.applyFrame(this.frameAt(0));
  }

  private wizKey(i: number, pose: string) {
    return `wiz${i}-${pose}-${JSON.stringify(this.d.looks[i])}`;
  }

  private frameAt(t: number): { f: Frame; n: Frame; a: number } {
    const fr = this.d.result.frames;
    const i = Math.min(fr.length - 1, Math.max(0, Math.floor(t / 0.1)));
    const n = fr[Math.min(fr.length - 1, i + 1)];
    return { f: fr[i], n, a: Math.min(1, Math.max(0, t / 0.1 - i)) };
  }

  private pos(i: number): { x: number; y: number } {
    const sp = this.sprites[i];
    return { x: sp.x, y: sp.y - 62 };
  }

  private staffTip(i: number) {
    const sp = this.sprites[i];
    return { x: sp.x + (i === 0 ? 30 : -30), y: sp.y - 108 };
  }

  update(_time: number, delta: number) {
    if (!this.d) return;
    const dt = delta / 1000;
    if (!this.paused) {
      let rate = this.speed;
      if (this.simT < this.slowUntil) rate *= 0.3;
      this.simT += dt * rate;
    }
    const t = this.simT;
    const evs = this.d.result.events;
    while (this.evIdx < evs.length && evs[this.evIdx].t <= t) this.onEvent(evs[this.evIdx++]);
    const fr = this.frameAt(Math.min(t, this.d.result.duration));
    this.applyFrame(fr);
    this.updateProjectiles(t);
    this.fx = this.fx.filter((f) => {
      if (t >= f.until) {
        f.destroy();
        return false;
      }
      f.update?.(t);
      return true;
    });
    if (this.decisionUntil < t) this.decisionText.setAlpha(Math.max(0, this.decisionText.alpha - dt * 2));
    this.timeText.setText(`${Math.min(t, this.d.result.duration).toFixed(0)}s`);
    if (!this.ended && t >= this.d.result.duration + 1.4) {
      this.ended = true;
      this.d.onEnd();
    }
  }

  private applyFrame({ f, n, a }: { f: Frame; n: Frame; a: number }) {
    const r = this.d.result;
    this.hud.clear();
    for (let i = 0; i < 2; i++) {
      const ff = f.f[i];
      const nf = n.f[i];
      const x = sx(ff.x + (nf.x - ff.x) * a);
      const sp = this.sprites[i];
      if (!this.fallen[i]) {
        sp.x = x;
        const hurt = this.simT < this.hurtUntil[i];
        const pose = hurt ? 'hurt' : ff.cast >= 0 ? 'cast' : Math.floor(this.simT * 2.5 + i) % 2 ? 'idle1' : 'idle0';
        sp.setTexture(this.wizKey(i, pose));
        if (ff.st.includes('frozen')) sp.setTint(0x9ad8ff);
        else if (hurt) sp.setTint(0xff9a9a);
        else if (ff.st.includes('poison')) sp.setTint(0xc8ffb0);
        else if (ff.st.includes('burn')) sp.setTint(0xffd0a0);
        else sp.clearTint();
      }
      this.shadows[i].x = sp.x;
      // ward bubble
      const g = this.wards[i];
      g.clear();
      if (ff.shield > 0 && !this.fallen[i]) {
        const str = Math.min(1, ff.shield / 300);
        g.lineStyle(3, 0xbfe0ff, 0.35 + str * 0.45);
        g.fillStyle(0x8ac8ff, 0.08 + str * 0.12);
        g.fillEllipse(sp.x, sp.y - 66, 132, 156);
        g.strokeEllipse(sp.x, sp.y - 66, 132, 156);
        g.lineStyle(1, 0xffffff, 0.25);
        for (let k = 0; k < 6; k++) {
          const ang = this.simT * 0.8 + (k * Math.PI) / 3;
          g.lineBetween(sp.x + Math.cos(ang) * 50, sp.y - 66 + Math.sin(ang) * 60, sp.x + Math.cos(ang + 0.6) * 58, sp.y - 66 + Math.sin(ang + 0.6) * 70);
        }
      }
      // statuses
      this.drawStatuses(i, ff.st, sp.x, sp.y - 156);
      // HUD bars
      const left = i === 0;
      const bx = left ? 24 : W - 24 - 300;
      const hpPct = Math.max(0, ff.hp / r.maxHp[i]);
      const mpPct = Math.max(0, ff.mana / r.maxMana[i]);
      this.hud.fillStyle(0x1a1020, 0.85).fillRect(bx - 3, 38, 306, 36);
      this.hud.fillStyle(0x3a1a1a).fillRect(bx, 41, 300, 16);
      this.hud.fillStyle(hpPct > 0.35 ? 0x5ad070 : 0xe05a4a).fillRect(left ? bx : bx + 300 * (1 - hpPct), 41, 300 * hpPct, 16);
      this.hud.fillStyle(0xffffff, 0.18).fillRect(bx, 41, 300, 4);
      if (ff.shield > 0) this.hud.fillStyle(0xbfe0ff, 0.85).fillRect(left ? bx : bx + 300 - Math.min(300, (300 * ff.shield) / r.maxHp[i]), 41, Math.min(300, (300 * ff.shield) / r.maxHp[i]), 5);
      this.hud.fillStyle(0x1a1a3a).fillRect(bx, 60, 300, 10);
      this.hud.fillStyle(0x58a8ff).fillRect(left ? bx : bx + 300 * (1 - mpPct), 60, 300 * mpPct, 10);
      // cast bar
      if (ff.cast >= 0 && !this.fallen[i]) {
        const spell = this.d.spells[i][ff.cast];
        const prog = Math.min(1, ff.prog + (nf.cast === ff.cast ? (nf.prog - ff.prog) * a : 0));
        this.hud.fillStyle(0x1a1020, 0.9).fillRect(sp.x - 40, GROUND + 14, 80, 9);
        this.hud.fillStyle(spell?.visual.primary ?? 0xffffff).fillRect(sp.x - 39, GROUND + 15, 78 * prog, 7);
      }
    }
  }

  private statusKey: string[] = ['', ''];
  private drawStatuses(i: number, st: StatusType[], x: number, y: number) {
    const c = this.statusIcons[i];
    c.setPosition(x, y);
    const key = st.join(',');
    if (key === this.statusKey[i]) return;
    this.statusKey[i] = key;
    c.removeAll(true);
    const ICON: Partial<Record<StatusType, [ParticleKind, number, number]>> = {
      burn: ['flame', 0xff6a2a, 0xffd25a],
      poison: ['drop', 0x7ee05a, 0x2e6b2a],
      chill: ['flake', 0x7fd8ff, 0xe8fbff],
      frozen: ['flake', 0xffffff, 0x7fd8ff],
      stun: ['star', 0xfff27a, 0xffffff],
      conductive: ['spark', 0xb98cff, 0xfff27a],
      vulnerable: ['rune', 0xc070ff, 0xffffff],
      blighted: ['smoke', 0x3a5a2a, 0x7ee05a],
      slowed: ['cog', 0xf0c75a, 0xfff4c8],
    };
    st.filter((s) => ICON[s]).forEach((s, k, arr) => {
      const [kind, c1, c2] = ICON[s]!;
      const img = this.add.image((k - (arr.length - 1) / 2) * 22, 0, this.ptex(kind, c1, c2)).setScale(1.3);
      c.add(img);
    });
    if (st.includes('frozen')) {
      const ice = this.add.rectangle(0, 92, 90, 130, 0xbfe8ff, 0.35).setStrokeStyle(2, 0xffffff, 0.7);
      c.add(ice);
    }
  }

  // ---------------- events ----------------
  private float(x: number, y: number, text: string, color: string, size = 20, rise = 50) {
    const t = this.add
      .text(x + (Math.random() * 20 - 10), y, text, { fontFamily: '"Pixelify Sans", monospace', fontSize: `${size}px`, color, stroke: '#1a1020', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: t, y: y - rise, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private burst(x: number, y: number, kind: ParticleKind, c: number, c2: number, n = 14, speed = 160, life = 500) {
    const e = this.add.particles(x, y, this.ptex(kind, c, c2), {
      speed: { min: speed * 0.3, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: life,
      scale: { start: 1.4, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      emitting: false,
    });
    e.setDepth(40);
    e.explode(n);
    this.time.delayedCall(life + 100, () => e.destroy());
  }

  private onEvent(e: CombatEvent) {
    switch (e.type) {
      case 'cast': {
        const s = this.d.spells[e.who][e.spell];
        if (!s) return;
        sfx.cast(s.element);
        const tip = this.staffTip(e.who);
        this.chargeEmitters[e.who]?.destroy();
        const em = this.add.particles(tip.x, tip.y, this.ptex(s.visual.particle, s.visual.primary, s.visual.glow), {
          speed: { min: 20, max: 60 },
          lifespan: 350,
          scale: { start: 0.2, end: 1.1 * s.visual.size },
          alpha: { start: 0, end: 0.9 },
          frequency: s.behavior === 'orbiting' ? 25 : 55,
          emitZone: s.behavior === 'orbiting' ? { type: 'edge', source: new Phaser.Geom.Circle(0, 0, 34), quantity: 24 } : undefined,
        } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig);
        em.setDepth(30);
        this.chargeEmitters[e.who] = em;
        const sp = this.sprites[e.who];
        const glyph = this.add.image(sp.x, GROUND + 4, this.glyphTex(s.visual.primary)).setAlpha(0).setDepth(5);
        this.tweens.add({ targets: glyph, alpha: 0.85, duration: 200 });
        this.fx.push({ until: e.t + e.dur + 0.1, update: () => (glyph.x = this.sprites[e.who].x), destroy: () => glyph.destroy() });
        break;
      }
      case 'release': {
        this.chargeEmitters[e.who]?.stop();
        const ce = this.chargeEmitters[e.who];
        if (ce) this.time.delayedCall(400, () => ce.destroy());
        this.chargeEmitters[e.who] = null;
        const s = this.d.spells[e.who][e.spell];
        if (!s) return;
        sfx.release(s.element);
        if (e.echo) this.float(this.staffTip(e.who).x, this.staffTip(e.who).y - 10, 'ECHO', hex(s.visual.glow), 16);
        this.spawnSpell(e.who, s, e.t, e.echo);
        break;
      }
      case 'hit': {
        const s = this.d.spells[e.who][e.spell];
        const target = 1 - e.who;
        this.landProjectile(e.who, e.spell, e.t);
        if (!s) return;
        const p = this.pos(target);
        this.impact(s, p.x, p.y, e.dmg + e.absorbed);
        if (e.dmg > 0) {
          this.float(p.x, p.y - 40, `${e.dmg}`, e.dmg >= 150 ? '#ffd25a' : '#ffffff', e.dmg >= 150 ? 30 : 22);
          this.hurtUntil[target] = this.simT + 0.15;
        }
        if (e.absorbed > 0) this.float(p.x + 30, p.y - 10, `(${e.absorbed})`, '#bfe0ff', 16);
        if (e.broke) {
          this.burst(p.x, p.y, 'shard', 0xbfe0ff, 0xffffff, 26, 260, 700);
          this.float(p.x, p.y - 80, 'WARD BROKEN', '#bfe0ff', 20);
          sfx.shatter();
        }
        if (e.shatter) {
          this.burst(p.x, p.y, 'shard', 0x7fd8ff, 0xffffff, 34, 320, 800);
          this.float(p.x, p.y - 100, 'SHATTER!', '#7fd8ff', 30, 70);
          this.cameras.main.shake(260, 0.012);
          sfx.shatter();
        }
        if (e.statuses.includes('frozen')) this.float(p.x, p.y - 90, 'FROZEN', '#bfe8ff', 22);
        if (e.statuses.includes('stun')) this.float(p.x, p.y - 90, 'STAGGERED', '#fff27a', 20);
        if (e.chain > 0) this.chainArcs(p.x, p.y, s, e.chain);
        if (s.lifesteal > 0 && e.dmg > 0) this.lifestealMotes(target, e.who, s);
        if (e.dmg + e.absorbed >= 150) this.cameras.main.shake(180, 0.006 + Math.min(0.01, (e.dmg + e.absorbed) / 40000));
        sfx.hit(s.element, e.dmg >= 150);
        if (s.linger) this.lingerField(target, s, e.t);
        break;
      }
      case 'dodge': {
        const sp = this.sprites[e.who];
        this.tweens.add({ targets: sp, y: GROUND - 34, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        this.float(sp.x, sp.y - 170, 'DODGE', '#cfe3ff', 20);
        sfx.dodge();
        const proj = this.projectiles.find((p) => p.from === 1 - e.who && !p.done);
        if (proj) proj.passThrough = true;
        this.landProjectile(1 - e.who, e.spell, e.t, true);
        break;
      }
      case 'interrupt': {
        this.chargeEmitters[e.who]?.destroy();
        this.chargeEmitters[e.who] = null;
        const p = this.pos(e.who);
        this.float(p.x, p.y - 90, 'INTERRUPTED', '#ff9a6a', 22);
        this.burst(this.staffTip(e.who).x, this.staffTip(e.who).y, 'spark', 0xff9a6a, 0xffffff, 12, 140);
        sfx.interrupt();
        break;
      }
      case 'shield': {
        const s = this.d.spells[e.who][e.spell];
        const sp = this.sprites[e.who];
        const ring = this.add.circle(sp.x, sp.y - 50, 20, s?.visual.primary ?? 0xbfe0ff, 0.4).setDepth(20);
        this.tweens.add({ targets: ring, radius: 70, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
        if (s) this.burst(sp.x, sp.y - 50, s.visual.particle, s.visual.primary, s.visual.glow, 14, 120);
        this.float(sp.x, sp.y - 150, `+${e.amount} ward`, '#bfe0ff', 18);
        sfx.shield();
        break;
      }
      case 'heal': {
        const s = this.d.spells[e.who][e.spell];
        const sp = this.sprites[e.who];
        const em = this.add.particles(sp.x, sp.y - 20, this.ptex('leaf', s?.visual.primary ?? 0x8affc0, 0xf2ffe0), {
          x: { min: -30, max: 30 },
          speedY: { min: -120, max: -60 },
          lifespan: 800,
          scale: { start: 1.2, end: 0 },
          alpha: { start: 1, end: 0 },
          quantity: 2,
          frequency: 30,
        });
        this.time.delayedCall(500, () => em.stop());
        this.time.delayedCall(1400, () => em.destroy());
        if (e.amount > 0) this.float(sp.x, sp.y - 150, `+${e.amount}`, '#8affc0', 22);
        sfx.heal();
        break;
      }
      case 'dot': {
        const p = this.pos(e.who);
        const col = e.kind === 'burn' ? '#ffb070' : e.kind === 'poison' ? '#9ef07a' : '#d0b0ff';
        this.float(p.x + 26, p.y - 20, `${e.dmg}`, col, 15, 30);
        break;
      }
      case 'backlash': {
        const p = this.pos(e.who);
        this.burst(this.staffTip(e.who).x, this.staffTip(e.who).y, 'spark', 0xff4a4a, 0xffd25a, 16, 180);
        this.float(p.x, p.y - 100, `BACKLASH ${e.dmg}`, '#ff6a6a', 18);
        break;
      }
      case 'phoenix': {
        const p = this.pos(e.who);
        this.burst(p.x, p.y, 'flame', 0xff6a2a, 0xffd25a, 40, 260, 900);
        this.float(p.x, p.y - 110, 'PHOENIX!', '#ffd25a', 30);
        break;
      }
      case 'collapse': {
        this.float(W / 2, 140, 'THE ARENA COLLAPSES', '#ff8070', 30, 30);
        this.add.particles(0, 0, this.ptex('pebble', 0x6a5a4a, 0x8a7a6a), {
          x: { min: 40, max: W - 40 },
          y: -10,
          speedY: { min: 120, max: 260 },
          lifespan: 2200,
          scale: { start: 1.3, end: 1 },
          frequency: 120,
        });
        const tint = this.add.rectangle(0, 0, W, H, 0x8a1a1a, 0).setOrigin(0).setDepth(45);
        this.tweens.add({ targets: tint, fillAlpha: 0.12, duration: 3000 });
        break;
      }
      case 'ko': {
        const sp = this.sprites[e.who];
        this.slowUntil = e.t + 1.0;
        this.fallen[e.who] = true;
        this.cameras.main.flash(300, 255, 240, 200);
        this.cameras.main.shake(400, 0.015);
        sp.setTint(0x777788);
        this.tweens.add({ targets: sp, angle: e.who === 0 ? -80 : 80, y: GROUND + 10, duration: 700, ease: 'Bounce.easeOut' });
        this.burst(sp.x, sp.y - 50, 'star', 0xd9b44a, 0xffffff, 30, 260, 1000);
        break;
      }
      case 'decision': {
        if (this.d.showDecisions !== e.who) return;
        this.decisionText.setText(`Grimoire › ${e.text}`).setAlpha(1);
        this.decisionUntil = e.t + 2.2;
        break;
      }
    }
  }

  // ---------------- spell visuals ----------------
  private spawnSpell(from: number, s: CompiledSpell, t: number, echo: boolean) {
    const v = s.visual;
    const to = 1 - from;
    if (s.kind === 'shield' || s.kind === 'heal') return; // handled by shield/heal events
    const tip = this.staffTip(from);
    const tgt = this.pos(to);
    const alpha = echo ? 0.55 : 1;
    if (s.travelTime <= 0) {
      if (s.delivery === 'beam') {
        const g = this.add.graphics().setDepth(35);
        const until = t + 0.3;
        this.fx.push({
          until,
          update: (now) => {
            const a = Math.max(0, (until - now) / 0.3);
            const p2 = this.pos(to);
            const tp = this.staffTip(from);
            g.clear();
            g.lineStyle(10 * v.size, v.primary, 0.35 * a * alpha);
            g.lineBetween(tp.x, tp.y, p2.x, p2.y);
            g.lineStyle(4 * v.size, v.glow, 0.9 * a * alpha);
            const segs = 8;
            g.beginPath();
            g.moveTo(tp.x, tp.y);
            for (let k = 1; k <= segs; k++) {
              const f = k / segs;
              g.lineTo(tp.x + (p2.x - tp.x) * f, tp.y + (p2.y - tp.y) * f + (k < segs ? (Math.random() - 0.5) * 10 * v.shimmer + Math.sin(now * 40 + k) * 2 : 0));
            }
            g.strokePath();
          },
          destroy: () => g.destroy(),
        });
      } else {
        // instant: a flash from the staff and a sigil over the foe
        const flash = this.add.circle(tip.x, tip.y, 14 * v.size, v.glow, 0.8 * alpha).setDepth(35);
        this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 220, onComplete: () => flash.destroy() });
      }
      if (s.form === 'hex') this.hexSigil(to, s, t);
      return;
    }
    if (s.delivery === 'rune') {
      const sp = this.sprites[to];
      const glyph = this.add.image(sp.x, GROUND + 4, this.glyphTex(v.primary)).setScale(0.3).setAlpha(alpha).setDepth(6);
      const until = t + s.travelTime;
      this.fx.push({ until, update: (now) => glyph.setScale(0.3 + 0.9 * ((now - t) / s.travelTime)).setRotation(Math.sin(now * 3) * 0.05), destroy: () => glyph.destroy() });
      this.projectiles.push({ start: t, end: until, from, spell: s, objs: [], offsetY: 0, echo, passThrough: false });
      return;
    }
    if (s.delivery === 'delayed' || s.form === 'storm') {
      const mark = this.add.image(tgt.x, tgt.y - 120, s.form === 'storm' ? this.cloudTex(v.primary) : this.ptex('ring', v.primary, v.glow)).setScale(s.form === 'storm' ? 1.1 : 3).setAlpha(0.2 * alpha).setDepth(36);
      const until = t + s.travelTime;
      this.fx.push({
        until,
        update: (now) => {
          const f = (now - t) / s.travelTime;
          mark.x = this.pos(to).x;
          mark.setAlpha((0.2 + f * 0.8) * alpha);
          if (s.form !== 'storm') mark.setRotation(now * 4).setScale(3 - f * 1.5);
        },
        destroy: () => mark.destroy(),
      });
      this.projectiles.push({ start: t, end: until, from, spell: s, objs: [], offsetY: 0, echo, passThrough: false });
      return;
    }
    // travelling projectile(s)
    const count = s.behavior === 'splitting' ? 3 : 1;
    for (let k = 0; k < count; k++) {
      const objs: Phaser.GameObjects.GameObject[] = [];
      let core: Phaser.GameObjects.Image;
      if (s.form === 'lance') core = this.add.image(tip.x, tip.y, this.lanceTex(v.primary, v.glow)).setScale(v.size * 1.1);
      else if (s.form === 'orb') core = this.add.image(tip.x, tip.y, this.orbTex(v.primary, v.glow)).setScale(v.size * 1.3);
      else core = this.add.image(tip.x, tip.y, this.ptex(v.particle, v.primary, v.glow)).setScale(1.4 * v.size);
      core.setAlpha(alpha).setDepth(38);
      if (from === 1) core.setFlipX(true);
      objs.push(core);
      const glow = this.add.circle(tip.x, tip.y, 10 * v.size, v.glow, 0.25 * alpha).setDepth(37);
      objs.push(glow);
      const emitter = this.add.particles(0, 0, this.ptex(v.particle, v.primary, v.secondary), {
        lifespan: 200 + 400 * v.trail,
        speed: { min: 5, max: 30 },
        scale: { start: 0.9 * v.size, end: 0 },
        alpha: { start: 0.8 * alpha, end: 0 },
        frequency: 50 - 35 * v.trail,
        follow: core,
        rotate: { min: 0, max: 360 },
      });
      emitter.setDepth(36);
      this.projectiles.push({ start: t, end: t + s.travelTime, from, spell: s, objs, offsetY: (k - (count - 1) / 2) * 22, echo, passThrough: s.behavior === 'piercing', emitter });
    }
  }

  private updateProjectiles(t: number) {
    for (const p of this.projectiles) {
      if (p.done || !p.objs.length) continue;
      const tip = this.staffTip(p.from);
      const tgt = this.pos(1 - p.from);
      let f = (t - p.start) / Math.max(0.01, p.end - p.start);
      if (f > 1 && !p.passThrough) continue;
      f = Math.max(0, f);
      let x = tip.x + (tgt.x - tip.x) * f;
      let y = tip.y + (tgt.y - tip.y) * f + p.offsetY * Math.sin(Math.min(1, f) * Math.PI);
      if (p.spell.behavior === 'homing') y -= Math.sin(Math.min(f, 1) * Math.PI) * 90;
      if (p.spell.behavior === 'orbiting' && f < 0.25) {
        const a = f * 30;
        x = tip.x + Math.cos(a) * 30;
        y = tip.y + Math.sin(a) * 30;
      }
      if (p.spell.visual.shimmer > 0) y += Math.sin(t * 50) * 4 * p.spell.visual.shimmer;
      const core = p.objs[0] as Phaser.GameObjects.Image;
      core.setPosition(x, y);
      (p.objs[1] as Phaser.GameObjects.Arc).setPosition(x, y);
      if (p.spell.form === 'orb') core.setRotation(t * 6);
      if (p.spell.form === 'lance') core.setRotation(Math.atan2(tgt.y - tip.y, tgt.x - tip.x) + (p.from === 1 ? Math.PI : 0));
      if (f > 1.6) this.killProjectile(p);
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  private killProjectile(p: Projectile) {
    p.done = true;
    for (const o of p.objs) o.destroy();
    p.emitter?.stop();
    const em = p.emitter;
    if (em) this.time.delayedCall(700, () => em.destroy());
  }

  /** Remove the projectiles of a given spell that arrived. */
  private landProjectile(from: number, spellIdx: number, t: number, dodged = false) {
    const s = this.d.spells[from][spellIdx];
    for (const p of this.projectiles) {
      if (p.done || p.from !== from || p.spell !== s || p.end > t + 0.15) continue;
      if (p.passThrough || dodged) {
        p.passThrough = true;
        continue;
      }
      this.killProjectile(p);
    }
  }

  private impact(s: CompiledSpell, x: number, y: number, amount: number) {
    const v = s.visual;
    const n = Math.round(10 + Math.min(20, amount / 12));
    switch (v.impact) {
      case 'crystal':
        this.burst(x, y, 'shard', v.primary, v.glow, n, 200);
        this.burst(x, y, 'flake', v.glow, 0xffffff, 6, 90, 800);
        break;
      case 'arc':
        this.chainArcs(x, y, s, 1);
        this.burst(x, y, 'spark', v.primary, v.glow, n, 260, 350);
        break;
      case 'smoke':
        this.burst(x, y, 'smoke', v.primary, v.secondary, n, 90, 900);
        break;
      case 'splash':
        this.burst(x, y, 'drop', v.primary, v.secondary, n, 180, 600);
        break;
      case 'ring': {
        const ring = this.add.image(x, y, this.ptex('ring', v.primary, v.glow)).setScale(1).setDepth(40);
        this.tweens.add({ targets: ring, scale: 8, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
        this.burst(x, y, 'rune', v.primary, v.glow, Math.round(n / 2), 160);
        break;
      }
      case 'quake':
        this.burst(x, GROUND, 'pebble', v.primary, v.secondary, n, 220, 700);
        this.cameras.main.shake(150, 0.006);
        break;
      case 'ripple': {
        for (let k = 0; k < 3; k++) {
          const ring = this.add.circle(x, y, 8, v.glow, 0).setStrokeStyle(2, v.primary, 0.9).setDepth(40);
          this.tweens.add({ targets: ring, radius: 60 + k * 15, alpha: 0, delay: k * 90, duration: 500, onComplete: () => ring.destroy() });
        }
        this.burst(x, y, 'cog', v.primary, v.glow, 6, 120);
        break;
      }
      case 'bloom':
        this.burst(x, y, 'leaf', v.primary, v.glow, n, 150, 800);
        break;
      default:
        this.burst(x, y, v.particle, v.primary, v.glow, n, 220);
        this.burst(x, y, 'dot', v.glow, 0xffffff, 6, 100, 300);
    }
    if (s.form === 'nova') {
      const ring = this.add.image(x, y, this.ptex('ring', v.primary, v.glow)).setDepth(40);
      this.tweens.add({ targets: ring, scale: 14, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    }
    if (s.delivery === 'delayed') {
      const bolt = this.add.rectangle(x, 0, 16 * v.size, y, v.glow, 0.85).setOrigin(0.5, 0).setDepth(39);
      this.tweens.add({ targets: bolt, alpha: 0, scaleX: 3, duration: 300, onComplete: () => bolt.destroy() });
    }
    if (s.delivery === 'rune') {
      const col = this.add.rectangle(x, GROUND, 50, 0, v.primary, 0.7).setOrigin(0.5, 1).setDepth(39);
      this.tweens.add({ targets: col, height: 160, alpha: 0, duration: 380, onComplete: () => col.destroy() });
    }
    // secondary effects derived from traits
    for (const t of v.secondaryFx) {
      if (t === 'chill') this.burst(x, y, 'flake', 0x7fd8ff, 0xffffff, 5, 80, 700);
      if (t === 'burn' || t === 'volatile') this.burst(x, y, 'flame', 0xff6a2a, 0xffd25a, 5, 120, 500);
      if (t === 'conduct' || t === 'chain') this.burst(x, y, 'spark', 0xb98cff, 0xfff27a, 5, 200, 300);
      if (t === 'poison' || t === 'blight') this.burst(x, y, 'drop', 0x7ee05a, 0x2e6b2a, 5, 90, 700);
      if (t === 'pierce') {
        const streak = this.add.rectangle(x, y, 80, 3, 0xffffff, 0.9).setDepth(41);
        this.tweens.add({ targets: streak, scaleX: 3, alpha: 0, duration: 250, onComplete: () => streak.destroy() });
      }
    }
  }

  private chainArcs(x: number, y: number, s: CompiledSpell, n: number) {
    const g = this.add.graphics().setDepth(42);
    g.lineStyle(3, s.visual.glow, 0.95);
    for (let k = 0; k < n + 1; k++) {
      let px = x;
      let py = y;
      const ang = Math.random() * Math.PI * 2;
      g.beginPath();
      g.moveTo(px, py);
      for (let j = 0; j < 5; j++) {
        px += Math.cos(ang) * 14 + (Math.random() - 0.5) * 18;
        py += Math.sin(ang) * 14 + (Math.random() - 0.5) * 18;
        g.lineTo(px, py);
      }
      g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  private lifestealMotes(from: number, to: number, s: CompiledSpell) {
    const a = this.pos(from);
    const b = this.pos(to);
    for (let k = 0; k < 6; k++) {
      const m = this.add.image(a.x, a.y, this.ptex('dot', 0xd04060, s.visual.glow)).setDepth(43);
      this.tweens.add({ targets: m, x: b.x, y: b.y - 10, delay: k * 50, duration: 500, ease: 'Sine.easeIn', onComplete: () => m.destroy() });
    }
  }

  private lingerField(target: number, s: CompiledSpell, t: number) {
    const L = s.linger!;
    const sp = this.sprites[target];
    const v = s.visual;
    const until = t + L.duration;
    const isStorm = s.form === 'storm';
    const cloud = isStorm ? this.add.image(sp.x, sp.y - 150, this.cloudTex(v.primary)).setScale(1.2).setDepth(36) : null;
    const em = this.add.particles(sp.x, isStorm ? sp.y - 140 : GROUND, this.ptex(v.particle, v.primary, v.glow), {
      x: { min: -45, max: 45 },
      speedY: isStorm ? { min: 200, max: 320 } : { min: -60, max: -20 },
      lifespan: isStorm ? 500 : 900,
      scale: { start: 1, end: 0.2 },
      alpha: { start: 0.9, end: 0 },
      frequency: 45,
    });
    em.setDepth(37);
    this.fx.push({
      until,
      update: () => {
        const x = this.sprites[target].x;
        em.setPosition(x, isStorm ? sp.y - 140 : GROUND);
        cloud?.setPosition(x, sp.y - 150);
      },
      destroy: () => {
        em.stop();
        cloud?.destroy();
        this.time.delayedCall(900, () => em.destroy());
      },
    });
  }

  private hexSigil(target: number, s: CompiledSpell, t: number) {
    const sp = this.sprites[target];
    const g = this.add.image(sp.x, sp.y - 150, this.ptex('rune', s.visual.primary, s.visual.glow)).setScale(3).setDepth(44);
    this.fx.push({ until: t + 1.2, update: (now) => g.setRotation(now * 2).setAlpha(Math.max(0, 1 - (now - t) / 1.2)).setX(this.sprites[target].x), destroy: () => g.destroy() });
  }
}

export function createBattleGame(parent: HTMLElement, data: BattleData): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: W,
    height: H,
    pixelArt: true,
    backgroundColor: '#120c18',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
    banner: false,
    scene: [],
  });
  game.scene.add('battle', BattleScene, true, data);
  return game;
}
