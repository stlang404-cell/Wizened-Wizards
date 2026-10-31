import { describe, expect, test } from 'vitest';
import { freshWorld, botPlay } from './helpers';
import { compileSpec, npcSpec, npcsInTier } from '../src/sim/world';
import { simulateDuel, MAX_TIME } from '../src/sim/combat';

describe('balance (automated combat simulations)', () => {
  test.each([0, 2, 4, 6, 8])('tier %i round robin: no dominant build, no degenerate fights', (tier) => {
    const s = freshWorld();
    const field = npcsInTier(s, tier).slice(0, 12).map((n) => compileSpec(npcSpec(n), s.lib));
    const wins = field.map(() => 0);
    const durations: number[] = [];
    let stunLock = 0;
    for (let i = 0; i < field.length; i++)
      for (let j = i + 1; j < field.length; j++) {
        const r = simulateDuel(field[i], field[j], i * 31 + j, { recordFrames: true, maxDecisions: 0 });
        wins[r.winner === 0 ? i : j]++;
        durations.push(r.duration);
        expect(r.duration).toBeLessThanOrEqual(MAX_TIME);
        for (const f of r.frames) {
          expect(f.f[0].mana).toBeGreaterThanOrEqual(0);
          expect(f.f[1].mana).toBeGreaterThanOrEqual(0);
        }
        let run = 0;
        for (const f of r.frames) {
          run = f.f[0].st.includes('frozen') || f.f[0].st.includes('stun') ? run + 1 : 0;
          if (run > 35) stunLock++;
        }
      }
    const games = field.length - 1;
    const best = Math.max(...wins) / games;
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    console.log(`tier ${tier}: best win rate ${(best * 100).toFixed(0)}%, median duration ${median}s, min ${durations[0]}s`);
    expect(best).toBeLessThan(1.0001);
    expect(stunLock).toBe(0);
    expect(median).toBeGreaterThan(30);
    expect(median).toBeLessThanOrEqual(MAX_TIME);
  });

  test('the first promotion is achievable by following the intended loop', () => {
    let promoted = 0;
    for (const seed of [1234, 99, 7]) {
      const s = freshWorld(seed);
      const log = botPlay(s, 160);
      console.log(`seed ${seed}: ${log.filter((l) => /PROMOTED|guardian|end:/.test(l)).slice(-3).join(' | ')}`);
      if (s.player.tier >= 1) promoted++;
    }
    expect(promoted).toBeGreaterThanOrEqual(2);
  }, 120000);
});
