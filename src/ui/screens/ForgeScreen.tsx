import { useMemo, useState } from 'react';
import { useGame, useStore } from '../../state/store';
import * as G from '../../sim/game';
import { BEHAVIOR_INFO, CONDITIONAL_INFO, DELIVERY_INFO, EVOLUTION, FORM_INFO, TRIGGER_INFO, theoreticalCombinations, validBehaviors, validDeliveries } from '../../sim/compiler';
import { OP_INFO, ancestryTree, rawMaterialsFor, type AncestryNode } from '../../sim/genetics';
import { ELEMENT_INFO, MATERIAL_MAP } from '../../sim/data/materials';
import { componentValue } from '../../sim/market';
import { RESEARCH, LAB_LEVELS } from '../../sim/upgrades';
import { compileCached } from '../../sim/npc';
import { compileSpec, npcSpec, playerSpec } from '../../sim/world';
import { estimateWinProbability } from '../../sim/combat';
import { tierName } from '../../sim/hierarchy';
import type { Behavior, Component, Conditional, Delivery, Form, Ingredient, SpellRecipe, SynthOp, Trigger } from '../../sim/types';
import { PROPS } from '../../sim/types';
import { Bar, CompIcon, ElIcon, IngredientIcon, MatIcon, Money, Panel, SpellCard, ingredientName, rarityLabel } from '../components/common';
import { sfx } from '../../art/audio';

type Tab = 'lab' | 'invent' | 'research' | 'archive';

export function ForgeScreen() {
  const [tab, setTab] = useState<Tab>('invent');
  const g = useGame();
  return (
    <div className="screen-inner">
      <div className="screen-title">
        <h1>FORGE</h1>
        <p>
          {G.labInfo(g).name} · invention depth {G.labInfo(g).maxGeneration} · {G.labInfo(g).modifiers} modifier slot{G.labInfo(g).modifiers > 1 ? 's' : ''}
        </p>
      </div>
      <div className="tabs">
        {(
          [
            ['invent', 'Component Invention'],
            ['lab', 'Spell Laboratory'],
            ['research', 'Research & Laboratory'],
            ['archive', 'Archive'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`forge-tab-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'invent' && <Invention />}
      {tab === 'lab' && <SpellLab />}
      {tab === 'research' && <Research />}
      {tab === 'archive' && <Archive />}
    </div>
  );
}

// ------------------------------------------------------------ inventory
function Inventory({ onPick, filter, selectedKeys = [] }: { onPick: (i: Ingredient) => void; filter?: 'material' | 'component'; selectedKeys?: string[] }) {
  const g = useGame();
  const mats = Object.entries(g.player.materials).filter(([, n]) => n > 0);
  const comps = Object.entries(g.player.components).filter(([, n]) => n > 0);
  return (
    <div className="col">
      {filter !== 'component' && (
        <>
          <div className="slot-label">Materials</div>
          <div className="inv-grid">
            {mats.length === 0 && <div className="muted small">No materials. Win duels or visit the Market.</div>}
            {mats.map(([id, n]) => {
              const m = MATERIAL_MAP[id];
              return (
                <div key={id} className={`inv-cell ${selectedKeys.includes(`material:${id}`) ? 'selected' : ''}`} onClick={() => onPick({ kind: 'material', id })} title={`${m.name} — ${ELEMENT_INFO[m.element].name}. ${m.lore}`} data-testid={`mat-${id}`}>
                  <span className="count">{n}</span>
                  <MatIcon id={id} />
                  <span className={`label rarity-${m.rarity}`}>{m.name}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {filter !== 'material' && (
        <>
          <div className="slot-label" style={{ marginTop: 8 }}>
            Components
          </div>
          <div className="inv-grid">
            {comps.length === 0 && <div className="muted small">No components yet. Invent one!</div>}
            {comps.map(([id, n]) => {
              const c = g.lib[id];
              if (!c) return null;
              return (
                <div key={id} className={`inv-cell ${selectedKeys.includes(`component:${id}`) ? 'selected' : ''}`} onClick={() => onPick({ kind: 'component', id })} title={`${c.name} (gen ${c.generation}) — ${c.traits.map((t) => t.trait).join(', ')}`} data-testid={`comp-${id}`}>
                  <span className="count">{n}</span>
                  <CompIcon el={c.element} sec={c.secondary} gen={c.generation} />
                  <span className={`label rarity-${c.rarity}`}>{c.name}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function ComponentDetail({ c, showValue = true }: { c: Component; showValue?: boolean }) {
  const g = useGame();
  return (
    <div className="subpanel">
      <div className="row">
        <CompIcon el={c.element} sec={c.secondary} gen={c.generation} size={4} />
        <div>
          <div className="title" style={{ fontFamily: 'Cinzel', fontWeight: 600 }}>
            {c.name}
          </div>
          <div className="small muted row" style={{ gap: 4 }}>
            <ElIcon el={c.element} size={1} />
            {c.secondary && <ElIcon el={c.secondary} size={1} />}
            {ELEMENT_INFO[c.element].name}
            {c.secondary ? ` / ${ELEMENT_INFO[c.secondary].name}` : ''} · gen {c.generation} · strain {c.strain}/6 · {rarityLabel(c.rarity)}
          </div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '4px 14px', marginTop: 8 }}>
        {PROPS.map((k) => (
          <div key={k} className="small">
            <div className="row">
              <span className="muted">{k}</span>
              <span className="right num">{c.props[k]}</span>
            </div>
            <Bar value={c.props[k]} max={100} color={k === 'volatility' ? '#e0703a' : k === 'stability' ? '#6ab0ff' : undefined} />
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ marginTop: 8, gap: 4 }}>
        {c.traits.map((t) => (
          <span key={t.trait} className="tag" style={{ color: '#f5d77a' }}>
            {t.trait} {Math.round(t.mag * 100)}
          </span>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        {c.notes}
      </div>
      {showValue && (
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Market value <Money v={componentValue(g.market, c.id, g.lib)} /> · invented day {c.createdAt}
        </div>
      )}
    </div>
  );
}

function Tree({ node }: { node: AncestryNode }) {
  return (
    <li>
      <span className="row" style={{ gap: 4 }}>
        <ElIcon el={node.element} size={1} />
        <span className={node.kind === 'component' ? 'gold' : ''}>{node.name}</span>
        {node.op && <span className="tiny muted">({node.op})</span>}
      </span>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <Tree key={i} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Ancestry({ id }: { id: string }) {
  const g = useGame();
  const tree = ancestryTree(id, g.lib);
  return (
    <div className="tree">
      <ul style={{ borderLeft: 'none', paddingLeft: 0 }}>
        <Tree node={tree} />
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ invention
function Invention() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const [op, setOp] = useState<SynthOp>('fuse');
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [last, setLast] = useState<Component[] | null>(null);
  const lab = G.labInfo(g);

  const args = (): G.SynthArgs => {
    const comp = ings.find((i) => i.kind === 'component');
    const mat = ings.find((i) => i.kind === 'material');
    if (op === 'fuse') return { ingredients: ings };
    if (op === 'extract') return { materialId: mat?.id };
    if (op === 'amplify') return { componentId: comp?.id, materialId: mat?.id };
    return { componentId: comp?.id };
  };
  const preview = useMemo(() => (ings.length ? G.previewSynth(g, op, args()) : null), [ings, op, g.player.money, g.lib]);

  const pick = (i: Ingredient) => {
    setLast(null);
    if (op === 'fuse') {
      if (ings.length >= 3) return toast('Fusion holds at most 3 ingredients.');
      const have = i.kind === 'material' ? g.player.materials[i.id] ?? 0 : g.player.components[i.id] ?? 0;
      const used = ings.filter((x) => x.kind === i.kind && x.id === i.id).length;
      if (used >= have) return toast('You do not have another one.');
      setIngs([...ings, i]);
    } else if (op === 'extract') setIngs(i.kind === 'material' ? [i] : ings);
    else if (op === 'amplify') {
      const others = ings.filter((x) => x.kind !== i.kind);
      setIngs([...others, i]);
    } else setIngs(i.kind === 'component' ? [i] : ings);
  };

  const invent = () => {
    const r = act((s) => G.synthesize(s, op, args()));
    if (r && r.ok) {
      setLast(r.components);
      setIngs([]);
      if (r.discoveries.length) {
        sfx.discovery();
        toast(`✦ Discovery! ${r.discoveries.join(' & ')}`, 'discovery');
      } else toast(`Created another ${r.components[0].name}.`, 'success');
    }
  };

  return (
    <div className="grid cols-main-side">
      <Panel title="Your stores">
        <Inventory onPick={pick} filter={op === 'extract' ? 'material' : op === 'refine' || op === 'stabilize' || op === 'mutate' || op === 'split' ? 'component' : undefined} selectedKeys={ings.map((i) => `${i.kind}:${i.id}`)} />
      </Panel>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Crucible">
          <div className="row wrap" style={{ gap: 4 }}>
            {(Object.keys(OP_INFO) as SynthOp[]).map((k) => (
              <button key={k} className={`btn small ${op === k ? 'primary' : ''}`} disabled={lab.level < OP_INFO[k].minLab} title={lab.level < OP_INFO[k].minLab ? `Requires Laboratory ${OP_INFO[k].minLab}` : OP_INFO[k].desc} onClick={() => (setOp(k), setIngs([]), setLast(null))} data-testid={`op-${k}`}>
                {OP_INFO[k].name}
              </button>
            ))}
          </div>
          <p className="small muted">
            <b className="gold">{OP_INFO[op].name}</b> ({OP_INFO[op].inputs}): {OP_INFO[op].desc}
          </p>
          <div className="row wrap">
            {ings.map((i, k) => (
              <div key={k} className="slot filled" onClick={() => setIngs(ings.filter((_, j) => j !== k))} title="Click to remove" style={{ minWidth: 150 }}>
                <IngredientIcon ing={i} lib={g.lib} />
                <span className="small">{ingredientName(i, g.lib)}</span>
              </div>
            ))}
            {ings.length === 0 && <div className="slot" style={{ minWidth: 220 }}><span className="muted small">Click items in your stores to add them.</span></div>}
          </div>
          {preview && !preview.ok && <p className="red small">{preview.error}</p>}
          {preview && preview.ok && (
            <div style={{ marginTop: 10 }}>
              <div className="slot-label">Predicted result{preview.components.length > 1 ? 's' : ''}</div>
              {preview.components.map((c) => (
                <div key={c.id} style={{ marginBottom: 6 }}>
                  <ComponentDetail c={c} showValue={false} />
                  {!g.lib[c.id] && <div className="gold small">✦ New discovery</div>}
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            {preview?.ok && (
              <span className="small">
                Cost <Money v={preview.cost} />
              </span>
            )}
            <button className="btn primary right" disabled={!ings.length || (preview !== null && !preview.ok && op !== 'mutate')} onClick={invent} data-testid="invent">
              ✦ Invent
            </button>
          </div>
        </Panel>
        {last && (
          <Panel title="Fresh from the crucible" className="glow-in">
            {last.map((c) => (
              <div key={c.id}>
                <ComponentDetail c={c} />
                <div className="slot-label" style={{ marginTop: 6 }}>
                  Ancestry
                </div>
                <Ancestry id={c.id} />
              </div>
            ))}
            <button className="btn arcane" style={{ marginTop: 8 }} onClick={() => document.querySelector<HTMLButtonElement>('[data-testid="forge-tab-lab"]')?.click()}>
              Use it in the Spell Laboratory →
            </button>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ spell lab
type SlotKey = 'essence' | 'mod0' | 'mod1' | 'mod2' | 'catalyst';

function SpellLab() {
  const g = useGame();
  const rev = useStore((s) => s.rev);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const lab = G.labInfo(g);
  const has = (k: string) => g.player.research.includes(k as never);
  const [essence, setEssence] = useState<Ingredient | null>(null);
  const [mods, setMods] = useState<(Ingredient | null)[]>([null, null, null]);
  const [catalyst, setCatalyst] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<Form>('bolt');
  const [delivery, setDelivery] = useState<Delivery>('projectile');
  const [behavior, setBehavior] = useState<Behavior>('direct');
  const [trigger, setTrigger] = useState<Trigger>('onCast');
  const [conditional, setConditional] = useState<Conditional>('none');
  const [active, setActive] = useState<SlotKey>('essence');
  const [name, setName] = useState('');
  const [testOpp, setTestOpp] = useState('');
  const [justForged, setJustForged] = useState<string | null>(null);

  const dels = validDeliveries(form);
  const behs = validBehaviors(form, dels.includes(delivery) ? delivery : dels[0]);
  const recipe: SpellRecipe | null = essence
    ? {
        essence,
        form,
        delivery: dels.includes(delivery) ? delivery : dels[0],
        behavior: behs.includes(behavior) ? behavior : behs[0],
        modifiers: mods.slice(0, lab.modifiers).filter((m): m is Ingredient => !!m),
        catalyst: lab.catalyst && catalyst ? catalyst : undefined,
        trigger,
        conditional,
        evolution: [],
      }
    : null;
  const pv = useMemo(() => (recipe ? G.previewSpell(g, recipe, name || undefined) : null), [JSON.stringify(recipe), name, g.player.money, rev]);

  const pick = (i: Ingredient) => {
    setJustForged(null);
    if (active === 'essence') setEssence(i);
    else if (active === 'catalyst') setCatalyst(i);
    else {
      const k = Number(active.slice(3));
      const next = mods.slice();
      next[k] = i;
      setMods(next);
    }
    const order: SlotKey[] = ['essence', 'mod0', 'mod1', 'mod2'];
    const idx = order.indexOf(active);
    if (idx >= 0 && idx + 1 <= lab.modifiers) setActive(order[idx + 1]);
  };

  const opponents = useMemo(() => G.listOpponents(g), [g.clock.hour, g.player.tier]);
  const test = useMemo(() => {
    if (!pv?.ok || !testOpp || !g.npcs[testOpp]) return null;
    const base = playerSpec(g);
    const opp = compileSpec(npcSpec(g.npcs[testOpp]), g.lib);
    const before = estimateWinProbability(compileSpec(base, g.lib), opp, 14, 5);
    const slots = G.labInfo(g) && base.spells.length;
    const withSpell = { ...base, spells: [...base.spells] };
    const cap = g.player.upgrades.spellbook + 2;
    if (slots >= cap) withSpell.spells[withSpell.spells.length - 1] = { recipe: recipe!, name: pv.spell.name };
    else withSpell.spells.push({ recipe: recipe!, name: pv.spell.name });
    const after = estimateWinProbability(compileSpec(withSpell, g.lib), opp, 14, 5);
    return { before, after, replaced: slots >= cap };
  }, [pv?.ok && pv.spell.recipeId, testOpp]);

  const forge = () => {
    if (!recipe) return;
    const r = act((s) => G.forgeSpell(s, recipe, name || undefined));
    if (r && r.ok) {
      sfx.discovery();
      toast(r.discovery ? `✦ New spell discovered: ${r.entry.name}!` : `Forged ${r.entry.name}.`, 'discovery');
      setJustForged(r.entry.name);
      setEssence(null);
      setMods([null, null, null]);
      setCatalyst(null);
      setName('');
    }
  };

  const combos = theoreticalCombinations(g.player.knownComponents.length + 40, lab.modifiers, g.player.research.filter((r) => r.startsWith('cond:')).length, g.player.research.filter((r) => r.startsWith('trigger:')).length);

  const SlotView = ({ k, label, ing, clear }: { k: SlotKey; label: string; ing: Ingredient | null; clear: () => void }) => (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div className="slot-label">{label}</div>
      <div className={`slot ${ing ? 'filled' : ''} ${active === k ? 'active' : ''}`} onClick={() => setActive(k)} data-testid={`slot-${k}`}>
        {ing ? (
          <>
            <IngredientIcon ing={ing} lib={g.lib} />
            <span className="small grow">{ingredientName(ing, g.lib)}</span>
            <button className="btn small ghost" onClick={(e) => (e.stopPropagation(), clear())}>
              ✕
            </button>
          </>
        ) : (
          <span className="muted small">{active === k ? 'Pick from your stores…' : 'Empty'}</span>
        )}
      </div>
    </div>
  );

  const opt = <T extends string>(list: readonly T[], value: T, set: (v: T) => void, info: Record<string, { name: string; desc: string }>, prefix: string, valid?: readonly T[]) => (
    <div className="row wrap" style={{ gap: 4 }}>
      {list.map((k) => {
        const locked = !has(`${prefix}:${k}`);
        const invalid = valid && !valid.includes(k);
        return (
          <button key={k} className={`btn small ${value === k ? 'primary' : ''}`} disabled={locked || invalid} title={locked ? `Research required: ${info[k].name}` : info[k].desc} onClick={() => set(k)}>
            {locked ? '🔒 ' : ''}
            {info[k].name}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid cols-main-side">
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Spell Laboratory" right={<span className="tiny muted">≈ {combos.toExponential(2)} theoretical recipes with your current knowledge</span>}>
          <div className="row wrap" style={{ alignItems: 'flex-start' }}>
            <SlotView k="essence" label="Essence (element & potency)" ing={essence} clear={() => setEssence(null)} />
            {Array.from({ length: lab.modifiers }, (_, i) => (
              <SlotView key={i} k={`mod${i}` as SlotKey} label={`Modifier ${i + 1}`} ing={mods[i]} clear={() => setMods(mods.map((m, j) => (j === i ? null : m)))} />
            ))}
            {lab.catalyst && <SlotView k="catalyst" label="Catalyst" ing={catalyst} clear={() => setCatalyst(null)} />}
          </div>
          <div className="col" style={{ marginTop: 12, gap: 10 }}>
            <div>
              <div className="slot-label">Form — geometry</div>
              {opt(Object.keys(FORM_INFO) as Form[], form, setForm, FORM_INFO as never, 'form')}
            </div>
            <div>
              <div className="slot-label">Delivery</div>
              {opt(Object.keys(DELIVERY_INFO) as Delivery[], dels.includes(delivery) ? delivery : dels[0], setDelivery, DELIVERY_INFO, 'delivery', dels)}
            </div>
            <div>
              <div className="slot-label">Behavior — motion</div>
              {opt(Object.keys(BEHAVIOR_INFO) as Behavior[], behs.includes(behavior) ? behavior : behs[0], setBehavior, BEHAVIOR_INFO, 'behavior', behs)}
            </div>
            <div className="grid cols-2">
              <div>
                <div className="slot-label">Conditional effect</div>
                {opt(Object.keys(CONDITIONAL_INFO) as Conditional[], conditional, setConditional, CONDITIONAL_INFO, 'cond')}
              </div>
              <div>
                <div className="slot-label">Trigger</div>
                {opt(Object.keys(TRIGGER_INFO) as Trigger[], trigger, setTrigger, TRIGGER_INFO, 'trigger')}
              </div>
            </div>
          </div>
        </Panel>
        <Panel title={`Stores — filling: ${active === 'essence' ? 'Essence' : active === 'catalyst' ? 'Catalyst' : `Modifier ${Number(active.slice(3)) + 1}`}`}>
          <Inventory onPick={pick} />
        </Panel>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Compiled spell">
          {!recipe && <p className="muted small">Choose an essence to begin. Components you invented make the most interesting essences and modifiers.</p>}
          {pv && !pv.ok && (
            <ul className="red small">
              {pv.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {pv && pv.ok && (
            <>
              <SpellCard spell={pv.spell} />
              <div className="tiny muted" style={{ marginTop: 6 }}>
                Recipe {pv.spell.recipeId} · mechanic {pv.spell.mechanicId} · complexity {pv.spell.complexity}/{lab.complexity}
                {g.player.spells.some((s) => compileCached(s.recipe, g.lib)?.mechanicId === pv.spell.mechanicId) && <span className="violet"> · mechanically equivalent to a spell you know</span>}
              </div>
              {pv.locked.length > 0 && <p className="red small">Locked: {pv.locked.join(', ')}</p>}
              {pv.missing.length > 0 && <p className="red small">Missing: {pv.missing.join(', ')}</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <input type="text" placeholder={pv.spell.name} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} maxLength={40} />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="small">
                  Forging cost <Money v={pv.cost} /> (consumes ingredients)
                </span>
                <button className="btn primary right" disabled={pv.locked.length > 0 || pv.missing.length > 0 || g.player.money < pv.cost} onClick={forge} data-testid="forge-spell">
                  ✦ Forge Spell
                </button>
              </div>
            </>
          )}
          {justForged && (
            <div className="subpanel glow-in" style={{ marginTop: 10 }}>
              <div className="gold">✦ {justForged} has been inscribed into your archive.</div>
              <div className="small muted">It was added to your spellbook if a slot was free. Arrange your spellbook on the WIZARD screen.</div>
            </div>
          )}
        </Panel>
        {pv?.ok && (
          <Panel title="Counter-testing">
            <p className="small muted" style={{ marginTop: 0 }}>
              Simulate your build with this spell against an opponent before forging.
            </p>
            <select value={testOpp} onChange={(e) => setTestOpp(e.target.value)} style={{ width: '100%' }}>
              <option value="">Choose an opponent…</option>
              {opponents.map((o) => (
                <option key={o.npc.id} value={o.npc.id}>
                  {o.npc.name} ({o.tag}, {o.npc.rating})
                </option>
              ))}
              {G.promotionStatus(g).guardianId && <option value={G.promotionStatus(g).guardianId}>Guardian: {G.promotionStatus(g).guardian.name}</option>}
            </select>
            {testOpp && !g.npcs[testOpp] && <p className="small muted">The guardian has not appeared yet.</p>}
            {test && (
              <div className="small" style={{ marginTop: 8 }}>
                Current build: <b>{Math.round(test.before * 100)}%</b> → with this spell{test.replaced ? ' (replacing your last slot)' : ''}: <b className={test.after > test.before ? 'green' : 'red'}>{Math.round(test.after * 100)}%</b>
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ research
function Research() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  const nextLab = LAB_LEVELS[p.upgrades.lab + 1];
  return (
    <div className="grid cols-main-side">
      <Panel title="Research">
        <p className="small muted" style={{ marginTop: 0 }}>
          Unlock new grammar for your spells. Some research is restricted to higher ranks.
        </p>
        <div className="grid cols-2" style={{ gap: 6 }}>
          {RESEARCH.map((r) => {
            const done = p.research.includes(r.key);
            const locked = p.tier < r.tier;
            return (
              <div key={r.key} className="item">
                <div className="grow small">
                  <div className={done ? 'green' : ''}>{r.name}</div>
                  <div className="tiny muted">{locked ? `Requires ${tierName(r.tier)}` : done ? 'Researched' : ''}</div>
                </div>
                {!done && (
                  <button className="btn small" disabled={locked || p.money < r.cost} onClick={() => act((s) => G.doResearch(s, r.key), `Researched ${r.name}`)} data-testid={`research-${r.key}`}>
                    ${r.cost}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Laboratory">
        {LAB_LEVELS.map((l) => (
          <div key={l.level} className={`item ${p.upgrades.lab === l.level ? 'selected' : ''}`} style={{ marginBottom: 6 }}>
            <div className="grow small">
              <div className={p.upgrades.lab >= l.level ? 'gold' : ''}>
                {l.level}. {l.name}
              </div>
              <div className="tiny muted">
                Depth {l.maxGeneration} · {l.modifiers} modifier{l.modifiers > 1 ? 's' : ''} · {l.catalyst ? 'catalyst' : 'no catalyst'} · complexity {l.complexity} · ops: {Object.entries(OP_INFO).filter(([, o]) => o.minLab <= l.level).map(([, o]) => o.name).join(', ')}
              </div>
            </div>
            {nextLab && nextLab.level === l.level && (
              <button className="btn small primary" disabled={p.money < l.cost || p.tier < l.tier} onClick={() => act((s) => G.upgradeLab(s), `Laboratory upgraded: ${l.name}`)}>
                {p.tier < l.tier ? tierName(l.tier) : `$${l.cost}`}
              </button>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------ archive
function Archive() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'power' | 'date' | 'name' | 'mastery'>('date');
  const [favOnly, setFavOnly] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<'spells' | 'components'>('spells');
  const list = p.spells
    .map((e) => ({ e, s: compileCached(e.recipe, g.lib, e.name) }))
    .filter((x) => x.s && (!favOnly || x.e.favorite) && (x.e.name + x.s.element + x.s.form + x.s.tags.join()).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'power' ? b.s!.power - a.s!.power : sort === 'name' ? a.e.name.localeCompare(b.e.name) : sort === 'mastery' ? b.e.mastery - a.e.mastery : b.e.createdDay - a.e.createdDay));
  const selected = p.spells.find((x) => x.id === sel) ?? list[0]?.e;
  const sc = selected ? compileCached(selected.recipe, g.lib, selected.name) : null;
  const [rename, setRename] = useState('');
  const comps = p.knownComponents.map((id) => g.lib[id]).filter(Boolean);
  const [selC, setSelC] = useState<string | null>(null);
  const cSel = g.lib[selC ?? comps[0]?.id ?? ''];

  return (
    <>
      <div className="tabs">
        <button className={view === 'spells' ? 'active' : ''} onClick={() => setView('spells')}>
          Spells ({p.spells.length})
        </button>
        <button className={view === 'components' ? 'active' : ''} onClick={() => setView('components')}>
          Components ({comps.length})
        </button>
      </div>
      {view === 'spells' ? (
        <div className="grid cols-side-main">
          <Panel title="Spell archive">
            <div className="row wrap" style={{ marginBottom: 8 }}>
              <input type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
              <select value={sort} onChange={(e) => setSort(e.target.value as never)}>
                <option value="date">Newest</option>
                <option value="power">Power</option>
                <option value="mastery">Mastery</option>
                <option value="name">Name</option>
              </select>
              <label className="small row">
                <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />★
              </label>
            </div>
            <div className="list">
              {list.map(({ e, s }) => (
                <div key={e.id} className={`item clickable ${selected?.id === e.id ? 'selected' : ''}`} onClick={() => setSel(e.id)}>
                  <ElIcon el={s!.element} />
                  <div className="grow">
                    <div className="title small">
                      {e.favorite ? '★ ' : ''}
                      {e.name}
                    </div>
                    <div className="tiny muted">
                      power {Math.round(s!.power)} · mastery {e.mastery} · {e.wins}W/{e.losses}L {e.retired ? '· retired' : p.spellbook.includes(e.id) ? '· equipped' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          {selected && sc && (
            <Panel title={selected.name} right={<button className="btn small" onClick={() => act((s) => G.toggleFavorite(s, selected.id))}>{selected.favorite ? '★ Favorite' : '☆ Favorite'}</button>}>
              <SpellCard spell={sc} />
              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <div className="subpanel">
                  <h3>Record</h3>
                  <div className="small">
                    Forged day {selected.createdDay}
                    {selected.firstOfMechanic ? ' · original discovery' : ''}
                    <br />
                    Mastery {selected.mastery} casts · {selected.wins} wins / {selected.losses} losses · {selected.damage} lifetime damage
                  </div>
                  <h3 style={{ marginTop: 10 }}>Recipe</h3>
                  <div className="small col" style={{ gap: 3 }}>
                    <span>Essence: {ingredientName(selected.recipe.essence, g.lib)}</span>
                    {selected.recipe.modifiers.map((m, i) => (
                      <span key={i}>Modifier: {ingredientName(m, g.lib)}</span>
                    ))}
                    {selected.recipe.catalyst && <span>Catalyst: {ingredientName(selected.recipe.catalyst, g.lib)}</span>}
                    <span className="muted">
                      {FORM_INFO[selected.recipe.form].name} · {DELIVERY_INFO[selected.recipe.delivery].name} · {BEHAVIOR_INFO[selected.recipe.behavior].name}
                    </span>
                  </div>
                  {selected.recipe.essence.kind === 'component' && (
                    <>
                      <h3 style={{ marginTop: 10 }}>Component ancestry</h3>
                      <Ancestry id={selected.recipe.essence.id} />
                    </>
                  )}
                  <div className="row wrap" style={{ marginTop: 10 }}>
                    <input type="text" placeholder="Rename…" value={rename} onChange={(e) => setRename(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn small" disabled={!rename.trim()} onClick={() => (act((s) => G.renameSpell(s, selected.id, rename)), setRename(''))}>
                      Rename
                    </button>
                  </div>
                  <div className="row wrap" style={{ marginTop: 8 }}>
                    {selected.retired ? (
                      <button className="btn small" onClick={() => act((s) => G.forgeSpell(s, selected.recipe, selected.name), 'Rebuilt from the archive.')}>
                        Rebuild (needs ingredients)
                      </button>
                    ) : (
                      <button className="btn small danger" onClick={() => act((s) => G.retireSpell(s, selected.id), 'Spell retired to the archive.')}>
                        Retire
                      </button>
                    )}
                  </div>
                </div>
                <div className="subpanel">
                  <h3>Evolution</h3>
                  <p className="tiny muted" style={{ marginTop: 0 }}>
                    Specialise this spell. One choice per tier; each has a trade-off. Mastery is earned by casting it in duels.
                  </p>
                  {[1, 2, 3].map((tier) => (
                    <div key={tier} style={{ marginBottom: 8 }}>
                      <div className="slot-label">Tier {tier}</div>
                      <div className="col" style={{ gap: 4 }}>
                        {EVOLUTION.filter((n) => n.tier === tier).map((n) => {
                          const chosen = selected.recipe.evolution.includes(n.id);
                          const tierTaken = selected.recipe.evolution.some((x) => EVOLUTION.find((e) => e.id === x)?.tier === tier);
                          return (
                            <div key={n.id} className={`item ${chosen ? 'selected' : ''}`} style={{ padding: '4px 8px' }}>
                              <div className="grow tiny">
                                <b className={chosen ? 'gold' : ''}>{n.name}</b> — {n.desc}
                                <div className="muted">
                                  mastery {n.mastery} · ${n.cost}
                                </div>
                              </div>
                              {!tierTaken && (
                                <button className="btn small" disabled={selected.mastery < n.mastery || p.money < n.cost} onClick={() => act((s) => G.evolveSpell(s, selected.id, n.id), `${selected.name} evolved: ${n.name}`)}>
                                  Evolve
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}
        </div>
      ) : (
        <div className="grid cols-side-main">
          <Panel title="Invented components">
            <div className="list">
              {comps.length === 0 && <div className="muted small">Nothing invented yet.</div>}
              {comps.map((c) => (
                <div key={c.id} className={`item clickable ${cSel?.id === c.id ? 'selected' : ''}`} onClick={() => setSelC(c.id)}>
                  <CompIcon el={c.element} sec={c.secondary} gen={c.generation} />
                  <div className="grow">
                    <div className="title small">{c.name}</div>
                    <div className="tiny muted">
                      gen {c.generation} · owned {p.components[c.id] ?? 0} · {c.traits.map((t) => t.trait).join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          {cSel && (
            <Panel title={cSel.name}>
              <ComponentDetail c={cSel} />
              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <div className="subpanel">
                  <h3>Ancestry</h3>
                  <Ancestry id={cSel.id} />
                </div>
                <div className="subpanel">
                  <h3>Raw materials to rebuild</h3>
                  <div className="col small">
                    {Object.entries(rawMaterialsFor(cSel.id, g.lib)).map(([m, n]) => (
                      <span key={m} className="row">
                        <MatIcon id={m} size={2} /> {n}× {MATERIAL_MAP[m]?.name} <span className="muted">(own {p.materials[m] ?? 0})</span>
                      </span>
                    ))}
                  </div>
                  <button className="btn small" style={{ marginTop: 8 }} disabled={(p.components[cSel.id] ?? 0) < 1} onClick={() => act((s) => G.sellComponent(s, cSel.id), 'Component sold.')}>
                    Sell one for ${componentValue(g.market, cSel.id, g.lib)}
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
