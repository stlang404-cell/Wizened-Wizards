// Serializable persistent world state.
import type { ComponentLib } from './genetics';
import type { Personality } from './names';
import type { Attrs, Element, OwnedEquipment, SpellRecipe, TacticRule, WizardLook } from './types';
import type { ResearchKey } from './upgrades';

export const SCHEMA_VERSION = 3;

export interface SpellEntry {
  id: string; // recipe id
  recipe: SpellRecipe;
  name: string;
  favorite: boolean;
  createdDay: number;
  mastery: number; // casts in duels
  wins: number;
  losses: number;
  damage: number;
  retired: boolean;
  firstOfMechanic: boolean;
  starter?: boolean;
}

export interface CareerEntry {
  day: number;
  text: string;
  kind: 'duel' | 'promotion' | 'tournament' | 'invention' | 'market' | 'bet' | 'achievement' | 'guardian' | 'misc';
}

export interface PlayerState {
  id: 'player';
  name: string;
  look: WizardLook;
  money: number;
  tier: number;
  div: number;
  rating: number;
  peakRating: number;
  respect: number;
  attrs: Attrs;
  attrTrained: number;
  skillPoints: number;
  skills: string[];
  equipped: { wand: string; core: string; robe: string; relic: string }; // uids
  ownedEquipment: OwnedEquipment[];
  materials: Record<string, number>;
  components: Record<string, number>;
  knownComponents: string[]; // components the player invented or acquired (archive)
  spells: SpellEntry[];
  spellbook: string[];
  tactics: TacticRule[];
  upgrades: { lab: number; spellbook: number; grimoire: number };
  research: ResearchKey[];
  record: { wins: number; losses: number; streak: number; bestStreak: number; tournamentsWon: number; upsets: number; guardiansDefeated: number[] };
  promotion: { qualifyingWins: number; tournamentTop2: boolean };
  titles: string[];
  activeTitle: string | null;
  achievements: Record<string, number>;
  career: CareerEntry[];
  rivals: string[];
  stats: { componentsInvented: number; spellsForged: number; maxGeneration: number; duels: number; mutations: number; betsWon: number; betsLost: number; moneyEarned: number };
  lastTutorHour: number;
  lastStipendDay: number;
}

export interface NpcMemory {
  faced: number;
  beatPlayer: number;
  lostToPlayer: number;
  seenTags: Record<string, number>;
  seenElements: Record<string, number>;
}

export interface NpcState {
  id: string;
  name: string;
  personality: Personality;
  element: Element;
  element2: Element;
  tier: number;
  rating: number;
  wealth: number;
  respect: number;
  wins: number;
  losses: number;
  titles: string[];
  library: SpellRecipe[];
  loadout: number[];
  tactics: TacticRule[];
  attrs: Attrs;
  equipment: string[];
  look: WizardLook;
  memory: NpcMemory;
  adaptations: { day: number; text: string }[];
  guardian?: number;
  research: string; // current research goal
  strength: number;
  peakTier: number;
}

/** Compact, frozen build. Compiled deterministically on demand (components are immutable). */
export interface WizardSpec {
  id: string;
  name: string;
  attrs: Attrs;
  spells: { recipe: SpellRecipe; name?: string }[];
  tactics: TacticRule[];
  equipment: string[];
  enchants: Record<string, { level: number; path?: 'attune' | 'temper' }>;
  skills: string[];
  look: WizardLook;
}

export interface MatchSnapshot {
  a: string; // wizard id
  b: string;
  seed: number;
  wa?: WizardSpec; // locked loadouts once both known
  wb?: WizardSpec;
  probA?: number;
  winner?: string;
  duration?: number;
  status: 'waiting' | 'open' | 'done';
}

export interface Tournament {
  id: string;
  name: string;
  kind: 'skirmish' | 'cup' | 'open' | 'championship' | 'seasonal';
  tier: number;
  size: number;
  entryFee: number;
  prizePool: number;
  participants: string[];
  rounds: MatchSnapshot[][];
  round: number;
  status: 'registration' | 'running' | 'finished';
  champion?: string;
  runnerUp?: string;
  createdDay: number;
  playerEntered: boolean;
  playerPlacement?: number; // 1 = champion
  matchIds: string[][];
}

export interface Exhibition {
  id: string;
  match: MatchSnapshot;
  day: number;
  hour: number; // resolves when world clock passes
  tier: number;
}

export interface Bet {
  id: string;
  matchKey: string; // unique key of the match (tournament round or exhibition or duel)
  pick: string; // wizard id
  stake: number;
  odds: number;
  placedHour: number;
  status: 'open' | 'won' | 'lost' | 'void';
  payout: number;
  label: string;
  kind: 'match' | 'outright' | 'self';
}

export interface MarketItem {
  price: number;
  base: number;
  demand: number; // 0.5..2
  history: number[];
}

export interface MarketState {
  items: Record<string, MarketItem>; // material ids and equipment ids
  componentSales: Record<string, number>; // saturation per component id
  event: { name: string; desc: string; element: string; mult: number; untilDay: number } | null;
  lastDay: number;
}

export interface Contract {
  id: string;
  kind: 'deliver' | 'winElement' | 'beatRating' | 'inventTrait' | 'winStreak';
  desc: string;
  reward: number;
  respect: number;
  target: string;
  count: number;
  progress: number;
  expiresDay: number;
  done: boolean;
}

export interface DuelSetup {
  id: string;
  seed: number;
  a: WizardSpec;
  b: WizardSpec;
  opponentId: string;
  context: 'duel' | 'tournament' | 'guardian' | 'practice' | 'rival' | 'exhibition';
  tournamentId?: string;
  createdHour: number;
  prob: number;
}

export interface ReplayRecord {
  id: string;
  setup: DuelSetup;
  winner: 0 | 1;
  duration: number;
  day: number;
  summary: string;
  rewards?: string[];
}

export interface NewsItem {
  day: number;
  text: string;
}

export interface GameState {
  version: number;
  seed: number;
  createdAt: number;
  clock: { day: number; hour: number }; // hour = absolute hour counter
  counters: { duel: number; txn: number; bet: number; mutate: number; match: number; tourney: number; contract: number; equip: number; npc: number };
  player: PlayerState;
  lib: ComponentLib;
  npcs: Record<string, NpcState>;
  market: MarketState;
  tournaments: Tournament[];
  exhibitions: Exhibition[];
  bets: Bet[];
  ledger: { id: string; hour: number; amount: number; reason: string }[];
  appliedTxns: string[];
  champions: { day: number; tournament: string; champion: string; tier: number }[];
  news: NewsItem[];
  pendingDuel: DuelSetup | null;
  replays: ReplayRecord[];
  contracts: Contract[];
  onboarding: { step: number; dismissed: boolean };
  season: number;
}
