import { createWorld } from '../src/sim/world';
import type { GameState } from '../src/sim/state';
import * as G from '../src/sim/game';
import type { Ingredient, SpellRecipe } from '../src/sim/types';
import { MATERIAL_MAP } from '../src/sim/data/materials';

export const LOOK = { robe: 0x5a2a6e, trim: 0xd9b44a, hat: 'pointed' as const, beard: 'none' as const, skin: 0xf2d0b0, hair: 0x2a1a10, staff: 0x6a4a2a };

let cached: string | null = null;
/** A fresh world (cached JSON for speed). */
export function freshWorld(seed = 1234): GameState {
  if (seed === 1234) {
    if (!cached) cached = JSON.stringify(createWorld('Tester', LOOK, seed));
    return JSON.parse(cached);
  }
  return createWorld('Tester', LOOK, seed);
}

/** A simple bot that follows the intended early-game loop. Returns a log of milestones. */
export function botPlay(s: GameState, maxActions = 120): string[] {
  const log: string[] = [];
  const p = s.player;
  let forgedLance = false;
  for (let i = 0; i < maxActions; i++) {
    if (p.tier >= 1) {
      log.push(`PROMOTED after ${p.stats.duels} duels`);
      break;
    }
    // research basics
    for (const k of ['behavior:piercing', 'form:lance', 'form:mend'] as const) {
      if (!p.research.includes(k) && p.money >= 160) {
        const r = G.doResearch(s, k);
        if (r.ok) log.push(`research ${k}`);
      }
    }
    if (p.upgrades.spellbook === 0 && p.money >= 200) if (G.upgradeSpellbook(s).ok) log.push('spellbook 3');
    // invent a component from two compatible materials
    if (p.stats.componentsInvented < 3) {
      const mats = Object.entries(p.materials).filter(([, n]) => n > 0).map(([id]) => id);
      outer: for (let a = 0; a < mats.length; a++)
        for (let b = a + 1; b < mats.length; b++) {
          const ings: Ingredient[] = [
            { kind: 'material', id: mats[a] },
            { kind: 'material', id: mats[b] },
          ];
          const pv = G.previewSynth(s, 'fuse', { ingredients: ings });
          if (pv.ok && !s.lib[pv.components[0].id] && p.money >= pv.cost + 20) {
            const r = G.synthesize(s, 'fuse', { ingredients: ings });
            if (r.ok) {
              log.push(`invented ${r.components[0].name} [${r.components[0].traits.map((t) => t.trait).join(',')}]`);
              break outer;
            }
          }
        }
    }
    // forge a piercing lance once possible
    if (!forgedLance && p.research.includes('behavior:piercing') && p.research.includes('form:lance')) {
      const comps = Object.keys(p.components);
      const essence: Ingredient | undefined = comps.length
        ? { kind: 'component', id: comps[0] }
        : Object.keys(p.materials).length
          ? { kind: 'material', id: Object.keys(p.materials)[0] }
          : undefined;
      if (essence) {
        const recipe: SpellRecipe = { essence, form: 'lance', delivery: 'projectile', behavior: 'piercing', modifiers: [], trigger: 'onCast', conditional: 'none', evolution: [] };
        const r = G.forgeSpell(s, recipe);
        if (r.ok) {
          forgedLance = true;
          log.push(`forged ${r.entry.name}`);
        } else log.push(`forge failed: ${r.error}`);
      }
    }
    // forge a mend if possible
    if (p.research.includes('form:mend') && !p.spells.some((x) => x.recipe.form === 'mend')) {
      const lifeMat = Object.keys(p.materials).find((m) => MATERIAL_MAP[m]?.element === 'life' || MATERIAL_MAP[m]?.element === 'earth');
      if (lifeMat) {
        const r = G.forgeSpell(s, { essence: { kind: 'material', id: lifeMat }, form: 'mend', delivery: 'instant', behavior: 'direct', modifiers: [], trigger: 'onCast', conditional: 'none', evolution: [] });
        if (r.ok) log.push(`forged ${r.entry.name}`);
      }
    }
    // tournaments
    const st = G.promotionStatus(s);
    const current = s.tournaments.find((t) => t.playerEntered && t.status === 'running');
    if (current) {
      const r = G.playTournamentMatch(s, current.id);
      if (!r.ok) {
        while (current.status === 'running') G.advanceTournament(s, current.id);
      }
      if (current.status === 'finished') log.push(`tournament ${current.name} placed ${current.playerPlacement}`);
      continue;
    }
    if (!p.promotion.tournamentTop2 && p.stats.duels >= 6) {
      const t = s.tournaments.find((x) => x.status === 'registration' && x.kind === 'skirmish' && x.tier === p.tier);
      if (t && p.money >= t.entryFee + 30 && G.enterTournament(s, t.id).ok) {
        log.push(`entered ${t.name}`);
        continue;
      }
    }
    if (st.readyForGuardian) {
      for (const a of ['power', 'vitality', 'wisdom', 'focus'] as const) G.trainAttribute(s, a);
      const r = G.fightDuel(s, st.guardianId, 'guardian');
      log.push(`guardian attempt: ${r.ok ? (r.result.winner === 0 ? 'WON' : 'lost') : r.error}`);
      continue;
    }
    // regular duel against an even or weaker opponent
    const opps = G.listOpponents(s);
    const pick = opps.find((o) => o.tag === 'rookie') ?? opps.find((o) => o.tag === 'even') ?? opps.find((o) => o.tag === 'weaker') ?? opps[0];
    if (!pick) break;
    const r = G.fightDuel(s, pick.npc.id, 'duel');
    if (r.ok && i < 8) log.push(`duel ${r.result.winner === 0 ? 'W' : 'L'} vs ${pick.npc.name} (${Math.round(r.result.duration)}s) $${p.money} R${p.rating}`);
    if (p.money < 40) G.tutorFirstYears(s);
  }
  log.push(`end: tier ${p.tier} duels ${p.stats.duels} W${p.record.wins}/L${p.record.losses} $${p.money} rating ${p.rating} respect ${p.respect} comps ${p.stats.componentsInvented} spells ${p.spells.length}`);
  return log;
}
