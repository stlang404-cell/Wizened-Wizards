// Ledger, idempotent transactions, betting settlement, rewards and contracts.
import { MATERIALS, ELEMENT_INFO } from './data/materials';
import { Rng, clamp, hashString } from './rng';
import type { Bet, Contract, GameState } from './state';
import type { Element, Trait } from './types';
import { ELEMENTS } from './types';

export const HOUSE_MARGIN = 0.06;

/** Apply a money change exactly once. Returns false when the transaction was already applied. */
export function transact(s: GameState, txnId: string, amount: number, reason: string): boolean {
  if (s.appliedTxns.includes(txnId)) return false;
  if (!Number.isFinite(amount)) return false;
  amount = Math.round(amount);
  if (amount < 0 && s.player.money + amount < 0) return false;
  s.player.money += amount;
  if (amount > 0) s.player.stats.moneyEarned += amount;
  s.appliedTxns.push(txnId);
  if (s.appliedTxns.length > 800) s.appliedTxns.splice(0, s.appliedTxns.length - 800);
  s.ledger.unshift({ id: txnId, hour: s.clock.hour, amount, reason });
  if (s.ledger.length > 150) s.ledger.length = 150;
  return true;
}

export function nextTxn(s: GameState, kind: string): string {
  s.counters.txn++;
  return `${kind}#${s.counters.txn}`;
}

export function oddsFromProb(p: number): number {
  const odds = (1 - HOUSE_MARGIN) / clamp(p, 0.01, 0.99);
  return Math.round(clamp(odds, 1.05, 15) * 100) / 100;
}

export type BetError = string | null;

export function validateStake(s: GameState, stake: number): BetError {
  if (!Number.isInteger(stake)) return 'Stake must be a whole number of Dollars.';
  if (stake <= 0) return 'Stake must be positive.';
  if (stake > s.player.money) return 'You cannot afford that stake.';
  const cap = 50 + s.player.tier * 250 + Math.floor(s.player.money * 0.5);
  if (stake > cap) return `Bookmakers cap your stake at $${cap}.`;
  return null;
}

export function placeBet(s: GameState, b: Omit<Bet, 'id' | 'status' | 'payout' | 'placedHour'>): { ok: true; bet: Bet } | { ok: false; error: string } {
  const err = validateStake(s, b.stake);
  if (err) return { ok: false, error: err };
  if (s.bets.some((x) => x.matchKey === b.matchKey && x.status === 'open')) return { ok: false, error: 'You already have a bet on this.' };
  s.counters.bet++;
  const bet: Bet = { ...b, id: `bet${s.counters.bet}`, status: 'open', payout: 0, placedHour: s.clock.hour };
  if (!transact(s, `stake:${bet.id}`, -b.stake, `Bet: ${b.label}`)) return { ok: false, error: 'Transaction failed.' };
  s.bets.unshift(bet);
  if (s.bets.length > 120) s.bets.length = 120;
  return { ok: true, bet };
}

/** Settle all open bets on a match key. Idempotent: payouts use unique txn ids. */
export function settleBets(s: GameState, matchKey: string, winner: string): Bet[] {
  const settled: Bet[] = [];
  for (const bet of s.bets) {
    if (bet.matchKey !== matchKey || bet.status !== 'open') continue;
    if (bet.pick === winner) {
      const payout = Math.floor(bet.stake * bet.odds);
      if (transact(s, `payout:${bet.id}`, payout, `Bet won: ${bet.label}`)) {
        bet.payout = payout;
        s.player.stats.betsWon++;
      }
      bet.status = 'won';
    } else {
      bet.status = 'lost';
      s.player.stats.betsLost++;
    }
    settled.push(bet);
  }
  return settled;
}

export function voidBets(s: GameState, matchKey: string) {
  for (const bet of s.bets) {
    if (bet.matchKey !== matchKey || bet.status !== 'open') continue;
    transact(s, `refund:${bet.id}`, bet.stake, `Bet void: ${bet.label}`);
    bet.status = 'void';
  }
}

// ---------------- rewards ----------------

export function duelReward(tier: number, ratingDiff: number, won: boolean): number {
  const base = 22 + tier * 28 + tier * tier * 14;
  const upset = clamp(ratingDiff / 400, -0.4, 1.2);
  return Math.round(won ? base * (1 + upset) : base * 0.18);
}

export function materialDrops(seed: number, tier: number, element: Element, element2: Element, won: boolean): Record<string, number> {
  const rng = new Rng(seed);
  const out: Record<string, number> = {};
  const n = won ? rng.int(2, 3) : 1;
  const maxR = tier === 0 ? 1 : tier < 3 ? 2 : tier < 6 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const el = rng.chance(0.5) ? element : rng.chance(0.5) ? element2 : rng.pick(ELEMENTS);
    const opts = MATERIALS.filter((m) => m.element === el && m.rarity <= maxR && m.minTier <= tier);
    const weights = opts.map((m) => Math.pow(0.35, m.rarity));
    let r = rng.next() * weights.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < opts.length - 1 && r > weights[k]) r -= weights[k++];
    const m = opts[k];
    if (m) out[m.id] = (out[m.id] ?? 0) + 1;
  }
  return out;
}

// ---------------- contracts ----------------

const TRAIT_CONTRACT: Trait[] = ['pierce', 'chain', 'shatter', 'blight', 'echo', 'disrupt', 'lifesteal', 'fortify', 'thermal', 'amplify'];

export function generateContracts(s: GameState): Contract[] {
  const day = s.clock.day;
  const tier = s.player.tier;
  const rng = new Rng(hashString(`contracts|${s.seed}|${day}`));
  const out: Contract[] = [];
  const mk = (c: Omit<Contract, 'id' | 'progress' | 'done' | 'expiresDay'>) => {
    s.counters.contract++;
    out.push({ ...c, id: `ct${s.counters.contract}`, progress: 0, done: false, expiresDay: day + 3 });
  };
  const mats = MATERIALS.filter((m) => m.minTier <= tier && m.rarity <= Math.min(3, tier + 1));
  const m = rng.pick(mats);
  const count = rng.int(1, 3);
  mk({ kind: 'deliver', desc: `Deliver ${count}× ${m.name} to the Apothecary`, reward: Math.round(m.basePrice * count * 1.7 + 10), respect: 1, target: m.id, count });
  const el = rng.pick(ELEMENTS);
  mk({ kind: 'winElement', desc: `Win a duel while casting a ${ELEMENT_INFO[el].name} spell`, reward: 40 + tier * 45, respect: 2, target: el, count: 1 });
  const tr = rng.pick(TRAIT_CONTRACT);
  mk({ kind: 'inventTrait', desc: `Invent a component with the "${tr}" trait`, reward: 60 + tier * 60, respect: 3, target: tr, count: 1 });
  if (rng.chance(0.5)) mk({ kind: 'winStreak', desc: 'Win 3 duels in a row', reward: 90 + tier * 80, respect: 4, target: '', count: 3 });
  else mk({ kind: 'beatRating', desc: `Defeat a wizard rated ${s.player.rating + 40}+`, reward: 80 + tier * 70, respect: 4, target: String(s.player.rating + 40), count: 1 });
  return out;
}

export const TUTOR_PAY = (tier: number) => 25 + tier * 20;
