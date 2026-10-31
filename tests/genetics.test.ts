import { describe, expect, test } from 'vitest';
import { fuse, extract, refine, stabilize, amplify, mutate, split, ancestryTree, rawMaterialsFor, MAX_STRAIN, type ComponentLib, type SynthContext } from '../src/sim/genetics';
import type { Ingredient } from '../src/sim/types';

const M = (id: string): Ingredient => ({ kind: 'material', id });
const C = (id: string): Ingredient => ({ kind: 'component', id });
const ctx = (lib: ComponentLib, maxGeneration = 8): SynthContext => ({ lib, maxGeneration, day: 1, inventor: 'test' });

function add(lib: ComponentLib, r: ReturnType<typeof fuse>) {
  if (!r.ok) throw new Error(r.error);
  for (const c of r.components) lib[c.id] = c;
  return r.components;
}

describe('component synthesis', () => {
  test('fusion is deterministic and order-independent', () => {
    const a = fuse([M('stormglass'), M('dragon_scale'), M('conductive_rune')], ctx({}));
    const b = fuse([M('conductive_rune'), M('stormglass'), M('dragon_scale')], ctx({}));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.components[0]).toEqual(b.components[0]);
      expect(a.components[0].generation).toBe(1);
      expect(a.components[0].inputs.sort()).toEqual(['conductive_rune', 'dragon_scale', 'stormglass']);
    }
  });

  test('the Draconic Conductor example: storm/fire/arcane yields piercing lightning with instability', () => {
    const r = fuse([M('stormglass'), M('dragon_scale'), M('conductive_rune')], ctx({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.components[0];
    expect(c.element).toBe('storm');
    const traits = c.traits.map((t) => t.trait);
    expect(traits.some((t) => t === 'pierce' || t === 'chain' || t === 'conduct')).toBe(true);
    expect(c.props.volatility).toBeGreaterThan(30);
  });

  test('emergent traits appear from element pairs', () => {
    const r = fuse([M('ember_moss'), M('rime_lichen')], ctx({}));
    expect(r.ok && r.components[0].traits.some((t) => t.trait === 'thermal')).toBe(true);
  });

  test('incompatible elements are rejected', () => {
    const r = fuse([M('gloom_cap'), M('sunpetal')], ctx({}));
    expect(r.ok).toBe(false);
  });

  test('multi-stage invention records full ancestry', () => {
    const lib: ComponentLib = {};
    const [c1] = add(lib, fuse([M('stormglass'), M('conductive_rune')], ctx(lib)));
    const [c2] = add(lib, fuse([M('dragon_scale'), M('cinder_salt')], ctx(lib)));
    const [c3] = add(lib, fuse([C(c1.id), C(c2.id)], ctx(lib)));
    expect(c3.generation).toBe(2);
    const tree = ancestryTree(c3.id, lib);
    expect(tree.children.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
    expect(rawMaterialsFor(c3.id, lib)).toEqual({ stormglass: 1, conductive_rune: 1, dragon_scale: 1, cinder_salt: 1 });
  });

  test('laboratory depth gate and strain cap bound recursion', () => {
    const lib: ComponentLib = {};
    const [c1] = add(lib, fuse([M('stormglass'), M('conductive_rune')], ctx(lib)));
    const [c2] = add(lib, fuse([M('static_wool'), M('chalk_rune')], ctx(lib)));
    const [c3] = add(lib, fuse([C(c1.id), C(c2.id)], ctx(lib)));
    expect(fuse([C(c3.id), M('stormglass')], ctx(lib, 2)).ok).toBe(false);
    // keep straining one lineage — must eventually be refused
    let cur = c3.id;
    let refused = false;
    for (let i = 0; i < 12; i++) {
      const r = refine(cur, ctx(lib));
      if (!r.ok) {
        refused = true;
        break;
      }
      add(lib, r);
      cur = r.components[0].id;
      expect(r.components[0].strain).toBeLessThanOrEqual(MAX_STRAIN);
    }
    expect(refused).toBe(true);
  });

  test('no infinite power: repeated amplify/fuse loops stay bounded', () => {
    const lib: ComponentLib = {};
    let [c] = add(lib, fuse([M('tempest_core'), M('sky_anchor')], ctx(lib)));
    let maxPot = c.props.potency;
    for (let i = 0; i < 20; i++) {
      const a = amplify(c.id, 'tempest_core', ctx(lib));
      if (a.ok) {
        add(lib, a);
        c = a.components[0];
      }
      const f = fuse([C(c.id), M('sky_anchor')], ctx(lib));
      if (f.ok) {
        add(lib, f);
        c = f.components[0];
      }
      maxPot = Math.max(maxPot, c.props.potency);
      for (const v of Object.values(c.props)) expect(v).toBeLessThanOrEqual(100);
      for (const t of c.traits) expect(t.mag).toBeLessThanOrEqual(1.2);
    }
    expect(maxPot).toBeLessThanOrEqual(98);
  });

  test('extract, stabilize, mutate (deterministic per nonce), split (lossy)', () => {
    const lib: ComponentLib = {};
    const [e] = add(lib, extract('glacier_heart', ctx(lib)));
    expect(e.props.purity).toBeGreaterThan(58);
    const [f] = add(lib, fuse([M('cinder_salt'), M('stormglass')], ctx(lib)));
    const s = stabilize(f.id, ctx(lib));
    expect(s.ok && s.components[0].props.stability > f.props.stability).toBe(true);
    const m1 = mutate(f.id, { ...ctx(lib), nonce: 3 });
    const m2 = mutate(f.id, { ...ctx(lib), nonce: 3 });
    expect(m1).toEqual(m2);
    const sp = split(f.id, ctx(lib));
    expect(sp.ok).toBe(true);
    if (sp.ok) {
      expect(sp.components).toHaveLength(2);
      for (const half of sp.components) expect(half.props.potency).toBeLessThan(f.props.potency);
    }
  });
});
