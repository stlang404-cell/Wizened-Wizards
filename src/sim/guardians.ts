// Rank Guardians: memorable hand-designed bosses guarding each major promotion.
import { fuse, type ComponentLib } from './genetics';
import { tierBaseRating, NAMED_TIERS } from './hierarchy';
import { generateRecipe, npcStrength, randomLook, npcTactics } from './npc';
import { Rng, hashString } from './rng';
import type { NpcState } from './state';
import type { Attrs, Behavior, Conditional, Delivery, Element, Form, Ingredient, SpellRecipe, TacticRule, WizardLook } from './types';
import type { Personality } from './names';

type Ess = string; // 'm:id' or 'f:a+b'
interface SpellSpec {
  e: Ess;
  form: Form;
  d: Delivery;
  b: Behavior;
  mods?: string[];
  cond?: Conditional;
  evo?: string[];
}

export interface GuardianDef {
  name: string;
  title: string;
  personality: Personality;
  element: Element;
  element2: Element;
  attrs: Attrs;
  equipment: string[];
  spells: SpellSpec[];
  tactics: [TacticRule['condition'], TacticRule['action']][];
  look: Partial<WizardLook>;
  signature: string;
  style: string;
  strengths: string;
  weakness: string;
  quote: string;
  reward: { money: number; materials: Record<string, number>; equipment?: string };
}

const A = (vitality: number, wisdom: number, power: number, agility: number, focus: number): Attrs => ({ vitality, wisdom, power, agility, focus });

export const GUARDIANS: GuardianDef[] = [
  {
    name: 'Warden Bramwell Ashgrove',
    title: 'Keeper of the Cellar Gate',
    personality: 'cautious',
    element: 'earth',
    element2: 'fire',
    attrs: A(11, 10, 10, 9, 10),
    equipment: ['twig_wand', 'no_core', 'wool_robe', 'no_relic'],
    spells: [
      { e: 'm:river_clay', form: 'ward', d: 'instant', b: 'direct' },
      { e: 'm:ember_moss', form: 'bolt', d: 'projectile', b: 'direct' },
    ],
    tactics: [
      ['selfUnshielded', 'preferDefense'],
      ['always', 'preferBurst'],
    ],
    look: { robe: 0x5a3a1f, trim: 0xd9b44a, hat: 'wide', beard: 'long', hair: 0xe0e0e0 },
    signature: 'Granite Ward — an ironbark barrier he renews whenever it falls.',
    style: 'Turtles behind thick earthen wards and chips away with cinder bolts.',
    strengths: 'Very durable shields; patient.',
    weakness: 'Piercing magic slips straight through his wards. A Lance or the Piercing behavior is ideal.',
    quote: '"Nobody leaves the cellar until they can get past a simple wall."',
    reward: { money: 250, materials: { stormglass: 2, glacier_heart: 1, conductive_rune: 2 }, equipment: 'rowan_wand' },
  },
  {
    name: 'Isolde Rimeveil',
    title: 'The Lantern-Hall Frostwarden',
    personality: 'scholar',
    element: 'frost',
    element2: 'chrono',
    attrs: A(13, 13, 12, 11, 13),
    equipment: ['willow_wand', 'rime_core', 'furlined_robe', 'focus_stone'],
    spells: [
      { e: 'f:hoarfrost_quill+sand_of_hours', form: 'bolt', d: 'projectile', b: 'splitting' },
      { e: 'm:glacier_heart', form: 'lance', d: 'beam', b: 'direct', cond: 'vsFrozen' },
      { e: 'm:glacier_heart', form: 'ward', d: 'instant', b: 'direct' },
      { e: 'm:hoarfrost_quill', form: 'nova', d: 'instant', b: 'direct' },
    ],
    tactics: [
      ['enemyFrozen', 'preferShatter'],
      ['fightStart', 'preferControl'],
      ['enemyChilled', 'preferControl'],
      ['selfHpLow', 'preferDefense'],
    ],
    look: { robe: 0x2a4a7a, trim: 0xe8fbff, hat: 'circlet', beard: 'none', hair: 0xf0f0f0 },
    signature: 'Rimebound Shatter Lance — a beam that shatters frozen foes.',
    style: 'Stacks chill with splitting frost bolts, freezes you, then shatters.',
    strengths: 'Lockdown and burst against frozen targets.',
    weakness: 'Her furs make her weak to fire (−5%), and frost resistance or fast burst blunt her lockdown.',
    quote: '"Stillness is the purest form of defeat."',
    reward: { money: 700, materials: { dragon_scale: 2, wraith_silk: 2, moonsilver: 1 }, equipment: 'glacier_core' },
  },
  {
    name: 'Corvin Hollowmere',
    title: 'The Ivy Cloister Leech',
    personality: 'tactician',
    element: 'shadow',
    element2: 'life',
    attrs: A(15, 14, 14, 12, 12),
    equipment: ['blackthorn_wand', 'leech_core', 'warded_robe', 'iron_locket'],
    spells: [
      { e: 'f:wraith_silk+nightshade_ink', form: 'bolt', d: 'beam', b: 'direct', mods: ['gloom_cap'] },
      { e: 'm:heartwood_sap', form: 'mend', d: 'instant', b: 'lingering' },
      { e: 'm:wraith_silk', form: 'hex', d: 'instant', b: 'direct' },
      { e: 'm:golem_heartstone', form: 'ward', d: 'instant', b: 'orbiting' },
    ],
    tactics: [
      ['selfHpMid', 'preferHeal'],
      ['selfUnshielded', 'preferDefense'],
      ['always', 'preferHeal'],
      ['enemyShielded', 'preferPierce'],
    ],
    look: { robe: 0x2a1a3a, trim: 0x8a2a5a, hat: 'hood', beard: 'short', hair: 0x2a1a10 },
    signature: 'Siphoning Umbral Beam — drains your life into his.',
    style: 'Outlasts opponents with lifesteal, lingering heals and orbiting wards.',
    strengths: 'Enormous sustain.',
    weakness: 'Blight (venom + shadow fusions) halves his healing. Interrupting his heals is decisive.',
    quote: '"Every wound you give me, I simply borrow back."',
    reward: { money: 1500, materials: { basilisk_fang: 2, thunderbird_plume: 2, echo_bell: 1 }, equipment: 'hydra_core' },
  },
  {
    name: 'Oberon Galewright',
    title: 'Bellringer of the Storm',
    personality: 'aggressive',
    element: 'storm',
    element2: 'arcane',
    attrs: A(15, 15, 17, 14, 14),
    equipment: ['rowan_wand', 'thunder_core', 'silk_robe', 'quick_glove'],
    spells: [
      { e: 'f:thunderbird_plume+conductive_rune', form: 'bolt', d: 'instant', b: 'chaining', evo: ['swift'] },
      { e: 'f:stormglass+moonsilver', form: 'lance', d: 'beam', b: 'chaining', cond: 'vsConductive' },
      { e: 'm:thunderbird_plume', form: 'storm', d: 'instant', b: 'direct' },
      { e: 'm:static_wool', form: 'ward', d: 'instant', b: 'direct' },
    ],
    tactics: [
      ['enemyConductive', 'preferStorm'],
      ['enemyLongCast', 'interrupt'],
      ['always', 'preferBurst'],
      ['selfHpLow', 'preferDefense'],
    ],
    look: { robe: 0x3a2a6e, trim: 0xfff27a, hat: 'pointed', beard: 'braided', hair: 0xc0a060 },
    signature: 'Forked Thunder Lance — chains through conductive foes.',
    style: 'Lightning-fast instant casts, chains and interruptions.',
    strengths: 'Speed, chaining burst.',
    weakness: 'Storm resistance (Grounded Copper Robe) and sturdy shields soak his chains.',
    quote: '"Keep up, if you can."',
    reward: { money: 3000, materials: { tempest_core: 1, starfrost_shard: 1, golem_heartstone: 2 }, equipment: 'starmetal_wand' },
  },
  {
    name: 'Morwen Thistledown',
    title: 'Herbmistress of the Observatory',
    personality: 'trickster',
    element: 'venom',
    element2: 'shadow',
    attrs: A(17, 17, 17, 15, 16),
    equipment: ['yew_wand', 'hydra_core', 'antidote_robe', 'mana_vial'],
    spells: [
      { e: 'f:basilisk_fang+nightshade_ink', form: 'bolt', d: 'projectile', b: 'splitting', evo: ['thrifty'] },
      { e: 'm:hydra_blood', form: 'storm', d: 'instant', b: 'direct' },
      { e: 'f:basilisk_fang+wraith_silk', form: 'lance', d: 'beam', b: 'direct', cond: 'vsPoisoned' },
      { e: 'm:heartwood_sap', form: 'mend', d: 'instant', b: 'direct' },
      { e: 'm:wraith_silk', form: 'hex', d: 'instant', b: 'direct' },
    ],
    tactics: [
      ['enemyPoisoned', 'preferBurst'],
      ['always', 'preferDot'],
      ['enemyHealing', 'interrupt'],
      ['selfHpLow', 'preferHeal'],
    ],
    look: { robe: 0x2a4a22, trim: 0x7ee05a, hat: 'wide', beard: 'none', hair: 0x8a2a1a },
    signature: 'Toxic Surge Lance — devastating against poisoned foes.',
    style: 'Stacks poison, blights your healing, then detonates.',
    strengths: 'Relentless damage over time.',
    weakness: 'Venom resistance and early burst; she is fragile once her mana runs dry.',
    quote: '"Patience, dear. It only stings for a moment. Then it stings forever."',
    reward: { money: 6000, materials: { phoenix_ash: 1, void_pearl: 1, aeon_crystal: 1 }, equipment: 'thorn_robe' },
  },
  {
    name: 'Archivist Quillon Vane',
    title: 'Keeper of the Gilded Library',
    personality: 'scholar',
    element: 'chrono',
    element2: 'arcane',
    attrs: A(19, 20, 19, 15, 18),
    equipment: ['starmetal_wand', 'aeon_core', 'starweave_robe', 'hourglass_relic'],
    spells: [
      { e: 'f:aeon_crystal+astral_prism', form: 'orb', d: 'projectile', b: 'homing', evo: ['potent', 'arcing'] },
      { e: 'f:echo_bell+moonsilver', form: 'lance', d: 'delayed', b: 'piercing' },
      { e: 'm:aeon_crystal', form: 'ward', d: 'instant', b: 'orbiting' },
      { e: 'm:clockwork_gear', form: 'bolt', d: 'instant', b: 'direct', cond: 'vsCasting' },
      { e: 'm:dryad_tear', form: 'mend', d: 'instant', b: 'direct' },
    ],
    tactics: [
      ['enemyLongCast', 'interrupt'],
      ['selfUnshielded', 'preferDefense'],
      ['always', 'preferBurst'],
      ['selfHpLow', 'preferHeal'],
    ],
    look: { robe: 0x6e5a22, trim: 0xfff4c8, hat: 'crown', beard: 'long', hair: 0xe0e0e0 },
    signature: 'Echoing Aeon Orb — a slow sphere that often happens twice.',
    style: 'Long, echoing casts behind orbiting wards.',
    strengths: 'Enormous echo damage.',
    weakness: 'His great orbs take an age to cast: interrupt them.',
    quote: '"I have already read how this ends."',
    reward: { money: 12000, materials: { wyrmking_ember: 1, sky_anchor: 1 }, equipment: 'wyrmbone_staff' },
  },
  {
    name: 'Seraphine Duskmantle',
    title: 'Voice of the Silent Spire',
    personality: 'trickster',
    element: 'arcane',
    element2: 'shadow',
    attrs: A(21, 22, 21, 18, 22),
    equipment: ['archon_sceptre', 'rune_core', 'archmage_robe', 'focus_stone'],
    spells: [
      { e: 'f:astral_prism+void_pearl', form: 'bolt', d: 'instant', b: 'piercing', evo: ['swift', 'piercer'] },
      { e: 'f:moonsilver+wraith_silk', form: 'hex', d: 'instant', b: 'direct' },
      { e: 'm:astral_prism', form: 'lance', d: 'beam', b: 'piercing', cond: 'vsShielded', evo: ['potent'] },
      { e: 'm:titan_marrow', form: 'ward', d: 'instant', b: 'direct' },
      { e: 'm:dryad_tear', form: 'mend', d: 'instant', b: 'direct' },
    ],
    tactics: [
      ['enemyLongCast', 'interrupt'],
      ['enemyHealing', 'interrupt'],
      ['enemyShielded', 'preferPierce'],
      ['selfHpLow', 'preferHeal'],
      ['always', 'preferBurst'],
    ],
    look: { robe: 0x1f3a6e, trim: 0xd0e8ff, hat: 'hood', beard: 'none', hair: 0x3a3a3a },
    signature: 'Silencing Runic Dart — snaps every spell you begin.',
    style: 'Interrupts everything, pierces everything.',
    strengths: 'Disruption and piercing.',
    weakness: 'Instant casts and Clarity leave her nothing to interrupt; she has modest health.',
    quote: '"Hush."',
    reward: { money: 22000, materials: { eclipse_shard: 1, primordial_seed: 1 }, equipment: 'phoenix_core' },
  },
  {
    name: 'Grand Magister Aldous Thorne',
    title: 'Head of the Crimson Conclave',
    personality: 'tactician',
    element: 'fire',
    element2: 'storm',
    attrs: A(24, 23, 24, 19, 22),
    equipment: ['archon_sceptre', 'phoenix_core', 'archmage_robe', 'quick_glove'],
    spells: [
      { e: 'f:wyrmking_ember+tempest_core', form: 'lance', d: 'beam', b: 'chaining', evo: ['potent', 'piercer', 'overcharged'] },
      { e: 'f:phoenix_ash+cinder_salt', form: 'nova', d: 'instant', b: 'direct', cond: 'vsBurning' },
      { e: 'm:phoenix_ash', form: 'storm', d: 'delayed', b: 'direct' },
      { e: 'm:titan_marrow', form: 'ward', d: 'instant', b: 'orbiting' },
      { e: 'm:dryad_tear', form: 'mend', d: 'instant', b: 'lingering' },
      { e: 'm:astral_prism', form: 'bolt', d: 'instant', b: 'piercing' },
    ],
    tactics: [
      ['enemyLongCast', 'interrupt'],
      ['selfHpLow', 'preferHeal'],
      ['enemyShielded', 'preferPierce'],
      ['selfUnshielded', 'preferDefense'],
      ['enemyHpLow', 'preferBurst'],
      ['always', 'preferDot'],
    ],
    look: { robe: 0x6e1a1a, trim: 0xd9b44a, hat: 'crown', beard: 'braided', hair: 0xe0e0e0 },
    signature: 'Pyre-Storm Lance — overcharged, chaining, piercing fire.',
    style: 'Masterful all-rounder who answers everything.',
    strengths: 'No obvious holes.',
    weakness: 'Fire resistance blunts most of his arsenal; out-sustain his burn.',
    quote: '"Show me something I have not seen."',
    reward: { money: 40000, materials: { wyrmking_ember: 2, eclipse_shard: 2, sky_anchor: 2 }, equipment: 'phoenix_feather' },
  },
  {
    name: 'The Wizened One',
    title: 'Eldest of the Hall of Ancients',
    personality: 'scholar',
    element: 'arcane',
    element2: 'chrono',
    attrs: A(27, 26, 26, 20, 26),
    equipment: ['archon_sceptre', 'aeon_core', 'starweave_robe', 'phoenix_feather'],
    spells: [
      { e: 'f:astral_prism+aeon_crystal', form: 'lance', d: 'delayed', b: 'piercing', evo: ['potent', 'piercer', 'resonant'] },
      { e: 'f:sky_anchor+starfrost_shard', form: 'bolt', d: 'beam', b: 'chaining', evo: ['swift'] },
      { e: 'f:eclipse_shard+hydra_blood', form: 'hex', d: 'instant', b: 'direct' },
      { e: 'm:primordial_seed', form: 'mend', d: 'instant', b: 'lingering' },
      { e: 'm:titan_marrow', form: 'ward', d: 'instant', b: 'orbiting' },
      { e: 'f:wyrmking_ember+phoenix_ash', form: 'storm', d: 'delayed', b: 'direct' },
    ],
    tactics: [
      ['enemyLongCast', 'interrupt'],
      ['enemyHealing', 'interrupt'],
      ['selfHpLow', 'preferHeal'],
      ['enemyShielded', 'preferPierce'],
      ['selfUnshielded', 'preferDefense'],
      ['enemyHpLow', 'preferBurst'],
      ['always', 'preferDot'],
    ],
    look: { robe: 0xf2e6c9, trim: 0xd9b44a, hat: 'pointed', beard: 'long', hair: 0xffffff },
    signature: 'Aeonic Doom Lance — strikes from a moment that has not happened yet.',
    style: 'Every tool, perfectly timed.',
    strengths: 'Everything.',
    weakness: 'Only a build designed specifically against them will do.',
    quote: '"Ah. Another one. Let us see what you have invented."',
    reward: { money: 80000, materials: { primordial_seed: 2, aeon_crystal: 3 } },
  },
];

function ess(spec: Ess, lib: ComponentLib): Ingredient {
  if (spec.startsWith('m:')) return { kind: 'material', id: spec.slice(2) };
  const [a, b] = spec.slice(2).split('+');
  const res = fuse(
    [
      { kind: 'material', id: a },
      { kind: 'material', id: b },
    ],
    { lib, maxGeneration: 8, day: 0, inventor: 'guardian' },
  );
  if (!res.ok) return { kind: 'material', id: a };
  const c = res.components[0];
  if (!lib[c.id]) lib[c.id] = c;
  return { kind: 'component', id: c.id };
}

export function buildGuardian(g: number, lib: ComponentLib): NpcState {
  const tier = g;
  if (g >= GUARDIANS.length) return buildAscensionGuardian(g, lib);
  const d = GUARDIANS[g];
  const library: SpellRecipe[] = d.spells.map((s) => ({
    essence: ess(s.e, lib),
    form: s.form,
    delivery: s.d,
    behavior: s.b,
    modifiers: (s.mods ?? []).map((m) => ({ kind: 'material' as const, id: m })),
    trigger: 'onCast',
    conditional: s.cond ?? 'none',
    evolution: s.evo ?? [],
  }));
  const rng = new Rng(hashString(d.name));
  const n: NpcState = {
    id: `guardian${g}`,
    name: d.name,
    personality: d.personality,
    element: d.element,
    element2: d.element2,
    tier,
    rating: tierBaseRating(tier) + 260,
    wealth: d.reward.money * 4,
    respect: 100 + g * g * 60,
    wins: 40 + g * 25,
    losses: 3 + g,
    titles: [d.title],
    library,
    loadout: library.map((_, i) => i),
    tactics: d.tactics.map(([condition, action]) => ({ condition, action, enabled: true })),
    attrs: { ...d.attrs },
    equipment: d.equipment,
    look: { ...randomLook(rng, d.element), ...d.look },
    memory: { faced: 0, beatPlayer: 0, lostToPlayer: 0, seenTags: {}, seenElements: {} },
    adaptations: [],
    guardian: g,
    research: d.element2,
    strength: 0,
    peakTier: tier,
  };
  n.strength = npcStrength(n, lib);
  return n;
}

/** Procedural ascension guardians: smarter builds, only mildly stronger stats. */
export function buildAscensionGuardian(g: number, lib: ComponentLib): NpcState {
  const asc = g - (NAMED_TIERS - 1);
  const base = GUARDIANS[(asc - 1) % GUARDIANS.length];
  const rng = new Rng(hashString(`ascension|${g}`));
  const tier = Math.min(g, NAMED_TIERS - 1);
  const roles = ['attack', 'attack', 'defense', 'heal', 'utility', 'attack'] as const;
  // evolutionary pick: generate several candidates per role and keep the most powerful
  const library: SpellRecipe[] = roles.map((role) => {
    let best: SpellRecipe | null = null;
    let bestP = -1;
    for (let i = 0; i < 4; i++) {
      const r = generateRecipe(rng, tier, base.element, base.element2, role, base.personality, lib, 0, 'guardian');
      const n = { library: [r], loadout: [0], attrs: base.attrs } as unknown as NpcState;
      const p = npcStrength(n, lib);
      if (p > bestP) {
        bestP = p;
        best = r;
      }
    }
    return best!;
  });
  const bump = Math.min(10, Math.floor(asc / 2));
  const attrs = { ...GUARDIANS[GUARDIANS.length - 1].attrs };
  for (const k of Object.keys(attrs) as (keyof Attrs)[]) attrs[k] += bump;
  const n: NpcState = {
    id: `guardian${g}`,
    name: `Echo of ${base.name.split(' ').slice(-1)[0]}, Ascendant ${asc}`,
    personality: 'tactician',
    element: base.element,
    element2: base.element2,
    tier: g,
    rating: tierBaseRating(NAMED_TIERS - 1) + 260 + asc * 60,
    wealth: 50000,
    respect: 5000 + asc * 500,
    wins: 100 + asc * 10,
    losses: 0,
    titles: [`Warden of Ascension ${asc}`],
    library,
    loadout: library.map((_, i) => i),
    tactics: npcTactics('tactician', 8),
    attrs,
    equipment: GUARDIANS[GUARDIANS.length - 1].equipment,
    look: { ...randomLook(rng, base.element), hat: 'crown' },
    memory: { faced: 0, beatPlayer: 0, lostToPlayer: 0, seenTags: {}, seenElements: {} },
    adaptations: [],
    guardian: g,
    research: base.element2,
    strength: 0,
    peakTier: g,
  };
  n.strength = npcStrength(n, lib);
  return n;
}

export function guardianInfo(g: number): GuardianDef {
  if (g < GUARDIANS.length) return GUARDIANS[g];
  const base = GUARDIANS[(g - GUARDIANS.length) % GUARDIANS.length];
  const asc = g - (NAMED_TIERS - 1);
  return {
    ...base,
    name: `Echo of ${base.name.split(' ').slice(-1)[0]}, Ascendant ${asc}`,
    title: `Warden of Ascension ${asc}`,
    signature: 'A freshly evolved arsenal, rebuilt every ascension.',
    style: 'A tactician using the best spells evolved by the Hall.',
    weakness: 'Scout their spellbook and build a specific counter.',
    reward: { money: 20000 + asc * 5000, materials: { primordial_seed: 1, eclipse_shard: 1, sky_anchor: 1 } },
  };
}
