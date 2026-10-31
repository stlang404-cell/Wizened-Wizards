import type { EquipmentDef } from '../types';

export const EQUIPMENT: EquipmentDef[] = [
  // ---------- Wands ----------
  { id: 'twig_wand', name: 'Crooked Twig Wand', slot: 'wand', tier: 0, price: 0, attrs: {}, lore: 'Found under a bench in the Great Hall.' },
  { id: 'ash_wand', name: 'Ashwood Wand', slot: 'wand', tier: 0, price: 120, attrs: { power: 2 }, lore: 'Standard issue for first-years.' },
  { id: 'willow_wand', name: 'Weeping Willow Wand', slot: 'wand', tier: 0, price: 140, attrs: { focus: 2, wisdom: 1 }, lore: 'Patient, forgiving, a little sad.' },
  { id: 'blackthorn_wand', name: 'Blackthorn Wand', slot: 'wand', tier: 1, price: 420, attrs: { power: 4, focus: -1 }, lore: 'Wants to fight. Usually wins.' },
  { id: 'rowan_wand', name: 'Rowan Wand', slot: 'wand', tier: 1, price: 400, attrs: { focus: 3, agility: 2 }, lore: 'Light, quick and protective.' },
  { id: 'yew_wand', name: 'Elder Yew Wand', slot: 'wand', tier: 2, price: 1100, attrs: { power: 5, wisdom: 2 }, lore: 'Older than the castle walls.' },
  { id: 'starmetal_wand', name: 'Starmetal Rod', slot: 'wand', tier: 3, price: 2600, attrs: { power: 6, focus: 3 }, perk: 'quickdraw', lore: 'Forged from a falling star.' },
  { id: 'wyrmbone_staff', name: 'Wyrmbone Staff', slot: 'wand', tier: 4, price: 6200, attrs: { power: 8, vitality: 2, agility: -2 }, lore: 'Heavy enough to block a sword.' },
  { id: 'archon_sceptre', name: 'Archon Sceptre', slot: 'wand', tier: 6, price: 16000, attrs: { power: 9, focus: 5, wisdom: 3 }, perk: 'clarity', lore: 'Carried by the first Archmage.' },
  // ---------- Cores ----------
  { id: 'no_core', name: 'Hollow Core', slot: 'core', tier: 0, price: 0, attrs: {}, lore: 'Nothing inside. Yet.' },
  { id: 'ember_core', name: 'Ember Core', slot: 'core', tier: 0, price: 160, attrs: {}, affinity: 'fire', affinityBonus: 0.12, lore: 'A coal that never cools.' },
  { id: 'rime_core', name: 'Rime Core', slot: 'core', tier: 0, price: 160, attrs: {}, affinity: 'frost', affinityBonus: 0.12, lore: 'Cold to the touch, always.' },
  { id: 'spark_core', name: 'Spark Core', slot: 'core', tier: 0, price: 160, attrs: {}, affinity: 'storm', affinityBonus: 0.12, lore: 'Your hair stands on end.' },
  { id: 'dusk_core', name: 'Dusk Core', slot: 'core', tier: 1, price: 380, attrs: {}, affinity: 'shadow', affinityBonus: 0.14, lore: 'Smells faintly of old libraries.' },
  { id: 'thorn_core', name: 'Thornheart Core', slot: 'core', tier: 1, price: 380, attrs: {}, affinity: 'venom', affinityBonus: 0.14, lore: 'Pricks the fingers of thieves.' },
  { id: 'rune_core', name: 'Runewrit Core', slot: 'core', tier: 1, price: 380, attrs: {}, affinity: 'arcane', affinityBonus: 0.14, lore: 'Etched with a thousand tiny glyphs.' },
  { id: 'stone_core', name: 'Granite Core', slot: 'core', tier: 1, price: 380, attrs: { vitality: 1 }, affinity: 'earth', affinityBonus: 0.14, lore: 'Unimpressed by everything.' },
  { id: 'gear_core', name: 'Clockheart Core', slot: 'core', tier: 1, price: 380, attrs: {}, affinity: 'chrono', affinityBonus: 0.14, lore: 'Ticks in time with your pulse.' },
  { id: 'bloom_core', name: 'Bloomheart Core', slot: 'core', tier: 1, price: 380, attrs: {}, affinity: 'life', affinityBonus: 0.14, lore: 'Sprouts in spring.' },
  { id: 'thunder_core', name: 'Thunderbird Core', slot: 'core', tier: 2, price: 1300, attrs: { agility: 1 }, affinity: 'storm', affinityBonus: 0.16, perk: 'stormRod', lore: 'Arcs leap further from its tip.' },
  { id: 'glacier_core', name: 'Glacier Core', slot: 'core', tier: 2, price: 1300, attrs: {}, affinity: 'frost', affinityBonus: 0.16, perk: 'frostbiteCore', lore: 'Frost spreads twice as fast.' },
  { id: 'leech_core', name: 'Leechblood Core', slot: 'core', tier: 2, price: 1300, attrs: {}, affinity: 'shadow', affinityBonus: 0.14, perk: 'leechCore', lore: 'Thirsty.' },
  { id: 'hydra_core', name: 'Hydra Core', slot: 'core', tier: 3, price: 2900, attrs: {}, affinity: 'venom', affinityBonus: 0.16, perk: 'venomGland', lore: 'Two heads, twice the poison.' },
  { id: 'aeon_core', name: 'Aeon Core', slot: 'core', tier: 3, price: 2900, attrs: { focus: 1 }, affinity: 'chrono', affinityBonus: 0.16, perk: 'chronoGear', lore: 'Remembers the spell you just cast.' },
  { id: 'phoenix_core', name: 'Phoenix Core', slot: 'core', tier: 4, price: 7000, attrs: {}, affinity: 'fire', affinityBonus: 0.18, perk: 'phoenixDown', lore: 'Refuses to let its bearer die.' },
  // ---------- Robes ----------
  { id: 'patched_robe', name: 'Patched Robe', slot: 'robe', tier: 0, price: 0, attrs: {}, lore: 'Three previous owners. All alive. Probably.' },
  { id: 'wool_robe', name: 'Academy Wool Robe', slot: 'robe', tier: 0, price: 110, attrs: { vitality: 2 }, lore: 'Warm, itchy, dependable.' },
  { id: 'silk_robe', name: 'Scholar Silk Robe', slot: 'robe', tier: 0, price: 150, attrs: { wisdom: 2, agility: 1 }, lore: 'Flows nicely when you gesture.' },
  { id: 'emberproof_robe', name: 'Emberproof Mantle', slot: 'robe', tier: 1, price: 450, attrs: { vitality: 2 }, resist: { fire: 0.22, frost: -0.05 }, lore: 'Lined with salamander leather.' },
  { id: 'furlined_robe', name: 'Fur-lined Robe', slot: 'robe', tier: 1, price: 450, attrs: { vitality: 2 }, resist: { frost: 0.22, fire: -0.05 }, lore: 'Snow-owl down. Very cosy.' },
  { id: 'grounded_robe', name: 'Grounded Copper Robe', slot: 'robe', tier: 1, price: 450, attrs: { vitality: 1 }, resist: { storm: 0.24 }, lore: 'Woven with copper wire.' },
  { id: 'warded_robe', name: 'Warded Vestments', slot: 'robe', tier: 2, price: 1250, attrs: { vitality: 3, focus: 1 }, resist: { arcane: 0.15, shadow: 0.12 }, lore: 'Every stitch a protective rune.' },
  { id: 'antidote_robe', name: 'Herbalist Coat', slot: 'robe', tier: 2, price: 1200, attrs: { vitality: 3 }, resist: { venom: 0.25 }, lore: 'Pockets full of antidotes.' },
  { id: 'thorn_robe', name: 'Thornweave Robe', slot: 'robe', tier: 3, price: 2800, attrs: { vitality: 4 }, perk: 'thornweave', lore: 'Hurts to hit.' },
  { id: 'starweave_robe', name: 'Starweave Robe', slot: 'robe', tier: 4, price: 6500, attrs: { vitality: 5, wisdom: 3 }, resist: { arcane: 0.1, storm: 0.1, frost: 0.1, fire: 0.1 }, lore: 'Woven on the longest night.' },
  { id: 'archmage_robe', name: 'Archmage Regalia', slot: 'robe', tier: 6, price: 15000, attrs: { vitality: 6, wisdom: 4, focus: 2 }, resist: { shadow: 0.15, chrono: 0.15, life: 0.15 }, lore: 'Heavy with expectation.' },
  // ---------- Relics ----------
  { id: 'no_relic', name: 'Empty Pocket', slot: 'relic', tier: 0, price: 0, attrs: {}, lore: 'Lint.' },
  { id: 'owl_feather', name: 'Owl Feather Charm', slot: 'relic', tier: 0, price: 130, attrs: { agility: 2 }, lore: 'Hoots softly at danger.' },
  { id: 'mana_vial', name: 'Bottomless Vial', slot: 'relic', tier: 0, price: 180, attrs: { wisdom: 1 }, perk: 'manaWell', lore: 'Refills itself when nearly empty.' },
  { id: 'iron_locket', name: 'Iron Locket', slot: 'relic', tier: 1, price: 500, attrs: { vitality: 2 }, perk: 'bulwark', lore: 'Shields cast while wearing it are sturdier.' },
  { id: 'focus_stone', name: 'Meditation Stone', slot: 'relic', tier: 1, price: 520, attrs: { focus: 3 }, perk: 'clarity', lore: 'Ignore the first distraction.' },
  { id: 'quick_glove', name: 'Quickdraw Glove', slot: 'relic', tier: 2, price: 1150, attrs: { agility: 2 }, perk: 'quickdraw', lore: 'Your first spell leaves before you finish thinking it.' },
  { id: 'hourglass_relic', name: 'Pocket Hourglass', slot: 'relic', tier: 3, price: 2700, attrs: { focus: 2 }, perk: 'chronoGear', lore: 'Turn it over. Again.' },
  { id: 'phoenix_feather', name: 'Phoenix Feather', slot: 'relic', tier: 5, price: 9500, attrs: { vitality: 3 }, perk: 'phoenixDown', lore: 'Warm, even in the grave.' },
];

export const EQUIP_MAP: Record<string, EquipmentDef> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

export const PERK_INFO: Record<string, string> = {
  quickdraw: 'First spell of the duel casts 50% faster.',
  manaWell: '+60% mana regeneration while below 30% mana.',
  thornweave: 'Reflects 8% of damage taken.',
  phoenixDown: 'Once per duel, survive a lethal blow and heal 15%.',
  stormRod: 'Storm spells chain one additional time.',
  frostbiteCore: 'Chill applies two stacks.',
  leechCore: '+6% lifesteal on all damage spells.',
  bulwark: 'Shields are 25% stronger.',
  clarity: 'Immune to the first interrupt each duel.',
  venomGland: 'Poison damage +30%.',
  chronoGear: '+10% echo chance on all spells.',
};

export const ENCHANT_COST = [0, 150, 420, 1100];
export const ENCHANT_INFO = {
  attune: 'Attune: +4% damage per level for its element and +1 Focus per level.',
  temper: 'Temper: +1 to each of its attribute bonuses per level (or +1 Vitality).',
};
