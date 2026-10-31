import { useState } from 'react';
import { useGame, useStore } from '../../state/store';
import * as G from '../../sim/game';
import { MATERIALS, ELEMENT_INFO } from '../../sim/data/materials';
import { EQUIPMENT, EQUIP_MAP } from '../../sim/data/equipment';
import { buyPrice, sellPrice, componentValue } from '../../sim/market';
import { oddsFromProb } from '../../sim/economy';
import { matchKey } from '../../sim/tournament';
import { wizardName } from '../../sim/world';
import { tierName } from '../../sim/hierarchy';
import { CompIcon, ElIcon, EquipIcon, MatIcon, Money, Panel, Sparkline, perkText, rarityLabel } from '../components/common';
import { replaySetup } from './DuelScreen';
import type { MatchSnapshot } from '../../sim/state';

type Tab = 'materials' | 'equipment' | 'sell' | 'betting' | 'ledger';

export function MarketScreen() {
  const [tab, setTab] = useState<Tab>('materials');
  const g = useGame();
  const ev = g.market.event;
  return (
    <div className="screen-inner">
      <div className="screen-title">
        <h1>MARKET</h1>
        <p>The Midnight Arcade · day {g.clock.day}{G.discount(g) > 0 ? ` · ${Math.round(G.discount(g) * 100)}% respect discount` : ''}</p>
      </div>
      {ev && (
        <div className="panel parchment" style={{ marginBottom: 12, padding: '8px 14px' }}>
          <b>{ev.name}</b> — {ev.desc} (until day {ev.untilDay})
        </div>
      )}
      <div className="tabs">
        {(
          [
            ['materials', 'Materials'],
            ['equipment', 'Equipment'],
            ['sell', 'Sell & Trade'],
            ['betting', 'Betting Hall'],
            ['ledger', 'Ledger'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`market-tab-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'materials' && <Materials />}
      {tab === 'equipment' && <Equipment />}
      {tab === 'sell' && <Sell />}
      {tab === 'betting' && <Betting />}
      {tab === 'ledger' && <Ledger />}
    </div>
  );
}

function Materials() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const [sel, setSel] = useState<string>(MATERIALS[0].id);
  const list = MATERIALS.filter((m) => G.materialAvailable(g, m.id));
  const it = g.market.items[sel];
  const m = MATERIALS.find((x) => x.id === sel)!;
  return (
    <div className="grid cols-main-side">
      <Panel title="Reagents">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Material</th>
              <th>Element</th>
              <th>Rarity</th>
              <th>Price</th>
              <th>Owned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const price = buyPrice(g.market, x.id, G.discount(g));
              const h = g.market.items[x.id].history;
              const trend = h.length > 1 ? h[h.length - 1] - h[h.length - 2] : 0;
              return (
                <tr key={x.id} className="clickable" onClick={() => setSel(x.id)} style={{ outline: sel === x.id ? '1px solid #d9b44a' : undefined }}>
                  <td>
                    <MatIcon id={x.id} size={2} />
                  </td>
                  <td>{x.name}</td>
                  <td>
                    <ElIcon el={x.element} size={1} /> {ELEMENT_INFO[x.element].name}
                  </td>
                  <td>{rarityLabel(x.rarity)}</td>
                  <td>
                    <Money v={price} /> <span className={trend > 0 ? 'red tiny' : trend < 0 ? 'green tiny' : 'tiny muted'}>{trend > 0 ? '▲' : trend < 0 ? '▼' : '–'}</span>
                  </td>
                  <td className="num">{g.player.materials[x.id] ?? 0}</td>
                  <td>
                    <div className="row" style={{ gap: 3 }}>
                      <button className="btn small" onClick={(e) => (e.stopPropagation(), act((s) => G.buyMaterial(s, x.id, 1)))} data-testid={`buy-${x.id}`}>
                        Buy
                      </button>
                      <button className="btn small" onClick={(e) => (e.stopPropagation(), act((s) => G.buyMaterial(s, x.id, 5)))}>
                        ×5
                      </button>
                      <button className="btn small ghost" disabled={!(g.player.materials[x.id] > 0)} onClick={(e) => (e.stopPropagation(), act((s) => G.sellMaterial(s, x.id, 1)))}>
                        Sell ${sellPrice(g.market, x.id)}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Panel title={m.name}>
        <div className="row">
          <MatIcon id={m.id} size={5} />
          <div className="small">
            <div>
              <ElIcon el={m.element} size={1} /> {ELEMENT_INFO[m.element].name} · {rarityLabel(m.rarity)}
            </div>
            <div className="muted">{m.lore}</div>
          </div>
        </div>
        <div className="slot-label" style={{ marginTop: 10 }}>
          Price history (30 days)
        </div>
        <Sparkline data={it.history} w={330} h={90} />
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 10 }}>
          {Object.entries(m.props).map(([k, v]) => (
            <div key={k} className="small">
              <span className="muted">{k}</span> <b className="num">{v}</b>
            </div>
          ))}
        </div>
        <p className="tiny muted">Buying raises demand (and price); selling lowers it. Merchants buy back at {Math.round(62)}% of the current price. NPC traders move prices every day.</p>
      </Panel>
    </div>
  );
}

function Equipment() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const slots = ['wand', 'core', 'robe', 'relic'] as const;
  return (
    <div className="grid cols-2">
      {slots.map((slot) => (
        <Panel key={slot} title={slot[0].toUpperCase() + slot.slice(1) + 's'}>
          <div className="list">
            {EQUIPMENT.filter((e) => e.slot === slot && e.price > 0).map((e) => {
              const avail = G.equipmentAvailable(g, e.id);
              const owned = g.player.ownedEquipment.some((o) => o.defId === e.id);
              const price = buyPrice(g.market, e.id, G.discount(g));
              return (
                <div key={e.id} className="item" style={{ opacity: avail ? 1 : 0.5 }}>
                  <EquipIcon defId={e.id} />
                  <div className="grow">
                    <div className="title small">
                      {e.name} <span className="tiny muted">T{e.tier}</span>
                    </div>
                    <div className="tiny muted">{perkText(e.id)}</div>
                  </div>
                  {owned ? (
                    <span className="tiny green">Owned</span>
                  ) : avail ? (
                    <button className="btn small" disabled={g.player.money < price} onClick={() => act((s) => G.buyEquipment(s, e.id), `Bought ${e.name}. Equip it on the WIZARD screen.`)}>
                      ${price}
                    </button>
                  ) : (
                    <span className="tiny muted">{tierName(Math.max(0, e.tier - 1))}+</span>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Sell() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  const comps = Object.entries(p.components).filter(([, n]) => n > 0);
  const equips = p.ownedEquipment.filter((o) => !Object.values(p.equipped).includes(o.uid) && EQUIP_MAP[o.defId]?.price > 0);
  return (
    <div className="grid cols-2">
      <Panel title="Sell components">
        <p className="small muted" style={{ marginTop: 0 }}>
          Collectors pay for well-crafted inventions. Prices drop as you flood the market with the same design.
        </p>
        <div className="list">
          {comps.length === 0 && <div className="muted small">No components to sell.</div>}
          {comps.map(([id, n]) => {
            const c = g.lib[id];
            return (
              <div key={id} className="item">
                <CompIcon el={c.element} sec={c.secondary} gen={c.generation} />
                <div className="grow small">
                  {c.name} ×{n}
                  <div className="tiny muted">{c.traits.map((t) => t.trait).join(', ')}</div>
                </div>
                <button className="btn small" onClick={() => act((s) => G.sellComponent(s, id))}>
                  Sell ${componentValue(g.market, id, g.lib)}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Sell equipment">
        <div className="list">
          {equips.length === 0 && <div className="muted small">No unequipped items worth selling.</div>}
          {equips.map((o) => (
            <div key={o.uid} className="item">
              <EquipIcon defId={o.defId} />
              <div className="grow small">
                {EQUIP_MAP[o.defId].name} {o.enchant ? `+${o.enchant}` : ''}
              </div>
              <button className="btn small" onClick={() => act((s) => G.sellEquipment(s, o.uid))}>
                Sell
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MatchBet({ k, m, label }: { k: string; m: MatchSnapshot; label: string }) {
  const g = useGame();
  const act = useStore((s) => s.act);
  const [stake, setStake] = useState(20);
  const pa = m.probA ?? 0.5;
  const mine = g.bets.find((b) => b.matchKey === k);
  return (
    <div className="item">
      <div className="grow small">
        <div className="tiny muted">{label}</div>
        <div>
          <b>{wizardName(g, m.a)}</b> <span className="gold">{oddsFromProb(pa).toFixed(2)}×</span> <span className="muted">vs</span> <b>{wizardName(g, m.b)}</b> <span className="gold">{oddsFromProb(1 - pa).toFixed(2)}×</span>
        </div>
        {m.status === 'done' && <div className="tiny green">Winner: {wizardName(g, m.winner!)}</div>}
        {mine && (
          <div className="tiny violet">
            Your bet: ${mine.stake} on {wizardName(g, mine.pick)} @ {mine.odds}× — {mine.status}
            {mine.payout ? ` (+$${mine.payout})` : ''}
          </div>
        )}
      </div>
      {m.status === 'open' && !mine && (
        <div className="row" style={{ gap: 3 }}>
          $<input type="number" value={stake} min={1} onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={{ width: 64 }} />
          <button className="btn small" onClick={() => act((s) => G.betOnMatch(s, k, m.a, stake), 'Bet placed.')}>
            {wizardName(g, m.a).split(' ')[0]}
          </button>
          <button className="btn small" onClick={() => act((s) => G.betOnMatch(s, k, m.b, stake), 'Bet placed.')}>
            {wizardName(g, m.b).split(' ')[0]}
          </button>
        </div>
      )}
    </div>
  );
}

function Betting() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const [stake, setStake] = useState(20);
  const open = g.exhibitions.filter((e) => e.match.status !== 'done');
  const done = g.exhibitions.filter((e) => e.match.status === 'done').slice(-4);
  const running = g.tournaments.filter((t) => t.status !== 'finished');
  return (
    <div className="grid cols-2">
      <Panel title="Exhibition bouts">
        <p className="small muted" style={{ marginTop: 0 }}>
          Odds come from simulating each matchup. Results are fixed by a committed seed and locked builds — they settle exactly once. Fictional Dollars only.
        </p>
        <div className="list">
          {open.map((e) => (
            <div key={e.id}>
              <MatchBet k={`exh:${e.id}`} m={e.match} label={`${tierName(e.tier)} exhibition · resolves hour ${e.hour}`} />
              <button
                className="btn small ghost"
                onClick={() => {
                  const r = act((s) => G.watchExhibition(s, e.id));
                  if (r && r.ok) replaySetup(r.setup, `Exhibition: ${r.setup.a.name} vs ${r.setup.b.name}`, null);
                }}
              >
                ▶ Watch now (settles bets)
              </button>
            </div>
          ))}
          {done.map((e) => (
            <MatchBet key={e.id} k={`exh:${e.id}`} m={e.match} label="Finished" />
          ))}
        </div>
      </Panel>
      <div className="col" style={{ gap: 14 }}>
        {running.map((t) => {
          const outright = G.outrightOdds(g, t);
          const outrightOpen = !t.rounds.some((r) => r.some((m) => m.status === 'done'));
          const myOut = g.bets.find((b) => b.matchKey === `outright:${t.id}`);
          return (
            <Panel key={t.id} title={t.name} right={<span className="tiny muted">{t.status}</span>}>
              {t.status === 'running' &&
                t.rounds[t.round].map((m, i) =>
                  m.a !== 'player' && m.b !== 'player' && m.status === 'open' ? <MatchBet key={i} k={matchKey(t, t.round, i)} m={m} label={`Round ${t.round + 1}`} /> : null,
                )}
              {outrightOpen && (
                <div className="subpanel" style={{ marginTop: 8 }}>
                  <div className="row">
                    <h3 style={{ margin: 0 }}>Outright winner</h3>
                    <span className="right small">
                      Stake $<input type="number" value={stake} onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={{ width: 64 }} />
                    </span>
                  </div>
                  {myOut ? (
                    <div className="small violet">
                      Your bet: ${myOut.stake} on {wizardName(g, myOut.pick)} @ {myOut.odds}× ({myOut.status})
                    </div>
                  ) : (
                    <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                      {t.participants
                        .slice()
                        .sort((a, b) => outright[a] - outright[b])
                        .slice(0, 8)
                        .map((pid) => (
                          <button key={pid} className="btn small" onClick={() => act((s) => G.betOutright(s, t.id, pid, stake), 'Outright bet placed.')}>
                            {wizardName(g, pid).split(' ')[0]} {outright[pid].toFixed(2)}×
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          );
        })}
        <Panel title="Your bets">
          <div className="list">
            {g.bets.length === 0 && <div className="muted small">No bets yet.</div>}
            {g.bets.slice(0, 12).map((b) => (
              <div key={b.id} className="item small">
                <div className="grow">
                  {b.label} <span className="muted">· ${b.stake} @ {b.odds}×</span>
                </div>
                <span className={b.status === 'won' ? 'green' : b.status === 'lost' ? 'red' : 'muted'}>
                  {b.status}
                  {b.payout ? ` +$${b.payout}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Record: {g.player.stats.betsWon} won · {g.player.stats.betsLost} lost
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Ledger() {
  const g = useGame();
  return (
    <Panel title="Ledger">
      <table className="tbl">
        <thead>
          <tr>
            <th>Hour</th>
            <th>Transaction</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {g.ledger.map((l) => (
            <tr key={l.id}>
              <td className="muted">{l.hour}</td>
              <td>{l.reason}</td>
              <td style={{ textAlign: 'right' }} className={l.amount >= 0 ? 'green num' : 'red num'}>
                {l.amount >= 0 ? '+' : ''}
                {l.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
