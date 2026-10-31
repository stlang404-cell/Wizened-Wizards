// ARCANE GENETICS — the procedural component invention engine.
// Materials and components are combined through typed operations into new components
// with inherited and emergent traits. Everything is deterministic and bounded.

import { ELEMENT_INFO, elementAffinity, getMaterial } from './data/materials';
import { clamp, hashId, hashString, Rng } from './rng';
import type { Component, Element, Ingredient, Props, PropKey, Rarity, SynthOp, Trait, TraitValue } from './types';
import { PROPS } from './types';

export const MAX_STRAIN = 6;
export const MAX_TRAITS = 4;
export const ABSOLUTE_MAX_GENERATION = 8;

export type ComponentLib = Record<string, Component>;

export interface ResolvedIngredient {
  id: string;
  kind: 'material' | 'component';
  name: string;
  element: Element;
  secondary?: Element;
  props: Props;
  traits: TraitValue[];
  generation: number;
  strain: number;
  rarity: Rarity;
  tags: string[];
}

export function resolveIngredient(ing: Ingredient, lib: ComponentLib): ResolvedIngredient | null {
  if (ing.kind === 'material') {
    const m = getMaterial(ing.id);
    if (!m) return null;
    return {
      id: m.id,
      kind: 'material',
      name: m.name,
      element: m.element,
      props: { ...m.props },
      traits: deriveTraits(m.element, m.props, m.tags),
      generation: 0,
      strain: 0,
      rarity: m.rarity,
      tags: m.tags,
    };
  }
  const c = lib[ing.id];
  if (!c) return null;
  return {
    id: c.id,
    kind: 'component',
    name: c.name,
    element: c.element,
    secondary: c.secondary,
    props: { ...c.props },
    traits: c.traits.map((t) => ({ ...t })),
    generation: c.generation,
    strain: c.strain,
    rarity: c.rarity,
    tags: [],
  };
}

const ELEMENT_TRAITS: Record<Element, [Trait, PropKey][]> = {
  fire: [['burn', 'potency']],
  frost: [['chill', 'stability']],
  storm: [['conduct', 'conductivity']],
  shadow: [['lifesteal', 'resonance']],
  venom: [['poison', 'potency']],
  arcane: [['pierce', 'purity']],
  earth: [['fortify', 'stability']],
  chrono: [['echo', 'resonance']],
  life: [['mend', 'purity']],
};

const SECONDARY_ELEMENT_TRAITS: Record<Element, [Trait, PropKey, number]> = {
  fire: ['volatile', 'volatility', 50],
  frost: ['shatter', 'purity', 55],
  storm: ['chain', 'conductivity', 60],
  shadow: ['blight', 'resonance', 55],
  venom: ['amplify', 'resonance', 55],
  arcane: ['disrupt', 'conductivity', 55],
  earth: ['stagger', 'potency', 55],
  chrono: ['haste', 'conductivity', 45],
  life: ['efficiency', 'purity', 58],
};

/** Derive traits purely from element + properties + tags. */
export function deriveTraits(element: Element, p: Props, tags: string[] = []): TraitValue[] {
  const out: Record<string, number> = {};
  const add = (t: Trait, m: number) => {
    out[t] = Math.max(out[t] ?? 0, clamp(m, 0, 1.2));
  };
  for (const [t, k] of ELEMENT_TRAITS[element]) add(t, 0.3 + p[k] / 140);
  const [st, sk, thr] = SECONDARY_ELEMENT_TRAITS[element];
  if (p[sk] >= thr) add(st, (p[sk] - thr) / 60 + 0.25);
  if (p.purity >= 66) add('efficiency', (p.purity - 60) / 60);
  if (p.resonance >= 72) add('echo', (p.resonance - 60) / 80);
  if (p.volatility >= 62) add('volatile', (p.volatility - 50) / 60);
  if (p.stability >= 76) add('fortify', (p.stability - 60) / 60);
  if (p.conductivity >= 76) add('chain', (p.conductivity - 60) / 60);
  if (tags.includes('glass')) add('reflect', 0.35);
  if (tags.includes('draconic')) add('amplify', 0.3);
  if (tags.includes('celestial')) add('pierce', 0.3);
  if (tags.includes('feather')) add('haste', 0.3);
  return topTraits(Object.entries(out).map(([trait, mag]) => ({ trait: trait as Trait, mag })));
}

function topTraits(list: TraitValue[], n = MAX_TRAITS): TraitValue[] {
  return list
    .filter((t) => t.mag > 0.05)
    .sort((a, b) => b.mag - a.mag || a.trait.localeCompare(b.trait))
    .slice(0, n)
    .map((t) => ({ trait: t.trait, mag: Math.round(t.mag * 100) / 100 }));
}

function mergeTraits(lists: TraitValue[][], scale = 1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lists) for (const t of l) out[t.trait] = Math.max(out[t.trait] ?? 0, t.mag * scale);
  return out;
}

/** Emergent traits created when two elements meet in a fusion. */
const EMERGENT: Record<string, [Trait, number][]> = {
  'fire|frost': [['thermal', 0.6]],
  'fire|storm': [['volatile', 0.4], ['chain', 0.25]],
  'storm|arcane': [['pierce', 0.45], ['chain', 0.3]],
  'shadow|venom': [['blight', 0.55]],
  'arcane|chrono': [['echo', 0.45]],
  'frost|earth': [['shatter', 0.5], ['stagger', 0.2]],
  'frost|storm': [['conduct', 0.3], ['chill', 0.3]],
  'shadow|arcane': [['disrupt', 0.45]],
  'venom|fire': [['amplify', 0.45]],
  'earth|life': [['fortify', 0.45], ['mend', 0.3]],
  'chrono|frost': [['haste', 0.35], ['chill', 0.25]],
  'shadow|chrono': [['lifesteal', 0.35], ['echo', 0.2]],
  'arcane|life': [['efficiency', 0.4]],
  'storm|chrono': [['haste', 0.45]],
  'earth|fire': [['stagger', 0.35]],
};

function emergentFor(a: Element, b: Element): [Trait, number][] {
  return EMERGENT[`${a}|${b}`] ?? EMERGENT[`${b}|${a}`] ?? [];
}

// ------------------- naming -------------------

const NOUN_BY_PROP: Record<PropKey, string[]> = {
  potency: ['Core', 'Heart', 'Ember', 'Kernel'],
  stability: ['Anchor', 'Keystone', 'Bulwark', 'Lattice'],
  conductivity: ['Conductor', 'Filament', 'Coil', 'Channel'],
  volatility: ['Catalyst', 'Fuse', 'Spark', 'Flux'],
  resonance: ['Resonator', 'Chime', 'Harmonic', 'Echo'],
  purity: ['Essence', 'Distillate', 'Tincture', 'Quintessence'],
};
const TAG_ADJ: Record<string, string> = {
  draconic: 'Draconic',
  celestial: 'Celestial',
  beast: 'Feral',
  plant: 'Sylvan',
  rune: 'Runic',
  metal: 'Gilded',
  glass: 'Prismatic',
  feather: 'Gale',
  fungus: 'Mycelial',
  ink: 'Scribed',
  cloth: 'Woven',
  rebirth: 'Reborn',
  mineral: 'Crystalline',
  wood: 'Oaken',
};
const TRAIT_ADJ: Partial<Record<Trait, string>> = {
  pierce: 'Piercing',
  chain: 'Forking',
  shatter: 'Shattering',
  thermal: 'Thermic',
  blight: 'Blighted',
  echo: 'Echoing',
  disrupt: 'Disruptive',
  volatile: 'Unstable',
  amplify: 'Amplifying',
  fortify: 'Fortified',
  lifesteal: 'Siphoning',
  haste: 'Quickened',
  stagger: 'Concussive',
  reflect: 'Mirrored',
  efficiency: 'Frugal',
};

function nameComponent(seedStr: string, element: Element, props: Props, traits: TraitValue[], tags: string[], op: SynthOp): string {
  const rng = new Rng(hashString(seedStr));
  const topProp = (Object.keys(props) as PropKey[]).sort((a, b) => props[b] - props[a])[0];
  const noun = rng.pick(NOUN_BY_PROP[topProp]);
  const tagAdj = tags.map((t) => TAG_ADJ[t]).filter(Boolean);
  let adj: string;
  if (op === 'extract') adj = `${ELEMENT_INFO[element].adj}`;
  else if (tagAdj.length && rng.chance(0.6)) adj = rng.pick(tagAdj);
  else {
    const t = traits.find((tr) => TRAIT_ADJ[tr.trait]);
    adj = t && rng.chance(0.7) ? TRAIT_ADJ[t.trait]! : ELEMENT_INFO[element].adj;
  }
  const opSuffix: Partial<Record<SynthOp, string>> = { refine: ' (Refined)', stabilize: ' (Stable)', amplify: ' (Amplified)' };
  return `${adj} ${noun}${opSuffix[op] ?? ''}`;
}

function rarityFrom(props: Props, gen: number, inputs: Rarity[]): Rarity {
  const avg = (props.potency + props.purity + props.resonance) / 3;
  const base = Math.max(...inputs, 0);
  let r = base;
  if (avg > 62 && gen >= 2) r = Math.max(r, 2);
  if (avg > 72 && gen >= 3) r = Math.max(r, 3);
  if (avg > 82 && gen >= 4) r = Math.max(r, 4);
  return clamp(r, 0, 4) as Rarity;
}

function noteFor(traits: TraitValue[], props: Props): string {
  const pos = traits.slice(0, 2).map((t) => t.trait);
  const parts: string[] = [];
  if (pos.length) parts.push(`Grants ${pos.join(' & ')}`);
  if (props.volatility - props.stability > 15) parts.push('dangerously unstable');
  else if (props.stability > 70) parts.push('very stable');
  if (props.purity > 70) parts.push('mana-efficient');
  return parts.join('; ') + '.';
}

// ------------------- operations -------------------

export interface SynthContext {
  lib: ComponentLib;
  maxGeneration: number; // laboratory level gate
  day: number;
  inventor: string;
  nonce?: number; // for mutate
}

export type SynthResult = { ok: true; components: Component[]; cost: number } | { ok: false; error: string };

export const OP_INFO: Record<SynthOp, { name: string; inputs: string; desc: string; minLab: number }> = {
  fuse: { name: 'Fuse', inputs: '2–3 ingredients', desc: 'Blend ingredients; inherit traits and discover emergent ones.', minLab: 0 },
  extract: { name: 'Extract', inputs: '1 material ×2', desc: 'Distil a material into a purer elemental essence.', minLab: 0 },
  refine: { name: 'Refine', inputs: '1 component', desc: '+Purity, −Volatility. Cheaper spells.', minLab: 1 },
  stabilize: { name: 'Stabilize', inputs: '1 component', desc: '+Stability, removes backlash risk, −Potency.', minLab: 1 },
  amplify: { name: 'Amplify', inputs: '1 component + 1 material', desc: '+Potency at the cost of stability. Strains the component.', minLab: 2 },
  mutate: { name: 'Mutate', inputs: '1 component', desc: 'Unpredictable trait mutation. High strain.', minLab: 3 },
  split: { name: 'Split', inputs: '1 component', desc: 'Separate into two weaker components along elemental lines.', minLab: 3 },
};

export function synthCost(op: SynthOp, gen: number): number {
  const base: Record<SynthOp, number> = { fuse: 12, extract: 6, refine: 10, stabilize: 10, amplify: 18, mutate: 22, split: 14 };
  return Math.round(base[op] * Math.pow(1 + gen, 1.35));
}

function finish(
  op: SynthOp,
  idSeed: string,
  inputs: ResolvedIngredient[],
  element: Element,
  secondary: Element | undefined,
  props: Props,
  traitMap: Record<string, number>,
  generation: number,
  strain: number,
  ctx: SynthContext,
): Component {
  for (const k of PROPS) props[k] = Math.round(clamp(props[k], 1, 100));
  // re-derive intrinsic traits from new properties and merge with inherited ones
  const intrinsic = deriveTraits(element, props, []);
  for (const t of intrinsic) traitMap[t.trait] = Math.max(traitMap[t.trait] ?? 0, t.mag);
  // instability blocks fortify-heavy combos; unstable mixtures always carry volatility
  if (props.volatility - props.stability > 20) traitMap.volatile = Math.max(traitMap.volatile ?? 0, (props.volatility - props.stability) / 80);
  const traits = topTraits(Object.entries(traitMap).map(([trait, mag]) => ({ trait: trait as Trait, mag: Math.min(mag, 1.2) })));
  const id = hashId('cmp', idSeed);
  const tags = Array.from(new Set(inputs.flatMap((i) => i.tags)));
  return {
    id,
    name: nameComponent(idSeed, element, props, traits, tags, op),
    element,
    secondary: secondary && secondary !== element ? secondary : undefined,
    props,
    traits,
    generation,
    strain,
    op,
    inputs: inputs.map((i) => i.id),
    rarity: rarityFrom(props, generation, inputs.map((i) => i.rarity)),
    createdAt: ctx.day,
    inventor: ctx.inventor,
    notes: noteFor(traits, props),
  };
}

export function fuse(ings: Ingredient[], ctx: SynthContext): SynthResult {
  if (ings.length < 2 || ings.length > 3) return { ok: false, error: 'Fusion requires 2 or 3 ingredients.' };
  const ids = ings.map((i) => `${i.kind}:${i.id}`);
  if (new Set(ids).size !== ids.length && ings.every((i) => i.kind === 'component'))
    return { ok: false, error: 'A component cannot be fused with itself.' };
  const res = ings.map((i) => resolveIngredient(i, ctx.lib));
  if (res.some((r) => !r)) return { ok: false, error: 'Unknown ingredient.' };
  const r = res as ResolvedIngredient[];
  const generation = Math.max(...r.map((x) => x.generation)) + 1;
  if (generation > Math.min(ctx.maxGeneration, ABSOLUTE_MAX_GENERATION))
    return { ok: false, error: `Your laboratory can only handle invention depth ${ctx.maxGeneration}. Upgrade the Laboratory.` };
  const strain = Math.max(...r.map((x) => x.strain)) + 1;
  if (strain > MAX_STRAIN) return { ok: false, error: 'These ingredients are too strained to fuse further.' };

  // compatibility
  let compat = 0;
  let pairs = 0;
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      compat += elementAffinity(r[i].element, r[j].element);
      pairs++;
    }
  compat /= pairs;
  if (compat <= -0.45) return { ok: false, error: `${ELEMENT_INFO[r[0].element].name} and ${ELEMENT_INFO[r[1].element].name} violently repel each other.` };

  // dominant element weighted by potency
  const weight: Partial<Record<Element, number>> = {};
  // conductive ingredients channel their element more strongly
  for (const x of r) weight[x.element] = (weight[x.element] ?? 0) + x.props.potency + x.props.conductivity * 0.5 + 10;
  const ranked = (Object.keys(weight) as Element[]).sort((a, b) => weight[b]! - weight[a]! || a.localeCompare(b));
  const element = ranked[0];
  const secondary = ranked[1];

  const props = {} as Props;
  for (const k of PROPS) props[k] = r.reduce((s, x) => s + x.props[k], 0) / r.length;
  const maxPot = Math.max(...r.map((x) => x.props.potency));
  // fusion synergy, bounded so recursion cannot amplify forever
  props.potency = Math.min(props.potency + 5 * (r.length - 1) + 12 * compat, maxPot + 8, 96);
  props.resonance += 6 * compat + 3;
  props.stability += 10 * compat - 3 * (r.length - 1);
  props.volatility += compat < 0 ? -compat * 30 : 2;
  props.purity -= 2;

  const traitMap = mergeTraits(r.map((x) => x.traits), 0.92);
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++)
      for (const [t, m] of emergentFor(r[i].element, r[j].element)) traitMap[t] = Math.max(traitMap[t] ?? 0, m + Math.max(0, compat) * 0.3);

  const idSeed = `fuse|${[...ids].sort().join('+')}`;
  r.sort((a, b) => a.id.localeCompare(b.id));
  const c = finish('fuse', idSeed, r, element, secondary, props, traitMap, generation, strain, ctx);
  return { ok: true, components: [c], cost: synthCost('fuse', generation) };
}

export function extract(materialId: string, ctx: SynthContext): SynthResult {
  const x = resolveIngredient({ kind: 'material', id: materialId }, ctx.lib);
  if (!x) return { ok: false, error: 'Unknown material.' };
  const props = { ...x.props };
  props.purity += 18;
  props.potency -= 6;
  props.volatility -= 6;
  props.resonance += 4;
  const traitMap: Record<string, number> = {};
  const best = x.traits[0];
  if (best) traitMap[best.trait] = best.mag * 1.3;
  for (const t of x.traits.slice(1, 3)) traitMap[t.trait] = t.mag * 0.8;
  const c = finish('extract', `extract|${materialId}`, [x], x.element, undefined, props, traitMap, 1, 1, ctx);
  c.name = `Essence of ${x.name}`;
  return { ok: true, components: [c], cost: synthCost('extract', 0) };
}

function single(op: SynthOp, compId: string, ctx: SynthContext): ResolvedIngredient | string {
  const x = resolveIngredient({ kind: 'component', id: compId }, ctx.lib);
  if (!x) return 'Unknown component.';
  return x;
}

export function refine(compId: string, ctx: SynthContext): SynthResult {
  const x = single('refine', compId, ctx);
  if (typeof x === 'string') return { ok: false, error: x };
  if (x.strain + 1 > MAX_STRAIN) return { ok: false, error: 'Component is at maximum strain.' };
  const props = { ...x.props };
  props.purity += 12;
  props.volatility -= 7;
  props.potency -= 3;
  const tm = mergeTraits([x.traits]);
  if (tm.efficiency !== undefined) tm.efficiency += 0.1;
  const c = finish('refine', `refine|${x.id}`, [x], x.element, x.secondary, props, tm, x.generation, x.strain + 1, ctx);
  return { ok: true, components: [c], cost: synthCost('refine', x.generation) };
}

export function stabilize(compId: string, ctx: SynthContext): SynthResult {
  const x = single('stabilize', compId, ctx);
  if (typeof x === 'string') return { ok: false, error: x };
  if (x.strain + 1 > MAX_STRAIN) return { ok: false, error: 'Component is at maximum strain.' };
  const props = { ...x.props };
  props.stability += 18;
  props.volatility -= 16;
  props.potency -= 5;
  const tm = mergeTraits([x.traits]);
  delete tm.volatile;
  const c = finish('stabilize', `stabilize|${x.id}`, [x], x.element, x.secondary, props, tm, x.generation, x.strain + 1, ctx);
  c.traits = c.traits.filter((t) => t.trait !== 'volatile' || props.volatility - props.stability > 20);
  return { ok: true, components: [c], cost: synthCost('stabilize', x.generation) };
}

export function amplify(compId: string, materialId: string, ctx: SynthContext): SynthResult {
  const x = single('amplify', compId, ctx);
  if (typeof x === 'string') return { ok: false, error: x };
  const m = resolveIngredient({ kind: 'material', id: materialId }, ctx.lib);
  if (!m) return { ok: false, error: 'Unknown material.' };
  if (m.element !== x.element) return { ok: false, error: `Amplification needs a ${ELEMENT_INFO[x.element].name} material.` };
  if (x.strain + 2 > MAX_STRAIN) return { ok: false, error: 'Component would exceed maximum strain.' };
  const props = { ...x.props };
  const gain = Math.max(2, Math.min(14, (m.props.potency - x.props.potency) / 3 + 10));
  props.potency = Math.min(props.potency + gain, 98);
  props.stability -= 14;
  props.volatility += 10;
  const tm = mergeTraits([x.traits]);
  const top = x.traits[0];
  if (top) tm[top.trait] = top.mag * 1.15;
  const c = finish('amplify', `amplify|${x.id}|${m.id}`, [x, m], x.element, x.secondary, props, tm, x.generation, x.strain + 2, ctx);
  return { ok: true, components: [c], cost: synthCost('amplify', x.generation) };
}

const MUTABLE: Trait[] = ['pierce', 'chain', 'shatter', 'echo', 'disrupt', 'stagger', 'haste', 'reflect', 'blight', 'amplify', 'lifesteal', 'thermal', 'efficiency'];

export function mutate(compId: string, ctx: SynthContext): SynthResult {
  const x = single('mutate', compId, ctx);
  if (typeof x === 'string') return { ok: false, error: x };
  if (x.strain + 2 > MAX_STRAIN) return { ok: false, error: 'Component would exceed maximum strain.' };
  const nonce = ctx.nonce ?? 0;
  const rng = new Rng(hashString(`mutate|${x.id}|${nonce}`));
  const props = { ...x.props };
  for (const k of PROPS) props[k] += rng.range(-12, 12);
  props.stability -= 6;
  const tm = mergeTraits([x.traits]);
  // drop the weakest trait and gain a new random one
  const weakest = x.traits[x.traits.length - 1];
  if (weakest && x.traits.length >= 2) delete tm[weakest.trait];
  const gained = rng.pick(MUTABLE);
  tm[gained] = Math.max(tm[gained] ?? 0, rng.range(0.35, 0.8));
  const c = finish('mutate', `mutate|${x.id}|${nonce}`, [x], x.element, x.secondary, props, tm, x.generation, x.strain + 2, ctx);
  return { ok: true, components: [c], cost: synthCost('mutate', x.generation) };
}

export function split(compId: string, ctx: SynthContext): SynthResult {
  const x = single('split', compId, ctx);
  if (typeof x === 'string') return { ok: false, error: x };
  if (!x.secondary) return { ok: false, error: 'Only multi-element components can be split.' };
  if (x.strain + 1 > MAX_STRAIN) return { ok: false, error: 'Component is at maximum strain.' };
  const half = (elem: Element, idx: number) => {
    const props = { ...x.props };
    props.potency *= 0.82;
    props.resonance *= 0.85;
    props.purity += 6;
    const tm: Record<string, number> = {};
    x.traits.forEach((t, i) => {
      if (i % 2 === idx) tm[t.trait] = t.mag * 0.85;
    });
    return finish('split', `split|${x.id}|${idx}`, [x], elem, undefined, props, tm, x.generation, x.strain + 1, ctx);
  };
  return { ok: true, components: [half(x.element, 0), half(x.secondary, 1)], cost: synthCost('split', x.generation) };
}

/** Walk a component's ancestry to the raw materials. */
export function ancestryTree(id: string, lib: ComponentLib, depth = 0): AncestryNode {
  const c = lib[id];
  if (!c || depth > 12) {
    const m = getMaterial(id);
    return { id, name: m?.name ?? id, kind: 'material', element: m?.element ?? 'arcane', children: [] };
  }
  return {
    id,
    name: c.name,
    kind: 'component',
    element: c.element,
    op: c.op,
    children: c.inputs.map((i) => ancestryTree(i, lib, depth + 1)),
  };
}
export interface AncestryNode {
  id: string;
  name: string;
  kind: 'material' | 'component';
  element: Element;
  op?: SynthOp;
  children: AncestryNode[];
}

/** Raw materials (with counts) required to rebuild a component from scratch. */
export function rawMaterialsFor(id: string, lib: ComponentLib, out: Record<string, number> = {}, depth = 0): Record<string, number> {
  const c = lib[id];
  if (!c || depth > 12) {
    out[id] = (out[id] ?? 0) + 1;
    return out;
  }
  if (c.op === 'extract') {
    out[c.inputs[0]] = (out[c.inputs[0]] ?? 0) + 2;
    return out;
  }
  for (const i of c.inputs) rawMaterialsFor(i, lib, out, depth + 1);
  return out;
}
