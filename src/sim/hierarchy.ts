// The Infinite Magical Hierarchy: named tiers, divisions, numbered ascension.

export const TIERS = [
  { name: 'Apprentice', society: 'The Cellar Circle', color: '#9a8466' },
  { name: 'Initiate', society: 'The Lantern Hall', color: '#b9a36a' },
  { name: 'Adept', society: 'The Ivy Cloister', color: '#7fae6b' },
  { name: 'Conjurer', society: 'The Bell Tower', color: '#6ba3c9' },
  { name: 'Magus', society: 'The Starlit Observatory', color: '#8f7ad8' },
  { name: 'Archmage', society: 'The Gilded Library', color: '#d9b44a' },
  { name: 'Sage', society: 'The Silent Spire', color: '#d97a5a' },
  { name: 'Grand Sorcerer', society: 'The Crimson Conclave', color: '#c9465a' },
  { name: 'Wizened', society: 'The Hall of the Ancients', color: '#f2e6c9' },
] as const;

export const NAMED_TIERS = TIERS.length;
export const DIVISIONS = ['III', 'II', 'I'];

export function tierBaseRating(tier: number): number {
  return 800 + tier * 200;
}

export function divisionThreshold(tier: number, div: number): number {
  return tierBaseRating(tier) + div * 55;
}

export function rankLabel(tier: number, div: number): string {
  if (tier >= NAMED_TIERS) return `Ascendant ${tier - NAMED_TIERS + 1}`;
  return `${TIERS[tier].name} ${DIVISIONS[div]}`;
}

export function tierName(tier: number): string {
  if (tier >= NAMED_TIERS) return `Ascendant ${tier - NAMED_TIERS + 1}`;
  return TIERS[tier].name;
}

export function tierColor(tier: number): string {
  if (tier >= NAMED_TIERS) return '#ffffff';
  return TIERS[tier].color;
}

export function societyName(tier: number): string {
  if (tier >= NAMED_TIERS) return `The Endless Ascent, Circle ${tier - NAMED_TIERS + 1}`;
  return TIERS[tier].society;
}

/** Attribute cap: tied to tier so inflation stays bounded; ascension adds very slowly. */
export function attributeCap(tier: number): number {
  const named = Math.min(tier, NAMED_TIERS - 1);
  const asc = Math.max(0, tier - (NAMED_TIERS - 1));
  return 14 + named * 2 + Math.min(10, Math.floor(asc / 2));
}

export interface PromotionRequirements {
  rating: number;
  qualifyingWins: number;
  tournamentTop2: boolean;
  componentsInvented: number;
  customSpells: number;
  maxGeneration: number;
  guardian: true;
}

export function promotionRequirements(tier: number): PromotionRequirements {
  if (tier >= NAMED_TIERS - 1) {
    const a = tier - (NAMED_TIERS - 1);
    return {
      rating: tierBaseRating(NAMED_TIERS - 1) + 150 + a * 60,
      qualifyingWins: 4 + Math.min(a, 6),
      tournamentTop2: a % 2 === 0,
      componentsInvented: 18 + a * 2,
      customSpells: 9 + Math.min(a, 6),
      maxGeneration: Math.min(8, 6 + Math.floor(a / 3)),
      guardian: true,
    };
  }
  return {
    rating: divisionThreshold(tier, 2) + (tier === 0 ? 10 : 40),
    qualifyingWins: 3 + tier,
    tournamentTop2: true,
    componentsInvented: 1 + tier * 2,
    customSpells: 1 + tier,
    maxGeneration: Math.min(1 + Math.floor(tier / 2), 6),
    guardian: true,
  };
}

export function eloExpected(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function eloDelta(ra: number, rb: number, won: boolean, k = 32): number {
  return Math.round(k * ((won ? 1 : 0) - eloExpected(ra, rb)));
}

export function divisionFor(tier: number, rating: number): number {
  let d = 0;
  for (let i = 0; i < 3; i++) if (rating >= divisionThreshold(tier, i)) d = i;
  return d;
}

export const RESPECT_PRIVILEGES = [
  { respect: 25, id: 'rivalBounties', name: 'Rival Bounties', desc: 'Rivals pay double Dollars when defeated.' },
  { respect: 60, id: 'discount5', name: "Merchant's Courtesy", desc: '5% discount at the Market.' },
  { respect: 120, id: 'challengeUp', name: 'Bold Challenger', desc: 'Challenge wizards one full tier above you.' },
  { respect: 200, id: 'blackMarket', name: 'Midnight Bazaar', desc: 'Access to rare and legendary materials above your tier.' },
  { respect: 320, id: 'discount10', name: 'Patron of the Guilds', desc: '10% discount at the Market (replaces 5%).' },
  { respect: 500, id: 'invitational', name: 'Invitational Seat', desc: 'Free entry to all tournaments.' },
  { respect: 800, id: 'stipend', name: 'Academy Stipend', desc: 'Receive a daily stipend scaled to your tier.' },
];

export function hasPrivilege(respect: number, id: string): boolean {
  const p = RESPECT_PRIVILEGES.find((x) => x.id === id);
  return !!p && respect >= p.respect;
}
