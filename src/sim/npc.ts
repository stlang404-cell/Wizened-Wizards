// Persistent NPC wizards: generation, combat builds, and adaptive behaviour.
import { compileSpell, recipeId, validBehaviors, validDeliveries } from './compiler';
import { EQUIPMENT, EQUIP_MAP } from './data/equipment';
import { MATERIALS, elementAffinity } from './data/materials';
import { fuse, type ComponentLib } from './genetics';
import { attributeCap, tierBaseRating } from './hierarchy';
import { PERSONALITIES, PERSONALITY_INFO, wizardName, type Personality } from './names';
import { Rng, clamp, hashString } from './rng';
import type { NpcState } from './state';
import type {
  Attrs,
  Behavior,
  CombatWizard,
  CompiledSpell,
  Conditional,
  Delivery,
  Element,
  Form,
  Ingredient,
  SpellRecipe,
  TacticRule,
  WizardLook,
} from './types';
import { ATTRS, ELEMENTS } from './types';
import { researchForTier, LAB_LEVELS } from './upgrades';
import { estimateWinProbability } from './combat';

// ---------- compile cache (components are immutable, so recipe id → spell is stable) ----------
const cache = new Map<string, CompiledSpell>();
export function compileCached(r: SpellRecipe, lib: ComponentLib, name?: string): CompiledSpell | null {
  const key = recipeId(r) + (name ?? '');
  const hit = cache.get(key);
  if (hit) return hit;
  const res = compileSpell(r, lib, { customName: name });
  if (!res.ok) return null;
  cache.set(key, res.spell);
  if (cache.size > 6000) cache.clear();
  return res.spell;
}

export function labForTier(tier: number) {
  return LAB_LEVELS[clamp(tier, 0, LAB_LEVELS.length - 1)];
}

function rarityCap(tier: number) {
  return tier === 0 ? 1 : tier < 4 ? 2 : tier < 6 ? 3 : 4;
}

function materialFor(rng: Rng, el: Element, tier: number, preferHigh = true): string {
  const opts = MATERIALS.filter((m) => m.element === el && m.minTier <= tier && m.rarity <= rarityCap(tier));
  if (!opts.length) return MATERIALS.find((m) => m.element === el)!.id;
  opts.sort((a, b) => a.rarity - b.rarity);
  if (preferHigh && rng.chance(0.65)) return opts[opts.length - 1 - rng.int(0, Math.min(1, opts.length - 1))].id;
  return rng.pick(opts).id;
}

const LOOK_ROBES = [0x5a2a6e, 0x2a3f6e, 0x6e2a2a, 0x2a5e3a, 0x6e5a2a, 0x3a3a4a, 0x7a3a5a, 0x2a5a6a, 0x4a2a1a, 0x1f2a44];
const LOOK_TRIM = [0xd9b44a, 0xc0c0d0, 0xe07a3a, 0x8affc0, 0x7fd8ff, 0xb98cff];
export function randomLook(rng: Rng, el?: Element): WizardLook {
  const elRobe: Partial<Record<Element, number>> = { fire: 0x7a2a1a, frost: 0x2a4a7a, storm: 0x3a2a6e, shadow: 0x2a1a3a, venom: 0x2a4a22, arcane: 0x1f3a6e, earth: 0x5a3a1f, chrono: 0x6e5a22, life: 0x2a5a3a };
  return {
    robe: el && rng.chance(0.6) ? elRobe[el]! : rng.pick(LOOK_ROBES),
    trim: rng.pick(LOOK_TRIM),
    hat: rng.pick(['pointed', 'hood', 'crown', 'wide', 'circlet'] as const),
    beard: rng.pick(['none', 'none', 'short', 'long', 'braided'] as const),
    skin: rng.pick([0xf2d0b0, 0xe0b090, 0xc08a60, 0x8a5a3a, 0x5a3a2a, 0xf8e0c8]),
    hair: rng.pick([0x2a1a10, 0x6a4a2a, 0xc0a060, 0xe0e0e0, 0x8a2a1a, 0x3a3a3a, 0xf0f0f0]),
    staff: rng.pick([0x6a4a2a, 0x3a2a1a, 0xa08060, 0x2a2a2a]),
  };
}

type Role = 'attack' | 'defense' | 'heal' | 'utility';

const FORMS_BY_ROLE: Record<Role, Form[]> = {
  attack: ['bolt', 'lance', 'orb', 'nova', 'storm'],
  defense: ['ward'],
  heal: ['mend'],
  utility: ['hex', 'bolt'],
};

const CONDITIONAL_BY_ELEMENT: Partial<Record<Element, Conditional>> = {
  frost: 'vsFrozen',
  storm: 'vsConductive',
  venom: 'vsPoisoned',
  fire: 'vsBurning',
  arcane: 'vsShielded',
  earth: 'vsShielded',
  shadow: 'vsCasting',
  chrono: 'vsCasting',
};

/** Generate a spell recipe using exactly the same unlocks and grammar as the player. */
export function generateRecipe(rng: Rng, tier: number, el: Element, el2: Element, role: Role, personality: Personality, lib: ComponentLib, day = 0, inventor = 'npc'): SpellRecipe {
  const research = new Set(researchForTier(tier));
  const lab = labForTier(tier);
  for (let attempt = 0; attempt < 10; attempt++) {
    let forms = FORMS_BY_ROLE[role].filter((f) => research.has(`form:${f}`));
    if (personality === 'showman' && role === 'attack') forms = forms.filter((f) => f !== 'bolt' || forms.length === 1);
    if (!forms.length) forms = ['bolt'];
    const form = rng.pick(forms);
    let element = el;
    if (role === 'heal') element = rng.chance(0.6) ? 'life' : el;
    if (role === 'defense') element = rng.chance(0.5) ? 'earth' : el;
    let essence: Ingredient = { kind: 'material', id: materialFor(rng, element, tier) };
    if (tier >= 1 && rng.chance(0.35 + tier * 0.08) && elementAffinity(element, el2) > -0.4) {
      const res = fuse([essence, { kind: 'material', id: materialFor(rng, rng.chance(0.6) ? el2 : element, tier) }], { lib, maxGeneration: lab.maxGeneration, day, inventor });
      if (res.ok) {
        const c = res.components[0];
        if (!lib[c.id]) lib[c.id] = c;
        essence = { kind: 'component', id: c.id };
      }
    }
    const dels = validDeliveries(form).filter((d) => research.has(`delivery:${d}`));
    const delivery: Delivery = personality === 'trickster' && dels.includes('instant') && rng.chance(0.5) ? 'instant' : rng.pick(dels.length ? dels : (['instant'] as Delivery[]));
    const behs = validBehaviors(form, delivery).filter((b) => research.has(`behavior:${b}`));
    const behavior: Behavior = rng.pick(behs.length ? behs : (['direct'] as Behavior[]));
    const maxMods = tier === 0 ? (rng.chance(0.4) ? 1 : 0) : Math.min(lab.modifiers, 1 + Math.floor(tier / 3));
    const modifiers: Ingredient[] = [];
    for (let i = 0; i < maxMods; i++) {
      const me = rng.chance(0.6) ? el2 : rng.pick(ELEMENTS);
      if (elementAffinity(element, me) <= -0.4) continue;
      const id = materialFor(rng, me, tier, false);
      if (!modifiers.some((m) => m.id === id) && id !== essence.id) modifiers.push({ kind: 'material', id });
    }
    let conditional: Conditional = 'none';
    if (role === 'attack' && tier >= 1 && rng.chance(personality === 'scholar' || personality === 'tactician' ? 0.6 : 0.3)) {
      const c = CONDITIONAL_BY_ELEMENT[element];
      if (c && research.has(`cond:${c}`)) conditional = c;
    }
    const recipe: SpellRecipe = {
      essence,
      form,
      delivery,
      behavior,
      modifiers,
      catalyst: lab.catalyst && tier >= 2 && rng.chance(0.3) ? { kind: 'material', id: materialFor(rng, element, tier) } : undefined,
      trigger: 'onCast',
      conditional,
      evolution: [],
    };
    // NPCs evolve spells as they climb (same nodes as the player)
    if (tier >= 2) recipe.evolution.push(rng.pick(['potent', 'thrifty', 'swift']));
    if (tier >= 4) recipe.evolution.push(rng.pick(['piercer', 'arcing', 'warding']));
    if (tier >= 6) recipe.evolution.push(rng.pick(['overcharged', 'resonant', 'tactical']));
    const res = compileSpell(recipe, lib, { maxModifiers: lab.modifiers + (tier === 0 ? 1 : 0), maxComplexity: lab.complexity + 1 });
    if (res.ok) return recipe;
  }
  return { essence: { kind: 'material', id: materialFor(rng, el, tier) }, form: 'bolt', delivery: 'projectile', behavior: 'direct', modifiers: [], trigger: 'onCast', conditional: 'none', evolution: [] };
}

const R = (condition: TacticRule['condition'], action: TacticRule['action']): TacticRule => ({ condition, action, enabled: true });

export function npcTactics(p: Personality, tier: number): TacticRule[] {
  const slots = tier === 0 ? 2 : tier < 2 ? 4 : tier < 4 ? 6 : 8;
  const base: Record<Personality, TacticRule[]> = {
    aggressive: [R('enemyHpLow', 'preferBurst'), R('always', 'preferBurst'), R('selfManaLow', 'preferEfficient'), R('enemyShielded', 'preferPierce')],
    cautious: [R('selfHpLow', 'preferHeal'), R('selfUnshielded', 'preferDefense'), R('enemyShielded', 'preferPierce'), R('selfManaLow', 'conserveMana')],
    trickster: [R('enemyLongCast', 'interrupt'), R('enemyHealing', 'interrupt'), R('fightStart', 'preferControl'), R('enemyChilled', 'preferControl'), R('selfHpLow', 'preferDefense')],
    scholar: [R('enemyFrozen', 'preferShatter'), R('enemyShielded', 'preferPierce'), R('enemyLongCast', 'interrupt'), R('selfHpLow', 'preferHeal'), R('enemyPoisoned', 'preferDot')],
    showman: [R('fightStart', 'preferBurst'), R('always', 'preferStorm'), R('selfHpLow', 'preferHeal'), R('selfManaLow', 'preferEfficient')],
    tactician: [R('enemyLongCast', 'interrupt'), R('selfHpLow', 'preferHeal'), R('enemyShielded', 'preferPierce'), R('enemyFrozen', 'preferShatter'), R('enemyHealing', 'preferBlight'), R('selfManaLow', 'preferEfficient')],
  };
  // tier 0 apprentices use only the simplest conditions
  const allowed = tier === 0 ? new Set(['always', 'selfHpLow', 'enemyShielded', 'selfManaLow']) : null;
  return base[p].filter((r) => !allowed || allowed.has(r.condition)).slice(0, slots);
}

function npcAttrs(rng: Rng, tier: number, p: Personality): Attrs {
  const a: Attrs = { vitality: 10, wisdom: 10, power: 10, agility: 10, focus: 10 };
  if (tier === 0) for (const k of ATTRS) a[k] = rng.int(8, 10);
  const pts = tier * 4 + rng.int(0, 3);
  const weights: Record<Personality, number[]> = {
    aggressive: [1, 1, 4, 1, 1],
    cautious: [4, 2, 1, 1, 1],
    trickster: [1, 1, 1, 3, 3],
    scholar: [1, 3, 2, 1, 2],
    showman: [1, 2, 3, 2, 1],
    tactician: [2, 2, 2, 1, 2],
  };
  const w = weights[p];
  const tot = w.reduce((s, x) => s + x, 0);
  const cap = attributeCap(tier);
  for (let i = 0; i < pts; i++) {
    let r = rng.next() * tot;
    let k = 0;
    while (r > w[k]) r -= w[k++];
    const key = ATTRS[k];
    if (a[key] < cap) a[key]++;
  }
  return a;
}

export function npcEquipment(rng: Rng, tier: number, el: Element, wealthy: boolean): string[] {
  const out: string[] = [];
  for (const slot of ['wand', 'core', 'robe', 'relic'] as const) {
    const opts = EQUIPMENT.filter((e) => e.slot === slot && e.tier <= tier && (e.tier >= tier - 2 || e.price === 0));
    let pick = opts.filter((e) => !e.affinity || e.affinity === el);
    if (!pick.length) pick = opts;
    pick.sort((a, b) => b.tier - a.tier || b.price - a.price);
    const choice = wealthy ? pick[0] : rng.pick(pick);
    if (choice) out.push(choice.id);
  }
  return out;
}

export function loadoutSize(tier: number): number {
  return clamp(2 + Math.floor(tier * 0.6), 2, 6);
}

export function generateNpc(seed: number, tier: number, lib: ComponentLib, idx: number): NpcState {
  const rng = new Rng(seed);
  const personality = rng.pick(PERSONALITIES);
  const element = rng.pick(ELEMENTS.filter((e) => e !== 'life'));
  let element2 = rng.pick(ELEMENTS);
  if (element2 === element || elementAffinity(element, element2) <= -0.4) element2 = rng.pick(['arcane', 'earth', 'chrono'] as Element[]);
  const size = tier === 0 ? rng.int(1, 2) : loadoutSize(tier);
  const roles: Role[] = ['attack'];
  if (personality === 'cautious') roles.push('defense', 'heal');
  else if (personality === 'trickster') roles.push('utility', 'defense');
  else if (personality === 'aggressive') roles.push('attack', 'defense');
  else roles.push('defense', 'attack', 'heal');
  roles.push('attack', 'utility', 'attack', 'heal');
  const library: SpellRecipe[] = [];
  const libSize = Math.min(8, size + (tier === 0 ? 0 : rng.int(1, 2)));
  for (let i = 0; i < libSize; i++) library.push(generateRecipe(rng, tier, element, element2, roles[i % roles.length], personality, lib, 0, `npc${idx}`));
  const wealthy = rng.chance(PERSONALITY_INFO[personality].greed);
  const npc: NpcState = {
    id: `npc${idx}`,
    name: wizardName(rng),
    personality,
    element,
    element2,
    tier,
    rating: tierBaseRating(tier) + rng.int(-60, 190),
    wealth: Math.round((60 + tier * tier * 250) * rng.range(0.5, 1.8)),
    respect: Math.round(tier * tier * 12 * rng.range(0.5, 1.5)),
    wins: rng.int(0, 10 + tier * 20),
    losses: rng.int(0, 10 + tier * 18),
    titles: [],
    library,
    loadout: library.map((_, i) => i).slice(0, size),
    tactics: npcTactics(personality, tier),
    attrs: npcAttrs(rng, tier, personality),
    equipment: tier === 0 && rng.chance(0.5) ? ['twig_wand', 'patched_robe'] : npcEquipment(rng, tier, element, wealthy),
    look: randomLook(rng, element),
    memory: { faced: 0, beatPlayer: 0, lostToPlayer: 0, seenTags: {}, seenElements: {} },
    adaptations: [],
    research: element2,
    strength: 0,
    peakTier: tier,
  };
  npc.strength = npcStrength(npc, lib);
  return npc;
}

export function npcCombatWizard(n: NpcState, lib: ComponentLib): CombatWizard {
  const spells = n.loadout.map((i) => n.library[i]).filter(Boolean).map((r) => compileCached(r, lib)).filter((s): s is CompiledSpell => !!s);
  return {
    id: n.id,
    name: n.name,
    attrs: { ...n.attrs },
    spells,
    tactics: n.tactics.map((t) => ({ ...t })),
    equipment: n.equipment.map((e) => EQUIP_MAP[e]).filter(Boolean),
    enchants: {},
    skills: n.guardian !== undefined ? guardianSkills(n.guardian) : n.tier >= 3 ? ['e1', 'a1'].slice(0, Math.floor(n.tier / 3)) : [],
    look: n.look,
  };
}

function guardianSkills(g: number): string[] {
  const s = ['a1', 'e1', 's1', 'e2b', 'a2a', 's3', 'e3', 'a3', 'e4a'];
  return s.slice(0, Math.min(s.length, Math.floor(g / 1.5) + (g > 0 ? 1 : 0)));
}

/** Cheap strength heuristic used for background (non-detailed) simulation. */
export function npcStrength(n: NpcState, lib: ComponentLib): number {
  const spells = n.loadout.map((i) => compileCached(n.library[i], lib)).filter(Boolean) as CompiledSpell[];
  const sp = spells.reduce((s, x) => s + x.power, 0);
  const a = n.attrs;
  return Math.round(sp * (1 + (a.power - 10) * 0.025) * (1 + (a.vitality - 10) * 0.03) + (a.wisdom + a.focus + a.agility - 30) * 2);
}

// ---------------- Adaptation ----------------

export interface AdaptationContext {
  playerBuild: CombatWizard;
  lib: ComponentLib;
  day: number;
}

/** Record what the NPC observed of the player's build after a duel. */
export function observePlayer(n: NpcState, player: CombatWizard, npcWon: boolean) {
  n.memory.faced++;
  if (npcWon) n.memory.beatPlayer++;
  else n.memory.lostToPlayer++;
  for (const s of player.spells) {
    for (const t of s.tags) n.memory.seenTags[t] = (n.memory.seenTags[t] ?? 0) + 1;
    n.memory.seenElements[s.element] = (n.memory.seenElements[s.element] ?? 0) + 1;
  }
}

const RESIST_ROBES: Partial<Record<Element, string>> = { fire: 'emberproof_robe', frost: 'furlined_robe', storm: 'grounded_robe', venom: 'antidote_robe', arcane: 'warded_robe', shadow: 'warded_robe' };

/**
 * Before a rematch, an NPC who has seen the player adapts using legal moves only:
 * counter-tactics, loadout search (via real simulations), equipment purchases with
 * its own wealth, and inventing a new counter spell.
 */
export function adaptNpc(n: NpcState, ctx: AdaptationContext): string[] {
  const notes: string[] = [];
  if (n.memory.faced === 0) return notes;
  const adapt = PERSONALITY_INFO[n.personality].adapt;
  const rng = new Rng(hashString(`${n.id}|adapt|${n.memory.faced}|${ctx.day}`));
  const tags = n.memory.seenTags;
  const slots = n.tier === 0 ? 2 : n.tier < 2 ? 4 : n.tier < 4 ? 6 : 8;
  const addRule = (rule: TacticRule, label: string) => {
    if (n.tactics.some((r) => r.condition === rule.condition && r.action === rule.action)) return;
    if (n.tactics.length >= slots) n.tactics.pop();
    n.tactics.unshift(rule);
    notes.push(`added Grimoire rule "${label}"`);
  };
  const lost = n.memory.lostToPlayer > n.memory.beatPlayer;
  if (lost && rng.chance(0.4 + adapt * 0.6)) {
    if ((tags.defense ?? 0) > 0) addRule(R('enemyShielded', 'preferPierce'), 'Enemy shielded → piercing');
    if ((tags.heal ?? 0) > 0 && n.tier >= 1) addRule(R('enemyHealing', 'interrupt'), 'Enemy healing → interrupt');
    if (ctx.playerBuild.spells.some((s) => s.castTime >= 1.4) && n.tier >= 1) addRule(R('enemyLongCast', 'interrupt'), 'Long cast → interrupt');
    if ((tags.damage ?? 0) >= 2) addRule(R('selfHpLow', 'preferDefense'), 'Health low → shields');
  }
  // equipment: buy resistance against the player's dominant element
  const elems = Object.entries(n.memory.seenElements).sort((a, b) => b[1] - a[1]);
  if (lost && elems.length) {
    const el = elems[0][0] as Element;
    const robe = RESIST_ROBES[el];
    const def = robe ? EQUIP_MAP[robe] : undefined;
    if (def && def.tier <= n.tier + 1 && !n.equipment.includes(def.id) && n.wealth >= def.price * 0.6) {
      n.wealth -= Math.round(def.price * 0.6);
      n.equipment = n.equipment.filter((e) => EQUIP_MAP[e]?.slot !== 'robe');
      n.equipment.push(def.id);
      notes.push(`bought a ${def.name} to resist your ${el} spells`);
    }
  }
  // invent a new counter spell when repeatedly beaten
  if (n.memory.lostToPlayer >= 2 && n.library.length < 8 && rng.chance(adapt)) {
    const role: Role = (tags.defense ?? 0) > 0 ? 'attack' : rng.chance(0.5) ? 'defense' : 'attack';
    const recipe = generateRecipe(rng, n.tier, n.element, n.element2, role, n.personality, ctx.lib, ctx.day, n.id);
    if ((tags.defense ?? 0) > 0 && recipe.form !== 'ward' && researchForTier(n.tier).includes('behavior:piercing') && validBehaviors(recipe.form, recipe.delivery).includes('piercing')) recipe.behavior = 'piercing';
    if (compileCached(recipe, ctx.lib)) {
      n.library.push(recipe);
      notes.push(`invented ${compileCached(recipe, ctx.lib)!.name}`);
    }
  }
  // evolutionary loadout search against the player's current build
  const size = n.loadout.length;
  if (n.library.length > size && (lost || rng.chance(adapt * 0.5))) {
    const candidates: number[][] = [n.loadout.slice()];
    for (let i = 0; i < 5; i++) {
      const pool = n.library.map((_, k) => k);
      rng.shuffle(pool);
      candidates.push(pool.slice(0, size).sort((a, b) => a - b));
    }
    let best = n.loadout.slice();
    let bestP = -1;
    for (const cand of candidates) {
      const trial = { ...n, loadout: cand };
      const p = estimateWinProbability(npcCombatWizard(trial, ctx.lib), ctx.playerBuild, 6, n.memory.faced * 13);
      if (p > bestP + 0.01) {
        bestP = p;
        best = cand;
      }
    }
    if (best.join(',') !== n.loadout.join(',')) {
      n.loadout = best;
      notes.push(`re-optimised spell loadout against your build (sim win rate ${Math.round(bestP * 100)}%)`);
    }
  }
  if (notes.length) {
    n.adaptations.unshift({ day: ctx.day, text: notes.join('; ') });
    n.adaptations = n.adaptations.slice(0, 8);
  }
  n.strength = npcStrength(n, ctx.lib);
  return notes;
}
