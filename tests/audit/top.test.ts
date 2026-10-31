import { test } from 'vitest';
import { freshWorld } from '../helpers';
import { compileSpec, npcSpec, npcsInTier } from '../../src/sim/world';
import { simulateDuel } from '../../src/sim/combat';
test('top', () => {
  const s = freshWorld(1234);
  for (const tier of [3, 6]) {
    const npcs = npcsInTier(s, tier).slice(0, 36);
    const W = npcs.map((n) => compileSpec(npcSpec(n), s.lib));
    const wins = W.map(() => 0); const agg = W.map(() => ({ dealt: 0, taken: 0, heal: 0, shield: 0, dot: 0, absorbed: 0 }));
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) { const r = simulateDuel(W[i], W[j], i * 97 + j, { recordFrames: false, maxDecisions: 0 }); wins[r.winner === 0 ? i : j]++; for (const [k, side] of [[i, 0], [j, 1]] as const) { const rp = r.reports[side]; agg[k].dealt += rp.damageDealt; agg[k].taken += rp.damageTaken; agg[k].heal += rp.healing; agg[k].shield += rp.shielding; agg[k].dot += rp.dotDamage; agg[k].absorbed += r.reports[1 - side].absorbedByEnemyShield; } }
    const order = wins.map((w, i) => i).sort((a, b) => wins[b] - wins[a]);
    for (const i of [order[0], order[1], order[order.length - 1]]) {
      const w = W[i], a = agg[i];
      console.log(`T${tier} ${wins[i]}/35 ${npcs[i].personality} attrs ${Object.values(w.attrs).join(',')} | per duel dealt ${(a.dealt/35)|0} taken ${(a.taken/35)|0} heal ${(a.heal/35)|0} shield ${(a.shield/35)|0} dot ${(a.dot/35)|0}`);
      for (const x of w.spells) console.log(`    ${x.kind} ${x.form}/${x.delivery}/${x.behavior} dmg${x.damage}x${x.hits} ch${x.chain} dot${x.dot ? x.dot.type + x.dot.dps : ''} ling${x.linger?.dps ?? ''} sh${x.shield} heal${x.heal} mana${x.manaCost} ct${x.castTime} cd${x.cooldown} ls${x.lifesteal} st${x.statuses.map(s => s.type)} p${x.power}`);
    }
  }
}, 100000);
