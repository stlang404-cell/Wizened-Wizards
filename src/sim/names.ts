import type { Rng } from './rng';

const FIRST = [
  'Percival', 'Agatha', 'Thaddeus', 'Wilhelmina', 'Barnaby', 'Cordelia', 'Ignatius', 'Rosalind', 'Mortimer', 'Ottoline',
  'Cuthbert', 'Esmeralda', 'Fitzwilliam', 'Henrietta', 'Leopold', 'Marigold', 'Septimus', 'Theodora', 'Ambrose', 'Beatrix',
  'Cornelius', 'Delphine', 'Edmund', 'Florentine', 'Gideon', 'Hyacinth', 'Isidore', 'Juniper', 'Lucius', 'Minerva',
  'Nathaniel', 'Octavia', 'Peregrine', 'Quintus', 'Rowena', 'Silas', 'Tabitha', 'Ulysses', 'Violet', 'Wendell',
  'Xanthe', 'Yorick', 'Zephyrine', 'Alaric', 'Bramble', 'Cressida', 'Dorian', 'Elspeth', 'Fennimore', 'Gwendolyn',
  'Horatio', 'Imogen', 'Jasper', 'Kestrel', 'Lavinia', 'Magnus', 'Nimue', 'Oswin', 'Philippa', 'Rupert',
  'Sybil', 'Tobias', 'Ursula', 'Valentine', 'Winifred', 'Aurelius', 'Clementine', 'Erasmus', 'Ophelia', 'Lysander',
];
const LAST_A = ['Quill', 'Moss', 'Thistle', 'Bramble', 'Ember', 'Frost', 'Raven', 'Candle', 'Owl', 'Ash', 'Mistle', 'Hollow', 'Star', 'Thorn', 'Rook', 'Fern', 'Grey', 'Copper', 'Lantern', 'Wick', 'Hazel', 'Gloom', 'Spindle', 'Toad', 'Bell', 'Moon', 'Pebble', 'Whistle'];
const LAST_B = ['feather', 'bottom', 'wick', 'worth', 'shire', 'mere', 'wood', 'cott', 'field', 'hart', 'more', 'brook', 'ridge', 'well', 'grove', 'stone', 'vane', 'ley', 'by', 'crest', 'weather', 'whisker', 'pot', 'kettle'];
const EPITHETS = ['the Unready', 'the Bold', 'of the Third Floor', 'the Damp', 'the Curious', 'Who Arrives Late', 'the Patient', 'the Loud', 'Half-Singed', 'the Bookish', 'Twice-Expelled', 'the Lucky', 'the Grim', 'the Gentle'];

export function wizardName(rng: Rng): string {
  const name = `${rng.pick(FIRST)} ${rng.pick(LAST_A)}${rng.pick(LAST_B)}`;
  return rng.chance(0.08) ? `${name} ${rng.pick(EPITHETS)}` : name;
}

export const PERSONALITIES = ['aggressive', 'cautious', 'trickster', 'scholar', 'showman', 'tactician'] as const;
export type Personality = (typeof PERSONALITIES)[number];

export const PERSONALITY_INFO: Record<Personality, { name: string; desc: string; adapt: number; greed: number }> = {
  aggressive: { name: 'Aggressive', desc: 'Relentless offense; rarely defends.', adapt: 0.3, greed: 0.4 },
  cautious: { name: 'Cautious', desc: 'Shields and heals; outlasts opponents.', adapt: 0.5, greed: 0.2 },
  trickster: { name: 'Trickster', desc: 'Hexes, control and interruptions.', adapt: 0.6, greed: 0.5 },
  scholar: { name: 'Scholar', desc: 'Complex inventions; studies opponents closely.', adapt: 0.9, greed: 0.2 },
  showman: { name: 'Showman', desc: 'Flashy, high-variance spells. Loves a crowd.', adapt: 0.3, greed: 0.7 },
  tactician: { name: 'Tactician', desc: 'Precise Grimoire play; adapts quickly.', adapt: 1.0, greed: 0.3 },
};
