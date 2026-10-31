// Authoritative player actions. All mutate a GameState in place and are deterministic.
import { compileSpell, EVOLUTION, recipeComplexity, recipeId, type CompileResult } from './compiler';
import { estimateWinProbability, simulateDuel, type CombatResult } from './combat';
import { ENCHANT_COST, EQUIPMENT, EQUIP_MAP } from './data/equipment';
import { MATERIALS, MATERIAL_MAP } from './data/materials';
import { SKILL_MAP, canLearnSkill } from './data/skills';
import { duelReward, materialDrops, nextTxn, oddsFromProb, placeBet, settleBets, transact, TUTOR_PAY } from './economy';
import { amplify, extract, fuse, mutate, OP_INFO, refine, resolveIngredient, split, stabilize, type SynthContext, type SynthResult } from './genetics';
import { buildGuardian, guardianInfo } from './guardians';
import {
  NAMED_TIERS,
  attributeCap,
  divisionFor,
  eloDelta,
  hasPrivilege,
  promotionRequirements,
  rankLabel,
  tierBaseRating,
  tierName,
} from './hierarchy';
import { applyBuy, applySell, buyPrice, componentValue, recordComponentSale, sellPrice } from './market';
import { adaptNpc, compileCached, observePlayer } from './npc';
import { Rng, hashString } from './rng';
import type { DuelSetup, GameState, NpcState, SpellEntry, Tournament } from './state';
import { validateTactics, GRIMOIRE_LEVELS } from './tactics';
import { advanceRound, lockMatch, matchKey, outrightProbabilities, placementOf, playerMatch, prizeFor, startTournament } from './tournament';
import type { Attr, Component, Ingredient, SpellRecipe, SynthOp, TacticRule } from './types';
import { LAB_LEVELS, RESEARCH, SPELLBOOK_LEVELS, attrTrainCost, type ResearchKey } from './upgrades';
import {
  advanceWorld,
  compileSpec,
  ensurePopulation,
  finishTournament,
  lockRound,
  news,
  npcSpec,
  npcsInTier,
  playerSpec,
  playerSpellbookSlots,
  refreshTournaments,
  resolveExhibition,
  specFor,
  wizardName,
  wizardRating,
} from './world';

export type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function career(s: GameState, text: string, kind: GameState['player']['career'][number]['kind']) {
  s.player.career.unshift({ day: s.clock.day, text, kind });
  if (s.player.career.length > 200) s.player.career.length = 200;
}

export function discount(s: GameState): number {
  const r = s.player.respect;
  return hasPrivilege(r, 'discount10') ? 0.1 : hasPrivilege(r, 'discount5') ? 0.05 : 0;
}

function addMats(s: GameState, mats: Record<string, number>) {
  for (const [k, v] of Object.entries(mats)) s.player.materials[k] = (s.player.materials[k] ?? 0) + v;
}

// ---------------- achievements ----------------

export const ACHIEVEMENTS: { id: string; name: string; desc: string; title?: string; check: (s: GameState) => boolean }[] = [
  { id: 'first_win', name: 'First Blood', desc: 'Win your first duel.', check: (s) => s.player.record.wins >= 1 },
  { id: 'inventor', name: 'Inventor', desc: 'Invent your first component.', check: (s) => s.player.stats.componentsInvented >= 1 },
  { id: 'spellwright', name: 'Spellwright', desc: 'Forge your first custom spell.', title: 'Spellwright', check: (s) => s.player.stats.spellsForged >= 1 },
  { id: 'deep_thinker', name: 'Deep Thinker', desc: 'Invent a generation-3 component.', check: (s) => s.player.stats.maxGeneration >= 3 },
  { id: 'master_inventor', name: 'Master Inventor', desc: 'Invent 15 components.', title: 'Master Inventor', check: (s) => s.player.stats.componentsInvented >= 15 },
  { id: 'arsenal', name: 'Arsenal', desc: 'Own 6 spells.', check: (s) => s.player.spells.length >= 6 },
  { id: 'giant_slayer', name: 'Giant Slayer', desc: 'Defeat a wizard rated 150+ above you.', title: 'Giant Slayer', check: (s) => s.player.record.upsets >= 1 },
  { id: 'champion', name: 'Champion', desc: 'Win a tournament.', title: 'Champion', check: (s) => s.player.record.tournamentsWon >= 1 },
  { id: 'promoted', name: 'Rising Star', desc: 'Earn your first promotion.', check: (s) => s.player.tier >= 1 },
  { id: 'warden_breaker', name: 'Warden-Breaker', desc: 'Defeat three rank guardians.', title: 'Warden-Breaker', check: (s) => s.player.record.guardiansDefeated.length >= 3 },
  { id: 'streak5', name: 'Unstoppable', desc: 'Win 5 duels in a row.', check: (s) => s.player.record.bestStreak >= 5 },
  { id: 'wealthy', name: 'Gilded Purse', desc: 'Hold $5,000.', check: (s) => s.player.money >= 5000 },
  { id: 'bookie', name: 'Sharp Bettor', desc: 'Win 5 bets.', check: (s) => s.player.stats.betsWon >= 5 },
  { id: 'scholar', name: 'Scholar', desc: 'Complete 10 research projects.', check: (s) => s.player.research.length >= 17 },
  { id: 'archmage', name: 'Archmage', desc: 'Reach the Archmage tier.', title: 'Archmage', check: (s) => s.player.tier >= 5 },
  { id: 'wizened', name: 'Truly Wizened', desc: 'Reach the Wizened tier.', title: 'the Wizened', check: (s) => s.player.tier >= 8 },
  { id: 'ascendant', name: 'Ascendant', desc: 'Begin the Endless Ascent.', title: 'Ascendant', check: (s) => s.player.tier >= NAMED_TIERS },
];

export function checkAchievements(s: GameState): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.player.achievements[a.id] !== undefined) continue;
    if (a.check(s)) {
      s.player.achievements[a.id] = s.clock.day;
      if (a.title && !s.player.titles.includes(a.title)) s.player.titles.push(a.title);
      got.push(a.name);
      career(s, `Achievement unlocked: ${a.name}.`, 'achievement');
    }
  }
  return got;
}

// ---------------- forge ----------------

export function labInfo(s: GameState) {
  return LAB_LEVELS[Math.min(s.player.upgrades.lab, LAB_LEVELS.length - 1)];
}

function synthCtx(s: GameState, nonce?: number): SynthContext {
  return { lib: s.lib, maxGeneration: labInfo(s).maxGeneration, day: s.clock.day, inventor: 'player', nonce };
}

function hasIngredient(s: GameState, i: Ingredient, n = 1): boolean {
  return i.kind === 'material' ? (s.player.materials[i.id] ?? 0) >= n : (s.player.components[i.id] ?? 0) >= n;
}

function consume(s: GameState, i: Ingredient, n = 1) {
  const bag = i.kind === 'material' ? s.player.materials : s.player.components;
  bag[i.id] = (bag[i.id] ?? 0) - n;
  if (bag[i.id] <= 0) delete bag[i.id];
}

export interface SynthArgs {
  ingredients?: Ingredient[];
  materialId?: string;
  componentId?: string;
}

/** Dry run: what would this operation produce? (No consumption.) */
export function previewSynthesis(s: GameState, op: SynthOp, a: SynthArgs): SynthResult {
  const ctx = synthCtx(s, s.counters.mutate);
  const lib = { ...s.lib };
  ctx.lib = lib;
  switch (op) {
    case 'fuse':
      return fuse(a.ingredients ?? [], ctx);
    case 'extract':
      return extract(a.materialId ?? '', ctx);
    case 'refine':
      return refine(a.componentId ?? '', ctx);
    case 'stabilize':
      return stabilize(a.componentId ?? '', ctx);
    case 'amplify':
      return amplify(a.componentId ?? '', a.materialId ?? '', ctx);
    case 'mutate':
      return { ok: false, error: 'Mutation is unpredictable — results cannot be previewed.' };
    case 'split':
      return split(a.componentId ?? '', ctx);
  }
}

export function synthesize(s: GameState, op: SynthOp, a: SynthArgs): Res<{ components: Component[]; discoveries: string[] }> {
  const p = s.player;
  if (labInfo(s).level < OP_INFO[op].minLab) return fail(`${OP_INFO[op].name} requires Laboratory level ${OP_INFO[op].minLab}.`);
  const uses: { ing: Ingredient; n: number }[] = [];
  if (op === 'fuse') {
    const ings = a.ingredients ?? [];
    const counts = new Map<string, { ing: Ingredient; n: number }>();
    for (const i of ings) {
      const k = `${i.kind}:${i.id}`;
      const c = counts.get(k) ?? { ing: i, n: 0 };
      c.n++;
      counts.set(k, c);
    }
    uses.push(...counts.values());
  } else if (op === 'extract') uses.push({ ing: { kind: 'material', id: a.materialId ?? '' }, n: 2 });
  else if (op === 'amplify') {
    uses.push({ ing: { kind: 'component', id: a.componentId ?? '' }, n: 1 });
    uses.push({ ing: { kind: 'material', id: a.materialId ?? '' }, n: 1 });
  } else uses.push({ ing: { kind: 'component', id: a.componentId ?? '' }, n: 1 });
  for (const u of uses) if (!hasIngredient(s, u.ing, u.n)) return fail(`You need ${u.n}× ${resolveIngredient(u.ing, s.lib)?.name ?? u.ing.id}.`);
  const ctx = synthCtx(s, s.counters.mutate);
  let r: SynthResult;
  switch (op) {
    case 'fuse':
      r = fuse(a.ingredients ?? [], ctx);
      break;
    case 'extract':
      r = extract(a.materialId ?? '', ctx);
      break;
    case 'refine':
      r = refine(a.componentId ?? '', ctx);
      break;
    case 'stabilize':
      r = stabilize(a.componentId ?? '', ctx);
      break;
    case 'amplify':
      r = amplify(a.componentId ?? '', a.materialId ?? '', ctx);
      break;
    case 'mutate':
      r = mutate(a.componentId ?? '', ctx);
      break;
    case 'split':
      r = split(a.componentId ?? '', ctx);
      break;
  }
  if (!r.ok) return fail(r.error);
  if (p.money < r.cost) return fail(`Costs $${r.cost}.`);
  if (!transact(s, nextTxn(s, 'synth'), -r.cost, `${OP_INFO[op].name} in the laboratory`)) return fail('Transaction failed.');
  for (const u of uses) consume(s, u.ing, u.n);
  if (op === 'mutate') {
    s.counters.mutate++;
    p.stats.mutations++;
  }
  const discoveries: string[] = [];
  for (const c of r.components) {
    const isNew = !s.lib[c.id];
    if (isNew) s.lib[c.id] = c;
    const comp = s.lib[c.id];
    p.components[comp.id] = (p.components[comp.id] ?? 0) + 1;
    if (!p.knownComponents.includes(comp.id)) {
      p.knownComponents.push(comp.id);
      p.stats.componentsInvented++;
      discoveries.push(comp.name);
      career(s, `Invented ${comp.name} (gen ${comp.generation}).`, 'invention');
    }
    p.stats.maxGeneration = Math.max(p.stats.maxGeneration, comp.generation);
    for (const ct of s.contracts) {
      if (!ct.done && ct.kind === 'inventTrait' && comp.traits.some((t) => t.trait === ct.target)) completeContract(s, ct.id);
    }
  }
  checkAchievements(s);
  return { ok: true, components: r.components.map((c) => s.lib[c.id]), discoveries };
}

export function missingResearch(s: GameState, r: SpellRecipe): string[] {
  const need: ResearchKey[] = [`form:${r.form}`, `delivery:${r.delivery}`, `behavior:${r.behavior}`, `cond:${r.conditional}`, `trigger:${r.trigger}`];
  return need.filter((k) => !s.player.research.includes(k));
}

export function playerCompileLimits(s: GameState) {
  const lab = labInfo(s);
  return { maxModifiers: lab.modifiers, maxComplexity: lab.complexity };
}

export function previewSpell(s: GameState, r: SpellRecipe, name?: string): CompileResult & { missing: string[]; locked: string[]; cost: number } {
  const lab = labInfo(s);
  const res = compileSpell(r, s.lib, { ...playerCompileLimits(s), customName: name });
  const missing: string[] = [];
  const ings: Ingredient[] = [r.essence, ...r.modifiers, ...(r.catalyst ? [r.catalyst] : [])];
  const need = new Map<string, number>();
  for (const i of ings) need.set(`${i.kind}:${i.id}`, (need.get(`${i.kind}:${i.id}`) ?? 0) + 1);
  for (const [k, n] of need) {
    const [kind, id] = k.split(':') as ['material' | 'component', string];
    if (!hasIngredient(s, { kind, id }, n)) missing.push(resolveIngredient({ kind, id }, s.lib)?.name ?? id);
  }
  const locked = missingResearch(s, r);
  if (r.catalyst && !lab.catalyst) locked.push('Catalyst slot (Laboratory 1)');
  const cx = recipeComplexity(r, 0);
  return { ...res, missing, locked, cost: 8 + cx * 6 };
}

export function forgeSpell(s: GameState, r: SpellRecipe, name?: string): Res<{ entry: SpellEntry; discovery: boolean }> {
  const p = s.player;
  const pv = previewSpell(s, r, name);
  if (!pv.ok) return fail(pv.errors.join(' '));
  if (pv.locked.length) return fail(`Locked: ${pv.locked.join(', ')}. Research it first.`);
  if (pv.missing.length) return fail(`Missing ingredients: ${pv.missing.join(', ')}.`);
  const id = recipeId(r);
  const existing = p.spells.find((x) => x.id === id);
  if (existing && !existing.retired) return fail('You already know this exact spell.');
  if (p.money < pv.cost) return fail(`Forging costs $${pv.cost}.`);
  if (!transact(s, nextTxn(s, 'forge'), -pv.cost, 'Spell forging')) return fail('Transaction failed.');
  for (const i of [r.essence, ...r.modifiers, ...(r.catalyst ? [r.catalyst] : [])]) consume(s, i, 1);
  const mechanicIds = new Set(p.spells.map((x) => compileCached(x.recipe, s.lib)?.mechanicId));
  const discovery = !mechanicIds.has(pv.spell.mechanicId);
  let entry: SpellEntry;
  if (existing) {
    existing.retired = false;
    entry = existing;
  } else {
    entry = {
      id,
      recipe: JSON.parse(JSON.stringify(r)),
      name: (name ?? pv.spell.name).slice(0, 40),
      favorite: false,
      createdDay: s.clock.day,
      mastery: 0,
      wins: 0,
      losses: 0,
      damage: 0,
      retired: false,
      firstOfMechanic: discovery,
    };
    p.spells.push(entry);
  }
  p.stats.spellsForged++;
  const best = Math.max(0, ...p.spells.filter((x) => x !== entry).map((x) => compileCached(x.recipe, s.lib)?.power ?? 0));
  if (discovery && pv.spell.power > best) {
    p.respect += 2;
    career(s, `Discovered a powerful new spell: ${entry.name}. (+2 respect)`, 'invention');
  } else career(s, `Forged ${entry.name}.`, 'invention');
  if (p.spellbook.length < playerSpellbookSlots(p)) p.spellbook.push(entry.id);
  checkAchievements(s);
  return { ok: true, entry, discovery };
}

export function setSpellbook(s: GameState, ids: string[]): Res {
  const p = s.player;
  if (ids.length > playerSpellbookSlots(p)) return fail(`Your spellbook holds ${playerSpellbookSlots(p)} spells.`);
  if (ids.length === 0) return fail('Keep at least one spell in your spellbook.');
  if (new Set(ids).size !== ids.length) return fail('Duplicate spell.');
  for (const id of ids) {
    const e = p.spells.find((x) => x.id === id);
    if (!e || e.retired) return fail('Unknown spell.');
  }
  p.spellbook = ids.slice();
  return { ok: true };
}

export function renameSpell(s: GameState, id: string, name: string): Res {
  const e = s.player.spells.find((x) => x.id === id);
  if (!e) return fail('Unknown spell.');
  const n = name.trim().slice(0, 40);
  if (!n) return fail('Name cannot be empty.');
  e.name = n;
  return { ok: true };
}

export function toggleFavorite(s: GameState, id: string) {
  const e = s.player.spells.find((x) => x.id === id);
  if (e) e.favorite = !e.favorite;
}

export function retireSpell(s: GameState, id: string): Res {
  const p = s.player;
  const e = p.spells.find((x) => x.id === id);
  if (!e) return fail('Unknown spell.');
  if (p.spellbook.length === 1 && p.spellbook[0] === id) return fail('You need at least one spell equipped.');
  e.retired = true;
  p.spellbook = p.spellbook.filter((x) => x !== id);
  return { ok: true };
}

export function evolveSpell(s: GameState, id: string, nodeId: string): Res<{ entry: SpellEntry }> {
  const p = s.player;
  const e = p.spells.find((x) => x.id === id);
  const node = EVOLUTION.find((n) => n.id === nodeId);
  if (!e || !node) return fail('Unknown spell or evolution.');
  const chosen = e.recipe.evolution.map((x) => EVOLUTION.find((n) => n.id === x)!).filter(Boolean);
  if (chosen.some((c) => c.tier === node.tier)) return fail('You already chose an evolution at this tier.');
  if (node.tier > 1 && !chosen.some((c) => c.tier === node.tier - 1)) return fail(`Choose a tier ${node.tier - 1} evolution first.`);
  if (e.mastery < node.mastery) return fail(`Requires ${node.mastery} mastery (casts in duels). You have ${e.mastery}.`);
  const recipe: SpellRecipe = { ...e.recipe, evolution: [...e.recipe.evolution, nodeId] };
  const res = compileSpell(recipe, s.lib, { ...playerCompileLimits(s), maxComplexity: 99 });
  if (!res.ok) return fail(res.errors.join(' '));
  if (p.money < node.cost) return fail(`Costs $${node.cost}.`);
  if (!transact(s, nextTxn(s, 'evolve'), -node.cost, `Evolved ${e.name}: ${node.name}`)) return fail('Transaction failed.');
  const newId = recipeId(recipe);
  const old = e.id;
  e.recipe = recipe;
  e.id = newId;
  p.spellbook = p.spellbook.map((x) => (x === old ? newId : x));
  career(s, `Evolved ${e.name} with ${node.name}.`, 'invention');
  return { ok: true, entry: e };
}

// ---------------- tactics ----------------

export function setTactics(s: GameState, rules: TacticRule[]): Res {
  const err = validateTactics(rules, s.player.upgrades.grimoire);
  if (err) return fail(err);
  s.player.tactics = rules.map((r) => ({ ...r }));
  return { ok: true };
}

// ---------------- opponents & duels ----------------

export interface OpponentOption {
  npc: NpcState;
  tag: 'rookie' | 'even' | 'stronger' | 'weaker' | 'rival' | 'challenger';
}

export function listOpponents(s: GameState): OpponentOption[] {
  const p = s.player;
  ensurePopulation(s, p.tier);
  const pool = npcsInTier(s, p.tier).sort((a, b) => a.rating - b.rating);
  const out: OpponentOption[] = [];
  const used = new Set<string>();
  const add = (n: NpcState | undefined, tag: OpponentOption['tag']) => {
    if (n && !used.has(n.id)) {
      used.add(n.id);
      out.push({ npc: n, tag });
    }
  };
  for (const rid of p.rivals) {
    const n = s.npcs[rid];
    if (n && Math.abs(n.tier - p.tier) <= 1) add(n, 'rival');
  }
  if (p.tier === 0 && p.record.wins < 3) {
    const rookies = pool.slice().sort((a, b) => a.strength - b.strength);
    add(rookies[0], 'rookie');
    add(rookies[1], 'rookie');
  }
  const rng = new Rng(hashString(`opp|${s.seed}|${Math.floor(s.clock.hour / 2)}`));
  const near = pool.filter((n) => !used.has(n.id)).sort((a, b) => Math.abs(a.rating - p.rating) - Math.abs(b.rating - p.rating));
  const below = near.filter((n) => n.rating < p.rating - 20);
  const above = near.filter((n) => n.rating > p.rating + 40);
  add(below[rng.int(0, Math.min(3, below.length - 1))], 'weaker');
  for (const n of near.slice(0, 8).filter(() => rng.chance(0.6)).slice(0, 3)) add(n, 'even');
  add(above[rng.int(0, Math.min(4, above.length - 1))], 'stronger');
  add(above[rng.int(5, Math.min(12, above.length - 1))], 'stronger');
  const canUp = hasPrivilege(p.respect, 'challengeUp') || p.div === 2;
  if (canUp) {
    const upper = npcsInTier(s, p.tier + 1).sort((a, b) => a.rating - b.rating);
    add(upper[rng.int(0, Math.min(5, upper.length - 1))], 'challenger');
  }
  return out.slice(0, 9);
}

export interface DuelOutcome {
  won: boolean;
  ratingDelta: number;
  money: number;
  materials: Record<string, number>;
  respect: number;
  notes: string[];
  adaptations: string[];
  achievements: string[];
  promoted?: string;
}

export interface DuelPackage {
  setup: DuelSetup;
  result: CombatResult;
  outcome: DuelOutcome;
}

/** Odds the bookmakers would offer on the player for a prospective duel. */
export function previewDuelOdds(s: GameState, opponentId: string): { prob: number; odds: number } {
  const n = s.npcs[opponentId];
  if (!n) return { prob: 0.5, odds: 1.9 };
  const prob = estimateWinProbability(compileSpec(playerSpec(s), s.lib), compileSpec(npcSpec(n), s.lib), 14, s.counters.duel);
  return { prob, odds: oddsFromProb(prob) };
}

export function fightDuel(
  s: GameState,
  opponentId: string,
  context: DuelSetup['context'],
  opts: { stake?: number; seed?: number; tournamentId?: string } = {},
): Res<DuelPackage> {
  const p = s.player;
  const n = s.npcs[opponentId];
  if (!n) return fail('Unknown opponent.');
  if (!p.spellbook.length) return fail('Equip at least one spell.');
  if (context === 'guardian') {
    const st = promotionStatus(s);
    if (!st.readyForGuardian) return fail('You have not met the requirements to challenge the guardian.');
  }
  // legal NPC adaptation before the duel
  const adaptations = adaptNpc(n, { playerBuild: compileSpec(playerSpec(s), s.lib), lib: s.lib, day: s.clock.day });
  s.counters.duel++;
  const seed = opts.seed ?? hashString(`duel|${s.seed}|${s.counters.duel}`);
  const a = playerSpec(s);
  const b = npcSpec(n);
  const wa = compileSpec(a, s.lib);
  const wb = compileSpec(b, s.lib);
  const prob = estimateWinProbability(wa, wb, 12, s.counters.duel);
  const setup: DuelSetup = { id: `duel${s.counters.duel}`, seed, a, b, opponentId, context, tournamentId: opts.tournamentId, createdHour: s.clock.hour, prob };
  const key = `duel:${setup.id}`;
  if (opts.stake && opts.stake > 0) {
    const r = placeBet(s, { matchKey: key, pick: 'player', stake: opts.stake, odds: oddsFromProb(prob), label: `Yourself vs ${n.name}`, kind: 'self' });
    if (!r.ok) return fail(r.error);
  }
  const result = simulateDuel(wa, wb, seed);
  const outcome = applyDuelOutcome(s, setup, result, adaptations);
  settleBets(s, key, result.winner === 0 ? 'player' : opponentId);
  return { ok: true, setup, result, outcome };
}

function applyDuelOutcome(s: GameState, setup: DuelSetup, r: CombatResult, adaptations: string[]): DuelOutcome {
  const p = s.player;
  const n = s.npcs[setup.opponentId];
  const won = r.winner === 0;
  const ctx = setup.context;
  const notes: string[] = [];
  const k = ctx === 'practice' ? 0 : ctx === 'guardian' ? 12 : 32;
  const ratingDelta = eloDelta(p.rating, n.rating, won, k);
  const diff = n.rating - p.rating;
  p.rating += ratingDelta;
  p.peakRating = Math.max(p.peakRating, p.rating);
  if (n.guardian === undefined) n.rating -= Math.round(ratingDelta * 0.8);
  // money
  let money = ctx === 'practice' ? (won ? 12 + p.tier * 8 : 4) : duelReward(p.tier, diff, won);
  if (won && p.rivals.includes(n.id) && hasPrivilege(p.respect, 'rivalBounties')) {
    money *= 2;
    notes.push('Rival bounty doubled your purse.');
  }
  if (ctx === 'tournament') money = Math.round(money * 0.5);
  transact(s, `duel-purse:${setup.id}`, money, `Duel purse vs ${n.name}`);
  // materials
  const materials = ctx === 'guardian' && won ? {} : materialDrops(setup.seed ^ 0x55, Math.min(p.tier, NAMED_TIERS - 1), n.element, n.element2, won);
  addMats(s, materials);
  // respect
  let respect = 0;
  if (won && ctx !== 'practice') {
    respect += 1;
    if (diff > 50) respect += Math.round(diff / 25);
    if (diff >= 150) {
      p.record.upsets++;
      notes.push('A historic upset! The halls are buzzing.');
      respect += 10;
    }
  }
  p.respect += respect;
  // record
  p.stats.duels++;
  if (won) {
    p.record.wins++;
    p.record.streak++;
    p.record.bestStreak = Math.max(p.record.bestStreak, p.record.streak);
  } else {
    p.record.losses++;
    p.record.streak = 0;
  }
  if (won && ctx !== 'practice' && n.tier >= p.tier && n.rating >= p.rating - ratingDelta - 140) {
    p.promotion.qualifyingWins++;
    notes.push(`Qualifying win (${p.promotion.qualifyingWins}/${promotionRequirements(p.tier).qualifyingWins}).`);
  }
  // spell mastery & records
  setup.a.spells.forEach((sp, i) => {
    const e = p.spells.find((x) => x.id === recipeId(sp.recipe));
    if (!e) return;
    const st = r.reports[0].spells[i];
    e.mastery += st?.casts ?? 0;
    e.damage += Math.round(st?.damage ?? 0);
    if (won) e.wins++;
    else e.losses++;
  });
  // NPC learns & records
  observePlayer(n, compileSpec(setup.a, s.lib), !won);
  if (won) n.losses++;
  else {
    n.wins++;
    n.wealth += Math.round(money * 0.5);
  }
  // rivalry
  if (!p.rivals.includes(n.id) && n.guardian === undefined && (n.memory.beatPlayer >= 2 || n.memory.lostToPlayer >= 3)) {
    p.rivals.push(n.id);
    if (p.rivals.length > 4) p.rivals.shift();
    notes.push(`${n.name} has declared you a rival!`);
    news(s, `${n.name} and ${p.name} are now bitter rivals.`);
  }
  // contracts
  for (const ct of s.contracts) {
    if (ct.done) continue;
    if (ct.kind === 'winElement' && won && setup.a.spells.some((sp, i) => (r.reports[0].spells[i]?.casts ?? 0) > 0 && compileCached(sp.recipe, s.lib)?.element === ct.target)) completeContract(s, ct.id);
    if (ct.kind === 'beatRating' && won && n.rating + ratingDelta >= Number(ct.target)) completeContract(s, ct.id);
    if (ct.kind === 'winStreak' && p.record.streak >= ct.count) completeContract(s, ct.id);
  }
  // division (tier changes only through promotion)
  if (p.tier < NAMED_TIERS) p.div = divisionFor(p.tier, p.rating);
  career(s, `${won ? 'Defeated' : 'Lost to'} ${n.name} (${ratingDelta >= 0 ? '+' : ''}${ratingDelta} rating, +$${money}).`, 'duel');
  // replay record
  s.replays.unshift({ id: setup.id, setup, winner: r.winner, duration: r.duration, day: s.clock.day, summary: `${won ? 'Victory' : 'Defeat'} vs ${n.name}`, rewards: [`$${money}`, ...Object.entries(materials).map(([m, c]) => `${c}× ${MATERIAL_MAP[m]?.name}`)] });
  if (s.replays.length > 12) s.replays.length = 12;
  let promoted: string | undefined;
  if (ctx === 'guardian' && won && n.guardian !== undefined) promoted = promote(s, n.guardian);
  const achievements = checkAchievements(s);
  advanceWorld(s, 1);
  return { won, ratingDelta, money, materials, respect, notes, adaptations, achievements, promoted };
}

// ---------------- promotion ----------------

export function guardianIdFor(tier: number) {
  return `guardian${tier}`;
}

export function ensureGuardian(s: GameState, tier: number): NpcState {
  const id = guardianIdFor(tier);
  if (!s.npcs[id]) s.npcs[id] = buildGuardian(tier, s.lib);
  return s.npcs[id];
}

export function promotionStatus(s: GameState) {
  const p = s.player;
  const req = promotionRequirements(p.tier);
  const custom = p.spells.filter((x) => !x.starter).length;
  const items = [
    { label: `Arcane rating ${req.rating}`, have: p.rating, need: req.rating, met: p.rating >= req.rating },
    { label: `Qualifying victories`, have: p.promotion.qualifyingWins, need: req.qualifyingWins, met: p.promotion.qualifyingWins >= req.qualifyingWins },
    ...(req.tournamentTop2 ? [{ label: 'Reach a tournament final (top 2)', have: p.promotion.tournamentTop2 ? 1 : 0, need: 1, met: p.promotion.tournamentTop2 }] : []),
    { label: 'Components invented', have: p.stats.componentsInvented, need: req.componentsInvented, met: p.stats.componentsInvented >= req.componentsInvented },
    { label: 'Custom spells forged', have: custom, need: req.customSpells, met: custom >= req.customSpells },
    { label: 'Deepest invention generation', have: p.stats.maxGeneration, need: req.maxGeneration, met: p.stats.maxGeneration >= req.maxGeneration },
  ];
  const readyForGuardian = items.every((i) => i.met);
  return { req, items, readyForGuardian, guardian: guardianInfo(p.tier), guardianId: guardianIdFor(p.tier) };
}

function promote(s: GameState, g: number): string {
  const p = s.player;
  if (g !== p.tier) return '';
  const info = guardianInfo(g);
  p.record.guardiansDefeated.push(g);
  const from = rankLabel(p.tier, p.div);
  p.tier++;
  p.div = 0;
  ensurePopulation(s, p.tier);
  const base = p.tier < NAMED_TIERS ? tierBaseRating(p.tier) : tierBaseRating(NAMED_TIERS - 1) + 150 + (p.tier - NAMED_TIERS) * 60;
  p.rating = Math.max(p.rating, base);
  p.promotion = { qualifyingWins: 0, tournamentTop2: false };
  p.skillPoints += 2;
  const respect = 25 * (g + 1);
  p.respect += respect;
  transact(s, `promotion:${g}`, info.reward.money, `Promotion reward: defeated ${info.name}`);
  addMats(s, info.reward.materials);
  if (info.reward.equipment && EQUIP_MAP[info.reward.equipment]) {
    s.counters.equip++;
    p.ownedEquipment.push({ uid: `eq${s.counters.equip}`, defId: info.reward.equipment, enchant: 0 });
  }
  const to = tierName(p.tier);
  career(s, `Defeated ${info.name} and ascended from ${from} to ${to}! (+${respect} respect, +2 skill points)`, 'promotion');
  news(s, `${p.name} defeated ${info.name} and joined ${to}.`);
  if (!p.titles.includes(`${to}`)) p.titles.push(to);
  ensureGuardian(s, p.tier);
  refreshTournaments(s);
  return to;
}

// ---------------- tournaments ----------------

export function enterTournament(s: GameState, tid: string): Res {
  const p = s.player;
  const t = s.tournaments.find((x) => x.id === tid);
  if (!t) return fail('Unknown tournament.');
  if (t.status !== 'registration') return fail('Registration is closed.');
  if (t.tier !== p.tier) return fail('This tournament is for another tier.');
  if (s.tournaments.some((x) => x.playerEntered && x.status !== 'finished')) return fail('Finish your current tournament first.');
  const free = hasPrivilege(p.respect, 'invitational');
  const fee = free ? 0 : t.entryFee;
  if (p.money < fee) return fail(`Entry fee is $${fee}.`);
  if (fee > 0 && !transact(s, `entry:${t.id}`, -fee, `Entry: ${t.name}`)) return fail('Transaction failed.');
  // replace the lowest-rated entrant with the player
  const lowest = t.participants.slice().sort((a, b) => wizardRating(s, a) - wizardRating(s, b))[0];
  t.participants = t.participants.map((x) => (x === lowest ? 'player' : x));
  t.playerEntered = true;
  // voids outright bets placed on the replaced wizard
  for (const b of s.bets) if (b.status === 'open' && b.matchKey === `outright:${t.id}` && b.pick === lowest) {
    transact(s, `refund:${b.id}`, b.stake, 'Bet void: entrant withdrew');
    b.status = 'void';
  }
  startTournament(t, (id) => wizardRating(s, id));
  lockRound(s, t);
  career(s, `Entered the ${t.name}.`, 'tournament');
  return { ok: true };
}

export function playTournamentMatch(s: GameState, tid: string, stake?: number): Res<DuelPackage> {
  const t = s.tournaments.find((x) => x.id === tid);
  if (!t) return fail('Unknown tournament.');
  const pm = playerMatch(t);
  if (!pm) return fail('You have no match to play.');
  const opp = pm.match.a === 'player' ? pm.match.b : pm.match.a;
  const res = fightDuel(s, opp, 'tournament', { stake, seed: pm.match.seed, tournamentId: t.id });
  if (!res.ok) return res;
  const m = pm.match;
  m.wa = m.a === 'player' ? res.setup.a : res.setup.b;
  m.wb = m.a === 'player' ? res.setup.b : res.setup.a;
  m.winner = res.result.winner === 0 ? 'player' : opp;
  m.status = 'done';
  m.duration = res.result.duration;
  settleBets(s, matchKey(t, pm.round, pm.idx), m.winner);
  advanceTournament(s, tid);
  return res;
}

/** Resolve remaining non-player matches in the round; builds the next round. */
export function advanceTournament(s: GameState, tid: string): Res<{ finished: boolean }> {
  const t = s.tournaments.find((x) => x.id === tid);
  if (!t) return fail('Unknown tournament.');
  if (t.status !== 'running') return fail('Tournament is not running.');
  const r = advanceRound(t, (id) => specFor(s, id), (spec) => compileSpec(spec, s.lib));
  for (const x of r.resolved) settleBets(s, x.key, x.winner);
  if (r.finished) {
    finishTournament(s, t);
    if (t.playerEntered) settlePlayerTournament(s, t);
  } else lockRound(s, t);
  return { ok: true, finished: r.finished };
}

function settlePlayerTournament(s: GameState, t: Tournament) {
  const p = s.player;
  const place = placementOf(t, 'player');
  t.playerPlacement = place;
  const prize = prizeFor(t, place);
  if (prize > 0) transact(s, `prize:${t.id}`, prize, `${t.name}: ${place === 1 ? 'Champion' : place === 2 ? 'Runner-up' : 'Semifinalist'}`);
  const rewardMats = new Rng(hashString(t.id));
  if (place <= 2) {
    if (t.tier >= p.tier) p.promotion.tournamentTop2 = true;
    const m = MATERIALS.filter((x) => x.rarity === Math.min(4, Math.min(t.tier, 8) / 2 + 1 | 0) && x.minTier <= t.tier + 1);
    if (m.length) addMats(s, { [rewardMats.pick(m).id]: place === 1 ? 2 : 1 });
  }
  let respect = 0;
  if (place === 1) {
    respect = 10 * (t.tier + 1) + t.size / 2;
    p.record.tournamentsWon++;
    const title = `${t.name} Champion`;
    const defended = p.titles.some((x) => x.startsWith(tierName(t.tier)) && x.endsWith(`${t.kind === 'seasonal' ? 'Finals' : ''} Champion`));
    if (defended) respect += 5;
    if (!p.titles.includes(title)) p.titles.push(title);
  } else if (place === 2) respect = 4 * (t.tier + 1);
  else if (place === 4) respect = t.tier + 1;
  p.respect += respect;
  career(s, `${t.name}: finished ${place === 1 ? '1st — Champion!' : place === 2 ? '2nd' : place === 4 ? 'in the semifinals' : `top ${place}`}${prize ? ` (+$${prize})` : ''}${respect ? ` (+${respect} respect)` : ''}.`, 'tournament');
  checkAchievements(s);
}

// ---------------- betting ----------------

function findMatch(s: GameState, key: string) {
  if (key.startsWith('exh:')) {
    const ex = s.exhibitions.find((e) => `exh:${e.id}` === key);
    return ex ? { match: ex.match, label: `Exhibition` } : null;
  }
  const m = /^(t\d+):r(\d+):m(\d+)$/.exec(key);
  if (!m) return null;
  const t = s.tournaments.find((x) => x.id === m[1]);
  const match = t?.rounds[Number(m[2])]?.[Number(m[3])];
  return match && t ? { match, label: t.name } : null;
}

export function betOnMatch(s: GameState, key: string, pick: string, stake: number): Res {
  const f = findMatch(s, key);
  if (!f) return fail('Unknown match.');
  const m = f.match;
  if (m.status !== 'open') return fail('Betting has closed on this match.');
  if (m.a === 'player' || m.b === 'player') return fail('Wager on your own match from the duel preparation screen.');
  if (pick !== m.a && pick !== m.b) return fail('Pick one of the two wizards.');
  if (m.probA === undefined) lockMatch(m, (id) => specFor(s, id), (spec) => compileSpec(spec, s.lib), 10);
  const p = pick === m.a ? m.probA! : 1 - m.probA!;
  const r = placeBet(s, { matchKey: key, pick, stake, odds: oddsFromProb(p), label: `${wizardName(s, pick)} (${f.label})`, kind: 'match' });
  return r.ok ? { ok: true } : fail(r.error);
}

export function outrightOdds(s: GameState, t: Tournament): Record<string, number> {
  const probs = outrightProbabilities(t, (id) => wizardRating(s, id));
  return Object.fromEntries(Object.entries(probs).map(([k, v]) => [k, oddsFromProb(v)]));
}

export function betOutright(s: GameState, tid: string, pick: string, stake: number): Res {
  const t = s.tournaments.find((x) => x.id === tid);
  if (!t) return fail('Unknown tournament.');
  const anyDone = t.rounds.some((r) => r.some((m) => m.status === 'done'));
  if (t.status === 'finished' || anyDone) return fail('Outright betting has closed.');
  if (!t.participants.includes(pick)) return fail('That wizard is not entered.');
  const odds = outrightOdds(s, t)[pick];
  const r = placeBet(s, { matchKey: `outright:${t.id}`, pick, stake, odds, label: `${wizardName(s, pick)} to win ${t.name}`, kind: 'outright' });
  return r.ok ? { ok: true } : fail(r.error);
}

export function watchExhibition(s: GameState, exId: string): Res<{ setup: DuelSetup }> {
  const ex = s.exhibitions.find((e) => e.id === exId);
  if (!ex) return fail('Unknown exhibition.');
  if (!ex.match.wa) lockMatch(ex.match, (id) => specFor(s, id), (spec) => compileSpec(spec, s.lib), 10);
  resolveExhibition(s, ex);
  const setup: DuelSetup = { id: ex.id, seed: ex.match.seed, a: ex.match.wa!, b: ex.match.wb!, opponentId: ex.match.b, context: 'exhibition', createdHour: s.clock.hour, prob: ex.match.probA ?? 0.5 };
  return { ok: true, setup };
}

// ---------------- market ----------------

export function materialAvailable(s: GameState, id: string): boolean {
  const m = MATERIAL_MAP[id];
  if (!m) return false;
  if (hasPrivilege(s.player.respect, 'blackMarket')) return m.minTier <= s.player.tier + 3;
  return m.minTier <= s.player.tier && m.rarity <= Math.min(3, s.player.tier + 2);
}

export function equipmentAvailable(s: GameState, id: string): boolean {
  const e = EQUIP_MAP[id];
  return !!e && e.price > 0 && e.tier <= s.player.tier + 1;
}

export function buyMaterial(s: GameState, id: string, qty = 1): Res {
  if (!Number.isInteger(qty) || qty <= 0 || qty > 20) return fail('Invalid quantity.');
  if (!materialAvailable(s, id)) return fail('Not available at your rank.');
  let total = 0;
  const m = s.market;
  const snapshot = m.items[id].demand;
  for (let i = 0; i < qty; i++) {
    total += buyPrice(m, id, discount(s));
    applyBuy(m, id, 1);
  }
  if (s.player.money < total) {
    m.items[id].demand = snapshot;
    m.items[id].price = Math.round(m.items[id].base * snapshot);
    return fail(`Costs $${total}.`);
  }
  transact(s, nextTxn(s, 'buy'), -total, `Bought ${qty}× ${MATERIAL_MAP[id].name}`);
  addMats(s, { [id]: qty });
  return { ok: true };
}

export function sellMaterial(s: GameState, id: string, qty = 1): Res {
  if (!Number.isInteger(qty) || qty <= 0) return fail('Invalid quantity.');
  if ((s.player.materials[id] ?? 0) < qty) return fail('You do not have that many.');
  let total = 0;
  for (let i = 0; i < qty; i++) {
    total += sellPrice(s.market, id);
    applySell(s.market, id, 1);
  }
  consume(s, { kind: 'material', id }, qty);
  transact(s, nextTxn(s, 'sell'), total, `Sold ${qty}× ${MATERIAL_MAP[id]?.name}`);
  return { ok: true };
}

export function sellComponent(s: GameState, id: string): Res<{ value: number }> {
  if ((s.player.components[id] ?? 0) < 1) return fail('You do not own that component.');
  const value = componentValue(s.market, id, s.lib);
  consume(s, { kind: 'component', id }, 1);
  recordComponentSale(s.market, id);
  transact(s, nextTxn(s, 'sellc'), value, `Sold component ${s.lib[id]?.name}`);
  return { ok: true, value };
}

export function buyEquipment(s: GameState, defId: string): Res {
  if (!equipmentAvailable(s, defId)) return fail('Not available at your rank.');
  const price = buyPrice(s.market, defId, discount(s));
  if (s.player.money < price) return fail(`Costs $${price}.`);
  transact(s, nextTxn(s, 'buyeq'), -price, `Bought ${EQUIP_MAP[defId].name}`);
  applyBuy(s.market, defId, 1);
  s.counters.equip++;
  s.player.ownedEquipment.push({ uid: `eq${s.counters.equip}`, defId, enchant: 0 });
  return { ok: true };
}

export function sellEquipment(s: GameState, uid: string): Res {
  const p = s.player;
  const o = p.ownedEquipment.find((e) => e.uid === uid);
  if (!o) return fail('Unknown item.');
  if (Object.values(p.equipped).includes(uid)) return fail('Unequip it first.');
  const def = EQUIP_MAP[o.defId];
  if (!def || def.price === 0) return fail('Worthless.');
  const price = sellPrice(s.market, o.defId) + Math.round(ENCHANT_COST.slice(0, o.enchant + 1).reduce((a, b) => a + b, 0) * 0.4);
  p.ownedEquipment = p.ownedEquipment.filter((e) => e.uid !== uid);
  applySell(s.market, o.defId, 1);
  transact(s, nextTxn(s, 'selleq'), price, `Sold ${def.name}`);
  return { ok: true };
}

export function equipItem(s: GameState, uid: string): Res {
  const p = s.player;
  const o = p.ownedEquipment.find((e) => e.uid === uid);
  if (!o) return fail('Unknown item.');
  const def = EQUIP_MAP[o.defId];
  p.equipped[def.slot] = uid;
  return { ok: true };
}

export function enchantItem(s: GameState, uid: string, path: 'attune' | 'temper'): Res {
  const p = s.player;
  const o = p.ownedEquipment.find((e) => e.uid === uid);
  if (!o) return fail('Unknown item.');
  const def = EQUIP_MAP[o.defId];
  if (o.enchant >= 3) return fail('Already at maximum enchantment.');
  if (o.path && o.path !== path) return fail(`This item is already on the ${o.path} path.`);
  if (path === 'attune' && !def.affinity && def.slot !== 'wand') return fail('Only cores and wands can be attuned.');
  const cost = ENCHANT_COST[o.enchant + 1] * (1 + def.tier * 0.5);
  if (p.money < cost) return fail(`Costs $${Math.round(cost)}.`);
  transact(s, nextTxn(s, 'ench'), -cost, `Enchanted ${def.name}`);
  o.enchant++;
  o.path = path;
  return { ok: true };
}

// ---------------- upgrades ----------------

export function upgradeLab(s: GameState): Res {
  const p = s.player;
  const next = LAB_LEVELS[p.upgrades.lab + 1];
  if (!next) return fail('Laboratory fully upgraded.');
  if (p.tier < next.tier) return fail(`Requires ${tierName(next.tier)} rank.`);
  if (p.money < next.cost) return fail(`Costs $${next.cost}.`);
  transact(s, `lab:${next.level}`, -next.cost, `Laboratory: ${next.name}`);
  p.upgrades.lab++;
  career(s, `Upgraded laboratory to ${next.name}.`, 'misc');
  return { ok: true };
}

export function upgradeSpellbook(s: GameState): Res {
  const p = s.player;
  const next = SPELLBOOK_LEVELS[p.upgrades.spellbook + 1];
  if (!next) return fail('Spellbook fully upgraded.');
  if (p.tier < next.tier) return fail(`Requires ${tierName(next.tier)} rank.`);
  if (p.money < next.cost) return fail(`Costs $${next.cost}.`);
  transact(s, `book:${p.upgrades.spellbook + 1}`, -next.cost, `Spellbook: ${next.slots} slots`);
  p.upgrades.spellbook++;
  return { ok: true };
}

export function upgradeGrimoire(s: GameState): Res {
  const p = s.player;
  const next = GRIMOIRE_LEVELS[p.upgrades.grimoire + 1];
  if (!next) return fail('Grimoire fully upgraded.');
  if (p.tier < next.tier) return fail(`Requires ${tierName(next.tier)} rank.`);
  if (p.money < next.cost) return fail(`Costs $${next.cost}.`);
  transact(s, `grim:${p.upgrades.grimoire + 1}`, -next.cost, `Grimoire: ${next.slots} rules`);
  p.upgrades.grimoire++;
  return { ok: true };
}

export function doResearch(s: GameState, key: ResearchKey): Res {
  const p = s.player;
  const r = RESEARCH.find((x) => x.key === key);
  if (!r) return fail('Unknown research.');
  if (p.research.includes(key)) return fail('Already researched.');
  if (p.tier < r.tier) return fail(`Requires ${tierName(r.tier)} rank.`);
  if (p.money < r.cost) return fail(`Costs $${r.cost}.`);
  transact(s, `research:${key}`, -r.cost, `Research: ${r.name}`);
  p.research.push(key);
  career(s, `Researched ${r.name}.`, 'misc');
  checkAchievements(s);
  return { ok: true };
}

export function trainAttribute(s: GameState, attr: Attr): Res {
  const p = s.player;
  if (p.attrs[attr] >= attributeCap(p.tier)) return fail(`Your rank caps attributes at ${attributeCap(p.tier)}. Earn a promotion to train further.`);
  const cost = attrTrainCost(p.attrTrained);
  if (p.money < cost) return fail(`Costs $${cost}.`);
  transact(s, nextTxn(s, 'train'), -cost, `Trained ${attr}`);
  p.attrs[attr]++;
  p.attrTrained++;
  return { ok: true };
}

export function learnSkill(s: GameState, id: string): Res {
  const p = s.player;
  const err = canLearnSkill(id, p.skills, p.skillPoints);
  if (err) return fail(err);
  p.skills.push(id);
  p.skillPoints--;
  career(s, `Learned ${SKILL_MAP[id].name}.`, 'misc');
  return { ok: true };
}

// ---------------- contracts & recovery ----------------

export function completeContract(s: GameState, cid: string) {
  const ct = s.contracts.find((c) => c.id === cid);
  if (!ct || ct.done) return;
  ct.done = true;
  ct.progress = ct.count;
  transact(s, `contract:${ct.id}`, ct.reward, `Contract: ${ct.desc}`);
  s.player.respect += ct.respect;
  career(s, `Completed contract: ${ct.desc} (+$${ct.reward}).`, 'misc');
}

export function deliverContract(s: GameState, cid: string): Res {
  const ct = s.contracts.find((c) => c.id === cid);
  if (!ct || ct.done || ct.kind !== 'deliver') return fail('Not deliverable.');
  if ((s.player.materials[ct.target] ?? 0) < ct.count) return fail(`You need ${ct.count}× ${MATERIAL_MAP[ct.target]?.name}.`);
  consume(s, { kind: 'material', id: ct.target }, ct.count);
  completeContract(s, cid);
  return { ok: true };
}

export function tutorFirstYears(s: GameState): Res<{ pay: number }> {
  const p = s.player;
  if (p.money >= 120) return fail('Tutoring is for wizards down on their luck (below $120).');
  if (p.lastTutorHour >= s.clock.hour) return fail('You have already tutored this hour. Duel or wait.');
  const pay = TUTOR_PAY(Math.min(p.tier, 8));
  p.lastTutorHour = s.clock.hour;
  transact(s, `tutor:${s.clock.hour}`, pay, 'Tutored first-years');
  advanceWorld(s, 1);
  return { ok: true, pay };
}

export function claimStipend(s: GameState): Res<{ pay: number }> {
  const p = s.player;
  if (!hasPrivilege(p.respect, 'stipend')) return fail('Requires the Academy Stipend privilege.');
  if (p.lastStipendDay >= s.clock.day) return fail('Already claimed today.');
  const pay = 200 + p.tier * 250;
  p.lastStipendDay = s.clock.day;
  transact(s, `stipend:${s.clock.day}`, pay, 'Academy stipend');
  return { ok: true, pay };
}

export function sparringPartner(s: GameState): NpcState {
  const pool = npcsInTier(s, s.player.tier).sort((a, b) => a.strength - b.strength);
  return pool[0];
}

export function rest(s: GameState) {
  advanceWorld(s, 1);
}

// ---------------- onboarding ----------------

export function onboarding(s: GameState) {
  const p = s.player;
  const customEquipped = p.spellbook.some((id) => !p.spells.find((x) => x.id === id)?.starter);
  const customUsed = p.spells.some((x) => !x.starter && x.mastery > 0);
  const steps = [
    { id: 'create', text: 'Create your wizard', done: true, where: 'WIZARD' },
    { id: 'duel', text: 'Enter your first duel (DUEL → pick a Rookie)', done: p.stats.duels >= 1, where: 'DUEL' },
    { id: 'earn', text: 'Earn your first Dollars', done: p.stats.moneyEarned > 0, where: 'DUEL' },
    { id: 'invent', text: 'Invent a component (FORGE → Fuse two materials)', done: p.stats.componentsInvented >= 1, where: 'FORGE' },
    { id: 'forge', text: 'Forge a new spell from it (FORGE → Spell Laboratory)', done: p.stats.spellsForged >= 1, where: 'FORGE' },
    { id: 'equip', text: 'Equip it in your spellbook (WIZARD → Spellbook)', done: customEquipped, where: 'WIZARD' },
    { id: 'use', text: 'Watch your spell work in combat', done: customUsed, where: 'DUEL' },
    { id: 'stronger', text: 'Challenge a stronger opponent', done: p.career.some((c) => c.kind === 'duel') && p.peakRating > 860, where: 'DUEL' },
    { id: 'learn', text: 'Learn from a defeat (read the battle analysis)', done: p.record.losses >= 1, where: 'DUEL' },
    { id: 'upgrade', text: 'Upgrade something (research, laboratory, equipment)', done: p.research.length > 7 || p.upgrades.lab + p.upgrades.spellbook + p.upgrades.grimoire > 0 || p.attrTrained > 0, where: 'MARKET' },
    { id: 'promote', text: 'Attempt your first promotion (ASCEND)', done: (s.npcs[guardianIdFor(0)]?.memory.faced ?? 0) > 0 || p.tier > 0, where: 'ASCEND' },
  ];
  return steps;
}

export { previewSynthesis as previewSynth, EQUIPMENT };
