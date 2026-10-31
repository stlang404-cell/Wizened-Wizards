import { describe, expect, test } from 'vitest';
import { compileSpell, recipeId, theoreticalCombinations } from '../src/sim/compiler';
import { fuse, type ComponentLib } from '../src/sim/genetics';
import type { SpellRecipe } from '../src/sim/types';

const R = (over: Partial<SpellRecipe> = {}): SpellRecipe => ({
  essence: { kind: 'material', id: 'stormglass' },
  form: 'bolt',
  delivery: 'projectile',
  behavior: 'direct',
  modifiers: [],
  trigger: 'onCast',
  conditional: 'none',
  evolution: [],
  ...over,
});

describe('spell compiler', () => {
  test('compiles real mechanics', () => {
    const r = compileSpell(R(), {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spell.damage).toBeGreaterThan(0);
    expect(r.spell.manaCost).toBeGreaterThanOrEqual(6);
    expect(r.spell.castTime).toBeGreaterThan(0);
    expect(r.spell.cooldown).toBeGreaterThan(0);
    expect(r.spell.description.length).toBeGreaterThan(0);
  });

  test('stable recipe ids independent of modifier order', () => {
    const a = R({ modifiers: [{ kind: 'material', id: 'chalk_rune' }, { kind: 'material', id: 'static_wool' }] });
    const b = R({ modifiers: [{ kind: 'material', id: 'static_wool' }, { kind: 'material', id: 'chalk_rune' }] });
    expect(recipeId(a)).toBe(recipeId(b));
    const ca = compileSpell(a, {});
    const cb = compileSpell(b, {});
    expect(ca.ok && cb.ok && ca.spell.mechanicId === cb.spell.mechanicId).toBe(true);
  });

  test.each([
    ['ward with delayed delivery', R({ form: 'ward', delivery: 'delayed' })],
    ['homing beam', R({ delivery: 'beam', behavior: 'homing' })],
    ['conditional on a heal', R({ form: 'mend', delivery: 'instant', conditional: 'vsFrozen' })],
    ['unknown essence', R({ essence: { kind: 'component', id: 'nope' } })],
    ['duplicate modifier', R({ modifiers: [{ kind: 'material', id: 'chalk_rune' }, { kind: 'material', id: 'chalk_rune' }] })],
    ['two evolutions in one tier', R({ evolution: ['potent', 'thrifty'] })],
    ['shadow essence with life modifier', R({ essence: { kind: 'material', id: 'wraith_silk' }, modifiers: [{ kind: 'material', id: 'sunpetal' }] })],
  ])('rejects invalid recipe: %s', (_n, recipe) => {
    expect(compileSpell(recipe, {}).ok).toBe(false);
  });

  test('complexity and modifier limits enforced', () => {
    const r = R({ modifiers: [{ kind: 'material', id: 'chalk_rune' }, { kind: 'material', id: 'static_wool' }] });
    expect(compileSpell(r, {}, { maxModifiers: 1 }).ok).toBe(false);
    expect(compileSpell(r, {}, { maxComplexity: 2 }).ok).toBe(false);
  });

  test('power has a price: more potent essences cost more mana', () => {
    const weak = compileSpell(R({ essence: { kind: 'material', id: 'static_wool' } }), {});
    const strong = compileSpell(R({ essence: { kind: 'material', id: 'tempest_core' } }), {});
    expect(weak.ok && strong.ok).toBe(true);
    if (weak.ok && strong.ok) {
      expect(strong.spell.damage).toBeGreaterThan(weak.spell.damage);
      expect(strong.spell.manaCost).toBeGreaterThan(weak.spell.manaCost);
    }
  });

  test('invented components produce distinct mechanics and visuals', () => {
    const lib: ComponentLib = {};
    const f = fuse([{ kind: 'material', id: 'stormglass' }, { kind: 'material', id: 'conductive_rune' }], { lib, maxGeneration: 4, day: 0, inventor: 't' });
    if (!f.ok) throw new Error(f.error);
    lib[f.components[0].id] = f.components[0];
    const plain = compileSpell(R(), lib);
    const custom = compileSpell(R({ essence: { kind: 'component', id: f.components[0].id }, form: 'lance', behavior: 'chaining' }), lib);
    const frost = compileSpell(R({ essence: { kind: 'material', id: 'glacier_heart' }, form: 'orb' }), lib);
    expect(plain.ok && custom.ok && frost.ok).toBe(true);
    if (!(plain.ok && custom.ok && frost.ok)) return;
    expect(custom.spell.mechanicId).not.toBe(plain.spell.mechanicId);
    expect(custom.spell.visual.geometry).toBe('lance');
    expect(custom.spell.visual.motion).toBe('chaining');
    expect(frost.spell.visual.particle).toBe('flake');
    expect(frost.spell.visual.primary).not.toBe(plain.spell.visual.primary);
    expect(custom.spell.chain).toBeGreaterThan(0);
  });

  test('anti-exploit caps hold for extreme recipes', () => {
    const r = compileSpell(
      R({
        essence: { kind: 'material', id: 'sky_anchor' },
        form: 'lance',
        delivery: 'beam',
        behavior: 'chaining',
        modifiers: [{ kind: 'material', id: 'tempest_core' }, { kind: 'material', id: 'astral_prism' }, { kind: 'material', id: 'aeon_crystal' }],
        catalyst: { kind: 'material', id: 'eclipse_shard' },
        evolution: ['potent', 'arcing', 'resonant'],
      }),
      {},
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spell.chain).toBeLessThanOrEqual(3);
    expect(r.spell.pierce).toBeLessThanOrEqual(0.75);
    expect(r.spell.echo).toBeLessThanOrEqual(0.5);
    expect(r.spell.manaCost).toBeLessThanOrEqual(95);
  });

  test('grammar supports a combinatorial space in the billions', () => {
    expect(theoreticalCombinations(60, 3, 9, 4)).toBeGreaterThan(1e9);
  });
});
