// SPELL COMPILER — converts a SpellRecipe into concrete deterministic mechanics.

import { ELEMENT_INFO, elementAffinity } from './data/materials';
import { resolveIngredient, type ComponentLib, type ResolvedIngredient } from './genetics';
import { clamp, hashId, hashString, round1, round2 } from './rng';
import type {
  Behavior,
  CompiledSpell,
  Conditional,
  Delivery,
  Form,
  Ingredient,
  SpellKind,
  SpellRecipe,
  SpellVisual,
  StatusApplication,
  Trait,
} from './types';

interface FormBase {
  kind: SpellKind;
  dmg: number;
  heal: number;
  shield: number;
  cast: number;
  cd: number;
  mana: number;
  travel: number;
  band: [number, number];
  name: string;
}

export const FORM_INFO: Record<Form, FormBase & { desc: string }> = {
  bolt: { kind: 'attack', dmg: 62, heal: 0, shield: 0, cast: 0.9, cd: 2.4, mana: 13, travel: 0.5, band: [15, 75], name: 'Bolt', desc: 'Quick, cheap, reliable damage.' },
  lance: { kind: 'attack', dmg: 120, heal: 0, shield: 0, cast: 1.7, cd: 4.8, mana: 26, travel: 0.25, band: [45, 100], name: 'Lance', desc: 'Long-range spear. Innate piercing.' },
  orb: { kind: 'attack', dmg: 150, heal: 0, shield: 0, cast: 2.1, cd: 6.5, mana: 32, travel: 1.2, band: [10, 80], name: 'Orb', desc: 'Slow, heavy sphere. Easy to dodge.' },
  nova: { kind: 'attack', dmg: 108, heal: 0, shield: 0, cast: 1.2, cd: 6.5, mana: 28, travel: 0, band: [0, 40], name: 'Nova', desc: 'Close-range blast. Strong status application.' },
  storm: { kind: 'attack', dmg: 40, heal: 0, shield: 0, cast: 1.8, cd: 9, mana: 34, travel: 0.6, band: [20, 100], name: 'Tempest', desc: 'Summons a lingering hazard over the foe.' },
  ward: { kind: 'shield', dmg: 0, heal: 0, shield: 150, cast: 0.8, cd: 10, mana: 26, travel: 0, band: [0, 100], name: 'Ward', desc: 'A barrier that absorbs damage.' },
  mend: { kind: 'heal', dmg: 0, heal: 135, shield: 0, cast: 1.4, cd: 9, mana: 30, travel: 0, band: [0, 100], name: 'Mend', desc: 'Restores health.' },
  hex: { kind: 'hex', dmg: 22, heal: 0, shield: 0, cast: 1.0, cd: 8, mana: 20, travel: 0, band: [0, 100], name: 'Hex', desc: 'Curses the foe: Vulnerable and strong statuses.' },
};

export const DELIVERY_INFO: Record<Delivery, { name: string; desc: string }> = {
  projectile: { name: 'Projectile', desc: 'Travels to the target. Can be dodged.' },
  beam: { name: 'Beam', desc: 'Instant line. Cannot be dodged. Slightly weaker.' },
  instant: { name: 'Instant', desc: 'Very fast cast, cannot be dodged. Weaker. Good for interrupts.' },
  rune: { name: 'Rune', desc: 'Erupts beneath the foe after a delay. Strong but dodgeable.' },
  delayed: { name: 'Delayed', desc: 'A doom mark that strikes later. Very strong, cannot be dodged.' },
};

export const BEHAVIOR_INFO: Record<Behavior, { name: string; desc: string }> = {
  direct: { name: 'Direct', desc: 'No special behavior.' },
  chaining: { name: 'Chaining', desc: 'Arcs repeatedly into the target. +1 chain.' },
  piercing: { name: 'Piercing', desc: 'Bypasses shields and resistances.' },
  homing: { name: 'Homing', desc: 'Curves to follow the target. Very hard to dodge.' },
  splitting: { name: 'Splitting', desc: 'Splits into three smaller strikes. More status rolls.' },
  lingering: { name: 'Lingering', desc: 'Leaves a damaging field behind.' },
  orbiting: { name: 'Orbiting', desc: 'Orbits the caster before release; grants a reflective sheen.' },
};

export const CONDITIONAL_INFO: Record<Conditional, { name: string; mult: number; desc: string }> = {
  none: { name: 'None', mult: 1, desc: 'No conditional effect.' },
  vsFrozen: { name: 'Shatter', mult: 1.75, desc: '+75% vs Frozen targets and shatters the ice.' },
  vsShielded: { name: 'Wardbreaker', mult: 2.2, desc: '×2.2 damage against shields.' },
  vsCasting: { name: 'Spellsnap', mult: 1.45, desc: '+45% vs casting foes and always interrupts.' },
  vsPoisoned: { name: 'Toxic Surge', mult: 1.45, desc: '+45% vs Poisoned targets.' },
  lowHealthSelf: { name: 'Desperation', mult: 1.5, desc: '+50% while you are below 40% health.' },
  vsChilled: { name: 'Thermal Shock', mult: 1.35, desc: '+35% vs Chilled targets.' },
  vsConductive: { name: 'Overload', mult: 1.45, desc: '+45% vs Conductive targets.' },
  vsBurning: { name: 'Flashpoint', mult: 1.35, desc: '+35% vs Burning targets.' },
};

export const TRIGGER_INFO = {
  onCast: { name: 'On Cast', desc: 'Standard.' },
  onHit: { name: 'On Hit', desc: 'Statuses always apply on hit; −10% damage.' },
  onKillshot: { name: 'Executioner', desc: '+60% damage vs foes below 25% health; −10% otherwise.' },
  onShieldBreak: { name: 'Breaker Refund', desc: 'Breaking a shield refunds half the mana and cooldown.' },
};

// ------------------- Evolution -------------------

export interface EvolutionNode {
  id: string;
  tier: 1 | 2 | 3;
  name: string;
  desc: string;
  mastery: number; // casts required
  cost: number;
}
export const EVOLUTION: EvolutionNode[] = [
  { id: 'potent', tier: 1, name: 'Potent', desc: '+18% damage/effect, +12% mana cost', mastery: 4, cost: 60 },
  { id: 'thrifty', tier: 1, name: 'Thrifty', desc: '−24% mana cost, −8% damage/effect', mastery: 4, cost: 60 },
  { id: 'swift', tier: 1, name: 'Swift', desc: '−22% cast time, −10% damage/effect', mastery: 4, cost: 60 },
  { id: 'piercer', tier: 2, name: 'Piercer', desc: '+20% pierce, +0.2s cast time', mastery: 12, cost: 180 },
  { id: 'arcing', tier: 2, name: 'Arcing', desc: '+1 chain, −12% damage', mastery: 12, cost: 180 },
  { id: 'warding', tier: 2, name: 'Self-Warding', desc: 'Casting grants a shield worth 18% of its power, +15% cooldown', mastery: 12, cost: 180 },
  { id: 'overcharged', tier: 3, name: 'Overcharged', desc: '+30% damage/effect, +20% cooldown, +5% backlash', mastery: 28, cost: 480 },
  { id: 'resonant', tier: 3, name: 'Resonant', desc: '+15% echo chance, +10% mana cost', mastery: 28, cost: 480 },
  { id: 'tactical', tier: 3, name: 'Tactical', desc: '−25% cooldown, −12% damage/effect', mastery: 28, cost: 480 },
];

// ------------------- Grammar -------------------

export function validDeliveries(form: Form): Delivery[] {
  switch (form) {
    case 'ward':
    case 'mend':
      return ['instant', 'beam'];
    case 'nova':
      return ['instant', 'rune'];
    case 'storm':
      return ['instant', 'delayed', 'rune'];
    case 'hex':
      return ['instant', 'projectile', 'beam', 'delayed'];
    default:
      return ['projectile', 'beam', 'instant', 'rune', 'delayed'];
  }
}

export function validBehaviors(form: Form, delivery: Delivery): Behavior[] {
  if (form === 'ward' || form === 'mend') return ['direct', 'lingering', 'orbiting'];
  const all: Behavior[] = ['direct', 'chaining', 'piercing', 'homing', 'splitting', 'lingering', 'orbiting'];
  return all.filter((b) => {
    if (b === 'homing' && delivery !== 'projectile') return false;
    if (b === 'splitting' && (delivery === 'beam' || form === 'nova' || form === 'storm')) return false;
    if (b === 'lingering' && form === 'storm') return false;
    return true;
  });
}

export function recipeComplexity(r: SpellRecipe, maxGen: number): number {
  return 1 + r.modifiers.length + (r.catalyst ? 1 : 0) + (r.conditional !== 'none' ? 1 : 0) + (r.trigger !== 'onCast' ? 1 : 0) + Math.floor(maxGen / 2);
}

export function canonicalRecipe(r: SpellRecipe): string {
  const ing = (i?: Ingredient) => (i ? `${i.kind[0]}:${i.id}` : '-');
  return [
    ing(r.essence),
    r.form,
    r.delivery,
    r.behavior,
    r.modifiers.map(ing).sort().join(','),
    ing(r.catalyst),
    r.trigger,
    r.conditional,
    [...r.evolution].sort().join(','),
  ].join('|');
}

export function recipeId(r: SpellRecipe): string {
  return hashId('spl', canonicalRecipe(r));
}

export interface CompileOptions {
  maxModifiers?: number;
  maxComplexity?: number;
  customName?: string;
}

export type CompileResult = { ok: true; spell: CompiledSpell } | { ok: false; errors: string[] };

const TRAIT_CAP = 1.5;
/** Damage-equivalent value bought per point of mana. Mana is the universal budget. */
export const BASE_MANA_EFFICIENCY = 5;
export const MAX_MANA = 80;
const MANA_EFF_FORM: Record<Form, number> = { bolt: 1.1, lance: 1, orb: 1.02, nova: 0.95, storm: 1, ward: 1, mend: 1, hex: 0.9 };
const STATUS_VALUE: Record<string, number> = { chill: 14, stun: 30, conductive: 10, blighted: 16, vulnerable: 28, slowed: 10, frozen: 0 };

export function compileSpell(recipe: SpellRecipe, lib: ComponentLib, opts: CompileOptions = {}): CompileResult {
  const errors: string[] = [];
  // canonical modifier order: compilation must not depend on slot order
  recipe = { ...recipe, modifiers: [...recipe.modifiers].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)) };
  const maxMods = opts.maxModifiers ?? 3;
  const ess = resolveIngredient(recipe.essence, lib);
  if (!ess) errors.push('The essence is missing or unknown.');
  if (recipe.modifiers.length > maxMods) errors.push(`Too many modifiers (max ${maxMods}).`);
  const modKeys = recipe.modifiers.map((m) => `${m.kind}:${m.id}`);
  if (new Set(modKeys).size !== modKeys.length) errors.push('The same modifier cannot be used twice.');
  const mods = recipe.modifiers.map((m) => resolveIngredient(m, lib));
  if (mods.some((m) => !m)) errors.push('A modifier is missing or unknown.');
  const cat = recipe.catalyst ? resolveIngredient(recipe.catalyst, lib) : null;
  if (recipe.catalyst && !cat) errors.push('The catalyst is missing or unknown.');
  if (!FORM_INFO[recipe.form]) errors.push('Unknown form.');
  else {
    if (!validDeliveries(recipe.form).includes(recipe.delivery)) errors.push(`${FORM_INFO[recipe.form].name} cannot use ${recipe.delivery} delivery.`);
    if (!validBehaviors(recipe.form, recipe.delivery).includes(recipe.behavior)) errors.push(`${recipe.behavior} behavior is incompatible with this form and delivery.`);
  }
  const fb = FORM_INFO[recipe.form];
  if (fb && recipe.conditional !== 'none' && (fb.kind === 'shield' || fb.kind === 'heal')) errors.push('Conditional effects only apply to offensive spells.');
  if (fb && (fb.kind === 'shield' || fb.kind === 'heal') && recipe.trigger !== 'onCast' && recipe.trigger !== 'onHit') errors.push('That trigger only applies to offensive spells.');
  const evoTiers = new Set<number>();
  for (const e of recipe.evolution) {
    const node = EVOLUTION.find((n) => n.id === e);
    if (!node) errors.push(`Unknown evolution ${e}.`);
    else if (evoTiers.has(node.tier)) errors.push('Only one evolution per tier.');
    else evoTiers.add(node.tier);
  }
  if (errors.length || !ess || !fb) return { ok: false, errors };

  const parts = [ess, ...(mods as ResolvedIngredient[]), ...(cat ? [cat] : [])];
  for (const p of parts.slice(1)) {
    if (elementAffinity(ess.element, p.element) <= -0.45)
      errors.push(`${ELEMENT_INFO[ess.element].name} essence rejects ${ELEMENT_INFO[p.element].name} (${p.name}).`);
  }
  const maxGen = Math.max(...parts.map((p) => p.generation));
  const complexity = recipeComplexity(recipe, maxGen);
  if (opts.maxComplexity !== undefined && complexity > opts.maxComplexity) errors.push(`Spell complexity ${complexity} exceeds your mastery limit of ${opts.maxComplexity}.`);
  if (errors.length) return { ok: false, errors };

  // ---- aggregate properties & traits ----
  const P = { ...ess.props };
  const modList = mods as ResolvedIngredient[];
  if (modList.length) for (const k of Object.keys(P) as (keyof typeof P)[]) P[k] = P[k] * (1 - 0.22 * modList.length) + modList.reduce((sum, m) => sum + m.props[k] * 0.22, 0);
  const traits: Record<string, number> = {};
  const addT = (t: Trait, m: number) => (traits[t] = Math.min(TRAIT_CAP, (traits[t] ?? 0) + m));
  for (const t of ess.traits) addT(t.trait, t.mag);
  for (const m of mods as ResolvedIngredient[]) for (const t of m.traits) addT(t.trait, t.mag * 0.7);
  if (cat) {
    P.potency = Math.min(100, P.potency + 8);
    P.volatility += 8;
    const top = cat.traits[0];
    if (top) addT(top.trait, top.mag * 1.1);
    for (const t of cat.traits.slice(1, 2)) addT(t.trait, t.mag * 0.4);
  }
  const T = (t: Trait) => traits[t] ?? 0;
  const secondaryEl = [...(mods as ResolvedIngredient[]), ...(cat ? [cat] : [])].map((m) => m.element).find((e) => e !== ess.element) ?? ess.secondary;

  // ---- base by form ----
  const powerScale = 0.55 + (P.potency / 100) * 0.9; // 50 → 1.0
  let dmg = fb.dmg * powerScale;
  let heal = fb.heal * powerScale;
  let shield = fb.shield * powerScale;
  let cast = fb.cast;
  let cd = fb.cd;
  let manaEff = MANA_EFF_FORM[recipe.form];
  let travel = fb.travel;
  let dodgeable = fb.kind === 'attack' || fb.kind === 'hex';
  let pierce = recipe.form === 'lance' ? 0.15 : 0;
  let chain = 0;
  let hits = 1;
  let statusMult = recipe.form === 'nova' ? 1.3 : recipe.form === 'hex' ? 1.6 : 1;
  let reflect = 0;
  let linger: { dps: number; duration: number } | undefined;
  const desc: string[] = [];

  if (recipe.form === 'storm') {
    linger = { dps: 40 * powerScale, duration: 5 };
    dmg = 30 * powerScale;
  }
  if (recipe.form === 'nova' || recipe.form === 'storm' || recipe.form === 'hex') dodgeable = recipe.form === 'hex' && recipe.delivery === 'projectile';

  // ---- delivery ----
  switch (recipe.delivery) {
    case 'projectile':
      break;
    case 'beam':
      travel = 0;
      dodgeable = false;
      cast += 0.3;
      dmg *= 0.9;
      heal *= 0.95;
      break;
    case 'instant':
      travel = 0;
      dodgeable = false;
      cast *= 0.6;
      dmg *= 0.78;
      manaEff *= 0.92;
      break;
    case 'rune':
      travel = 1.0;
      dodgeable = true;
      dmg *= 1.25;
      break;
    case 'delayed':
      travel = 1.6;
      dodgeable = false;
      dmg *= 1.35;
      if (linger) linger.dps *= 1.2;
      cd += 1.5;
      break;
  }

  // ---- behavior ----
  switch (recipe.behavior) {
    case 'direct':
      break;
    case 'chaining':
      chain += 1;
      dmg *= 0.8;
      break;
    case 'piercing':
      pierce += 0.25;
      dmg *= 0.92;
      break;
    case 'homing':
      travel *= 1.3;
      break;
    case 'splitting':
      hits = 3;
      dmg *= 0.42;
      break;
    case 'lingering':
      if (fb.kind === 'shield') {
        shield *= 1.15;
        cd += 1;
      } else if (fb.kind === 'heal') {
        heal *= 1.2;
        cast += 0.3;
      } else {
        linger = { dps: dmg * 0.25, duration: 4 };
        dmg *= 0.75;
      }
      break;
    case 'orbiting':
      cast += 0.4;
      dmg *= 1.15;
      shield *= 1.1;
      reflect += 0.1;
      break;
  }

  // ---- traits → mechanics ----
  const statuses: StatusApplication[] = [];
  let dot: CompiledSpell['dot'];
  let lifesteal = 0;
  let manaBurn = 0;
  let interrupts = false; // only Disrupt traits, Spellsnap conditionals and specific evolutions interrupt
  let echo = 0;
  let backlash = Math.max(0, (P.volatility - P.stability) / 260);
  const isOff = fb.kind === 'attack' || fb.kind === 'hex';

  if (isOff) {
    pierce += T('pierce') * 0.35;
    chain += Math.round(T('chain') * 1.6);
    if (T('burn') > 0) dot = { type: 'burn', dps: Math.max(dmg, 30) * 0.13 * T('burn') * statusMult, duration: 4 };
    if (T('poison') > 0) dot = { type: 'poison', dps: Math.max(dmg, 30) * 0.11 * T('poison') * statusMult, duration: 6 };
    if (dot && T('amplify') > 0) dot.dps *= 1 + 0.5 * T('amplify');
    if (T('chill') > 0) statuses.push({ type: 'chill', chance: clamp(0.45 + 0.4 * T('chill') * statusMult, 0, 1), duration: 4, magnitude: 1 });
    if (T('conduct') > 0) statuses.push({ type: 'conductive', chance: clamp(0.5 + 0.4 * T('conduct'), 0, 1), duration: 4, magnitude: 0.12 + 0.12 * T('conduct') });
    if (T('stagger') > 0) statuses.push({ type: 'stun', chance: clamp(0.18 * T('stagger') * statusMult, 0, 0.45), duration: 0.6, magnitude: 1 });
    if (T('blight') > 0) statuses.push({ type: 'blighted', chance: clamp(0.6 + 0.3 * T('blight'), 0, 1), duration: 5, magnitude: clamp(0.35 + 0.3 * T('blight'), 0, 0.75) });
    if (recipe.form === 'hex') statuses.push({ type: 'vulnerable', chance: 1, duration: 5, magnitude: 0.18 + 0.08 * powerScale });
    if (T('haste') > 0 && ess.element === 'chrono') statuses.push({ type: 'slowed', chance: 0.6, duration: 3, magnitude: 0.2 + 0.15 * T('haste') });
    lifesteal += T('lifesteal') * 0.28 + T('mend') * 0.08;
    if (T('disrupt') > 0.25) interrupts = true;
    manaBurn = 14 * T('disrupt');
    dmg *= 1 + 0.25 * T('volatile');
  } else {
    if (fb.kind === 'shield') {
      shield *= 1 + 0.5 * T('fortify');
      reflect += T('reflect') * 0.3 + (ess.element === 'arcane' ? 0.05 : 0);
    }
    if (fb.kind === 'heal') heal *= 1 + 0.5 * T('mend') + 0.2 * T('lifesteal');
  }
  backlash += 0.08 * T('volatile');
  echo += clamp(T('echo') * 0.35, 0, 0.45);
  cast *= 1 - 0.25 * clamp(T('haste'), 0, 1);
  cast *= 1 - clamp((P.conductivity - 50) / 400, -0.1, 0.1);

  // ---- conditional & trigger ----
  let conditionalMult = CONDITIONAL_INFO[recipe.conditional].mult;
  if (recipe.conditional !== 'none') {
    dmg *= 0.9;
    manaEff *= 0.9;
    cast += 0.1;
    if (recipe.conditional === 'vsCasting') interrupts = true;
  }
  // innate shatter / thermal traits add implicit conditionals without the module
  if (recipe.conditional === 'none' && T('shatter') > 0.3) {
    conditionalMult = 1 + 0.5 * T('shatter');
  }
  if (recipe.trigger === 'onHit' || recipe.trigger === 'onKillshot') {
    dmg *= 0.9;
    heal *= 0.9;
    shield *= 0.9;
  }

  // ---- evolution ----
  const evo = new Set(recipe.evolution);
  const effMul = (m: number) => {
    dmg *= m;
    heal *= m;
    shield *= m;
    if (dot) dot.dps *= m;
    if (linger) linger.dps *= m;
  };
  if (evo.has('potent')) effMul(1.18);
  if (evo.has('thrifty')) effMul(0.92);
  if (evo.has('swift')) {
    cast *= 0.78;
    effMul(0.9);
  }
  if (evo.has('piercer')) {
    pierce += 0.2;
    cast += 0.2;
  }
  if (evo.has('arcing')) {
    chain += 1;
    effMul(0.88);
  }
  if (evo.has('warding')) cd *= 1.15;
  if (evo.has('overcharged')) {
    effMul(1.3);
    cd *= 1.2;
    backlash += 0.05;
  }
  if (evo.has('resonant')) echo += 0.15;
  if (evo.has('tactical')) {
    cd *= 0.75;
    effMul(0.88);
  }

  if (evo.has('thrifty')) manaEff *= 1.3;
  if (evo.has('potent')) manaEff *= 0.95;
  if (evo.has('resonant')) manaEff *= 0.9;

  // ---- caps (anti-exploit) ----
  pierce = clamp(pierce, 0, 0.75);
  chain = clamp(chain, 0, 3);
  echo = clamp(echo, 0, 0.5);
  backlash = clamp(backlash, 0, 0.3);
  reflect = clamp(reflect, 0, 0.4);
  lifesteal = clamp(lifesteal, 0, 0.45);
  cast = clamp(cast, 0.35, 3.5);
  cd = clamp(cd, 1.2, 16);

  let mana = 0;
  {
    const dmgValue = dmg * hits * (1 + chain * 0.5) + (dot ? dot.dps * dot.duration * (dot.type === 'poison' ? 1.5 : 1.15) : 0) + (linger ? linger.dps * linger.duration : 0);
    const value =
      dmgValue * (1 + pierce * 0.3) * (1 + echo * 0.6) * (1 + lifesteal * 0.8) +
      heal * 1.3 +
      shield * 1.0 * (1 + reflect) +
      statuses.reduce((sum, st) => sum + (STATUS_VALUE[st.type] ?? 10) * st.chance, 0) +
      manaBurn +
      (interrupts ? 10 : 0);
    const eff =
      BASE_MANA_EFFICIENCY *
      manaEff *
      (recipe.delivery === 'projectile' ? 1.05 : recipe.delivery === 'beam' ? 0.95 : 1) *
      (1 + 0.3 * clamp(T('efficiency'), 0, 1) + clamp((P.purity - 50) / 250, -0.1, 0.15));
    mana = Math.max(6, value / eff);
    if (mana > MAX_MANA) {
      // beyond the mana ceiling, power is scaled down rather than discounted
      effMul(MAX_MANA / mana);
      mana = MAX_MANA;
    }
  }
  if (dot) dot = { type: dot.type, dps: round1(dot.dps), duration: dot.duration };
  if (linger) linger = { dps: round1(linger.dps), duration: linger.duration };

  const tags = new Set<string>();
  if (isOff) tags.add('damage');
  if (pierce >= 0.25) tags.add('pierce');
  if (fb.kind === 'heal' || lifesteal >= 0.15) tags.add('heal');
  if (fb.kind === 'shield') tags.add('defense');
  if (conditionalMult > 1.2 && (recipe.conditional === 'vsFrozen' || T('shatter') > 0.3)) tags.add('shatter');
  if (recipe.conditional === 'vsShielded') tags.add('pierce');
  if (interrupts) tags.add('interrupt');
  if (statuses.some((s) => s.type === 'chill' || s.type === 'stun' || s.type === 'slowed')) tags.add('control');
  if (dot || linger) tags.add('dot');
  if (statuses.some((s) => s.type === 'blighted')) tags.add('blight');
  if (ess.element === 'storm' || chain > 0) tags.add('storm');
  const totalDmg = dmg * hits * (1 + chain * 0.5) + (dot ? dot.dps * dot.duration : 0) + (linger ? linger.dps * linger.duration : 0);
  if (isOff && totalDmg / Math.max(mana, 1) > 5.2) tags.add('efficient');
  if (fb.kind !== 'attack' && fb.kind !== 'hex' && mana < 22) tags.add('efficient');
  if (isOff && dmg * hits >= 120) tags.add('burst');

  const power = round1(
    ((totalDmg * (1 + pierce * 0.4) + heal * 0.9 + shield * 0.75) * (1 + echo) * (1 + lifesteal * 0.5)) / (cd + cast) +
      statuses.length * 3 +
      (interrupts ? 4 : 0),
  );

  // ---- visuals derived from mechanics ----
  const visual = deriveVisual(recipe, ess.element, secondaryEl, P, traits, travel, power, backlash);

  const name = opts.customName ?? spellName(recipe, ess, secondaryEl, traits);
  const spell: CompiledSpell = {
    recipeId: recipeId(recipe),
    mechanicId: '',
    name,
    element: ess.element,
    secondary: secondaryEl,
    form: recipe.form,
    delivery: recipe.delivery,
    behavior: recipe.behavior,
    kind: fb.kind,
    damage: round1(dmg),
    heal: round1(heal),
    shield: round1(shield),
    manaCost: Math.round(mana),
    castTime: round2(cast),
    cooldown: round1(cd),
    travelTime: round2(travel),
    dodgeable,
    rangeBand: fb.band,
    pierce: round2(pierce),
    chain,
    hits,
    dot,
    statuses: statuses.map((s) => ({ ...s, chance: round2(s.chance), magnitude: round2(s.magnitude) })),
    conditional: recipe.conditional,
    conditionalMult: round2(conditionalMult),
    trigger: recipe.trigger,
    lifesteal: round2(lifesteal),
    reflect: round2(reflect),
    interrupts,
    manaBurn: round1(manaBurn),
    echo: round2(echo),
    backlash: round2(backlash),
    linger,
    selfWard: evo.has('warding') ? 0.18 : 0,
    tags: [...tags].sort(),
    visual,
    power,
    complexity,
    description: desc,
  };
  spell.mechanicId = mechanicSignature(spell);
  spell.description = describeSpell(spell, evo.has('warding'));
  return { ok: true, spell };
}

export function mechanicSignature(s: CompiledSpell): string {
  const q = (v: number, step: number) => Math.round(v / step);
  const sig = [
    s.kind,
    s.element,
    q(s.damage, 6),
    q(s.heal, 8),
    q(s.shield, 8),
    q(s.manaCost, 2),
    q(s.castTime, 0.1),
    q(s.cooldown, 0.5),
    q(s.travelTime, 0.2),
    s.dodgeable ? 1 : 0,
    q(s.pierce, 0.05),
    s.chain,
    s.hits,
    s.dot ? `${s.dot.type}${q(s.dot.dps, 2)}` : '',
    s.statuses.map((x) => `${x.type}${q(x.chance, 0.1)}`).join(','),
    s.conditional,
    s.trigger,
    q(s.lifesteal, 0.05),
    q(s.reflect, 0.05),
    s.interrupts ? 1 : 0,
    q(s.echo, 0.05),
    s.linger ? q(s.linger.dps, 3) : '',
  ].join('|');
  return hashId('mch', sig);
}

const FORM_NOUNS: Record<Form, string[]> = {
  bolt: ['Bolt', 'Dart', 'Spark', 'Shot'],
  lance: ['Lance', 'Spear', 'Javelin', 'Pike'],
  orb: ['Orb', 'Sphere', 'Globe', 'Moon'],
  nova: ['Nova', 'Burst', 'Eruption', 'Blast'],
  storm: ['Tempest', 'Squall', 'Maelstrom', 'Deluge'],
  ward: ['Ward', 'Aegis', 'Barrier', 'Bastion'],
  mend: ['Mend', 'Renewal', 'Bloom', 'Salve'],
  hex: ['Hex', 'Curse', 'Malison', 'Bane'],
};
const ELEMENT_WORDS: Record<string, string[]> = {
  fire: ['Ember', 'Flame', 'Cinder', 'Pyre'],
  frost: ['Frost', 'Rime', 'Glacial', 'Hoar'],
  storm: ['Storm', 'Thunder', 'Volt', 'Gale'],
  shadow: ['Shadow', 'Umbral', 'Dusk', 'Gloom'],
  venom: ['Venom', 'Toxin', 'Blight', 'Viper'],
  arcane: ['Arcane', 'Runic', 'Astral', 'Prism'],
  earth: ['Stone', 'Granite', 'Quake', 'Bedrock'],
  chrono: ['Chrono', 'Hourglass', 'Aeon', 'Tempo'],
  life: ['Verdant', 'Bloom', 'Vital', 'Sylvan'],
};
const TRAIT_PREFIX: Partial<Record<Trait, string>> = {
  pierce: 'Piercing',
  chain: 'Forked',
  shatter: 'Shattering',
  thermal: 'Thermic',
  blight: 'Withering',
  echo: 'Echoing',
  disrupt: 'Silencing',
  volatile: 'Volatile',
  lifesteal: 'Siphoning',
  conduct: 'Conductive',
  stagger: 'Concussive',
  reflect: 'Mirrored',
  amplify: 'Festering',
  haste: 'Quick',
};

function spellName(r: SpellRecipe, ess: ResolvedIngredient, sec: string | undefined, traits: Record<string, number>): string {
  const h = hashString(canonicalRecipe(r));
  const el = ELEMENT_WORDS[ess.element];
  const top = Object.entries(traits)
    .filter(([t]) => TRAIT_PREFIX[t as Trait])
    .sort((a, b) => b[1] - a[1])[0];
  const prefix = top && top[1] > 0.35 ? TRAIT_PREFIX[top[0] as Trait] + ' ' : sec && h % 3 === 0 ? ELEMENT_WORDS[sec][h % 4] + '-' : '';
  return `${prefix}${el[h % el.length]} ${FORM_NOUNS[r.form][(h >>> 3) % 4]}`;
}

const PARTICLE: Record<string, SpellVisual['particle']> = {
  fire: 'flame',
  frost: 'flake',
  storm: 'spark',
  shadow: 'smoke',
  venom: 'drop',
  arcane: 'rune',
  earth: 'pebble',
  chrono: 'cog',
  life: 'leaf',
};
const IMPACT: Record<string, SpellVisual['impact']> = {
  fire: 'burst',
  frost: 'crystal',
  storm: 'arc',
  shadow: 'smoke',
  venom: 'splash',
  arcane: 'ring',
  earth: 'quake',
  chrono: 'ripple',
  life: 'bloom',
};

function deriveVisual(
  r: SpellRecipe,
  el: keyof typeof ELEMENT_INFO,
  sec: keyof typeof ELEMENT_INFO | undefined,
  P: Record<string, number>,
  traits: Record<string, number>,
  travel: number,
  power: number,
  backlash: number,
): SpellVisual {
  const info = ELEMENT_INFO[el];
  const secColor = sec ? ELEMENT_INFO[sec].color : info.color2;
  const fx = Object.entries(traits)
    .filter(([, m]) => m > 0.25)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t as Trait);
  return {
    primary: info.color,
    secondary: secColor,
    glow: info.color2,
    particle: PARTICLE[el],
    geometry: r.form,
    motion: r.behavior,
    delivery: r.delivery,
    size: round2(clamp(0.7 + power / 120, 0.7, 2)),
    trail: round2(clamp((P.conductivity + P.resonance) / 160, 0.1, 1)),
    speed: travel > 0 ? round2(1 / travel) : 99,
    impact: IMPACT[el],
    secondaryFx: fx,
    shimmer: round2(clamp(backlash * 4, 0, 1)),
  };
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function describeSpell(s: CompiledSpell, selfWard = false): string[] {
  const d: string[] = [];
  if (s.damage > 0) d.push(`Deals ${Math.round(s.damage)} ${s.element} damage${s.hits > 1 ? ` ×${s.hits}` : ''}${s.chain ? `, arcs ${s.chain}× more` : ''}.`);
  if (s.heal > 0) d.push(`Heals ${Math.round(s.heal)}.`);
  if (s.shield > 0) d.push(`Shields for ${Math.round(s.shield)}${s.reflect ? `, reflecting ${pct(s.reflect)}` : ''}.`);
  if (s.dot) d.push(`${s.dot.type === 'burn' ? 'Burns' : 'Poisons'} for ${s.dot.dps}/s over ${s.dot.duration}s${s.dot.type === 'poison' ? ' (stacks)' : ''}.`);
  if (s.linger) d.push(`Leaves a hazard dealing ${s.linger.dps}/s for ${s.linger.duration}s.`);
  for (const st of s.statuses) d.push(`${pct(st.chance)} chance: ${st.type}${st.type === 'chill' ? ' (3 stacks freeze)' : ''}.`);
  if (s.pierce > 0) d.push(`Pierces ${pct(s.pierce)} of shields and resistance.`);
  if (s.lifesteal > 0) d.push(`Lifesteal ${pct(s.lifesteal)}.`);
  if (s.interrupts) d.push('Interrupts enemy casting.');
  if (s.manaBurn > 0) d.push(`Burns ${Math.round(s.manaBurn)} enemy mana.`);
  if (s.echo > 0) d.push(`${pct(s.echo)} chance to echo (recast at 45%).`);
  if (s.conditional !== 'none') d.push(`${CONDITIONAL_INFO[s.conditional].name}: ${CONDITIONAL_INFO[s.conditional].desc}`);
  else if (s.conditionalMult > 1.01) d.push(`Shatters frozen foes for +${pct(s.conditionalMult - 1)}.`);
  if (s.trigger !== 'onCast') d.push(`${TRIGGER_INFO[s.trigger].name}: ${TRIGGER_INFO[s.trigger].desc}`);
  if (selfWard) d.push('Grants a small self-shield when cast.');
  if (s.dodgeable) d.push('Can be dodged.');
  if (s.backlash > 0.02) d.push(`Unstable: ${pct(s.backlash)} backlash chance.`);
  return d;
}

/** Theoretical number of distinct recipes given known ingredient counts. */
export function theoreticalCombinations(nIngredients: number, maxMods: number, nConditionals: number, nTriggers: number): number {
  let triples = 0;
  for (const f of Object.keys(FORM_INFO) as Form[]) for (const d of validDeliveries(f)) triples += validBehaviors(f, d).length;
  let modCombos = 0;
  const C = (n: number, k: number) => {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  };
  for (let k = 0; k <= maxMods; k++) modCombos += C(Math.max(nIngredients - 1, 0), k);
  const evoCombos = 4 * 4 * 4;
  return nIngredients * triples * modCombos * (nIngredients + 1) * nConditionals * nTriggers * evoCombos;
}
