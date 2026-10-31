// Core typed data structures for the authoritative simulation.

export const ELEMENTS = ['fire', 'frost', 'storm', 'shadow', 'venom', 'arcane', 'earth', 'chrono', 'life'] as const;
export type Element = (typeof ELEMENTS)[number];

export const PROPS = ['potency', 'stability', 'conductivity', 'volatility', 'resonance', 'purity'] as const;
export type PropKey = (typeof PROPS)[number];
export type Props = Record<PropKey, number>; // each 0..100

/** Mechanical traits a component can carry into a spell. */
export const TRAITS = [
  'pierce', // ignore shields / resist
  'chain', // extra arcs
  'burn', // fire DoT
  'chill', // frost stacks -> freeze
  'shatter', // bonus vs frozen
  'conduct', // marks target conductive (storm bonus)
  'lifesteal',
  'poison', // stacking DoT
  'amplify', // amplifies DoTs / poison
  'disrupt', // interrupts casts, burns mana
  'stagger', // short stun chance
  'echo', // recast chance
  'haste', // faster casting
  'fortify', // stronger shields
  'reflect', // shield reflects damage
  'mend', // healing bonus
  'blight', // reduces enemy healing
  'volatile', // burst damage + self-backlash risk
  'efficiency', // lower mana cost
  'thermal', // fire+frost shock bonus vs chilled
] as const;
export type Trait = (typeof TRAITS)[number];

export interface TraitValue {
  trait: Trait;
  mag: number; // 0..1 typical
}

export type Rarity = 0 | 1 | 2 | 3 | 4; // common, uncommon, rare, epic, legendary
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

export interface MaterialDef {
  id: string;
  name: string;
  element: Element;
  props: Props;
  rarity: Rarity;
  basePrice: number;
  tags: string[];
  lore: string;
  minTier: number;
}

export type SynthOp = 'fuse' | 'extract' | 'refine' | 'stabilize' | 'amplify' | 'mutate' | 'split';

/** An invented component. Ingredients are referenced by id; ancestry is fully recorded. */
export interface Component {
  id: string; // stable hash of op + inputs
  name: string;
  element: Element;
  secondary?: Element;
  props: Props;
  traits: TraitValue[];
  generation: number; // invention depth (materials = 0)
  strain: number; // accumulated modification strain; capped
  op: SynthOp;
  inputs: string[]; // material or component ids
  rarity: Rarity;
  createdAt: number; // world day
  inventor: string; // wizard id
  notes: string;
}

export type Ingredient = { kind: 'material'; id: string } | { kind: 'component'; id: string };

// ---------------- Spell grammar ----------------

export const FORMS = ['bolt', 'lance', 'orb', 'nova', 'storm', 'ward', 'mend', 'hex'] as const;
export type Form = (typeof FORMS)[number];
export const DELIVERIES = ['projectile', 'beam', 'instant', 'rune', 'delayed'] as const;
export type Delivery = (typeof DELIVERIES)[number];
export const BEHAVIORS = ['direct', 'chaining', 'piercing', 'homing', 'splitting', 'lingering', 'orbiting'] as const;
export type Behavior = (typeof BEHAVIORS)[number];
export const TRIGGERS = ['onCast', 'onHit', 'onKillshot', 'onShieldBreak'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const CONDITIONALS = [
  'none',
  'vsFrozen', // shatter bonus
  'vsShielded', // breaker
  'vsCasting', // interrupt bonus
  'vsPoisoned', // amplify
  'lowHealthSelf', // desperation
  'vsChilled',
  'vsConductive',
  'vsBurning',
] as const;
export type Conditional = (typeof CONDITIONALS)[number];

export interface SpellRecipe {
  essence: Ingredient; // primary element and potency source
  form: Form;
  delivery: Delivery;
  behavior: Behavior;
  modifiers: Ingredient[]; // 0..3
  catalyst?: Ingredient;
  trigger: Trigger;
  conditional: Conditional;
  evolution: string[]; // chosen evolution node ids
}

export type SpellKind = 'attack' | 'shield' | 'heal' | 'hex';

export interface StatusApplication {
  type: StatusType;
  chance: number;
  duration: number;
  magnitude: number;
}

export type StatusType =
  | 'burn'
  | 'poison'
  | 'chill'
  | 'frozen'
  | 'stun'
  | 'conductive'
  | 'vulnerable'
  | 'blighted'
  | 'slowed'
  | 'hasted'
  | 'silenced';

export interface SpellVisual {
  primary: number; // 0xRRGGBB
  secondary: number;
  glow: number;
  particle: 'spark' | 'flame' | 'flake' | 'shard' | 'smoke' | 'drop' | 'rune' | 'pebble' | 'cog' | 'leaf';
  geometry: Form;
  motion: Behavior;
  delivery: Delivery;
  size: number; // 0.6..2
  trail: number; // 0..1 trail density
  speed: number; // px/s scale
  impact: 'burst' | 'crystal' | 'arc' | 'smoke' | 'splash' | 'ring' | 'quake' | 'ripple' | 'bloom';
  secondaryFx: Trait[]; // shown as secondary effects
  shimmer: number; // 0..1 instability wobble
}

export interface CompiledSpell {
  recipeId: string;
  mechanicId: string; // mechanical equivalence signature
  name: string;
  element: Element;
  secondary?: Element;
  form: Form;
  delivery: Delivery;
  behavior: Behavior;
  kind: SpellKind;
  damage: number;
  heal: number;
  shield: number;
  manaCost: number;
  castTime: number; // seconds
  cooldown: number; // seconds
  travelTime: number; // seconds
  dodgeable: boolean;
  rangeBand: [number, number]; // optimal distance band
  pierce: number; // 0..0.8
  chain: number; // extra hits
  hits: number; // number of projectiles/ticks (split)
  dot?: { type: 'burn' | 'poison'; dps: number; duration: number };
  statuses: StatusApplication[];
  conditional: Conditional;
  conditionalMult: number;
  trigger: Trigger;
  lifesteal: number;
  reflect: number;
  interrupts: boolean;
  manaBurn: number;
  echo: number; // chance
  backlash: number; // chance of self-damage
  linger?: { dps: number; duration: number };
  selfWard: number; // fraction of power granted as self shield on cast
  tags: string[];
  visual: SpellVisual;
  power: number; // overall rating
  complexity: number;
  description: string[];
}

// ---------------- Tactics ----------------

export const TACTIC_CONDITIONS = [
  'always',
  'enemyShielded',
  'selfHpLow',
  'selfHpMid',
  'enemyFrozen',
  'enemyChilled',
  'enemyLongCast',
  'selfManaLow',
  'enemyHpLow',
  'enemyPoisoned',
  'selfUnshielded',
  'enemyClose',
  'enemyFar',
  'enemyConductive',
  'enemyHealing',
  'fightStart',
] as const;
export type TacticCondition = (typeof TACTIC_CONDITIONS)[number];

export const TACTIC_ACTIONS = [
  'preferPierce',
  'preferHeal',
  'preferDefense',
  'preferShatter',
  'interrupt',
  'preferEfficient',
  'preferBurst',
  'preferControl',
  'preferDot',
  'keepDistance',
  'closeDistance',
  'conserveMana',
  'preferStorm',
  'preferBlight',
] as const;
export type TacticAction = (typeof TACTIC_ACTIONS)[number];

export interface TacticRule {
  condition: TacticCondition;
  action: TacticAction;
  enabled: boolean;
}

// ---------------- Wizards & equipment ----------------

export const ATTRS = ['vitality', 'wisdom', 'power', 'agility', 'focus'] as const;
export type Attr = (typeof ATTRS)[number];
export type Attrs = Record<Attr, number>;

export type EquipSlot = 'wand' | 'core' | 'robe' | 'relic';

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  tier: number;
  price: number;
  attrs: Partial<Attrs>;
  affinity?: Element; // +damage for spells of that element
  affinityBonus?: number;
  resist?: Partial<Record<Element, number>>;
  perk?: EquipPerk;
  lore: string;
}

export type EquipPerk =
  | 'quickdraw' // first spell casts 50% faster
  | 'manaWell' // +regen when below 30% mana
  | 'thornweave' // reflect 8% damage
  | 'phoenixDown' // once per duel, survive lethal at 1 hp and heal 15%
  | 'stormRod' // chain +1 on storm
  | 'frostbiteCore' // chill stacks +1
  | 'leechCore' // +6% lifesteal all spells
  | 'bulwark' // shields +25%
  | 'clarity' // interrupt immunity once
  | 'venomGland' // poison +30%
  | 'chronoGear'; // echo +10%

export interface OwnedEquipment {
  uid: string;
  defId: string;
  enchant: number; // 0..3
  path?: 'attune' | 'temper';
}

export interface CombatWizard {
  id: string;
  name: string;
  attrs: Attrs;
  spells: CompiledSpell[];
  tactics: TacticRule[];
  equipment: EquipmentDef[];
  enchants: Record<string, { level: number; path?: 'attune' | 'temper' }>;
  skills: string[];
  look: WizardLook;
}

export interface WizardLook {
  robe: number;
  trim: number;
  hat: 'pointed' | 'hood' | 'crown' | 'wide' | 'circlet';
  beard: 'none' | 'short' | 'long' | 'braided';
  skin: number;
  hair: number;
  staff: number;
}
