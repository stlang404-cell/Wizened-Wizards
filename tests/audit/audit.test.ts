import { test } from 'vitest';
import { freshWorld } from '../helpers';
import { compileSpec, npcSpec, npcsInTier } from '../../src/sim/world';
import { simulateDuel } from '../../src/sim/combat';
import { EQUIP_MAP } from '../../src/sim/data/equipment';

function corr(x: number[], y: number[]) { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy); }
test('audit', () => {
  for (const seed of [1234, 77]) {
    const s = freshWorld(seed);
    for (const tier of [0, 3, 6, 8]) {
      const npcs = npcsInTier(s, tier).slice(0, 36);
      const W = npcs.map((n) => compileSpec(npcSpec(n), s.lib));
      const wins = W.map(() => 0); const durs: number[] = []; let maxHit = 0;
      for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) { const r = simulateDuel(W[i], W[j], i * 97 + j, { recordFrames: false, maxDecisions: 0 }); wins[r.winner === 0 ? i : j]++; durs.push(r.duration); for (const e of r.events) if (e.type === 'hit') maxHit = Math.max(maxHit, e.dmg); }
      const wr = wins.map((w) => w / (W.length - 1));
      const attr = npcs.map((n) => Object.values(n.attrs).reduce((a, b) => a + b));
      const eq = npcs.map((n) => n.equipment.reduce((a, e) => a + (EQUIP_MAP[e]?.tier ?? 0), 0));
      const pow = W.map((w) => w.spells.reduce((a, x) => a + x.power, 0));
      const nsp = W.map((w) => w.spells.length);
      const hasDef = W.map((w) => (w.spells.some((x) => x.kind === 'shield' || x.kind === 'heal') ? 1 : 0));
      const byP: Record<string, number[]> = {}; npcs.forEach((n, i) => (byP[n.personality] ??= []).push(wr[i]));
      durs.sort((a, b) => a - b);
      console.log(`seed ${seed} T${tier}: max wr ${Math.max(...wr).toFixed(2)} min ${Math.min(...wr).toFixed(2)} | corr attr ${corr(attr, wr).toFixed(2)} equip ${corr(eq, wr).toFixed(2)} power ${corr(pow, wr).toFixed(2)} nSpells ${corr(nsp, wr).toFixed(2)} hasDef ${corr(hasDef, wr).toFixed(2)} | dur p10 ${durs[Math.floor(durs.length * .1)]} p50 ${durs[Math.floor(durs.length / 2)]} p90 ${durs[Math.floor(durs.length * .9)]} timeouts ${(durs.filter(d => d >= 99.9).length / durs.length * 100).toFixed(0)}% maxHit ${maxHit}`);
      console.log('   personality wr: ' + Object.entries(byP).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b) / v.length).toFixed(2)}`).join(' '));
    }
  }
}, 300000);
