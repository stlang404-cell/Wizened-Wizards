// AUTOMATED COMBAT ENGINE — fixed-timestep, deterministic, engine-independent.
// Produces a full timeline (frames + events) that the Phaser arena merely replays.

import { SKILL_MAP } from './data/skills';
import { ELEMENT_INFO } from './data/materials';
import { Rng, clamp, round1 } from './rng';
import type { CombatWizard, CompiledSpell, Element, EquipPerk, StatusType, TacticAction, TacticCondition, TacticRule } from './types';
import { ELEMENTS } from './types';

export const DT = 0.1;
export const MAX_TIME = 100;
export const COLLAPSE_START = 62;
export const ARENA_MIN = 4;
export const ARENA_MAX = 96;

export interface CombatStats {
  maxHp: number;
  maxMana: number;
  regen: number;
  powerMult: number;
  dodge: number;
  move: number;
  castSpeed: number;
  interruptResist: number;
  resist: Record<Element, number>;
  affinity: Partial<Record<Element, number>>;
  perks: Set<EquipPerk>;
  skills: Set<string>;
  shieldMult: number;
  healMult: number;
  echoBonus: number;
  lifestealBonus: number;
  dotMult: number;
  chillStacks: number;
  ctrlDuration: number;
  reflectWhileShielded: number;
}

export const HP_BASE = 1250;
export const HP_PER_VIT = 50;

export function deriveStats(w: CombatWizard): CombatStats {
  const a = { ...w.attrs };
  const affinity: Partial<Record<Element, number>> = {};
  const resist = Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  const perks = new Set<EquipPerk>();
  for (const eq of w.equipment) {
    const ench = w.enchants[eq.id];
    for (const [k, v] of Object.entries(eq.attrs)) a[k as keyof typeof a] += v ?? 0;
    if (ench && ench.level > 0) {
      if (ench.path === 'temper') {
        const keys = Object.keys(eq.attrs);
        if (keys.length === 0) a.vitality += ench.level;
        for (const k of keys) if ((eq.attrs as Record<string, number>)[k] > 0) a[k as keyof typeof a] += ench.level;
      } else {
        a.focus += ench.level;
      }
    }
    if (eq.affinity) affinity[eq.affinity] = (affinity[eq.affinity] ?? 0) + (eq.affinityBonus ?? 0) + (ench?.path === 'attune' ? ench.level * 0.04 : 0);
    if (eq.resist) for (const [k, v] of Object.entries(eq.resist)) resist[k as Element] += v ?? 0;
    if (eq.perk) perks.add(eq.perk);
  }
  const skills = new Set(w.skills.filter((s) => SKILL_MAP[s]));
  let maxHp = HP_BASE + a.vitality * HP_PER_VIT;
  if (skills.has('a1')) maxHp *= 1.08;
  if (skills.has('e2a')) maxHp *= 0.9;
  let powerMult = 1 + (a.power - 10) * 0.025;
  if (skills.has('e1')) powerMult *= 1.06;
  if (skills.has('e2a')) powerMult *= 1.14;
  if (skills.has('e2b')) powerMult *= 1.05;
  let regen = 3 + a.wisdom * 0.25;
  if (skills.has('s4b')) regen *= 1.15;
  for (const e of ELEMENTS) resist[e] = clamp(resist[e], -0.3, 0.6);
  return {
    maxHp: Math.round(maxHp),
    maxMana: Math.round(60 + a.wisdom * 4 + (skills.has('s1') ? 20 : 0)),
    regen,
    powerMult,
    dodge: clamp(0.05 + (a.agility - 10) * 0.01 + (skills.has('a4b') ? 0.06 : 0), 0, 0.32),
    move: 10 + a.agility * 0.4,
    castSpeed: clamp(1 + (a.focus - 10) * 0.015 + (skills.has('s3') ? 0.08 : 0), 0.7, 1.6),
    interruptResist: clamp((a.focus - 10) * 0.02 + (skills.has('a4a') ? 0.25 : 0), 0, 0.6),
    resist,
    affinity,
    perks,
    skills,
    shieldMult: (perks.has('bulwark') ? 1.25 : 1) * (skills.has('a2a') ? 1.25 : 1),
    healMult: skills.has('a3') ? 1.2 : 1,
    echoBonus: (perks.has('chronoGear') ? 0.1 : 0) + (skills.has('e3') ? 0.08 : 0),
    lifestealBonus: perks.has('leechCore') ? 0.06 : 0,
    dotMult: (perks.has('venomGland') ? 1.3 : 1) * (skills.has('s2b') ? 1.2 : 1),
    chillStacks: perks.has('frostbiteCore') ? 2 : 1,
    ctrlDuration: skills.has('s2a') ? 1.4 : 1,
    reflectWhileShielded: skills.has('a2b') ? 0.1 : 0,
  };
}

// ------------------------- timeline types -------------------------

export interface FighterFrame {
  x: number;
  hp: number;
  mana: number;
  shield: number;
  cast: number; // spell idx or -1
  prog: number; // 0..1
  st: StatusType[];
}
export interface Frame {
  t: number;
  f: [FighterFrame, FighterFrame];
}

export type CombatEvent =
  | { t: number; type: 'cast'; who: number; spell: number; dur: number }
  | { t: number; type: 'release'; who: number; spell: number; travel: number; echo: boolean }
  | { t: number; type: 'hit'; who: number; spell: number; dmg: number; absorbed: number; broke: boolean; statuses: StatusType[]; echo: boolean; shatter: boolean; chain: number }
  | { t: number; type: 'dodge'; who: number; spell: number }
  | { t: number; type: 'interrupt'; who: number; by: number; spell: number }
  | { t: number; type: 'shield'; who: number; amount: number; spell: number }
  | { t: number; type: 'heal'; who: number; amount: number; spell: number }
  | { t: number; type: 'dot'; who: number; dmg: number; kind: string }
  | { t: number; type: 'backlash'; who: number; dmg: number }
  | { t: number; type: 'phoenix'; who: number }
  | { t: number; type: 'collapse' }
  | { t: number; type: 'ko'; who: number }
  | { t: number; type: 'decision'; who: number; text: string };

export interface SpellStats {
  casts: number;
  damage: number;
  hits: number;
  dodged: number;
  absorbed: number;
  healing: number;
  shielding: number;
  interrupts: number;
}

export interface FighterReport {
  damageDealt: number;
  damageTaken: number;
  absorbedByEnemyShield: number;
  healing: number;
  shielding: number;
  dodges: number;
  dodgedByEnemy: number;
  interruptsLanded: number;
  interruptsSuffered: number;
  timesFrozen: number;
  timesStunned: number;
  manaStarvedTime: number;
  dotDamage: number;
  backlashDamage: number;
  blightPrevented: number;
  manaSpent: number;
  spells: SpellStats[];
  tacticFires: number[]; // per rule index
}

export interface CombatResult {
  winner: 0 | 1;
  duration: number;
  frames: Frame[];
  events: CombatEvent[];
  reports: [FighterReport, FighterReport];
  finalHp: [number, number];
  maxHp: [number, number];
  maxMana: [number, number];
  seed: number;
  insights: [string[], string[]];
}

// ------------------------- runtime -------------------------

interface StatusState {
  remaining: number;
  mag: number;
  stacks: number;
}

interface Fighter {
  idx: number;
  w: CombatWizard;
  s: CombatStats;
  hp: number;
  mana: number;
  x: number;
  shield: number;
  reflect: number;
  casting: { spell: number; remaining: number; total: number } | null;
  cds: number[];
  statuses: Partial<Record<StatusType, StatusState>>;
  freezeImmune: number;
  stunImmune: number;
  phoenixUsed: boolean;
  clarityUsed: boolean;
  firstCast: boolean;
  fields: { dps: number; remaining: number; element: Element; from: number }[];
  dotAccum: number;
  rep: FighterReport;
  preferredRange: number;
  rangeOverride: number | null;
  lastDecision: string;
}

interface Projectile {
  from: number;
  spell: number;
  arriveAt: number;
  mult: number;
  echo: boolean;
}

function emptyReport(n: number, rules: number): FighterReport {
  return {
    damageDealt: 0,
    damageTaken: 0,
    absorbedByEnemyShield: 0,
    healing: 0,
    shielding: 0,
    dodges: 0,
    dodgedByEnemy: 0,
    interruptsLanded: 0,
    interruptsSuffered: 0,
    timesFrozen: 0,
    timesStunned: 0,
    manaStarvedTime: 0,
    dotDamage: 0,
    backlashDamage: 0,
    blightPrevented: 0,
    manaSpent: 0,
    spells: Array.from({ length: n }, () => ({ casts: 0, damage: 0, hits: 0, dodged: 0, absorbed: 0, healing: 0, shielding: 0, interrupts: 0 })),
    tacticFires: Array.from({ length: rules }, () => 0),
  };
}

export interface SimOptions {
  recordFrames?: boolean;
  maxDecisions?: number;
}

export function simulateDuel(a: CombatWizard, b: CombatWizard, seed: number, opts: SimOptions = {}): CombatResult {
  const record = opts.recordFrames ?? true;
  const rng = new Rng(seed);
  const mk = (w: CombatWizard, idx: number): Fighter => {
    const s = deriveStats(w);
    return {
      idx,
      w,
      s,
      hp: s.maxHp,
      mana: s.maxMana,
      x: idx === 0 ? 22 : 78,
      shield: 0,
      reflect: 0,
      casting: null,
      cds: w.spells.map(() => 0),
      statuses: {},
      freezeImmune: 0,
      stunImmune: 0,
      phoenixUsed: false,
      clarityUsed: false,
      firstCast: true,
      fields: [],
      dotAccum: 0,
      rep: emptyReport(w.spells.length, w.tactics.length),
      preferredRange: preferredRange(w.spells),
      rangeOverride: null,
      lastDecision: '',
    };
  };
  const F: [Fighter, Fighter] = [mk(a, 0), mk(b, 1)];
  const frames: Frame[] = [];
  const events: CombatEvent[] = [];
  const projectiles: Projectile[] = [];
  const echoes: { at: number; who: number; spell: number }[] = [];
  let t = 0;
  let decisions = 0;
  const maxDecisions = opts.maxDecisions ?? 80;
  let collapseAnnounced = false;
  let winner: 0 | 1 | null = null;

  const has = (f: Fighter, st: StatusType) => (f.statuses[st]?.remaining ?? 0) > 0;
  const hpPct = (f: Fighter) => f.hp / f.s.maxHp;
  const dist = () => Math.abs(F[0].x - F[1].x);

  const addStatus = (f: Fighter, type: StatusType, duration: number, mag: number, stacks = 1) => {
    const cur = f.statuses[type];
    if (cur && cur.remaining > 0) {
      cur.remaining = Math.max(cur.remaining, duration);
      cur.mag = Math.max(cur.mag, mag);
      cur.stacks += stacks;
    } else f.statuses[type] = { remaining: duration, mag, stacks };
  };

  const interruptCast = (target: Fighter, by: Fighter, spellIdx: number, forced: boolean) => {
    if (!target.casting) return false;
    if (!forced) {
      if (target.s.perks.has('clarity') && !target.clarityUsed) {
        target.clarityUsed = true;
        return false;
      }
      if (rng.chance(target.s.interruptResist)) return false;
    }
    const sp = target.casting.spell;
    const spell = target.w.spells[sp];
    target.cds[sp] = spell.cooldown * 0.5 + (by.s.skills.has('s4a') ? 2 : 0);
    target.casting = null;
    target.rep.interruptsSuffered++;
    by.rep.interruptsLanded++;
    if (spellIdx >= 0) by.rep.spells[spellIdx].interrupts++;
    events.push({ t, type: 'interrupt', who: target.idx, by: by.idx, spell: sp });
    return true;
  };

  const dealDamage = (target: Fighter, amount: number, source: Fighter | null): number => {
    if (amount <= 0 || winner !== null) return 0;
    let dmg = amount;
    if (target.hp - dmg <= 0 && target.s.perks.has('phoenixDown') && !target.phoenixUsed) {
      target.phoenixUsed = true;
      dmg = Math.max(0, target.hp - 1);
      target.hp = 1 + target.s.maxHp * 0.15;
      events.push({ t, type: 'phoenix', who: target.idx });
      return dmg;
    }
    target.hp -= dmg;
    target.rep.damageTaken += dmg;
    if (source) {
      source.rep.damageDealt += dmg;
      if (target.s.perks.has('thornweave')) {
        const r = dmg * 0.08;
        source.hp -= r;
        target.rep.damageDealt += r;
      }
    }
    return dmg;
  };

  const heal = (f: Fighter, amount: number) => {
    let h = amount;
    const bl = f.statuses.blighted;
    if (bl && bl.remaining > 0) {
      const prevented = h * bl.mag;
      h -= prevented;
      const other = F[1 - f.idx];
      other.rep.blightPrevented += prevented;
    }
    const before = f.hp;
    f.hp = Math.min(f.s.maxHp, f.hp + h);
    const done = f.hp - before;
    f.rep.healing += done;
    return done;
  };

  const rangeMult = (spell: CompiledSpell) => {
    const d = dist();
    const [lo, hi] = spell.rangeBand;
    if (d >= lo && d <= hi) return 1;
    const off = d < lo ? lo - d : d - hi;
    return 1 - Math.min(0.3, off / 80);
  };

  /** Frozen, or within 1s of thawing: shatter combos still land. */
  const brittle = (f: Fighter) => has(f, 'frozen') || f.freezeImmune > 2;

  const condMet = (spell: CompiledSpell, A: Fighter, B: Fighter): boolean => {
    switch (spell.conditional) {
      case 'vsFrozen':
        return brittle(B);
      case 'vsShielded':
        return B.shield > 1;
      case 'vsCasting':
        return !!B.casting;
      case 'vsPoisoned':
        return has(B, 'poison');
      case 'lowHealthSelf':
        return hpPct(A) < 0.4;
      case 'vsChilled':
        return has(B, 'chill') || has(B, 'frozen');
      case 'vsConductive':
        return has(B, 'conductive');
      case 'vsBurning':
        return has(B, 'burn');
      case 'none':
        return spell.conditionalMult > 1.01 && brittle(B);
    }
  };

  const applyHit = (A: Fighter, B: Fighter, si: number, mult: number, echo: boolean) => {
    const spell = A.w.spells[si];
    const st = A.rep.spells[si];
    // dodge
    if (spell.dodgeable && !has(B, 'frozen') && !has(B, 'stun')) {
      let dc = B.s.dodge;
      if (spell.behavior === 'homing') dc *= 0.3;
      if (spell.delivery === 'rune') dc *= 1.5;
      if (spell.travelTime >= 1.1) dc *= 1.6;
      if (B.casting) dc *= 0.5;
      if (has(B, 'slowed') || has(B, 'chill')) dc *= 0.5;
      if (rng.chance(clamp(dc, 0, 0.6))) {
        B.rep.dodges++;
        A.rep.dodgedByEnemy++;
        st.dodged++;
        events.push({ t, type: 'dodge', who: B.idx, spell: si });
        return;
      }
    }
    const met = condMet(spell, A, B);
    let base = spell.damage * mult * A.s.powerMult * (1 + (A.s.affinity[spell.element] ?? 0)) * rangeMult(spell);
    base *= rng.range(0.93, 1.07);
    let shatter = false;
    let breakerMult = 1;
    // situational bonuses ADD together and are capped, so combos are strong but bounded
    let bonus = 0;
    if (met) {
      if (spell.conditional === 'vsShielded') breakerMult = spell.conditionalMult;
      else bonus += spell.conditionalMult - 1;
      if (spell.conditional === 'vsFrozen' || spell.conditional === 'none') {
        shatter = true;
        delete B.statuses.frozen;
        B.freezeImmune = 2; // immune to re-freezing, but no longer brittle
      }
    }
    if (spell.trigger === 'onKillshot' && hpPct(B) < 0.25) bonus += 0.6 / 0.9;
    const vul = B.statuses.vulnerable;
    if (vul && vul.remaining > 0) bonus += vul.mag;
    let chain = spell.chain + (A.s.perks.has('stormRod') && spell.element === 'storm' ? 1 : 0);
    const cond = B.statuses.conductive;
    if (cond && cond.remaining > 0 && (spell.element === 'storm' || chain > 0)) {
      bonus += spell.conditional === 'vsConductive' ? 0 : cond.mag;
      chain += 1;
    }
    chain = Math.min(chain, 3);
    if (A.s.skills.has('e4a') && hpPct(B) < 0.3) bonus += 0.25;
    if (A.s.skills.has('e4b') && t < 10) bonus += 0.25;
    base *= 1 + Math.min(bonus, 1);
    const res = clamp(B.s.resist[spell.element] * (1 - spell.pierce), -0.3, 0.6);
    base *= 1 - res;

    let totalThrough = 0;
    let totalAbsorbed = 0;
    let broke = false;
    const applied: StatusType[] = [];
    const strikes: number[] = [];
    for (let h = 0; h < spell.hits; h++) strikes.push(base);
    for (let c = 0; c < chain; c++) strikes.push(base * 0.5);
    for (const raw of strikes) {
      let through = raw;
      if (B.shield > 0) {
        const vsShield = raw * (1 - spell.pierce) * breakerMult;
        const absorbed = Math.min(B.shield, vsShield);
        B.shield -= absorbed;
        totalAbsorbed += absorbed;
        through = raw * spell.pierce + (vsShield - absorbed) / breakerMult;
        const refl = absorbed * (B.reflect + B.s.reflectWhileShielded);
        if (refl > 0) {
          A.hp -= refl;
          B.rep.damageDealt += refl;
        }
        if (B.shield <= 1) {
          B.shield = 0;
          B.reflect = 0;
          broke = true;
        }
      }
      totalThrough += dealDamage(B, through, A);
    }
    if (broke && spell.trigger === 'onShieldBreak') {
      A.mana = Math.min(A.s.maxMana, A.mana + spell.manaCost * 0.5);
      A.cds[si] *= 0.5;
    }
    A.rep.absorbedByEnemyShield += totalAbsorbed;
    st.damage += totalThrough;
    st.absorbed += totalAbsorbed;
    st.hits++;
    const ls = spell.lifesteal + A.s.lifestealBonus;
    if (ls > 0 && totalThrough > 0) heal(A, totalThrough * ls);

    // statuses
    const rolls = spell.hits;
    for (const s of spell.statuses) {
      let landed = false;
      for (let r = 0; r < rolls && !landed; r++) landed = spell.trigger === 'onHit' || rng.chance(s.chance);
      if (!landed) continue;
      if (s.type === 'chill') {
        if (has(B, 'frozen') || B.freezeImmune > 0) continue;
        addStatus(B, 'chill', 4 * A.s.ctrlDuration, 0.15, A.s.chillStacks);
        applied.push('chill');
        if ((B.statuses.chill?.stacks ?? 0) >= 3) {
          delete B.statuses.chill;
          addStatus(B, 'frozen', 2.2 * A.s.ctrlDuration, 1);
          B.rep.timesFrozen++;
          applied.push('frozen');
          if (B.casting) interruptCast(B, A, si, true);
        }
      } else if (s.type === 'stun') {
        if (B.stunImmune > 0 || has(B, 'frozen')) continue;
        addStatus(B, 'stun', s.duration, 1);
        B.stunImmune = 3.5;
        B.rep.timesStunned++;
        applied.push('stun');
        if (B.casting) interruptCast(B, A, si, true);
      } else {
        const cur = B.statuses[s.type];
        if (cur && cur.remaining > 0) {
          cur.remaining = Math.max(cur.remaining, s.duration);
          cur.mag = Math.max(cur.mag, s.magnitude);
        } else B.statuses[s.type] = { remaining: s.duration, mag: s.magnitude, stacks: 1 };
        applied.push(s.type);
      }
    }
    if (spell.dot) {
      const dps = spell.dot.dps * mult * A.s.dotMult * A.s.powerMult;
      const cur = B.statuses[spell.dot.type];
      if (spell.dot.type === 'poison') {
        if (cur && cur.remaining > 0) {
          cur.stacks = Math.min(3, cur.stacks + 1);
          cur.mag = Math.max(cur.mag, dps);
          cur.remaining = spell.dot.duration;
        } else B.statuses.poison = { remaining: spell.dot.duration, mag: dps, stacks: 1 };
      } else {
        B.statuses.burn = { remaining: spell.dot.duration, mag: Math.max(dps, cur?.remaining ? cur.mag : 0), stacks: 1 };
      }
      applied.push(spell.dot.type);
    }
    if (spell.linger) B.fields.push({ dps: spell.linger.dps * mult * A.s.powerMult, remaining: spell.linger.duration, element: spell.element, from: A.idx });
    if (spell.manaBurn > 0) B.mana = Math.max(0, B.mana - spell.manaBurn * mult);
    if (B.casting && (spell.interrupts || (spell.conditional === 'vsCasting' && met))) interruptCast(B, A, si, false);
    events.push({ t, type: 'hit', who: A.idx, spell: si, dmg: Math.round(totalThrough), absorbed: Math.round(totalAbsorbed), broke, statuses: applied, echo, shatter, chain });
  };

  const release = (A: Fighter, si: number, echo: boolean) => {
    const spell = A.w.spells[si];
    const B = F[1 - A.idx];
    const mult = echo ? 0.45 : 1;
    if (!echo) {
      A.cds[si] = spell.cooldown;
      A.rep.spells[si].casts++;
    }
    events.push({ t, type: 'release', who: A.idx, spell: si, travel: spell.travelTime, echo });
    // backlash
    const bl = A.s.skills.has('e2b') ? spell.backlash / 2 : spell.backlash;
    if (!echo && bl > 0 && rng.chance(bl)) {
      const d = Math.max(20, (spell.damage + spell.shield + spell.heal) * 0.25);
      A.hp -= d;
      A.rep.backlashDamage += d;
      events.push({ t, type: 'backlash', who: A.idx, dmg: Math.round(d) });
    }
    if (spell.kind === 'shield') {
      const amt = spell.shield * mult * A.s.shieldMult * A.s.powerMult;
      A.shield = Math.min(A.s.maxHp * 0.6, A.shield + amt);
      A.reflect = Math.max(A.reflect, spell.reflect);
      A.rep.shielding += amt;
      A.rep.spells[si].shielding += amt;
      events.push({ t, type: 'shield', who: A.idx, amount: Math.round(amt), spell: si });
    } else if (spell.kind === 'heal') {
      const done = heal(A, spell.heal * mult * A.s.healMult * A.s.powerMult);
      A.rep.spells[si].healing += done;
      events.push({ t, type: 'heal', who: A.idx, amount: Math.round(done), spell: si });
    } else if (spell.travelTime > 0) {
      projectiles.push({ from: A.idx, spell: si, arriveAt: t + spell.travelTime, mult, echo });
    } else {
      applyHit(A, B, si, mult, echo);
    }
    if (!echo && spell.reflect > 0 && spell.kind !== 'shield') A.reflect = Math.max(A.reflect, spell.reflect);
    if (!echo && spell.selfWard > 0) {
      const amt = (spell.damage * spell.hits + spell.heal) * spell.selfWard * A.s.shieldMult;
      A.shield = Math.min(A.s.maxHp * 0.6, A.shield + amt);
      A.rep.shielding += amt;
    }
    const echoChance = clamp(spell.echo + A.s.echoBonus, 0, 0.55);
    if (!echo && echoChance > 0 && rng.chance(echoChance)) echoes.push({ at: t + 0.6, who: A.idx, spell: si });
  };

  // ---------------------- tactical decision making ----------------------

  const condition = (c: TacticCondition, A: Fighter, B: Fighter): boolean => {
    switch (c) {
      case 'always':
        return true;
      case 'enemyShielded':
        return B.shield > 15;
      case 'selfHpLow':
        return hpPct(A) < 0.35;
      case 'selfHpMid':
        return hpPct(A) < 0.6;
      case 'enemyFrozen':
        return brittle(B);
      case 'enemyChilled':
        return has(B, 'chill');
      case 'enemyLongCast':
        return !!B.casting && B.casting.total >= 1.3 && B.casting.remaining > 0.35;
      case 'selfManaLow':
        return A.mana < A.s.maxMana * 0.3;
      case 'enemyHpLow':
        return hpPct(B) < 0.3;
      case 'enemyPoisoned':
        return has(B, 'poison');
      case 'selfUnshielded':
        return A.shield < 5;
      case 'enemyClose':
        return dist() < 35;
      case 'enemyFar':
        return dist() > 60;
      case 'enemyConductive':
        return has(B, 'conductive');
      case 'enemyHealing':
        return !!B.casting && B.w.spells[B.casting.spell].kind === 'heal';
      case 'fightStart':
        return t < 6;
    }
  };

  const matches = (act: TacticAction, s: CompiledSpell, A: Fighter, B: Fighter): boolean => {
    switch (act) {
      case 'preferPierce':
        return s.tags.includes('pierce');
      case 'preferHeal':
        return s.kind === 'heal' || s.lifesteal >= 0.15;
      case 'preferDefense':
        return s.kind === 'shield';
      case 'preferShatter':
        return s.tags.includes('shatter');
      case 'interrupt': {
        if (!B.casting || !s.interrupts) return false;
        const eta = s.castTime / castRate(A) + s.travelTime;
        return eta < B.casting.remaining / castRate(B) + 0.05;
      }
      case 'preferEfficient':
        return s.tags.includes('efficient') || s.manaCost <= 14;
      case 'preferBurst':
        return s.tags.includes('burst');
      case 'preferControl':
        return s.tags.includes('control');
      case 'preferDot':
        return s.tags.includes('dot');
      case 'preferStorm':
        return s.tags.includes('storm');
      case 'preferBlight':
        return s.tags.includes('blight');
      default:
        return false;
    }
  };

  const castRate = (f: Fighter) => {
    let r = f.s.castSpeed;
    if (has(f, 'slowed')) r *= 1 - (f.statuses.slowed?.mag ?? 0.2);
    if (has(f, 'chill')) r *= 1 - 0.1 * Math.min(2, f.statuses.chill?.stacks ?? 1);
    if (has(f, 'hasted')) r *= 1.2;
    return Math.max(0.4, r);
  };

  const utility = (s: CompiledSpell, A: Fighter, B: Fighter): number => {
    if (s.kind === 'shield') {
      if (A.shield > A.s.maxHp * 0.25) return 0;
      return ((s.shield * 0.55) / (s.castTime + 0.6)) * (0.5 + (1 - hpPct(A)));
    }
    if (s.kind === 'heal') {
      const missing = A.s.maxHp - A.hp;
      if (missing < s.heal * 0.5) return 0;
      return (Math.min(s.heal, missing) * 0.8) / (s.castTime + 0.6);
    }
    let dmg = s.damage * s.hits * (1 + s.chain * 0.5) + (s.dot ? s.dot.dps * s.dot.duration * 0.7 : 0) + (s.linger ? s.linger.dps * s.linger.duration * 0.7 : 0);
    if (s.dodgeable) dmg *= 1 - B.s.dodge;
    if (B.shield > 10 && s.conditional !== 'vsShielded') dmg *= 0.55 + s.pierce * 0.6;
    if (s.kind === 'hex' && has(B, 'vulnerable')) dmg *= 0.3;
    if (s.dot && has(B, s.dot.type) && s.dot.type === 'burn') dmg *= 0.75;
    if (condMet(s, A, B)) dmg *= s.conditional === 'vsShielded' ? 1.6 : s.conditionalMult;
    dmg *= rangeMult(s);
    return dmg / (s.castTime + 0.6) + s.statuses.length * 4;
  };

  const decide = (A: Fighter, B: Fighter) => {
    const spells = A.w.spells;
    const conserve = A.w.tactics.some((r) => r.enabled && r.action === 'conserveMana' && condition(r.condition, A, B));
    const avail: number[] = [];
    for (let i = 0; i < spells.length; i++) {
      if (A.cds[i] > 0 || A.mana < spells[i].manaCost) continue;
      if (conserve && A.mana < A.s.maxMana * 0.5 && spells[i].manaCost > 16 && spells[i].kind === 'attack') continue;
      avail.push(i);
    }
    // hold shatter spells while a freeze is building (same logic for every wizard)
    if (has(B, 'chill') && !has(B, 'frozen') && B.freezeImmune <= 0) {
      const held = avail.filter((i) => spells[i].tags.includes('shatter'));
      for (const h of held) avail.splice(avail.indexOf(h), 1);
    }
    // movement overrides from tactics
    A.rangeOverride = null;
    for (const r of A.w.tactics) {
      if (!r.enabled) continue;
      if ((r.action === 'keepDistance' || r.action === 'closeDistance') && condition(r.condition, A, B)) {
        A.rangeOverride = r.action === 'keepDistance' ? 80 : 18;
        break;
      }
    }
    if (!avail.length) return null;
    const score = avail.map((i) => ({ i, u: utility(spells[i], A, B), bonus: 0, rule: -1 }));
    A.w.tactics.forEach((r: TacticRule, ri) => {
      if (!r.enabled || r.action === 'keepDistance' || r.action === 'closeDistance' || r.action === 'conserveMana') return;
      if (!condition(r.condition, A, B)) return;
      for (const sc of score) {
        if (sc.rule === -1 && matches(r.action, spells[sc.i], A, B)) {
          if (spells[sc.i].kind === 'heal' && A.hp > A.s.maxHp * 0.92) continue;
          if (spells[sc.i].kind === 'shield' && A.shield > A.s.maxHp * 0.3) continue;
          sc.bonus = 1000 - ri * 100;
          sc.rule = ri;
        }
      }
    });
    score.sort((x, y) => y.bonus + y.u - (x.bonus + x.u) || x.i - y.i);
    const best = score[0];
    if (best.bonus === 0 && best.u <= 0) return null;
    if (best.rule >= 0) {
      A.rep.tacticFires[best.rule]++;
      const r = A.w.tactics[best.rule];
      const text = `Rule ${best.rule + 1} (${CONDITION_LABEL[r.condition]} → ${ACTION_LABEL[r.action]}): cast ${spells[best.i].name}`;
      if (text !== A.lastDecision && decisions < maxDecisions) {
        decisions++;
        events.push({ t, type: 'decision', who: A.idx, text });
      }
      A.lastDecision = text;
    }
    return best.i;
  };

  // ---------------------- main loop ----------------------
  const snapshot = () => {
    if (!record) return;
    frames.push({
      t: round1(t),
      f: F.map((f) => ({
        x: round1(f.x),
        hp: Math.max(0, Math.round(f.hp)),
        mana: Math.round(f.mana),
        shield: Math.round(f.shield),
        cast: f.casting ? f.casting.spell : -1,
        prog: f.casting ? round1(1 - f.casting.remaining / f.casting.total) : 0,
        st: (Object.keys(f.statuses) as StatusType[]).filter((k) => (f.statuses[k]?.remaining ?? 0) > 0),
      })) as [FighterFrame, FighterFrame],
    });
  };
  snapshot();

  const steps = Math.round(MAX_TIME / DT);
  for (let step = 1; step <= steps && winner === null; step++) {
    t = round1(step * DT);
    // 1. statuses, dots, fields, regen
    for (const f of F) {
      const other = F[1 - f.idx];
      let dot = 0;
      const burn = f.statuses.burn;
      if (burn && burn.remaining > 0) dot += burn.mag * DT;
      const poison = f.statuses.poison;
      if (poison && poison.remaining > 0) dot += poison.mag * (1 + 0.5 * (poison.stacks - 1)) * DT; // diminishing stacks
      for (const fl of f.fields) {
        dot += fl.dps * DT;
        fl.remaining -= DT;
      }
      f.fields = f.fields.filter((fl) => fl.remaining > 0);
      if (dot > 0) {
        const absorbed = Math.min(f.shield, dot * 0.5);
        f.shield -= absorbed;
        const d = dealDamage(f, dot - absorbed, other);
        other.rep.dotDamage += d;
        f.dotAccum += d;
      }
      if (step % 10 === 0 && f.dotAccum >= 1) {
        events.push({ t, type: 'dot', who: f.idx, dmg: Math.round(f.dotAccum), kind: burn?.remaining ? 'burn' : poison?.remaining ? 'poison' : 'field' });
        f.dotAccum = 0;
      }
      for (const k of Object.keys(f.statuses) as StatusType[]) {
        const s = f.statuses[k]!;
        s.remaining -= DT;
        if (s.remaining <= 0) {
          delete f.statuses[k];
          if (k === 'frozen') f.freezeImmune = 3;
        }
      }
      f.freezeImmune = Math.max(0, f.freezeImmune - DT);
      f.stunImmune = Math.max(0, f.stunImmune - DT);
      if (f.shield > 0) {
        f.shield -= f.shield * (f.s.skills.has('a2a') ? 0.02 : 0.04) * DT + 1.5 * DT;
        if (f.shield <= 0) {
          f.shield = 0;
          f.reflect = 0;
        }
      }
      let regen = f.s.regen;
      if (f.s.perks.has('manaWell') && f.mana < f.s.maxMana * 0.3) regen *= 1.6;
      f.mana = Math.min(f.s.maxMana, f.mana + regen * DT);
      for (let i = 0; i < f.cds.length; i++) if (f.cds[i] > 0) f.cds[i] = Math.max(0, f.cds[i] - DT);
    }
    // arena collapse: guarantees termination and pressure
    if (t >= COLLAPSE_START) {
      if (!collapseAnnounced) {
        collapseAnnounced = true;
        events.push({ t, type: 'collapse' });
      }
      const k = 0.004 + (t - COLLAPSE_START) * 0.0012;
      for (const f of F) {
        f.hp -= f.s.maxHp * k * DT;
      }
    }
    // 2. projectiles and echoes
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.arriveAt <= t + 1e-6) {
        projectiles.splice(i, 1);
        applyHit(F[p.from], F[1 - p.from], p.spell, p.mult, p.echo);
      }
    }
    for (let i = echoes.length - 1; i >= 0; i--) {
      if (echoes[i].at <= t + 1e-6) {
        const e = echoes.splice(i, 1)[0];
        release(F[e.who], e.spell, true);
      }
    }
    // 3. actions (alternate order each tick for fairness)
    const order = step % 2 === 0 ? [0, 1] : [1, 0];
    for (const oi of order) {
      const A = F[oi];
      const B = F[1 - oi];
      if (A.hp <= 0 || B.hp <= 0) continue;
      if (has(A, 'frozen') || has(A, 'stun')) {
        if (A.casting) interruptCast(A, B, -1, true);
        continue;
      }
      if (A.mana < 12) A.rep.manaStarvedTime += DT;
      if (A.casting) {
        A.casting.remaining -= DT * castRate(A);
        if (A.casting.remaining <= 1e-6) {
          const si = A.casting.spell;
          A.casting = null;
          release(A, si, false);
        }
        continue;
      }
      const choice = decide(A, B);
      if (choice !== null) {
        const sp = A.w.spells[choice];
        let ct = sp.castTime;
        if (A.firstCast && A.s.perks.has('quickdraw')) ct *= 0.5;
        A.firstCast = false;
        A.mana -= sp.manaCost;
        A.rep.manaSpent += sp.manaCost;
        A.casting = { spell: choice, remaining: ct, total: ct };
        events.push({ t, type: 'cast', who: A.idx, spell: choice, dur: round1(ct / castRate(A)) });
      } else {
        // reposition toward preferred range
        const want = A.rangeOverride ?? A.preferredRange;
        const d = dist();
        const dir = A.idx === 0 ? -1 : 1; // moving "away" direction
        const speed = A.s.move * (has(A, 'slowed') || has(A, 'chill') ? 0.6 : 1) * DT;
        if (Math.abs(d - want) > 3) {
          const delta = d < want ? dir * speed : -dir * speed;
          A.x = clamp(A.x + delta, ARENA_MIN, ARENA_MAX);
          if (A.idx === 0) A.x = Math.min(A.x, B.x - 8);
          else A.x = Math.max(A.x, B.x + 8);
        }
      }
    }
    // 4. outcome
    const dead0 = F[0].hp <= 0;
    const dead1 = F[1].hp <= 0;
    if (dead0 || dead1) {
      if (dead0 && dead1) winner = hpPct(F[0]) >= hpPct(F[1]) ? 0 : 1;
      else winner = dead0 ? 1 : 0;
      events.push({ t, type: 'ko', who: 1 - winner });
    }
    if (step % 1 === 0) snapshot();
  }
  if (winner === null) {
    winner = hpPct(F[0]) >= hpPct(F[1]) ? 0 : 1;
    events.push({ t, type: 'ko', who: 1 - winner });
  }
  const result: CombatResult = {
    winner,
    duration: t,
    frames,
    events,
    reports: [F[0].rep, F[1].rep],
    finalHp: [Math.max(0, Math.round(F[0].hp)), Math.max(0, Math.round(F[1].hp))],
    maxHp: [F[0].s.maxHp, F[1].s.maxHp],
    maxMana: [F[0].s.maxMana, F[1].s.maxMana],
    seed,
    insights: [[], []],
  };
  result.insights = [insightsFor(result, 0, a, b), insightsFor(result, 1, b, a)];
  return result;
}

function preferredRange(spells: CompiledSpell[]): number {
  const off = spells.filter((s) => s.kind === 'attack' || s.kind === 'hex');
  if (!off.length) return 50;
  let w = 0;
  let sum = 0;
  for (const s of off) {
    const mid = (s.rangeBand[0] + Math.min(s.rangeBand[1], 85)) / 2;
    sum += mid * (s.power + 1);
    w += s.power + 1;
  }
  return clamp(sum / w, 18, 80);
}

export const CONDITION_LABEL: Record<TacticCondition, string> = {
  always: 'Always',
  enemyShielded: 'Enemy is shielded',
  selfHpLow: 'My health < 35%',
  selfHpMid: 'My health < 60%',
  enemyFrozen: 'Enemy is frozen',
  enemyChilled: 'Enemy is chilled',
  enemyLongCast: 'Enemy begins a long cast',
  selfManaLow: 'My mana < 30%',
  enemyHpLow: 'Enemy health < 30%',
  enemyPoisoned: 'Enemy is poisoned',
  selfUnshielded: 'I have no shield',
  enemyClose: 'Enemy is close',
  enemyFar: 'Enemy is far',
  enemyConductive: 'Enemy is conductive',
  enemyHealing: 'Enemy is casting a heal',
  fightStart: 'First 6 seconds',
};
export const ACTION_LABEL: Record<TacticAction, string> = {
  preferPierce: 'Prioritise piercing spells',
  preferHeal: 'Prioritise healing',
  preferDefense: 'Prioritise shields',
  preferShatter: 'Use shatter spells',
  interrupt: 'Attempt interruption',
  preferEfficient: 'Use efficient spells',
  preferBurst: 'Use burst damage',
  preferControl: 'Use control spells',
  preferDot: 'Apply damage over time',
  keepDistance: 'Keep distance',
  closeDistance: 'Close distance',
  conserveMana: 'Conserve mana',
  preferStorm: 'Use storm / chain spells',
  preferBlight: 'Use blight (anti-heal)',
};

function insightsFor(r: CombatResult, me: number, mine: CombatWizard, theirs: CombatWizard): string[] {
  const my = r.reports[me];
  const op = r.reports[1 - me];
  const out: string[] = [];
  const dealtTotal = my.damageDealt + my.absorbedByEnemyShield;
  if (dealtTotal > 0 && my.absorbedByEnemyShield / dealtTotal > 0.25)
    out.push(`${Math.round((my.absorbedByEnemyShield / dealtTotal) * 100)}% of your damage was absorbed by shields. Piercing or Wardbreaker spells and a "Enemy is shielded → piercing" rule would help.`);
  const attempts = my.spells.reduce((s, x) => s + x.hits + x.dodged, 0);
  if (attempts > 4 && my.dodgedByEnemy / attempts > 0.2)
    out.push(`${my.dodgedByEnemy} of your spells were dodged. Beams, instant, delayed or homing deliveries cannot be easily dodged.`);
  if (my.timesFrozen >= 2) out.push(`You were frozen ${my.timesFrozen} times. Frost resistance (Fur-lined Robe), faster kills, or shields reduce chill pressure.`);
  if (my.interruptsSuffered >= 2) out.push(`Your casts were interrupted ${my.interruptsSuffered} times. Faster spells, Focus, or a Meditation Stone help.`);
  if (op.healing > r.maxHp[1 - me] * 0.25) out.push(`The opponent healed ${Math.round(op.healing)}. Blight (venom/shadow fusion) reduces enemy healing.`);
  if (my.manaStarvedTime > 12) out.push(`You were out of mana for ${Math.round(my.manaStarvedTime)}s. Efficient spells, Wisdom, or a "Mana low → efficient" rule help.`);
  if (my.backlashDamage > 100) out.push(`Unstable spells backfired for ${Math.round(my.backlashDamage)} damage. Stabilize your components.`);
  if (op.dotDamage > r.maxHp[me] * 0.3) out.push(`Damage over time dealt ${Math.round(op.dotDamage)} to you. Healing or burst to end the fight sooner helps.`);
  if (my.interruptsLanded > 0) out.push(`You interrupted the opponent ${my.interruptsLanded} times.`);
  if (my.blightPrevented > 50) out.push(`Your blight prevented ${Math.round(my.blightPrevented)} enemy healing.`);
  const best = my.spells.map((s, i) => ({ s, i })).sort((a, b) => b.s.damage - a.s.damage)[0];
  if (best && best.s.damage > 0) out.push(`Top spell: ${mine.spells[best.i].name} (${Math.round(best.s.damage)} damage in ${best.s.casts} casts).`);
  const theirBest = op.spells.map((s, i) => ({ s, i })).sort((a, b) => b.s.damage - a.s.damage)[0];
  if (theirBest && theirBest.s.damage > 0) {
    const sp = theirs.spells[theirBest.i];
    out.push(`Their most damaging spell: ${sp.name} (${ELEMENT_INFO[sp.element].name}, ${Math.round(theirBest.s.damage)} damage). Resistance to ${ELEMENT_INFO[sp.element].name} would blunt it.`);
  }
  const fired = my.tacticFires.reduce((a, b) => a + b, 0);
  if (mine.tactics.length && fired === 0) out.push('None of your Grimoire rules ever fired. Check that your spells match their actions.');
  return out;
}

/** Fast estimate of win probability by Monte Carlo of the real simulation. */
export function estimateWinProbability(a: CombatWizard, b: CombatWizard, samples = 24, salt = 0): number {
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const r = simulateDuel(a, b, (0x51ed + i * 7919 + salt) >>> 0, { recordFrames: false, maxDecisions: 0 });
    if (r.winner === 0) wins++;
  }
  return (wins + 0.5) / (samples + 1);
}
