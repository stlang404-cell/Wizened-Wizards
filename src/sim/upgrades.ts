// Upgrade paths: laboratory, spellbook, grimoire, research, attributes.
import type { Behavior, Conditional, Delivery, Form, Trigger } from './types';
import { attributeCap } from './hierarchy';

export const LAB_LEVELS = [
  { level: 0, cost: 0, tier: 0, maxGeneration: 2, modifiers: 1, catalyst: false, complexity: 4, name: 'Cellar Bench' },
  { level: 1, cost: 220, tier: 0, maxGeneration: 3, modifiers: 1, catalyst: true, complexity: 5, name: 'Apprentice Workshop' },
  { level: 2, cost: 700, tier: 1, maxGeneration: 4, modifiers: 2, catalyst: true, complexity: 6, name: 'Alchemical Laboratory' },
  { level: 3, cost: 1900, tier: 2, maxGeneration: 5, modifiers: 2, catalyst: true, complexity: 7, name: 'Candlelit Atelier' },
  { level: 4, cost: 4800, tier: 3, maxGeneration: 6, modifiers: 3, catalyst: true, complexity: 8, name: 'Tower Sanctum' },
  { level: 5, cost: 12000, tier: 5, maxGeneration: 8, modifiers: 3, catalyst: true, complexity: 10, name: 'Grand Arcanum' },
];

export const SPELLBOOK_LEVELS = [
  { slots: 2, cost: 0, tier: 0 },
  { slots: 3, cost: 160, tier: 0 },
  { slots: 4, cost: 650, tier: 1 },
  { slots: 5, cost: 2200, tier: 2 },
  { slots: 6, cost: 6500, tier: 4 },
];

export type ResearchKey = `form:${Form}` | `delivery:${Delivery}` | `behavior:${Behavior}` | `cond:${Conditional}` | `trigger:${Trigger}`;

export interface ResearchDef {
  key: ResearchKey;
  name: string;
  cost: number;
  tier: number;
}

export const STARTING_RESEARCH: ResearchKey[] = ['form:bolt', 'form:ward', 'delivery:projectile', 'delivery:instant', 'behavior:direct', 'cond:none', 'trigger:onCast'];

export const RESEARCH: ResearchDef[] = [
  { key: 'form:lance', name: 'Form: Lance', cost: 70, tier: 0 },
  { key: 'form:mend', name: 'Form: Mend', cost: 80, tier: 0 },
  { key: 'form:nova', name: 'Form: Nova', cost: 150, tier: 0 },
  { key: 'form:hex', name: 'Form: Hex', cost: 220, tier: 1 },
  { key: 'form:orb', name: 'Form: Orb', cost: 200, tier: 1 },
  { key: 'form:storm', name: 'Form: Tempest', cost: 420, tier: 2 },
  { key: 'delivery:beam', name: 'Delivery: Beam', cost: 110, tier: 0 },
  { key: 'delivery:rune', name: 'Delivery: Rune', cost: 260, tier: 1 },
  { key: 'delivery:delayed', name: 'Delivery: Delayed', cost: 420, tier: 2 },
  { key: 'behavior:piercing', name: 'Behavior: Piercing', cost: 90, tier: 0 },
  { key: 'behavior:chaining', name: 'Behavior: Chaining', cost: 140, tier: 0 },
  { key: 'behavior:homing', name: 'Behavior: Homing', cost: 200, tier: 1 },
  { key: 'behavior:splitting', name: 'Behavior: Splitting', cost: 260, tier: 1 },
  { key: 'behavior:lingering', name: 'Behavior: Lingering', cost: 330, tier: 2 },
  { key: 'behavior:orbiting', name: 'Behavior: Orbiting', cost: 380, tier: 2 },
  { key: 'cond:vsFrozen', name: 'Conditional: Shatter', cost: 150, tier: 0 },
  { key: 'cond:vsShielded', name: 'Conditional: Wardbreaker', cost: 200, tier: 1 },
  { key: 'cond:vsCasting', name: 'Conditional: Spellsnap', cost: 260, tier: 1 },
  { key: 'cond:vsChilled', name: 'Conditional: Thermal Shock', cost: 200, tier: 1 },
  { key: 'cond:vsPoisoned', name: 'Conditional: Toxic Surge', cost: 260, tier: 2 },
  { key: 'cond:vsConductive', name: 'Conditional: Overload', cost: 260, tier: 2 },
  { key: 'cond:vsBurning', name: 'Conditional: Flashpoint', cost: 260, tier: 2 },
  { key: 'cond:lowHealthSelf', name: 'Conditional: Desperation', cost: 340, tier: 3 },
  { key: 'trigger:onHit', name: 'Trigger: On Hit', cost: 300, tier: 2 },
  { key: 'trigger:onKillshot', name: 'Trigger: Executioner', cost: 460, tier: 3 },
  { key: 'trigger:onShieldBreak', name: 'Trigger: Breaker Refund', cost: 460, tier: 3 },
];

/** Research visible to an NPC of a tier (NPCs follow the same unlock structure). */
export function researchForTier(tier: number): ResearchKey[] {
  return [...STARTING_RESEARCH, ...RESEARCH.filter((r) => r.tier <= tier).map((r) => r.key)];
}

export function attrTrainCost(trainedSoFar: number): number {
  return Math.round(30 * Math.pow(1.2, trainedSoFar));
}

export function canTrainAttr(current: number, tier: number): boolean {
  return current < attributeCap(tier);
}
