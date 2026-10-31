import { useMemo, useState } from 'react';
import { useGame, useStore } from '../../state/store';
import * as G from '../../sim/game';
import { compileSpec, npcSpec, playerSpec } from '../../sim/world';
import { estimateWinProbability, simulateDuel, CONDITION_LABEL, ACTION_LABEL } from '../../sim/combat';
import { oddsFromProb, validateStake } from '../../sim/economy';
import { PERSONALITY_INFO } from '../../sim/names';
import { rankLabel, tierName } from '../../sim/hierarchy';
import { MATERIAL_MAP } from '../../sim/data/materials';
import { ElIcon, EquipIcon, Money, Panel, Portrait, SpellCard, perkText } from '../components/common';
import type { DuelSetup, NpcState } from '../../sim/state';
import { EQUIP_MAP } from '../../sim/data/equipment';

export function openDuelArena(pkg: G.DuelPackage, title: string, instant = false) {
  useStore.getState().setArena({ setup: pkg.setup, result: pkg.result, outcome: pkg.outcome, title, playerSide: 0, instant });
}

export function replaySetup(setup: DuelSetup, title: string, playerSide: 0 | null = 0) {
  const g = useStore.getState().game!;
  const result = simulateDuel(compileSpec(setup.a, g.lib), compileSpec(setup.b, g.lib), setup.seed);
  useStore.getState().setArena({ setup, result, title, playerSide });
}

export function DuelScreen() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const opponents = useMemo(() => G.listOpponents(g), [g, g.clock.hour, g.player.rating, g.player.tier]);
  const [sel, setSel] = useState<string | null>(null);
  const [stake, setStake] = useState(0);
  const [instant, setInstant] = useState(false);
  const selected = sel ? g.npcs[sel] : opponents[0]?.npc;
  const p = g.player;

  const fight = (id: string, context: 'duel' | 'practice' = 'duel') => {
    const r = act((s) => G.fightDuel(s, id, context, { stake: stake > 0 ? stake : undefined }));
    if (r && r.ok) {
      setStake(0);
      openDuelArena(r, `${context === 'practice' ? 'Sparring' : 'Duel'} vs ${g.npcs[id].name}`, instant);
    }
  };

  return (
    <div className="screen-inner">
      <div className="screen-title">
        <h1>DUEL</h1>
        <p>Scout an opponent, prepare your build, and watch your magic decide the fight.</p>
      </div>
      <div className="grid cols-side-main">
        <Panel title="Opponents" right={<span className="muted small">{tierName(p.tier)} circuit</span>}>
          <div className="list">
            {opponents.map(({ npc, tag }) => (
              <div key={npc.id} className={`item clickable ${selected?.id === npc.id ? 'selected' : ''}`} onClick={() => setSel(npc.id)} data-testid={`opp-${tag}`}>
                <Portrait look={npc.look} size={46} flip />
                <div className="grow">
                  <div className="title">{npc.name}</div>
                  <div className="small muted row" style={{ gap: 4 }}>
                    <ElIcon el={npc.element} size={1} />
                    <ElIcon el={npc.element2} size={1} />
                    {rankLabel(npc.tier, 0).split(' ')[0]} · <span className="blue num">{npc.rating}</span> · {npc.wins}W/{npc.losses}L
                  </div>
                </div>
                <span className={`tag ${tag}`}>{tag}</span>
              </div>
            ))}
          </div>
          <div className="subpanel" style={{ marginTop: 12 }}>
            <h3>Recovery</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              Low on Dollars? Spar safely (no rating change) or tutor first-years.
            </p>
            <div className="row wrap">
              <button className="btn small" onClick={() => fight(G.sparringPartner(g).id, 'practice')}>
                Spar with {G.sparringPartner(g).name.split(' ')[0]}
              </button>
              <button className="btn small" onClick={() => act((s) => G.tutorFirstYears(s), 'Tutored first-years.')} disabled={p.money >= 120}>
                Tutor first-years (+${25 + Math.min(p.tier, 8) * 20})
              </button>
            </div>
          </div>
        </Panel>
        <div className="col" style={{ gap: 14 }}>
          {selected && <Scout npc={selected} />}
          {selected && (
            <Panel title="Prepare & Fight">
              <PrepRow npc={selected} stake={stake} setStake={setStake} />
              <div className="row wrap" style={{ marginTop: 12 }}>
                <label className="row small">
                  <input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} /> Instant simulation
                </label>
                <button className="btn primary big right" data-testid="start-duel" onClick={() => fight(selected.id)}>
                  ⚔ Begin Duel
                </button>
              </div>
            </Panel>
          )}
          <div className="grid cols-2">
            <Contracts />
            <Replays />
          </div>
        </div>
      </div>
    </div>
  );
}

function PrepRow({ npc, stake, setStake }: { npc: NpcState; stake: number; setStake: (n: number) => void }) {
  const g = useGame();
  const p = g.player;
  const mine = useMemo(() => compileSpec(playerSpec(g), g.lib), [g, p.spellbook.join(), p.tactics, p.attrs, p.equipped, p.skills]);
  const prob = useMemo(() => estimateWinProbability(mine, compileSpec(npcSpec(npc), g.lib), 14, 3), [mine, npc, npc.loadout.join(), npc.tactics.length, npc.equipment.join()]);
  const odds = oddsFromProb(prob);
  const err = stake > 0 ? validateStake(g, stake) : null;
  return (
    <div className="grid cols-2">
      <div className="subpanel">
        <div className="row">
          <h3 style={{ margin: 0 }}>Your loadout</h3>
          <button className="btn small right" onClick={() => useStore.getState().setScreen('WIZARD')}>
            Edit spellbook & Grimoire
          </button>
        </div>
        <div className="col small" style={{ marginTop: 8, gap: 4 }}>
          {mine.spells.map((s, i) => (
            <div key={i} className="row">
              <ElIcon el={s.element} size={1} /> {s.name} <span className="muted tiny">({s.tags.join(', ')})</span>
            </div>
          ))}
          <div className="muted tiny" style={{ marginTop: 4 }}>
            Grimoire: {p.tactics.filter((t) => t.enabled).map((t) => `${CONDITION_LABEL[t.condition]} → ${ACTION_LABEL[t.action]}`).join(' | ') || 'no rules'}
          </div>
        </div>
      </div>
      <div className="subpanel">
        <h3>Bookmakers</h3>
        <div className="small">
          Simulated win chance: <b className={prob >= 0.5 ? 'green' : 'red'}>{Math.round(prob * 100)}%</b> · Odds on you: <b className="gold">{odds.toFixed(2)}×</b>
        </div>
        <div className="row small" style={{ marginTop: 6 }}>
          Wager on yourself: $
          <input type="number" min={0} step={5} value={stake} onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={{ width: 90 }} />
          {stake > 0 && !err && (
            <span>
              → payout <Money v={Math.floor(stake * odds)} />
            </span>
          )}
        </div>
        {err && <div className="red small">{err}</div>}
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Your build is locked when the duel begins; the result is settled once, deterministically.
        </div>
      </div>
    </div>
  );
}

function Scout({ npc }: { npc: NpcState }) {
  const g = useGame();
  const w = useMemo(() => compileSpec(npcSpec(npc), g.lib), [npc, npc.loadout.join(), npc.library.length, npc.tactics.length, npc.equipment.join()]);
  const pi = PERSONALITY_INFO[npc.personality];
  return (
    <Panel title={`Scouting: ${npc.name}`} right={npc.titles[0] ? <span className="small gold">{npc.titles[0]}</span> : undefined}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <Portrait look={npc.look} size={120} flip />
        <div className="col grow" style={{ flex: 1 }}>
          <div className="row wrap small">
            <span className="tag">{pi.name}</span>
            <span className="muted">{pi.desc}</span>
          </div>
          <div className="row wrap small">
            Rating <b className="blue num">{npc.rating}</b> · Record {npc.wins}W/{npc.losses}L · Wealth <Money v={npc.wealth} /> · Respect <span className="violet">{npc.respect}</span>
          </div>
          <div className="row wrap small">
            {(['vitality', 'wisdom', 'power', 'agility', 'focus'] as const).map((k) => (
              <span key={k} className="muted">
                {k.slice(0, 3).toUpperCase()} <b className="num" style={{ color: '#f2e6c9' }}>{npc.attrs[k]}</b>
              </span>
            ))}
          </div>
          <div className="row wrap small" style={{ gap: 10 }}>
            {npc.equipment.map((e) => (
              <span key={e} className="row" title={perkText(e)} style={{ gap: 3 }}>
                <EquipIcon defId={e} size={2} /> {EQUIP_MAP[e]?.name}
              </span>
            ))}
          </div>
          {npc.memory.faced > 0 && (
            <div className="small" style={{ color: '#ffb070' }}>
              History with you: {npc.memory.beatPlayer} wins, {npc.memory.lostToPlayer} losses. They remember your {Object.entries(npc.memory.seenTags).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ')} magic.
            </div>
          )}
          {npc.adaptations.slice(0, 2).map((a, i) => (
            <div key={i} className="small" style={{ color: '#ffb070' }}>
              Day {a.day}: {a.text}
            </div>
          ))}
        </div>
      </div>
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        {w.spells.map((s, i) => (
          <SpellCard key={i} spell={s} compact />
        ))}
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Tactics: {w.tactics.map((t, i) => `${i + 1}. ${CONDITION_LABEL[t.condition]} → ${ACTION_LABEL[t.action]}`).join('   ')}
      </div>
    </Panel>
  );
}

function Contracts() {
  const g = useGame();
  const act = useStore((s) => s.act);
  return (
    <Panel title="Contracts">
      <div className="list">
        {g.contracts.length === 0 && <div className="muted small">No contracts right now. New ones arrive each day.</div>}
        {g.contracts.map((c) => (
          <div key={c.id} className="item">
            <div className="grow small">
              <div className={c.done ? 'muted' : ''}>{c.desc}</div>
              <div className="tiny muted">
                Reward <Money v={c.reward} /> · +{c.respect} respect · expires day {c.expiresDay}
              </div>
            </div>
            {c.done ? (
              <span className="green small">Done</span>
            ) : c.kind === 'deliver' ? (
              <button className="btn small" disabled={(g.player.materials[c.target] ?? 0) < c.count} onClick={() => act((s) => G.deliverContract(s, c.id), 'Contract fulfilled!')}>
                Deliver ({g.player.materials[c.target] ?? 0}/{c.count} {MATERIAL_MAP[c.target]?.name.split(' ')[0]})
              </button>
            ) : (
              <span className="tiny muted">auto</span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Replays() {
  const g = useGame();
  return (
    <Panel title="Replays">
      <div className="list">
        {g.replays.length === 0 && <div className="muted small">Your duels will be recorded here.</div>}
        {g.replays.slice(0, 8).map((r) => (
          <div key={r.id} className="item">
            <div className="grow small">
              <div className={r.winner === 0 ? 'green' : 'red'}>{r.summary}</div>
              <div className="tiny muted">
                Day {r.day} · {Math.round(r.duration)}s · {r.rewards?.join(', ')}
              </div>
            </div>
            <button className="btn small" onClick={() => replaySetup(r.setup, `Replay: ${r.summary}`)}>
              ▶
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
