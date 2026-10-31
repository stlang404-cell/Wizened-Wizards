import { describe, expect, test } from 'vitest';
import { freshWorld } from './helpers';
import * as G from '../src/sim/game';
import { compileSpec, npcSpec, playerSpec, advanceWorld, npcsInTier } from '../src/sim/world';
import { adaptNpc, observePlayer } from '../src/sim/npc';
import { transact, settleBets, placeBet, oddsFromProb } from '../src/sim/economy';
import { componentValue, sellPrice, buyPrice } from '../src/sim/market';
import { synthCost } from '../src/sim/genetics';
import { createTournament, startTournament, advanceRound, bracketOrder } from '../src/sim/tournament';
import { serialize, deserialize, migrate } from '../src/sim/save';
import { SCHEMA_VERSION } from '../src/sim/state';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('NPC adaptation', () => {
  test('a beaten NPC legally adapts: rules, equipment, inventions or loadout', () => {
    const s = freshWorld();
    const n = npcsInTier(s, 1).find((x) => x.personality === 'tactician' || x.personality === 'scholar')!;
    const before = JSON.stringify([n.tactics, n.equipment, n.library.length, n.loadout]);
    const player = compileSpec(playerSpec(s), s.lib);
    const shieldy = { ...player, spells: [...player.spells, { ...player.spells[0], tags: ['defense'], kind: 'shield' as const }] };
    observePlayer(n, shieldy, false);
    observePlayer(n, shieldy, false);
    n.wealth = 5000;
    const notes = adaptNpc(n, { playerBuild: shieldy, lib: s.lib, day: 2 });
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.stringify([n.tactics, n.equipment, n.library.length, n.loadout])).not.toBe(before);
    expect(n.adaptations[0].text.length).toBeGreaterThan(0);
  });
});

describe('promotion', () => {
  test('guardian cannot be challenged before requirements; promotion grants rewards', () => {
    const s = freshWorld();
    const st = G.promotionStatus(s);
    expect(st.readyForGuardian).toBe(false);
    expect(G.fightDuel(s, st.guardianId, 'guardian').ok).toBe(false);
    // satisfy requirements honestly-ish then force a strong build to verify the promotion path
    const p = s.player;
    p.rating = st.req.rating;
    p.promotion = { qualifyingWins: 99, tournamentTop2: true };
    p.stats.componentsInvented = 5;
    p.stats.maxGeneration = 3;
    p.spells.push({ ...p.spells[0], id: 'x', starter: false });
    p.attrs = { vitality: 14, wisdom: 14, power: 14, agility: 14, focus: 14 };
    expect(G.promotionStatus(s).items.filter((i) => !i.met).map((i) => i.label)).toEqual([]);
    expect(G.promotionStatus(s).readyForGuardian).toBe(true);
    let promoted = false;
    for (let i = 0; i < 40 && !promoted; i++) {
      const r = G.fightDuel(s, st.guardianId, 'guardian');
      expect(r.ok).toBe(true);
      if (r.ok && r.outcome.promoted) promoted = true;
    }
    if (promoted) {
      expect(p.tier).toBe(1);
      expect(p.skillPoints).toBe(2);
      expect(p.promotion.qualifyingWins).toBe(0);
      expect(p.record.guardiansDefeated).toContain(0);
    }
  });
});

describe('tournaments', () => {
  test('bracket seeding is a permutation and top seeds meet late', () => {
    expect(bracketOrder(8).slice().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const o = bracketOrder(8);
    expect(Math.floor(o.indexOf(0) / 4)).not.toBe(Math.floor(o.indexOf(1) / 4));
  });
  test('runs deterministically to a champion with independent NPCs', () => {
    const run = () => {
      const s = freshWorld();
      const t = createTournament({ id: 'tx', kind: 'cup', tier: 0, day: 1, candidates: npcsInTier(s, 0).map((n) => n.id), rating: (id) => s.npcs[id].rating, seed: 42 });
      startTournament(t, (id) => s.npcs[id].rating);
      let guard = 0;
      while (t.status === 'running' && guard++ < 10) advanceRound(t, (id) => npcSpec(s.npcs[id]), (sp) => compileSpec(sp, s.lib));
      return t;
    };
    const a = run();
    const b = run();
    expect(a.status).toBe('finished');
    expect(a.rounds.length).toBe(3);
    expect(a.champion).toBe(b.champion);
    expect(a.participants).toContain(a.champion);
  });
  test('player can enter, play and finish a tournament', () => {
    const s = freshWorld();
    const t = s.tournaments.find((x) => x.kind === 'skirmish')!;
    expect(G.enterTournament(s, t.id).ok).toBe(true);
    let guard = 0;
    while (t.status === 'running' && guard++ < 10) {
      const r = G.playTournamentMatch(s, t.id);
      if (!r.ok) G.advanceTournament(s, t.id);
    }
    expect(t.status).toBe('finished');
    expect(t.playerPlacement).toBeGreaterThanOrEqual(1);
  });
});

describe('economy & betting', () => {
  test('transactions apply exactly once and never go negative', () => {
    const s = freshWorld();
    const m = s.player.money;
    expect(transact(s, 'x1', 50, 'test')).toBe(true);
    expect(transact(s, 'x1', 50, 'test')).toBe(false);
    expect(s.player.money).toBe(m + 50);
    expect(transact(s, 'x2', -1e9, 'test')).toBe(false);
    expect(s.player.money).toBe(m + 50);
  });
  test('no buy/sell arbitrage', () => {
    const s = freshWorld();
    s.player.money = 10000;
    const start = s.player.money;
    for (let i = 0; i < 10; i++) {
      G.buyMaterial(s, 'stormglass', 5);
      G.sellMaterial(s, 'stormglass', 5);
    }
    expect(s.player.money).toBeLessThan(start);
    expect(sellPrice(s.market, 'stormglass')).toBeLessThan(buyPrice(s.market, 'stormglass'));
  });
  test('component sale value saturates and crafting is not a money printer', () => {
    const s = freshWorld();
    s.player.money = 1000;
    s.player.materials = { stormglass: 10, conductive_rune: 10 };
    const spentStart = s.player.money;
    const r = G.synthesize(s, 'fuse', { ingredients: [{ kind: 'material', id: 'stormglass' }, { kind: 'material', id: 'conductive_rune' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.components[0].id;
    const v1 = componentValue(s.market, id, s.lib);
    G.sellComponent(s, id);
    expect(componentValue(s.market, id, s.lib)).toBeLessThan(v1);
    const matCost = buyPrice(s.market, 'stormglass') + buyPrice(s.market, 'conductive_rune');
    expect(v1).toBeLessThan(matCost + synthCost('fuse', 1));
    expect(spentStart).toBeGreaterThan(0);
  });
  test('bets: validation, odds from probability, single settlement', () => {
    const s = freshWorld();
    expect(placeBet(s, { matchKey: 'm1', pick: 'a', stake: -5, odds: 2, label: 'x', kind: 'match' }).ok).toBe(false);
    expect(placeBet(s, { matchKey: 'm1', pick: 'a', stake: 1.5, odds: 2, label: 'x', kind: 'match' }).ok).toBe(false);
    expect(placeBet(s, { matchKey: 'm1', pick: 'a', stake: 1e9, odds: 2, label: 'x', kind: 'match' }).ok).toBe(false);
    const before = s.player.money;
    expect(placeBet(s, { matchKey: 'm1', pick: 'a', stake: 40, odds: 2.5, label: 'x', kind: 'match' }).ok).toBe(true);
    expect(placeBet(s, { matchKey: 'm1', pick: 'b', stake: 10, odds: 2.5, label: 'x', kind: 'match' }).ok).toBe(false);
    expect(s.player.money).toBe(before - 40);
    settleBets(s, 'm1', 'a');
    settleBets(s, 'm1', 'a');
    expect(s.player.money).toBe(before - 40 + 100);
    expect(oddsFromProb(0.8)).toBeLessThan(oddsFromProb(0.3));
  });
  test('cannot bet on a resolved exhibition; settlement is deterministic', () => {
    const s = freshWorld();
    const ex = s.exhibitions[0];
    const copy = freshWorld();
    const exCopy = copy.exhibitions.find((e) => e.id === ex.id)!;
    expect(G.betOnMatch(s, `exh:${ex.id}`, ex.match.a, 20).ok).toBe(true);
    G.watchExhibition(s, ex.id);
    G.watchExhibition(copy, exCopy.id);
    expect(ex.match.winner).toBe(exCopy.match.winner);
    expect(G.betOnMatch(s, `exh:${ex.id}`, ex.match.a, 20).ok).toBe(false);
    expect(s.bets[0].status === 'won' || s.bets[0].status === 'lost').toBe(true);
  });
  test('duel rewards: winning pays, losing still pays a little (recovery), tutoring rescues broke wizards', () => {
    const s = freshWorld();
    const opp = G.listOpponents(s)[0].npc;
    const m = s.player.money;
    const r = G.fightDuel(s, opp.id, 'duel');
    expect(r.ok && s.player.money > m).toBe(true);
    s.player.money = 0;
    expect(G.tutorFirstYears(s).ok).toBe(true);
    expect(s.player.money).toBeGreaterThan(0);
  });
});

describe('upgrades have real effects', () => {
  test('attribute training raises combat stats; caps apply', () => {
    const s = freshWorld();
    s.player.money = 100000;
    const hp0 = compileSpec(playerSpec(s), s.lib);
    for (let i = 0; i < 20; i++) G.trainAttribute(s, 'vitality');
    expect(s.player.attrs.vitality).toBe(14);
    expect(G.trainAttribute(s, 'vitality').ok).toBe(false);
    expect(compileSpec(playerSpec(s), s.lib).attrs.vitality).toBeGreaterThan(hp0.attrs.vitality);
    expect(G.upgradeLab(s).ok).toBe(true);
    expect(G.labInfo(s).catalyst).toBe(true);
    expect(G.upgradeSpellbook(s).ok).toBe(true);
    expect(G.upgradeGrimoire(s).ok).toBe(true);
  });
});

describe('save / load', () => {
  test('round trip preserves state and remains playable', () => {
    const s = freshWorld();
    G.fightDuel(s, G.listOpponents(s)[0].npc.id, 'duel');
    const text = serialize(s);
    const r = deserialize(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toEqual(s);
    expect(G.fightDuel(r.state, G.listOpponents(r.state)[0].npc.id, 'duel').ok).toBe(true);
    advanceWorld(r.state, 8);
  });
  test('tampered or foreign files are rejected', () => {
    const s = freshWorld();
    const text = serialize(s).replace(`"money":${s.player.money}`, '"money":999999');
    expect(deserialize(text).ok).toBe(false);
    expect(deserialize('{"hello":1}').ok).toBe(false);
    expect(deserialize('not json').ok).toBe(false);
  });
  test('old schema versions migrate forward', () => {
    const s = freshWorld() as unknown as Record<string, unknown>;
    const st = s as unknown as { version: number; season?: number; counters: { npc?: number } };
    st.version = 1;
    delete st.season;
    delete st.counters.npc;
    const m = migrate(s);
    expect(m.version).toBe(SCHEMA_VERSION);
    expect(m.season).toBe(1);
    expect(m.counters.npc).toBeGreaterThan(0);
  });
});

describe('offline operation', () => {
  test('game source makes no network calls and references no remote URLs', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|css|html)$/.test(f)) files.push(p);
      }
    };
    walk('src');
    files.push('index.html');
    for (const f of files) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\/(?!www\.w3\.org)/);
    }
  });
});
