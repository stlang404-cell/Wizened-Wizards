import { test } from 'vitest';
import { freshWorld, botPlay } from '../helpers';
import * as G from '../../src/sim/game';
test('pacing', () => {
  for (const seed of [1234, 99, 7, 42, 5]) {
    const s = freshWorld(seed);
    const met: Record<string, number> = {};
    const orig = G.promotionStatus;
    for (let k = 0; k < 160 && s.player.tier === 0; k++) {
      botPlay(s, 1);
      for (const it of orig(s).items) if (it.met && met[it.label] === undefined) met[it.label] = s.player.stats.duels;
    }
    console.log(`seed ${seed}: tier ${s.player.tier} duels ${s.player.stats.duels} W${s.player.record.wins} L${s.player.record.losses} met at: ${JSON.stringify(met)} guardianTries ${s.npcs.guardian0.memory.faced}`);
  }
}, 200000);
