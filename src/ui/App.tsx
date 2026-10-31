import { useEffect, useRef, useState } from 'react';
import { useStore, type Screen } from '../state/store';
import { loadGame } from '../persist/db';
import { createWorld } from '../sim/world';
import { deserialize } from '../sim/save';
import * as G from '../sim/game';
import { elementIcon, wizardDataUrl } from '../art/pixel';
import { Money, Panel, Portrait, RankBadge } from './components/common';
import { DuelScreen, openDuelArena } from './screens/DuelScreen';
import { ForgeScreen } from './screens/ForgeScreen';
import { MarketScreen } from './screens/MarketScreen';
import { AscendScreen } from './screens/AscendScreen';
import { WizardScreen } from './screens/WizardScreen';
import { ArenaView } from './screens/ArenaView';
import type { WizardLook } from '../sim/types';
import { sfx } from '../art/audio';

const NAV: { id: Screen; icon: Parameters<typeof elementIcon>[0] }[] = [
  { id: 'DUEL', icon: 'fire' },
  { id: 'FORGE', icon: 'arcane' },
  { id: 'MARKET', icon: 'chrono' },
  { id: 'ASCEND', icon: 'storm' },
  { id: 'WIZARD', icon: 'life' },
];

export function App() {
  const game = useStore((s) => s.game);
  const [booting, setBooting] = useState(true);
  const [bootMsg, setBootMsg] = useState<string | null>(null);
  const setGame = useStore((s) => s.setGame);
  useEffect(() => {
    loadGame()
      .then((r) => {
        if (r.state) setGame(r.state);
        if (r.error) setBootMsg(r.error);
      })
      .catch((e) => setBootMsg(`Could not open saves: ${e}`))
      .finally(() => setBooting(false));
  }, [setGame]);
  if (booting)
    return (
      <div className="title-screen">
        <div className="title-logo">WIZENED WIZARDS</div>
      </div>
    );
  return (
    <>
      {game ? <Main /> : <Title message={bootMsg} />}
      <Toasts />
    </>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Main() {
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const arena = useStore((s) => s.arena);
  const setArena = useStore((s) => s.setArena);
  const act = useStore((s) => s.act);
  useStore((s) => s.rev);
  const g = useStore.getState().game!;
  const p = g.player;
  const promo = G.promotionStatus(g);
  const saving = useStore((s) => s.saving);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [screen]);
  const rematch =
    arena && arena.outcome && arena.setup.context === 'duel'
      ? () => {
          const id = arena.setup.opponentId;
          setArena(null);
          const r = act((s) => G.fightDuel(s, id, 'duel'));
          if (r && r.ok) openDuelArena(r, `Rematch vs ${g.npcs[id].name}`);
        }
      : undefined;
  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">
          WIZENED WIZARDS<small>THE INFINITE MAGICAL HIERARCHY</small>
        </div>
        <img className="px" src={wizardDataUrl(p.look, 1)} alt="" style={{ height: 34, marginLeft: 8 }} />
        <div className="col" style={{ gap: 0 }}>
          <b>{p.name}</b>
          <span className="tiny muted">{p.activeTitle ?? 'Apprentice of the Academy'}</span>
        </div>
        <RankBadge tier={p.tier} div={p.div} />
        <div className="spacer" />
        <div className="chip money" title="Dollars">
          <span className="v" data-testid="money">
            ${p.money.toLocaleString()}
          </span>
        </div>
        <div className="chip rating" title="Arcane rating">
          <span className="tiny muted">RATING</span>
          <span className="v">{p.rating}</span>
        </div>
        <div className="chip respect" title="Respect">
          <span className="tiny muted">RESPECT</span>
          <span className="v">{p.respect}</span>
        </div>
        <div className="chip" title="World clock">
          <span className="tiny muted">DAY</span>
          <span className="v">{g.clock.day}</span>
        </div>
        <span className="tiny muted" style={{ width: 54 }}>
          {saving ? 'saving…' : 'saved ✓'}
        </span>
      </div>
      <div className="screen" ref={scrollRef}>
        {screen === 'DUEL' && <DuelScreen />}
        {screen === 'FORGE' && <ForgeScreen />}
        {screen === 'MARKET' && <MarketScreen />}
        {screen === 'ASCEND' && <AscendScreen />}
        {screen === 'WIZARD' && <WizardScreen />}
      </div>
      <div className="nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={screen === n.id ? 'active' : ''}
            onClick={() => {
              sfx.click();
              setScreen(n.id);
            }}
            data-testid={`nav-${n.id}`}
          >
            <img className="px" src={elementIcon(n.icon, 2)} alt="" />
            {n.id}
            {n.id === 'ASCEND' && promo.readyForGuardian && <span className="badge">!</span>}
          </button>
        ))}
      </div>
      <Quest />
      {arena && <ArenaView session={arena} onClose={() => setArena(null)} onRematch={rematch} />}
    </div>
  );
}

function Quest() {
  const g = useStore.getState().game!;
  useStore((s) => s.rev);
  const act = useStore((s) => s.act);
  const setScreen = useStore((s) => s.setScreen);
  const [open, setOpen] = useState(false);
  const steps = G.onboarding(g);
  const nextIdx = steps.findIndex((s) => !s.done);
  if (g.onboarding.dismissed || nextIdx === -1) return null;
  const next = steps[nextIdx];
  return (
    <div className="quest">
      <div className="panel parchment">
        <div className="row">
          <b style={{ fontFamily: 'Cinzel' }}>Apprentice's Path</b>
          <span className="tiny" style={{ color: '#7a6040' }}>
            {nextIdx}/{steps.length}
          </span>
          <button className="btn small ghost right" style={{ color: '#5a3a14' }} onClick={() => setOpen(!open)}>
            {open ? 'less' : 'all'}
          </button>
          <button className="btn small ghost" style={{ color: '#5a3a14' }} onClick={() => act((s) => ((s.onboarding.dismissed = true), { ok: true }))}>
            ✕
          </button>
        </div>
        {open ? (
          <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {steps.map((s, i) => (
              <li key={s.id} className={s.done ? 'done' : i === nextIdx ? 'next' : ''} style={i === nextIdx ? { color: '#8a3a10', fontWeight: 600 } : undefined}>
                {s.text}
              </li>
            ))}
          </ol>
        ) : (
          <div style={{ marginTop: 4, color: '#8a3a10', fontWeight: 600, cursor: 'pointer' }} onClick={() => setScreen(next.where as Screen)}>
            ➤ {next.text}
          </div>
        )}
      </div>
    </div>
  );
}

const ROBES = [0x5a2a6e, 0x2a3f6e, 0x7a2a1a, 0x2a5a3a, 0x6e5a22, 0x1f2a44, 0x7a3a5a, 0x3a3a4a];
const TRIMS = [0xd9b44a, 0xc0c0d0, 0xe07a3a, 0x8affc0, 0x7fd8ff, 0xb98cff];
const SKINS = [0xf8e0c8, 0xf2d0b0, 0xe0b090, 0xc08a60, 0x8a5a3a, 0x5a3a2a];
const HAIRS = [0x2a1a10, 0x6a4a2a, 0xc0a060, 0xe0e0e0, 0x8a2a1a, 0x3a3a3a];
const HATS: WizardLook['hat'][] = ['pointed', 'wide', 'hood', 'circlet', 'crown'];
const BEARDS: WizardLook['beard'][] = ['none', 'short', 'long', 'braided'];

function Title({ message }: { message: string | null }) {
  const setGame = useStore((s) => s.setGame);
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState('');
  const [look, setLook] = useState<WizardLook>({ robe: ROBES[0], trim: TRIMS[0], hat: 'pointed', beard: 'none', skin: SKINS[1], hair: HAIRS[0], staff: 0x6a4a2a });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const begin = () => {
    setBusy(true);
    setTimeout(() => {
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const g = createWorld(name || 'Nameless Apprentice', look, seed);
      setGame(g);
      setBusy(false);
    }, 50);
  };
  const sw = (list: number[], key: 'robe' | 'trim' | 'skin' | 'hair') => (
    <div className="swatches">
      {list.map((c) => (
        <div key={c} className={`swatch ${look[key] === c ? 'sel' : ''}`} style={{ background: '#' + c.toString(16).padStart(6, '0') }} onClick={() => setLook({ ...look, [key]: c })} />
      ))}
    </div>
  );
  return (
    <div className="title-screen">
      <div className="title-card">
        <h1 className="title-logo">WIZENED WIZARDS</h1>
        <div className="title-sub">THE INFINITE MAGICAL HIERARCHY</div>
        {message && <div className="panel parchment" style={{ marginBottom: 12 }}>{message}</div>}
        <div className="grid cols-2">
          <Panel title="Enrol a new apprentice">
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <Portrait look={look} size={150} />
              <div className="col" style={{ flex: 1 }}>
                <input type="text" placeholder="Your wizard's name" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} data-testid="name-input" autoFocus />
                <div className="slot-label">Robe</div>
                {sw(ROBES, 'robe')}
                <div className="slot-label">Trim</div>
                {sw(TRIMS, 'trim')}
                <div className="slot-label">Skin & hair</div>
                {sw(SKINS, 'skin')}
                {sw(HAIRS, 'hair')}
                <div className="row wrap">
                  <select value={look.hat} onChange={(e) => setLook({ ...look, hat: e.target.value as WizardLook['hat'] })}>
                    {HATS.map((h) => (
                      <option key={h} value={h}>
                        {h} hat
                      </option>
                    ))}
                  </select>
                  <select value={look.beard} onChange={(e) => setLook({ ...look, beard: e.target.value as WizardLook['beard'] })}>
                    {BEARDS.map((b) => (
                      <option key={b} value={b}>
                        {b === 'none' ? 'no beard' : `${b} beard`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button className="btn primary big" style={{ width: '100%', marginTop: 14 }} disabled={busy} onClick={begin} data-testid="begin">
              {busy ? 'Summoning the Academy…' : 'Begin your apprenticeship'}
            </button>
          </Panel>
          <Panel title="The Academy awaits" className="parchment">
            <p>
              You arrive with <b>$250</b>, a crooked twig wand, a patched robe and a single spell. Nobody knows your name.
            </p>
            <p>
              Duel. Collect strange materials. <b>Invent</b> magical components in the crucible and <b>forge spells</b> nobody has ever cast. Write a Tactical Grimoire, study the wizards who beat you, and come back with the perfect counter.
            </p>
            <p>Climb from the Cellar Circle to the Hall of the Ancients — and beyond, into the Endless Ascent.</p>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Import a save file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = deserialize(await f.text());
                  if (!r.ok) toast(r.error, 'error');
                  else setGame(r.state);
                }}
              />
            </div>
            <p className="tiny muted">Runs entirely offline. Progress is saved automatically in this browser.</p>
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              {(['fire', 'frost', 'storm', 'shadow', 'venom', 'arcane', 'earth', 'chrono', 'life'] as const).map((e) => (
                <img key={e} className="px" src={elementIcon(e, 2)} alt={e} />
              ))}
            </div>
          </Panel>
        </div>
        <p className="center tiny muted" style={{ marginTop: 14 }}>
          <Money v={0} className="tiny" /> real money is ever involved — all Dollars and wagers are fictional.
        </p>
      </div>
    </div>
  );
}
