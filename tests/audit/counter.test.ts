import { test } from 'vitest';
import { freshWorld } from '../helpers';
import { compileSpec, npcSpec, npcsInTier } from '../../src/sim/world';
import { simulateDuel } from '../../src/sim/combat';
test('counters', () => {
  const s = freshWorld(1234);
  const others = [freshWorld(31), freshWorld(32), freshWorld(33)];
  for (const tier of [0, 3, 6, 8]) {
    const npcs = npcsInTier(s, tier).slice(0, 36);
    const W = npcs.map((n) => compileSpec(npcSpec(n), s.lib));
    const wins = W.map(() => 0);
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) wins[simulateDuel(W[i], W[j], i * 97 + j, { recordFrames: false, maxDecisions: 0 }).winner === 0 ? i : j]++;
    const top = W[wins.indexOf(Math.max(...wins))];
    let beat = 0, n = 0;
    for (const o of others) for (const c of npcsInTier(o, tier).slice(0, 50)) { const cw = compileSpec(npcSpec(c), o.lib); let cWins = 0; for (let k = 0; k < 3; k++) if (simulateDuel(top, cw, k * 7, { recordFrames: false, maxDecisions: 0 }).winner === 1) cWins++; if (cWins >= 2) beat++; n++; }
    console.log(`T${tier}: champion ${Math.max(...wins)}/35 — beaten (best of 3) by ${beat}/${n} builds from other worlds (${(beat / n * 100).toFixed(1)}%)`);
  }
}, 300000);
