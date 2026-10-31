// Tournaments: seeded brackets, deterministic match settlement, prizes.
import { estimateWinProbability, simulateDuel } from './combat';
import { Rng, hashString } from './rng';
import type { MatchSnapshot, Tournament, WizardSpec } from './state';
import type { CombatWizard } from './types';
import { tierName } from './hierarchy';

export type WizardResolver = (id: string) => WizardSpec;
export type SpecCompiler = (spec: WizardSpec) => CombatWizard;
export type RatingResolver = (id: string) => number;

export const TOURNAMENT_KINDS: Record<Tournament['kind'], { label: string; size: number; minTier: number; feeMult: number; poolMult: number }> = {
  skirmish: { label: 'Skirmish', size: 4, minTier: 0, feeMult: 1, poolMult: 4.5 },
  cup: { label: 'Cup', size: 8, minTier: 0, feeMult: 2, poolMult: 10 },
  open: { label: 'Open', size: 16, minTier: 1, feeMult: 3.5, poolMult: 22 },
  championship: { label: 'Championship', size: 32, minTier: 3, feeMult: 6, poolMult: 48 },
  seasonal: { label: 'Season Finals', size: 16, minTier: 0, feeMult: 4, poolMult: 34 },
};

const VENUES = ['Candlewick', 'Owlery', 'Ivy Gate', 'Moonwell', 'Lantern Hall', 'Thornfield', 'Hollowmere', 'Bell Tower', 'Rookery', 'Starfall'];

export function bracketOrder(n: number): number[] {
  // standard seeding: 1 v n, 2 v n-1 ... arranged so top seeds meet late
  let order = [0];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m - 1 - s]);
  }
  return order;
}

export function createTournament(opts: {
  id: string;
  kind: Tournament['kind'];
  tier: number;
  day: number;
  candidates: string[]; // npc ids eligible
  rating: RatingResolver;
  seed: number;
  season?: number;
}): Tournament {
  const k = TOURNAMENT_KINDS[opts.kind];
  const rng = new Rng(opts.seed);
  const pool = rng.shuffle(opts.candidates.slice()).slice(0, k.size);
  const fee = Math.round((10 + opts.tier * opts.tier * 40 + opts.tier * 20) * k.feeMult);
  const venue = rng.pick(VENUES);
  return {
    id: opts.id,
    name: opts.kind === 'seasonal' ? `${tierName(opts.tier)} Season ${opts.season ?? 1} Finals` : `${venue} ${tierName(opts.tier)} ${k.label}`,
    kind: opts.kind,
    tier: opts.tier,
    size: k.size,
    entryFee: fee,
    prizePool: Math.round(fee * k.poolMult),
    participants: pool,
    rounds: [],
    round: 0,
    status: 'registration',
    createdDay: opts.day,
    playerEntered: false,
    matchIds: [],
  };
}

/** Seed and build the first round. Participants are fixed from here on. */
export function startTournament(t: Tournament, rating: RatingResolver) {
  const seeded = t.participants.slice().sort((a, b) => rating(b) - rating(a) || a.localeCompare(b));
  const order = bracketOrder(t.size);
  const placed = order.map((i) => seeded[i]);
  const first: MatchSnapshot[] = [];
  for (let i = 0; i < placed.length; i += 2) first.push(makeMatch(t, 0, i / 2, placed[i], placed[i + 1]));
  t.rounds = [first];
  t.round = 0;
  t.status = 'running';
}

function makeMatch(t: Tournament, round: number, idx: number, a: string, b: string): MatchSnapshot {
  return { a, b, seed: hashString(`${t.id}|r${round}|m${idx}|${a}|${b}`), status: 'open' };
}

export function matchKey(t: Tournament, round: number, idx: number): string {
  return `${t.id}:r${round}:m${idx}`;
}

/** Lock both wizards' builds and compute fair win probability (for odds). */
export function lockMatch(m: MatchSnapshot, getWizard: WizardResolver, compile: SpecCompiler, samples = 12) {
  if (!m.wa) m.wa = getWizard(m.a);
  if (!m.wb) m.wb = getWizard(m.b);
  if (m.probA === undefined) m.probA = estimateWinProbability(compile(m.wa), compile(m.wb), samples, m.seed % 997);
}

export function resolveMatch(m: MatchSnapshot, getWizard: WizardResolver, compile: SpecCompiler): string {
  if (m.status === 'done' && m.winner) return m.winner;
  lockMatch(m, getWizard, compile);
  const r = simulateDuel(compile(m.wa!), compile(m.wb!), m.seed, { recordFrames: false, maxDecisions: 0 });
  m.winner = r.winner === 0 ? m.a : m.b;
  m.duration = r.duration;
  m.status = 'done';
  return m.winner;
}

export function playerMatch(t: Tournament): { round: number; idx: number; match: MatchSnapshot } | null {
  if (t.status !== 'running') return null;
  const r = t.rounds[t.round];
  const idx = r.findIndex((m) => (m.a === 'player' || m.b === 'player') && m.status !== 'done');
  return idx >= 0 ? { round: t.round, idx, match: r[idx] } : null;
}

/**
 * Resolve every non-player match in the current round. If all matches are complete,
 * build the next round (or finish). Returns keys of resolved matches for bet settlement.
 */
export function advanceRound(t: Tournament, getWizard: WizardResolver, compile: SpecCompiler): { resolved: { key: string; winner: string }[]; finished: boolean } {
  const resolved: { key: string; winner: string }[] = [];
  if (t.status !== 'running') return { resolved, finished: t.status === 'finished' };
  const r = t.rounds[t.round];
  r.forEach((m, i) => {
    if (m.status !== 'done' && m.a !== 'player' && m.b !== 'player') {
      resolved.push({ key: matchKey(t, t.round, i), winner: resolveMatch(m, getWizard, compile) });
    }
  });
  if (r.some((m) => m.status !== 'done')) return { resolved, finished: false };
  const winners = r.map((m) => m.winner!);
  if (winners.length === 1) {
    t.status = 'finished';
    t.champion = winners[0];
    const final = r[0];
    t.runnerUp = final.winner === final.a ? final.b : final.a;
    if (t.playerEntered) t.playerPlacement = placementOf(t, 'player');
    return { resolved, finished: true };
  }
  const next: MatchSnapshot[] = [];
  for (let i = 0; i < winners.length; i += 2) next.push(makeMatch(t, t.round + 1, i / 2, winners[i], winners[i + 1]));
  t.rounds.push(next);
  t.round++;
  return { resolved, finished: false };
}

/** 1 = champion, 2 = runner-up, 4 = semifinal, 8 = quarterfinal ... */
export function placementOf(t: Tournament, id: string): number {
  if (t.champion === id) return 1;
  for (let r = t.rounds.length - 1; r >= 0; r--) {
    const m = t.rounds[r].find((x) => x.a === id || x.b === id);
    if (m && m.status === 'done' && m.winner !== id) return Math.pow(2, t.rounds.length - r);
  }
  return t.size;
}

export function prizeFor(t: Tournament, placement: number): number {
  if (placement === 1) return Math.round(t.prizePool * 0.5);
  if (placement === 2) return Math.round(t.prizePool * 0.25);
  if (placement === 4) return Math.round(t.prizePool * 0.125);
  return 0;
}

export function outrightProbabilities(t: Tournament, rating: RatingResolver): Record<string, number> {
  const ws = t.participants.map((p) => Math.exp(rating(p) / 140));
  const sum = ws.reduce((a, b) => a + b, 0);
  return Object.fromEntries(t.participants.map((p, i) => [p, ws[i] / sum]));
}
