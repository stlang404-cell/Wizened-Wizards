// Dynamic marketplace: supply/demand pricing, NPC activity, events, price history.
import { EQUIPMENT, EQUIP_MAP } from './data/equipment';
import { MATERIALS, MATERIAL_MAP, ELEMENT_INFO } from './data/materials';
import { rawMaterialsFor, type ComponentLib } from './genetics';
import { Rng, clamp, hashString } from './rng';
import type { MarketState } from './state';
import type { Element } from './types';
import { ELEMENTS } from './types';

export const SELL_RATIO = 0.62;
export const IMPACT = 0.035;

export function createMarket(seed: number): MarketState {
  const items: MarketState['items'] = {};
  for (const m of MATERIALS) items[m.id] = { price: m.basePrice, base: m.basePrice, demand: 1, history: [m.basePrice] };
  for (const e of EQUIPMENT) if (e.price > 0) items[e.id] = { price: e.price, base: e.price, demand: 1, history: [e.price] };
  const st: MarketState = { items, componentSales: {}, event: null, lastDay: 0 };
  void seed;
  return st;
}

const EVENTS = [
  { name: 'Storm Season', desc: 'Storm materials are in high demand.', mult: 1.35 },
  { name: 'Frost Fair', desc: 'Frost goods flood the market.', mult: 0.75 },
  { name: 'Alchemists Strike', desc: 'Scarcity drives prices up.', mult: 1.3 },
  { name: 'Harvest Glut', desc: 'An abundant harvest lowers prices.', mult: 0.78 },
  { name: 'Tournament Fever', desc: 'Duelists are buying up supplies.', mult: 1.25 },
];

/** Advance the market by whole days: mean reversion, NPC trading noise and events. */
export function advanceMarket(m: MarketState, toDay: number, seed: number) {
  while (m.lastDay < toDay) {
    m.lastDay++;
    const rng = new Rng(hashString(`market|${seed}|${m.lastDay}`));
    if (m.event && m.event.untilDay < m.lastDay) m.event = null;
    if (!m.event && rng.chance(0.18)) {
      const e = rng.pick(EVENTS);
      const el = rng.pick(ELEMENTS);
      m.event = { name: `${e.name} (${ELEMENT_INFO[el].name})`, desc: e.desc, element: el, mult: e.mult, untilDay: m.lastDay + rng.int(2, 4) };
    }
    for (const [id, it] of Object.entries(m.items)) {
      // NPC market activity: random buying/selling pressure
      const noise = rng.range(-0.06, 0.06);
      it.demand = clamp(1 + (it.demand - 1) * 0.82 + noise, 0.55, 2.2);
      const el = (MATERIAL_MAP[id]?.element ?? EQUIP_MAP[id]?.affinity) as Element | undefined;
      const ev = m.event && el === m.event.element ? m.event.mult : 1;
      it.price = Math.max(1, Math.round(it.base * it.demand * ev));
      it.history.push(it.price);
      if (it.history.length > 30) it.history.shift();
    }
    for (const k of Object.keys(m.componentSales)) {
      m.componentSales[k] *= 0.8;
      if (m.componentSales[k] < 0.2) delete m.componentSales[k];
    }
  }
}

export function buyPrice(m: MarketState, id: string, discount = 0): number {
  const it = m.items[id];
  if (!it) return Infinity;
  return Math.max(1, Math.round(it.price * (1 - discount)));
}

export function sellPrice(m: MarketState, id: string): number {
  const it = m.items[id];
  if (!it) return 0;
  return Math.max(1, Math.floor(it.price * SELL_RATIO));
}

export function applyBuy(m: MarketState, id: string, qty: number) {
  const it = m.items[id];
  if (!it) return;
  it.demand = clamp(it.demand * Math.pow(1 + IMPACT, qty), 0.55, 2.2);
  it.price = Math.max(1, Math.round(it.base * it.demand));
}

export function applySell(m: MarketState, id: string, qty: number) {
  const it = m.items[id];
  if (!it) return;
  it.demand = clamp(it.demand * Math.pow(1 - IMPACT, qty), 0.55, 2.2);
  it.price = Math.max(1, Math.round(it.base * it.demand));
}

/** Value of an invented component: based on its raw materials and quality, saturates per design. */
export function componentValue(m: MarketState, id: string, lib: ComponentLib): number {
  const c = lib[id];
  if (!c) return 0;
  const raw = rawMaterialsFor(id, lib);
  let base = 0;
  for (const [mid, n] of Object.entries(raw)) base += (MATERIAL_MAP[mid]?.basePrice ?? 10) * n;
  const quality = (c.props.potency + c.props.purity + c.props.resonance + c.props.stability) / 260;
  const traitBonus = c.traits.reduce((s, t) => s + t.mag, 0) * 0.08;
  const value = base * (0.75 + quality * 0.35 + traitBonus) * (1 + c.rarity * 0.08) * (1 + 0.15 * c.generation);
  const sat = m.componentSales[id] ?? 0;
  return Math.max(1, Math.floor(value * SELL_RATIO * Math.pow(0.85, sat)));
}

export function recordComponentSale(m: MarketState, id: string) {
  m.componentSales[id] = (m.componentSales[id] ?? 0) + 1;
}
