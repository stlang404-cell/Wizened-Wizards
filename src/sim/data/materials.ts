import type { Element, MaterialDef, Props, Rarity } from '../types';

// [id, name, element, potency, stability, conductivity, volatility, resonance, purity, rarity, minTier, tags, lore]
type Row = [string, string, Element, number, number, number, number, number, number, Rarity, number, string[], string];

const ROWS: Row[] = [
  // FIRE
  ['ember_moss', 'Ember Moss', 'fire', 34, 52, 20, 40, 18, 30, 0, 0, ['plant'], 'Smoulders gently in damp cellars of the academy.'],
  ['cinder_salt', 'Cinder Salt', 'fire', 42, 40, 25, 55, 20, 42, 0, 0, ['mineral'], 'Crunches like frost but burns the tongue.'],
  ['dragon_scale', 'Dragon Scale', 'fire', 66, 58, 30, 50, 40, 48, 2, 1, ['draconic', 'beast'], 'Shed by the old wyrms beneath Cinderpeak.'],
  ['phoenix_ash', 'Phoenix Ash', 'fire', 74, 36, 28, 70, 62, 60, 3, 3, ['rebirth'], 'Still warm a century after the bird has risen.'],
  // FROST
  ['rime_lichen', 'Rime Lichen', 'frost', 30, 60, 18, 22, 24, 34, 0, 0, ['plant'], 'Grows on the north face of the Bell Tower.'],
  ['hoarfrost_quill', 'Hoarfrost Quill', 'frost', 40, 55, 22, 28, 38, 46, 1, 0, ['feather'], 'Plucked from the snow owls of the Observatory.'],
  ['glacier_heart', 'Glacier Heart', 'frost', 60, 72, 20, 18, 34, 58, 2, 1, ['mineral'], 'A stone of ancient ice that never melts.'],
  ['starfrost_shard', 'Starfrost Shard', 'frost', 72, 64, 42, 30, 60, 70, 3, 3, ['celestial'], 'Fell on the winter solstice, humming faintly.'],
  // STORM
  ['static_wool', 'Static Wool', 'storm', 32, 44, 52, 38, 20, 30, 0, 0, ['beast'], 'Sheared from cloud-sheep on blustery hilltops.'],
  ['stormglass', 'Stormglass', 'storm', 48, 46, 70, 44, 32, 50, 1, 0, ['mineral', 'glass'], 'Lightning-fused sand from the Tempest Dunes.'],
  ['thunderbird_plume', 'Thunderbird Plume', 'storm', 62, 40, 78, 56, 44, 52, 2, 1, ['feather', 'beast'], 'Crackles when stroked the wrong way.'],
  ['tempest_core', 'Tempest Core', 'storm', 76, 34, 88, 64, 58, 62, 3, 3, ['celestial'], 'The eye of a storm, caught in a jar.'],
  // SHADOW
  ['gloom_cap', 'Gloom Cap', 'shadow', 32, 50, 28, 30, 30, 26, 0, 0, ['plant', 'fungus'], 'A mushroom that drinks candlelight.'],
  ['nightshade_ink', 'Nightshade Ink', 'shadow', 44, 46, 34, 36, 46, 40, 1, 0, ['ink'], 'Writes words that are hard to remember.'],
  ['wraith_silk', 'Wraith Silk', 'shadow', 58, 42, 40, 44, 58, 50, 2, 1, ['cloth'], 'Woven by spiders that live between moments.'],
  ['void_pearl', 'Void Pearl', 'shadow', 74, 38, 46, 52, 72, 64, 3, 3, ['celestial'], 'Light bends politely around it.'],
  // VENOM
  ['bog_nettle', 'Bog Nettle', 'venom', 30, 48, 22, 34, 26, 28, 0, 0, ['plant'], 'Stings through two pairs of gloves.'],
  ['toad_bile', 'Toad Bile', 'venom', 40, 40, 26, 42, 36, 32, 0, 0, ['beast'], 'Collected from the croaking pond behind the greenhouse.'],
  ['basilisk_fang', 'Basilisk Fang', 'venom', 62, 50, 30, 46, 48, 50, 2, 1, ['beast', 'draconic'], 'Never look at it in a mirror.'],
  ['hydra_blood', 'Hydra Blood', 'venom', 72, 44, 34, 58, 66, 58, 3, 3, ['beast'], 'Splits into two droplets when spilled.'],
  // ARCANE
  ['chalk_rune', 'Chalk Rune', 'arcane', 28, 62, 44, 18, 32, 36, 0, 0, ['rune'], 'Every apprentice carries a stub of this.'],
  ['conductive_rune', 'Conductive Rune', 'arcane', 40, 54, 66, 26, 40, 48, 1, 0, ['rune'], 'Inscribed copper that channels intent.'],
  ['moonsilver', 'Moonsilver', 'arcane', 56, 60, 58, 28, 56, 66, 2, 1, ['metal'], 'Silver that remembers every moon it has seen.'],
  ['astral_prism', 'Astral Prism', 'arcane', 70, 58, 64, 32, 74, 80, 3, 3, ['celestial', 'glass'], 'Splits a single spell into seven colours.'],
  // EARTH
  ['river_clay', 'River Clay', 'earth', 30, 70, 20, 14, 18, 30, 0, 0, ['mineral'], 'Soft, patient, and surprisingly stubborn.'],
  ['ironbark', 'Ironbark', 'earth', 42, 74, 24, 18, 28, 40, 1, 0, ['plant', 'wood'], 'Bark that dulls axes and blunts hexes.'],
  ['golem_heartstone', 'Golem Heartstone', 'earth', 58, 82, 30, 20, 40, 52, 2, 1, ['mineral'], 'Still beats, slowly, once an hour.'],
  ['titan_marrow', 'Titan Marrow', 'earth', 72, 78, 34, 30, 52, 60, 3, 3, ['beast'], 'The bones of the mountains themselves.'],
  // CHRONO
  ['sand_of_hours', 'Sand of Hours', 'chrono', 30, 50, 34, 30, 44, 34, 0, 0, ['mineral'], 'Falls upward on Tuesdays.'],
  ['clockwork_gear', 'Clockwork Gear', 'chrono', 40, 58, 46, 26, 54, 44, 1, 0, ['metal'], 'Ticks a fraction ahead of real time.'],
  ['echo_bell', 'Echo Bell', 'chrono', 54, 48, 44, 38, 70, 52, 2, 1, ['metal'], 'Rings again, a moment after you stop.'],
  ['aeon_crystal', 'Aeon Crystal', 'chrono', 68, 54, 50, 40, 84, 66, 3, 3, ['celestial'], 'Holds a single preserved second.'],
  // LIFE
  ['sunpetal', 'Sunpetal', 'life', 28, 58, 22, 20, 34, 40, 0, 0, ['plant'], 'Turns to face whoever needs it most.'],
  ['unicorn_hair', 'Silverhoof Hair', 'life', 44, 60, 30, 18, 46, 62, 1, 0, ['beast'], 'Freely given by the silverhoofs of the glade.'],
  ['heartwood_sap', 'Heartwood Sap', 'life', 56, 62, 34, 22, 56, 64, 2, 1, ['plant', 'wood'], 'Bleeds from the oldest oak on the grounds.'],
  ['dryad_tear', 'Dryad Tear', 'life', 68, 56, 40, 28, 72, 78, 3, 3, ['plant'], 'Weeps only for things worth saving.'],
  // LEGENDARY (rank-gated)
  ['wyrmking_ember', 'Wyrmking Ember', 'fire', 88, 44, 40, 72, 70, 74, 4, 5, ['draconic'], 'The last coal of the first dragon.'],
  ['sky_anchor', 'Sky Anchor', 'storm', 86, 56, 92, 52, 66, 76, 4, 5, ['celestial', 'metal'], 'Pins a thunderhead in place.'],
  ['eclipse_shard', 'Eclipse Shard', 'shadow', 88, 46, 56, 56, 84, 74, 4, 5, ['celestial'], 'A sliver of the sun-eating dark.'],
  ['primordial_seed', 'Primordial Seed', 'life', 82, 70, 46, 30, 86, 88, 4, 5, ['plant'], 'Something enormous, waiting.'],
];

function toProps(r: Row): Props {
  return { potency: r[3], stability: r[4], conductivity: r[5], volatility: r[6], resonance: r[7], purity: r[8] };
}

const PRICE_BY_RARITY = [12, 34, 95, 260, 900];

export const MATERIALS: MaterialDef[] = ROWS.map((r) => ({
  id: r[0],
  name: r[1],
  element: r[2],
  props: toProps(r),
  rarity: r[9],
  minTier: r[10],
  tags: r[11],
  lore: r[12],
  basePrice: Math.round(PRICE_BY_RARITY[r[9]] * (0.85 + r[3] / 220)),
}));

export const MATERIAL_MAP: Record<string, MaterialDef> = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id: string): MaterialDef | undefined {
  return MATERIAL_MAP[id];
}

export const ELEMENT_INFO: Record<Element, { name: string; color: number; color2: number; adj: string; desc: string }> = {
  fire: { name: 'Fire', color: 0xff6a2a, color2: 0xffd25a, adj: 'Blazing', desc: 'Burns over time; volatile bursts.' },
  frost: { name: 'Frost', color: 0x7fd8ff, color2: 0xe8fbff, adj: 'Rimebound', desc: 'Chills and freezes; shatter combos.' },
  storm: { name: 'Storm', color: 0xb98cff, color2: 0xfff27a, adj: 'Thundering', desc: 'Fast, chaining, conductive.' },
  shadow: { name: 'Shadow', color: 0x7a3fb8, color2: 0x2a1240, adj: 'Umbral', desc: 'Lifesteal and debilitation.' },
  venom: { name: 'Venom', color: 0x7ee05a, color2: 0x2e6b2a, adj: 'Virulent', desc: 'Stacking poison, blights healing.' },
  arcane: { name: 'Arcane', color: 0x58a8ff, color2: 0xd0e8ff, adj: 'Runic', desc: 'Pierces wards; disrupts casts.' },
  earth: { name: 'Earth', color: 0xc08a4a, color2: 0x6b4a2a, adj: 'Bedrock', desc: 'Heavy wards; staggering blows.' },
  chrono: { name: 'Chrono', color: 0xf0c75a, color2: 0xfff4c8, adj: 'Aeonic', desc: 'Echoes, haste and slows.' },
  life: { name: 'Life', color: 0x8affc0, color2: 0xf2ffe0, adj: 'Verdant', desc: 'Healing and restoration.' },
};

/** Elemental compatibility: positive pairs synergise, negative pairs destabilise fusions. */
const AFFINITY: Partial<Record<string, number>> = {
  'fire|storm': 0.3,
  'fire|venom': 0.2,
  'fire|frost': -0.4,
  'fire|earth': 0.15,
  'fire|life': -0.2,
  'frost|storm': 0.2,
  'frost|earth': 0.25,
  'frost|chrono': 0.3,
  'storm|arcane': 0.35,
  'storm|earth': -0.3,
  'shadow|venom': 0.35,
  'shadow|life': -0.5,
  'shadow|arcane': 0.2,
  'shadow|chrono': 0.25,
  'venom|life': -0.35,
  'arcane|chrono': 0.4,
  'arcane|life': 0.15,
  'earth|life': 0.3,
  'earth|chrono': -0.15,
};

export function elementAffinity(a: Element, b: Element): number {
  if (a === b) return 0.25;
  return AFFINITY[`${a}|${b}`] ?? AFFINITY[`${b}|${a}`] ?? 0;
}
