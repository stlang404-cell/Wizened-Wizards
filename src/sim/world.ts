// World creation, wizard specs, and event-driven background simulation.
import { EQUIP_MAP } from './data/equipment';
import { simulateDuel } from './combat';
import { ELEMENT_INFO } from './data/materials';
import { advanceMarket, createMarket } from './market';
import { buildGuardian, GUARDIANS } from './guardians';
import { NAMED_TIERS, eloExpected, tierBaseRating, tierName } from './hierarchy';
import { compileCached, generateNpc, generateRecipe, npcEquipment, npcStrength, npcTactics, loadoutSize, randomLook } from './npc';
import { Rng, hashString, clamp } from './rng';
import type { Exhibition, GameState, NpcState, PlayerState, Tournament, WizardSpec } from './state';
import { SCHEMA_VERSION } from './state';
import type { CombatWizard, CompiledSpell, WizardLook } from './types';
import { ATTRS } from './types';
import { STARTING_RESEARCH, SPELLBOOK_LEVELS } from './upgrades';
import { TACTIC_PRESETS } from './tactics';
import { generateContracts } from './economy';
import { advanceRound, createTournament, lockMatch, startTournament, matchKey, TOURNAMENT_KINDS } from './tournament';
import { settleBets, voidBets } from './economy';
import { attributeCap } from './hierarchy';
import type { ComponentLib } from './genetics';

export const NPC_COUNTS = [160, 140, 120, 100, 85, 70, 55, 40, 30];
export const HOURS_PER_DAY = 6;

export const STARTER_RECIPE = {
  essence: { kind: 'material' as const, id: 'ember_moss' },
  form: 'bolt' as const,
  delivery: 'projectile' as const,
  behavior: 'direct' as const,
  modifiers: [],
  trigger: 'onCast' as const,
  conditional: 'none' as const,
  evolution: [],
};

export function createPlayer(name: string, look: WizardLook, lib: ComponentLib): PlayerState {
  const starter = compileCached(STARTER_RECIPE, lib)!;
  return {
    id: 'player',
    name: name.trim().slice(0, 28) || 'Nameless Apprentice',
    look,
    money: 250,
    tier: 0,
    div: 0,
    rating: 800,
    peakRating: 800,
    respect: 0,
    attrs: { vitality: 10, wisdom: 10, power: 10, agility: 10, focus: 10 },
    attrTrained: 0,
    skillPoints: 0,
    skills: [],
    equipped: { wand: 'eq1', core: 'eq2', robe: 'eq3', relic: 'eq4' },
    ownedEquipment: [
      { uid: 'eq1', defId: 'twig_wand', enchant: 0 },
      { uid: 'eq2', defId: 'no_core', enchant: 0 },
      { uid: 'eq3', defId: 'patched_robe', enchant: 0 },
      { uid: 'eq4', defId: 'no_relic', enchant: 0 },
    ],
    materials: { ember_moss: 2, static_wool: 1, chalk_rune: 2, rime_lichen: 1, river_clay: 1 },
    components: {},
    knownComponents: [],
    spells: [
      {
        id: starter.recipeId,
        recipe: STARTER_RECIPE,
        name: 'Ember Bolt',
        favorite: false,
        createdDay: 0,
        mastery: 0,
        wins: 0,
        losses: 0,
        damage: 0,
        retired: false,
        firstOfMechanic: false,
        starter: true,
      },
    ],
    spellbook: [starter.recipeId],
    tactics: TACTIC_PRESETS[0].rules.map((r) => ({ ...r })),
    upgrades: { lab: 0, spellbook: 0, grimoire: 0 },
    research: [...STARTING_RESEARCH],
    record: { wins: 0, losses: 0, streak: 0, bestStreak: 0, tournamentsWon: 0, upsets: 0, guardiansDefeated: [] },
    promotion: { qualifyingWins: 0, tournamentTop2: false },
    titles: [],
    activeTitle: null,
    achievements: {},
    career: [{ day: 0, text: 'Enrolled at the Academy as a penniless apprentice.', kind: 'misc' }],
    rivals: [],
    stats: { componentsInvented: 0, spellsForged: 0, maxGeneration: 0, duels: 0, mutations: 0, betsWon: 0, betsLost: 0, moneyEarned: 0 },
    lastTutorHour: -99,
    lastStipendDay: 0,
  };
}

export function createWorld(name: string, look: WizardLook, seed: number): GameState {
  const lib: ComponentLib = {};
  const npcs: Record<string, NpcState> = {};
  let idx = 0;
  NPC_COUNTS.forEach((count, tier) => {
    for (let i = 0; i < count; i++) {
      const n = generateNpc(hashString(`npc|${seed}|${idx}`), tier, lib, idx);
      npcs[n.id] = n;
      idx++;
    }
  });
  for (let g = 0; g < GUARDIANS.length; g++) {
    const gd = buildGuardian(g, lib);
    npcs[gd.id] = gd;
  }
  const s: GameState = {
    version: SCHEMA_VERSION,
    seed,
    createdAt: Date.now(),
    clock: { day: 1, hour: HOURS_PER_DAY },
    counters: { duel: 0, txn: 0, bet: 0, mutate: 0, match: 0, tourney: 0, contract: 0, equip: 10, npc: idx },
    player: createPlayer(name, look, lib),
    lib,
    npcs,
    market: createMarket(seed),
    tournaments: [],
    exhibitions: [],
    bets: [],
    ledger: [],
    appliedTxns: [],
    champions: [],
    news: [{ day: 1, text: 'A new apprentice has enrolled at the Academy.' }],
    pendingDuel: null,
    replays: [],
    contracts: [],
    onboarding: { step: 0, dismissed: false },
    season: 1,
  };
  s.market.lastDay = 1;
  s.contracts = generateContracts(s);
  refreshTournaments(s);
  refreshExhibitions(s);
  return s;
}

// ---------------- specs ----------------

export function playerSpellbookSlots(p: PlayerState): number {
  return SPELLBOOK_LEVELS[Math.min(p.upgrades.spellbook, SPELLBOOK_LEVELS.length - 1)].slots;
}

export function playerSpec(s: GameState): WizardSpec {
  const p = s.player;
  const equipment: string[] = [];
  const enchants: WizardSpec['enchants'] = {};
  for (const uid of Object.values(p.equipped)) {
    const o = p.ownedEquipment.find((e) => e.uid === uid);
    if (!o) continue;
    equipment.push(o.defId);
    if (o.enchant > 0) enchants[o.defId] = { level: o.enchant, path: o.path };
  }
  const spells = p.spellbook
    .map((id) => p.spells.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, playerSpellbookSlots(p))
    .map((e) => ({ recipe: e.recipe, name: e.name }));
  return {
    id: 'player',
    name: p.name,
    attrs: { ...p.attrs },
    spells,
    tactics: p.tactics.map((t) => ({ ...t })),
    equipment,
    enchants,
    skills: [...p.skills],
    look: p.look,
  };
}

export function npcSpec(n: NpcState): WizardSpec {
  return {
    id: n.id,
    name: n.name,
    attrs: { ...n.attrs },
    spells: n.loadout.map((i) => n.library[i]).filter(Boolean).map((r) => ({ recipe: r })),
    tactics: n.tactics.map((t) => ({ ...t })),
    equipment: [...n.equipment],
    enchants: {},
    skills: n.guardian !== undefined ? guardianSkillList(n.guardian) : n.tier >= 3 ? ['e1', 'a1'].slice(0, Math.floor(n.tier / 3)) : [],
    look: n.look,
  };
}

function guardianSkillList(g: number): string[] {
  const s = ['a1', 'e1', 's1', 'e2b', 'a2a', 's3', 'e3', 'a3', 'e4a'];
  return s.slice(0, Math.min(s.length, Math.floor(g / 1.5) + (g > 0 ? 1 : 0)));
}

export function specFor(s: GameState, id: string): WizardSpec {
  if (id === 'player') return playerSpec(s);
  const n = s.npcs[id];
  if (!n) throw new Error(`Unknown wizard ${id}`);
  return npcSpec(n);
}

export function compileSpec(spec: WizardSpec, lib: ComponentLib): CombatWizard {
  return {
    id: spec.id,
    name: spec.name,
    attrs: { ...spec.attrs },
    spells: spec.spells.map((x) => compileCached(x.recipe, lib, x.name)).filter((x): x is CompiledSpell => !!x),
    tactics: spec.tactics.map((t) => ({ ...t })),
    equipment: spec.equipment.map((e) => EQUIP_MAP[e]).filter(Boolean),
    enchants: { ...spec.enchants },
    skills: [...spec.skills],
    look: spec.look,
  };
}

export function wizardName(s: GameState, id: string): string {
  if (id === 'player') return s.player.name;
  return s.npcs[id]?.name ?? id;
}

export function wizardRating(s: GameState, id: string): number {
  if (id === 'player') return s.player.rating;
  return s.npcs[id]?.rating ?? 0;
}

export function wizardTier(s: GameState, id: string): number {
  if (id === 'player') return s.player.tier;
  return s.npcs[id]?.tier ?? 0;
}

export function news(s: GameState, text: string) {
  s.news.unshift({ day: s.clock.day, text });
  if (s.news.length > 60) s.news.length = 60;
}

// ---------------- population ----------------

export function npcsInTier(s: GameState, tier: number): NpcState[] {
  return Object.values(s.npcs).filter((n) => n.tier === tier && n.guardian === undefined);
}

/** Endless hierarchy: make sure an ascension tier has a living population. */
export function ensurePopulation(s: GameState, tier: number) {
  const have = npcsInTier(s, tier).length;
  const need = tier < NAMED_TIERS ? 0 : 24;
  const c = s.counters;
  for (let i = have; i < need; i++) {
    const idx = c.npc++;
    const n = generateNpc(hashString(`npc|${s.seed}|${idx}`), Math.min(tier, NAMED_TIERS - 1), s.lib, idx);
    n.tier = tier;
    n.rating = tierBaseRating(NAMED_TIERS - 1) + 150 + (tier - NAMED_TIERS + 1) * 60 + (n.rating - tierBaseRating(NAMED_TIERS - 1));
    const bump = Math.min(10, Math.floor((tier - NAMED_TIERS + 1) / 2));
    for (const k of ATTRS) n.attrs[k] = Math.min(attributeCap(tier), n.attrs[k] + bump);
    n.strength = npcStrength(n, s.lib);
    s.npcs[n.id] = n;
  }
}

// ---------------- background simulation ----------------

function promoteNpc(s: GameState, n: NpcState, rng: Rng) {
  n.tier++;
  n.peakTier = Math.max(n.peakTier, n.tier);
  const effTier = Math.min(n.tier, NAMED_TIERS - 1);
  n.rating = Math.max(n.rating, tierBaseRating(effTier));
  const pts = 4;
  for (let i = 0; i < pts; i++) {
    const k = rng.pick(ATTRS);
    if (n.attrs[k] < attributeCap(n.tier)) n.attrs[k]++;
  }
  const size = loadoutSize(effTier);
  const roles = ['attack', 'defense', 'attack', 'heal', 'utility'] as const;
  while (n.library.length < Math.min(8, size + 1)) n.library.push(generateRecipe(rng, effTier, n.element, n.element2, rng.pick(roles), n.personality, s.lib, s.clock.day, n.id));
  // replace the weakest spell with a freshly researched one
  const fresh = generateRecipe(rng, effTier, n.element, n.element2, 'attack', n.personality, s.lib, s.clock.day, n.id);
  n.library.push(fresh);
  if (n.library.length > 8) n.library.shift();
  n.loadout = pickBestLoadout(n, s.lib, size);
  n.tactics = npcTactics(n.personality, effTier);
  if (n.wealth > 300) n.equipment = npcEquipment(rng, effTier, n.element, true);
  n.strength = npcStrength(n, s.lib);
  news(s, `${n.name} has been promoted to ${tierName(n.tier)}.`);
}

function pickBestLoadout(n: NpcState, lib: ComponentLib, size: number): number[] {
  const scored = n.library.map((r, i) => ({ i, p: compileCached(r, lib)?.power ?? 0, k: compileCached(r, lib)?.kind ?? 'attack' }));
  const off = scored.filter((x) => x.k === 'attack' || x.k === 'hex').sort((a, b) => b.p - a.p);
  const def = scored.filter((x) => x.k === 'shield' || x.k === 'heal').sort((a, b) => b.p - a.p);
  const out: number[] = [];
  if (off[0]) out.push(off.shift()!.i);
  if (size >= 3 && def[0]) out.push(def.shift()!.i);
  const rest = [...off, ...def].sort((a, b) => b.p - a.p);
  while (out.length < size && rest.length) out.push(rest.shift()!.i);
  return out.sort((a, b) => a - b);
}

function demoteNpc(s: GameState, n: NpcState) {
  n.tier--;
  n.rating = Math.min(n.rating, tierBaseRating(Math.min(n.tier, NAMED_TIERS - 1)) + 120);
  news(s, `${n.name} has fallen to ${tierName(n.tier)}.`);
}

function simulateBackgroundHour(s: GameState, hour: number) {
  const rng = new Rng(hashString(`bg|${s.seed}|${hour}`));
  const byTier: Record<number, NpcState[]> = {};
  for (const n of Object.values(s.npcs)) {
    if (n.guardian !== undefined) continue;
    (byTier[n.tier] ??= []).push(n);
  }
  for (const [, list] of Object.entries(byTier)) {
    const bouts = Math.max(2, Math.floor(list.length / 8));
    for (let i = 0; i < bouts; i++) {
      const a = rng.pick(list);
      const b = rng.pick(list);
      if (a === b) continue;
      const sa = a.strength + 1;
      const sb = b.strength + 1;
      const pStrength = sa / (sa + sb);
      const p = clamp(0.5 * pStrength + 0.5 * eloExpected(a.rating, b.rating), 0.05, 0.95);
      const aWins = rng.chance(p);
      const w = aWins ? a : b;
      const l = aWins ? b : a;
      const k = 20;
      const d = Math.round(k * (1 - eloExpected(w.rating, l.rating)));
      w.rating += d;
      l.rating -= d;
      w.wins++;
      l.losses++;
      const purse = 10 + w.tier * w.tier * 15;
      w.wealth += purse;
      l.wealth = Math.max(0, l.wealth - Math.round(purse * 0.3));
      w.respect += d > 20 ? 2 : 0;
    }
  }
}

function simulateBackgroundDay(s: GameState, day: number) {
  const rng = new Rng(hashString(`day|${s.seed}|${day}`));
  const all = Object.values(s.npcs).filter((n) => n.guardian === undefined);
  // promotions and demotions (NPCs climb and fall by the same rating structure)
  for (const n of all) {
    const eff = Math.min(n.tier, NAMED_TIERS - 1);
    const top = n.tier < NAMED_TIERS - 1 ? tierBaseRating(eff) + 230 : tierBaseRating(NAMED_TIERS - 1) + 230 + (n.tier - NAMED_TIERS + 1) * 60;
    if (n.rating >= top && n.tier < s.player.tier + 2 && rng.chance(0.35)) promoteNpc(s, n, rng);
    else if (n.tier > 0 && n.rating < tierBaseRating(eff) - 110 && rng.chance(0.35)) demoteNpc(s, n);
  }
  // research: a few NPCs invent new spells and swap them in if stronger
  for (let i = 0; i < 6; i++) {
    const n = rng.pick(all);
    const eff = Math.min(n.tier, NAMED_TIERS - 1);
    const r = generateRecipe(rng, eff, n.element, n.element2, rng.chance(0.7) ? 'attack' : 'defense', n.personality, s.lib, day, n.id);
    if (n.library.length >= 8) n.library.splice(rng.int(0, n.library.length - 1), 1);
    n.library.push(r);
    n.loadout = pickBestLoadout(n, s.lib, n.loadout.length || 1).filter((x) => x < n.library.length);
    n.wealth = Math.max(0, n.wealth - 20 * (eff + 1));
    n.strength = npcStrength(n, s.lib);
  }
  // background NPC-only tournaments resolved by strength sampling (light simulation)
  for (let tier = 0; tier <= Math.max(s.player.tier + 1, 2); tier++) {
    const pool = all.filter((n) => n.tier === tier);
    if (pool.length < 8) continue;
    rng.shuffle(pool);
    let field = pool.slice(0, 8);
    while (field.length > 1) {
      const next: NpcState[] = [];
      for (let i = 0; i < field.length; i += 2) {
        const a = field[i];
        const b = field[i + 1];
        const p = clamp((a.strength + 1) / (a.strength + b.strength + 2) * 0.5 + eloExpected(a.rating, b.rating) * 0.5, 0.05, 0.95);
        next.push(rng.chance(p) ? a : b);
      }
      field = next;
    }
    const champ = field[0];
    champ.wealth += 80 + tier * tier * 120;
    champ.respect += 5 + tier * 2;
    const title = `${tierName(tier)} Day ${day} Invitational Champion`;
    s.champions.unshift({ day, tournament: `${tierName(tier)} Invitational`, champion: champ.name, tier });
    if (champ.titles.length < 4 && rng.chance(0.3)) champ.titles.push(title);
  }
  if (s.champions.length > 80) s.champions.length = 80;
  if (rng.chance(0.4)) {
    const n = rng.pick(all.filter((x) => x.tier <= s.player.tier + 1));
    if (n) news(s, `${n.name} unveiled a new ${ELEMENT_INFO[n.element].name} invention at the ${tierName(n.tier)} salon.`);
  }
}

/** Advance the world clock. Background is event-driven: only cheap estimates, no full sims, except tournaments. */
export function advanceWorld(s: GameState, hours = 1) {
  for (let h = 0; h < hours; h++) {
    s.clock.hour++;
    simulateBackgroundHour(s, s.clock.hour);
    const newDay = Math.floor(s.clock.hour / HOURS_PER_DAY);
    if (newDay > s.clock.day) {
      s.clock.day = newDay;
      simulateBackgroundDay(s, newDay);
      advanceMarket(s.market, newDay, s.seed);
      s.contracts = s.contracts.filter((c) => !c.done && c.expiresDay >= newDay);
      if (s.contracts.length < 3) s.contracts.push(...generateContracts(s).slice(0, 4 - s.contracts.length));
      if (newDay % 14 === 0) {
        s.season++;
        news(s, `Season ${s.season} has begun across the hierarchy.`);
      }
    }
    progressNpcTournaments(s);
    resolveDueExhibitions(s);
  }
  refreshTournaments(s);
  refreshExhibitions(s);
}

// ---------------- tournaments (player-tier, fully simulated) ----------------

export function refreshTournaments(s: GameState) {
  const tier = s.player.tier;
  ensurePopulation(s, tier);
  // drop finished tournaments older than 3 days
  s.tournaments = s.tournaments.filter((t) => t.status !== 'finished' || t.createdDay >= s.clock.day - 3);
  const kinds = (Object.keys(TOURNAMENT_KINDS) as Tournament['kind'][]).filter((k) => {
    const info = TOURNAMENT_KINDS[k];
    if (k === 'seasonal') return s.clock.day % 14 >= 10; // finals window
    if (k === 'championship') return tier >= 3;
    return tier >= info.minTier;
  });
  for (const kind of kinds) {
    const exists = s.tournaments.some((t) => t.kind === kind && t.tier === tier && t.status !== 'finished');
    if (exists) continue;
    let cands = npcsInTier(s, tier).map((n) => n.id);
    if (cands.length < TOURNAMENT_KINDS[kind].size && tier > 0) cands = cands.concat(npcsInTier(s, tier - 1).map((n) => n.id));
    if (cands.length < TOURNAMENT_KINDS[kind].size) continue;
    s.counters.tourney++;
    const t = createTournament({
      id: `t${s.counters.tourney}`,
      kind,
      tier,
      day: s.clock.day,
      candidates: cands,
      rating: (id) => wizardRating(s, id),
      seed: hashString(`tourney|${s.seed}|${s.counters.tourney}`),
      season: s.season,
    });
    s.tournaments.push(t);
  }
}

/** Tournaments the player did not enter run on their own, one round per world hour. */
function progressNpcTournaments(s: GameState) {
  for (const t of s.tournaments) {
    if (t.playerEntered) continue;
    if (t.status === 'registration' && t.createdDay < s.clock.day) {
      startTournament(t, (id) => wizardRating(s, id));
      lockRound(s, t);
      voidBets(s, `outright-late:${t.id}`);
      continue;
    }
    if (t.status === 'running') {
      const r = advanceRound(t, (id) => specFor(s, id), (spec) => compileSpec(spec, s.lib));
      for (const x of r.resolved) settleBets(s, x.key, x.winner);
      if (r.finished) finishTournament(s, t);
      else lockRound(s, t);
    }
  }
}

export function lockRound(s: GameState, t: Tournament) {
  const r = t.rounds[t.round];
  if (!r) return;
  r.forEach((m) => {
    if (m.status !== 'done' && m.a !== 'player' && m.b !== 'player') lockMatch(m, (id) => specFor(s, id), (spec) => compileSpec(spec, s.lib), 10);
  });
}

export function finishTournament(s: GameState, t: Tournament) {
  if (!t.champion) return;
  const champName = wizardName(s, t.champion);
  s.champions.unshift({ day: s.clock.day, tournament: t.name, champion: champName, tier: t.tier });
  news(s, `${champName} won the ${t.name}!`);
  settleBets(s, `outright:${t.id}`, t.champion);
  for (const id of [t.champion, t.runnerUp]) {
    if (!id || id === 'player') continue;
    const n = s.npcs[id];
    if (!n) continue;
    const prize = id === t.champion ? t.prizePool * 0.5 : t.prizePool * 0.25;
    n.wealth += Math.round(prize);
    n.respect += id === t.champion ? 10 + t.tier * 4 : 3;
    n.rating += id === t.champion ? 15 : 5;
    if (id === t.champion && n.titles.length < 5) n.titles.push(`${t.name} Champion`);
  }
}

// ---------------- exhibitions (spectate & bet) ----------------

export function refreshExhibitions(s: GameState) {
  const tier = s.player.tier;
  s.exhibitions = s.exhibitions.filter((e) => e.match.status !== 'done' || e.hour >= s.clock.hour - 12);
  const open = s.exhibitions.filter((e) => e.match.status !== 'done').length;
  const rng = new Rng(hashString(`exh|${s.seed}|${s.clock.hour}`));
  for (let i = open; i < 4; i++) {
    const t = rng.chance(0.65) ? tier : tier + 1;
    const pool = npcsInTier(s, t);
    if (pool.length < 2) continue;
    const a = rng.pick(pool);
    const near = pool.filter((n) => n !== a).sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating)).slice(0, 8);
    const b = rng.pick(near);
    s.counters.match++;
    const ex: Exhibition = {
      id: `ex${s.counters.match}`,
      match: { a: a.id, b: b.id, seed: hashString(`exh|${s.seed}|${s.counters.match}`), status: 'open' },
      day: s.clock.day,
      hour: s.clock.hour + rng.int(2, 4),
      tier: t,
    };
    lockMatch(ex.match, (id) => specFor(s, id), (spec) => compileSpec(spec, s.lib), 10);
    s.exhibitions.push(ex);
  }
}

export function resolveExhibition(s: GameState, ex: Exhibition) {
  if (ex.match.status === 'done') return;
  const m = ex.match;
  // deterministic: locked builds + committed seed
  const r = simulateDuel(compileSpec(m.wa!, s.lib), compileSpec(m.wb!, s.lib), m.seed, { recordFrames: false, maxDecisions: 0 });
  m.winner = r.winner === 0 ? m.a : m.b;
  m.duration = r.duration;
  m.status = 'done';
  const w = s.npcs[m.winner];
  const l = s.npcs[m.winner === m.a ? m.b : m.a];
  if (w && l) {
    const d = Math.round(20 * (1 - eloExpected(w.rating, l.rating)));
    w.rating += d;
    l.rating -= d;
    w.wins++;
    l.losses++;
  }
  settleBets(s, `exh:${ex.id}`, m.winner);
}

function resolveDueExhibitions(s: GameState) {
  for (const ex of s.exhibitions) if (ex.match.status !== 'done' && ex.hour <= s.clock.hour) resolveExhibition(s, ex);
}

export { matchKey };
export function lookFromSeed(seed: number): WizardLook {
  return randomLook(new Rng(seed));
}
