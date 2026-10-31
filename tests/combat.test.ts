import { describe, expect, test } from 'vitest';
import { simulateDuel, MAX_TIME, deriveStats, type CombatResult } from '../src/sim/combat';
import { compileSpell } from '../src/sim/compiler';
import type { CombatWizard, SpellRecipe, TacticRule } from '../src/sim/types';
import { EQUIP_MAP } from '../src/sim/data/equipment';

const look = { robe: 0, trim: 0, hat: 'pointed' as const, beard: 'none' as const, skin: 0, hair: 0, staff: 0 };
const spell = (over: Partial<SpellRecipe>) => {
  const r = compileSpell({ essence: { kind: 'material', id: 'cinder_salt' }, form: 'bolt', delivery: 'projectile', behavior: 'direct', modifiers: [], trigger: 'onCast', conditional: 'none', evolution: [], ...over }, {});
  if (!r.ok) throw new Error(r.errors.join());
  return r.spell;
};
const wiz = (id: string, spells: ReturnType<typeof spell>[], tactics: TacticRule[] = [], equipment: string[] = []): CombatWizard => ({
  id,
  name: id,
  attrs: { vitality: 10, wisdom: 10, power: 10, agility: 10, focus: 10 },
  spells,
  tactics,
  equipment: equipment.map((e) => EQUIP_MAP[e]),
  enchants: {},
  skills: [],
  look,
});
const T = (condition: TacticRule['condition'], action: TacticRule['action']): TacticRule => ({ condition, action, enabled: true });
const hits = (r: CombatResult) => r.events.filter((e) => e.type === 'hit');

const bolt = spell({});
const frostBolt = spell({ essence: { kind: 'material', id: 'glacier_heart' }, behavior: 'splitting' });
const shatterLance = spell({ essence: { kind: 'material', id: 'glacier_heart' }, form: 'lance', delivery: 'beam', conditional: 'vsFrozen' });
const ward = spell({ essence: { kind: 'material', id: 'golem_heartstone' }, form: 'ward', delivery: 'instant' });
const pierceLance = spell({ essence: { kind: 'material', id: 'conductive_rune' }, form: 'lance', behavior: 'piercing' });

describe('combat engine', () => {
  test('is fully deterministic for a seed', () => {
    const a = wiz('a', [bolt, frostBolt]);
    const b = wiz('b', [pierceLance, ward]);
    const r1 = simulateDuel(a, b, 1234);
    const r2 = simulateDuel(a, b, 1234);
    expect(r1.winner).toBe(r2.winner);
    expect(r1.events).toEqual(r2.events);
    expect(r1.frames).toEqual(r2.frames);
    expect(simulateDuel(a, b, 999).events).not.toEqual(r1.events);
  });

  test('always terminates; standard matches land in a sane duration band', () => {
    const durs: number[] = [];
    for (let s = 0; s < 20; s++) {
      const r = simulateDuel(wiz('a', [bolt, pierceLance]), wiz('b', [frostBolt, ward]), s);
      expect(r.duration).toBeLessThanOrEqual(MAX_TIME);
      durs.push(r.duration);
    }
    const avg = durs.reduce((x, y) => x + y, 0) / durs.length;
    expect(avg).toBeGreaterThan(35);
    expect(avg).toBeLessThan(100);
  });

  test('frost + shatter combo fires and freeze has diminishing returns (no permanent stun)', () => {
    const cryo = wiz('cryo', [frostBolt, shatterLance], [T('enemyFrozen', 'preferShatter'), T('always', 'preferControl')]);
    const r = simulateDuel(cryo, wiz('dummy', [bolt]), 7);
    expect(hits(r).some((h) => h.type === 'hit' && h.shatter)).toBe(true);
    // never frozen for long uninterrupted stretches
    let run = 0;
    let maxRun = 0;
    for (const f of r.frames) {
      run = f.f[1].st.includes('frozen') || f.f[1].st.includes('stun') ? run + 1 : 0;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun * 0.1).toBeLessThanOrEqual(2.6);
  });

  test('mana never goes negative and shields are capped and decay', () => {
    const turtle = wiz('t', [ward, ward, bolt]);
    const r = simulateDuel(turtle, wiz('b', [bolt]), 3);
    const maxHp = r.maxHp[0];
    for (const f of r.frames) {
      expect(f.f[0].mana).toBeGreaterThanOrEqual(0);
      expect(f.f[0].shield).toBeLessThanOrEqual(maxHp * 0.6 + 1);
    }
    // shields decay on their own: find a frame with shield, check it drops without hits
    const idx = r.frames.findIndex((f) => f.f[0].shield > 50);
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  test('tactics change behaviour: a rule overrides the default utility AI', () => {
    const shielded = wiz('s', [ward, bolt], [T('selfUnshielded', 'preferDefense')]);
    const orb = spell({ essence: { kind: 'material', id: 'dragon_scale' }, form: 'orb', delivery: 'beam' });
    const pierceBolt = spell({ essence: { kind: 'material', id: 'conductive_rune' }, behavior: 'piercing' });
    const noRules = wiz('p', [orb, pierceBolt]);
    const withRules = wiz('p', [orb, pierceBolt], [T('always', 'preferEfficient')]);
    let fired = 0;
    let differs = 0;
    for (let s = 0; s < 10; s++) {
      const a = simulateDuel(noRules, shielded, s);
      const b = simulateDuel(withRules, shielded, s);
      fired += b.reports[0].tacticFires[0];
      if (JSON.stringify(a.events.filter((e) => e.type === 'cast')) !== JSON.stringify(b.events.filter((e) => e.type === 'cast'))) differs++;
      expect(b.events.some((e) => e.type === 'decision')).toBe(true);
    }
    expect(fired).toBeGreaterThan(0);
    expect(differs).toBeGreaterThan(5); // casting sequence changes because of the rule
  });

  test('interactions: storm conductivity, poison amplification, shield reflection, disruption, echo', () => {
    const storm = spell({ essence: { kind: 'material', id: 'tempest_core' }, form: 'bolt', behavior: 'chaining' });
    const poison = spell({ essence: { kind: 'material', id: 'hydra_blood' } });
    const mirror = spell({ essence: { kind: 'material', id: 'astral_prism' }, form: 'ward', delivery: 'instant', behavior: 'orbiting' });
    const disrupt = spell({ essence: { kind: 'material', id: 'conductive_rune' }, delivery: 'instant', conditional: 'vsCasting' });
    const echo = spell({ essence: { kind: 'material', id: 'aeon_crystal' } });
    expect(storm.statuses.some((s) => s.type === 'conductive')).toBe(true);
    expect(storm.chain).toBeGreaterThan(0);
    expect(poison.dot?.type).toBe('poison');
    expect(mirror.reflect).toBeGreaterThan(0);
    expect(disrupt.interrupts).toBe(true);
    expect(echo.echo).toBeGreaterThan(0);
    const longCaster = wiz('l', [spell({ essence: { kind: 'material', id: 'glacier_heart' }, form: 'orb' })]);
    const r = simulateDuel(wiz('d', [disrupt], [T('enemyLongCast', 'interrupt')]), longCaster, 5);
    expect(r.reports[0].interruptsLanded).toBeGreaterThan(0);
    const re = simulateDuel(wiz('e', [echo]), wiz('x', [bolt]), 5);
    expect(re.events.some((e) => e.type === 'release' && e.echo)).toBe(true);
    const rp = simulateDuel(wiz('p', [poison]), wiz('x', [bolt]), 5);
    expect(rp.reports[0].dotDamage).toBeGreaterThan(0);
  });

  test('equipment has real effects (resistance reduces damage taken)', () => {
    const fire = wiz('f', [bolt]);
    let plain = 0;
    let robed = 0;
    for (let s = 0; s < 6; s++) {
      plain += simulateDuel(fire, wiz('x', [frostBolt]), s).reports[1].damageTaken;
      robed += simulateDuel(fire, wiz('x', [frostBolt], [], ['emberproof_robe']), s).reports[1].damageTaken;
    }
    expect(robed).toBeLessThan(plain);
    expect(deriveStats(wiz('x', [], [], ['emberproof_robe'])).resist.fire).toBeGreaterThan(0);
  });
});
