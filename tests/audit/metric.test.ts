import { test } from 'vitest';
import { freshWorld } from '../helpers';
import { compileSpec, npcSpec, npcsInTier } from '../../src/sim/world';
import { simulateDuel, deriveStats } from '../../src/sim/combat';
import type { CompiledSpell, CombatWizard } from '../../src/sim/types';
function corr(x: number[], y: number[]) { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy); }
const val = (x: CompiledSpell) => (x.damage * x.hits * (1 + x.chain * 0.5) + (x.dot ? x.dot.dps * x.dot.duration : 0) + (x.linger ? x.linger.dps * x.linger.duration : 0)) * (x.dodgeable ? 0.85 : 1) + x.heal + x.shield * 0.7 + x.statuses.length * 15;
const metrics: Record<string, (w: CombatWizard) => number> = {
  power: (w) => w.spells.reduce((a, x) => a + x.power, 0),
  valPerSec: (w) => w.spells.reduce((a, x) => a + val(x) / (x.cooldown + x.castTime), 0),
  sustained: (w) => { const st = deriveStats(w); const off = w.spells.filter(x => x.kind !== 'heal' && x.kind !== 'shield'); const eff = off.length ? Math.max(...off.map(x => val(x) / x.manaCost)) : 0; const cdCap = w.spells.reduce((a, x) => a + val(x) / (x.cooldown + x.castTime), 0); return Math.min(cdCap, st.regen * eff * 1.3) * st.powerMult * (st.maxHp / 2000); },
  effBest: (w) => Math.max(...w.spells.map(x => val(x) / x.manaCost)),
};
test('metric', () => {
  const s = freshWorld(1234);
  for (const tier of [0, 3, 6, 8]) {
    const npcs = npcsInTier(s, tier).slice(0, 36); const W = npcs.map((n) => compileSpec(npcSpec(n), s.lib)); const wins = W.map(() => 0);
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) wins[simulateDuel(W[i], W[j], i * 97 + j, { recordFrames: false, maxDecisions: 0 }).winner === 0 ? i : j]++;
    console.log(`T${tier} ` + Object.entries(metrics).map(([k, f]) => `${k} ${corr(W.map(f), wins).toFixed(2)}`).join('  '));
  }
}, 200000);
