import { useMemo, useState } from 'react';
import { useGame, useStore } from '../../state/store';
import * as G from '../../sim/game';
import { NAMED_TIERS, RESPECT_PRIVILEGES, TIERS, divisionThreshold, promotionRequirements, rankLabel, societyName, tierBaseRating, tierColor, tierName } from '../../sim/hierarchy';
import { compileSpec, npcSpec, playerSpec, wizardName, wizardRating, npcsInTier } from '../../sim/world';
import { estimateWinProbability } from '../../sim/combat';
import { TOURNAMENT_KINDS, playerMatch } from '../../sim/tournament';
import { PERSONALITY_INFO } from '../../sim/names';
import { Bar, ElIcon, Money, Panel, Portrait, SpellCard } from '../components/common';
import { openDuelArena } from './DuelScreen';
import type { Tournament } from '../../sim/state';

type Tab = 'promotion' | 'tournaments' | 'rankings' | 'hierarchy' | 'respect' | 'chronicle';

export function AscendScreen() {
  const [tab, setTab] = useState<Tab>('promotion');
  const g = useGame();
  return (
    <div className="screen-inner">
      <div className="screen-title">
        <h1>ASCEND</h1>
        <p>
          {societyName(g.player.tier)} · Season {g.season}
        </p>
      </div>
      <div className="tabs">
        {(
          [
            ['promotion', 'Promotion'],
            ['tournaments', 'Tournaments'],
            ['rankings', 'Rankings'],
            ['hierarchy', 'Hierarchy'],
            ['respect', 'Respect & Titles'],
            ['chronicle', 'Chronicle'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`ascend-tab-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'promotion' && <Promotion />}
      {tab === 'tournaments' && <Tournaments />}
      {tab === 'rankings' && <Rankings />}
      {tab === 'hierarchy' && <Hierarchy />}
      {tab === 'respect' && <Respect />}
      {tab === 'chronicle' && <Chronicle />}
    </div>
  );
}

function Promotion() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const st = G.promotionStatus(g);
  const gd = g.npcs[st.guardianId];
  const info = st.guardian;
  const prob = useMemo(() => (gd ? estimateWinProbability(compileSpec(playerSpec(g), g.lib), compileSpec(npcSpec(gd), g.lib), 16, 11) : null), [gd, g.player.spellbook.join(), g.player.tactics, g.player.attrs, g.player.equipped]);
  const gw = gd ? compileSpec(npcSpec(gd), g.lib) : null;
  const challenge = () => {
    if (!gd) act((s) => (G.ensureGuardian(s, s.player.tier), { ok: true }));
    const r = act((s) => G.fightDuel(s, st.guardianId, 'guardian'));
    if (r && r.ok) openDuelArena(r, `Guardian Trial: ${info.name}`);
  };
  return (
    <div className="grid cols-2">
      <Panel title={`Promotion to ${tierName(g.player.tier + 1)}`}>
        <p className="small muted" style={{ marginTop: 0 }}>
          Promotions are earned, not granted. Meet every requirement, then defeat the rank guardian.
        </p>
        <div className="col">
          {st.items.map((it) => (
            <div key={it.label}>
              <div className="row small">
                <span className={it.met ? 'green' : ''}>
                  {it.met ? '✔' : '○'} {it.label}
                </span>
                <span className="right num">
                  {it.have} / {it.need}
                </span>
              </div>
              <Bar value={it.have - (it.label.startsWith('Arcane') ? tierBaseRating(Math.min(g.player.tier, NAMED_TIERS - 1)) - 100 : 0)} max={it.need - (it.label.startsWith('Arcane') ? tierBaseRating(Math.min(g.player.tier, NAMED_TIERS - 1)) - 100 : 0)} color={it.met ? '#6fd38a' : undefined} />
            </div>
          ))}
          <div className="row small">
            <span className={st.readyForGuardian ? 'gold' : 'muted'}>{st.readyForGuardian ? '✦ Defeat the guardian' : '○ Defeat the guardian (unlocks when the above are met)'}</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          {prob !== null && <span className="small">Simulated chance vs guardian: <b className={prob >= 0.5 ? 'green' : 'red'}>{Math.round(prob * 100)}%</b></span>}
          <button className="btn primary big right" disabled={!st.readyForGuardian} onClick={challenge} data-testid="challenge-guardian">
            Challenge Guardian
          </button>
        </div>
        <p className="tiny muted">Rewards: ${info.reward.money.toLocaleString()}, rare materials{info.reward.equipment ? ', a unique item' : ''}, +2 skill points, respect, and entry into {societyName(g.player.tier + 1)}.</p>
      </Panel>
      <Panel title="Rank Guardian">
        <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
          {gd && <Portrait look={gd.look} size={130} flip />}
          <div className="col small" style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Cinzel', fontSize: 18, color: '#f5d77a' }}>{info.name}</div>
            <div className="muted">{info.title}</div>
            <i>{info.quote}</i>
            <div>
              <b>Style:</b> {info.style}
            </div>
            <div>
              <b>Signature:</b> {info.signature}
            </div>
            <div>
              <b>Strengths:</b> {info.strengths}
            </div>
            <div style={{ color: '#9ad08a' }}>
              <b>Weakness:</b> {info.weakness}
            </div>
            {gd && gd.memory.faced > 0 && (
              <div style={{ color: '#ffb070' }}>
                You have challenged them {gd.memory.faced}× ({gd.memory.lostToPlayer} wins).
              </div>
            )}
          </div>
        </div>
        {gw && (
          <div className="grid cols-2" style={{ marginTop: 10 }}>
            {gw.spells.map((s, i) => (
              <SpellCard key={i} spell={s} compact />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Bracket({ t }: { t: Tournament }) {
  const g = useGame();
  const rounds = t.rounds;
  const totalRounds = Math.log2(t.size);
  return (
    <div className="bracket">
      {Array.from({ length: totalRounds }, (_, r) => (
        <div key={r} className="round">
          <div className="slot-label">{r === totalRounds - 1 ? 'Final' : r === totalRounds - 2 ? 'Semifinals' : `Round ${r + 1}`}</div>
          {(rounds[r] ?? Array.from({ length: t.size / Math.pow(2, r + 1) }, () => null)).map((m, i) => (
            <div key={i} className="m">
              {m ? (
                [m.a, m.b].map((id) => (
                  <div key={id} className={`${m.status === 'done' ? (m.winner === id ? 'w' : 'l') : ''} ${id === 'player' ? 'pl' : ''}`}>
                    <span>{wizardName(g, id)}</span>
                    <span className="muted num">{wizardRating(g, id)}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="muted">—</div>
                  <div className="muted">—</div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      {t.champion && (
        <div className="round">
          <div className="slot-label">Champion</div>
          <div className="m">
            <div className="w">{wizardName(g, t.champion)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tournaments() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const [stake, setStake] = useState(0);
  const mine = g.tournaments.find((t) => t.playerEntered && t.status !== 'finished') ?? g.tournaments.filter((t) => t.playerEntered).slice(-1)[0];
  const list = g.tournaments.filter((t) => t.tier === g.player.tier);
  const pm = mine ? playerMatch(mine) : null;
  const play = () => {
    if (!mine) return;
    const r = act((s) => G.playTournamentMatch(s, mine.id, stake > 0 ? stake : undefined));
    if (r && r.ok) {
      setStake(0);
      openDuelArena(r, `${mine.name}: Round ${mine.round + 1}`);
    }
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      {mine && (
        <Panel title={mine.name} right={<span className="small muted">{TOURNAMENT_KINDS[mine.kind].label} · {mine.size} wizards · prize pool <Money v={mine.prizePool} /></span>}>
          <Bracket t={mine} />
          <div className="row" style={{ marginTop: 12 }}>
            {mine.status === 'finished' ? (
              <span className="gold">Finished — your placement: {mine.playerPlacement === 1 ? 'Champion!' : mine.playerPlacement === 2 ? 'Runner-up' : `Top ${mine.playerPlacement}`}</span>
            ) : pm ? (
              <>
                <span className="small">
                  Your match: vs <b>{wizardName(g, pm.match.a === 'player' ? pm.match.b : pm.match.a)}</b>
                </span>
                <span className="small right">
                  Wager on yourself $<input type="number" value={stake} min={0} onChange={(e) => setStake(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={{ width: 70 }} />
                </span>
                <button className="btn primary" onClick={play} data-testid="play-tournament-match">
                  ⚔ Fight
                </button>
              </>
            ) : (
              <>
                <span className="small muted">You have been eliminated. Watch the rest unfold.</span>
                <button className="btn right" onClick={() => act((s) => G.advanceTournament(s, mine.id))}>
                  Simulate next round
                </button>
              </>
            )}
          </div>
        </Panel>
      )}
      <Panel title="Open tournaments">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tournament</th>
              <th>Field</th>
              <th>Entry</th>
              <th>Prize pool</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.size} wizards</td>
                <td>
                  <Money v={t.entryFee} />
                </td>
                <td>
                  <Money v={t.prizePool} />
                </td>
                <td className="muted">{t.status === 'registration' ? 'Registration open' : t.status === 'running' ? `Round ${t.round + 1}` : `Won by ${wizardName(g, t.champion!)}`}</td>
                <td>
                  {t.status === 'registration' && (
                    <button className="btn small primary" onClick={() => act((s) => G.enterTournament(s, t.id), `Entered ${t.name}!`)} data-testid={`enter-${t.kind}`}>
                      Enter
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted">Reaching the final (top 2) of a tournament at your tier counts toward promotion. Tournaments you skip run on their own each day — bet on them in the Market's Betting Hall.</p>
      </Panel>
      <Panel title="Hall of Champions">
        <div className="list">
          {g.champions.slice(0, 12).map((c, i) => (
            <div key={i} className="item small">
              <span className="muted">Day {c.day}</span>
              <span className="grow">{c.tournament}</span>
              <span className="gold">{c.champion}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Rankings() {
  const g = useGame();
  const [tier, setTier] = useState(g.player.tier);
  const rows = useMemo(() => {
    const list = npcsInTier(g, tier).map((n) => ({ id: n.id, name: n.name, rating: n.rating, w: n.wins, l: n.losses, p: PERSONALITY_INFO[n.personality].name, el: n.element, rival: g.player.rivals.includes(n.id) }));
    if (tier === g.player.tier) list.push({ id: 'player', name: g.player.name, rating: g.player.rating, w: g.player.record.wins, l: g.player.record.losses, p: 'You', el: 'arcane', rival: false });
    return list.sort((a, b) => b.rating - a.rating);
  }, [g, tier, g.clock.hour]);
  const myIdx = rows.findIndex((r) => r.id === 'player');
  const shown = rows.slice(0, 40);
  if (myIdx >= 40) shown.push(rows[myIdx]);
  return (
    <Panel title={`${tierName(tier)} rankings`} right={<select value={tier} onChange={(e) => setTier(Number(e.target.value))}>{Array.from({ length: Math.max(NAMED_TIERS, g.player.tier + 2) }, (_, i) => <option key={i} value={i}>{tierName(i)}</option>)}</select>}>
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Wizard</th>
            <th>Rating</th>
            <th>Record</th>
            <th>Style</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className={r.id === 'player' ? 'me' : ''}>
              <td>{rows.indexOf(r) + 1}</td>
              <td>
                {r.id !== 'player' && <ElIcon el={r.el} size={1} />} {r.name} {r.rival && <span className="tag rival">rival</span>}
              </td>
              <td className="num blue">{r.rating}</td>
              <td>
                {r.w}W / {r.l}L
              </td>
              <td className="muted">{r.p}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Hierarchy() {
  const g = useGame();
  const tiers = Array.from({ length: Math.max(NAMED_TIERS + 1, g.player.tier + 2) }, (_, i) => i);
  return (
    <Panel title="The Infinite Magical Hierarchy">
      <div className="list">
        {tiers
          .slice()
          .reverse()
          .map((t) => {
            const count = npcsInTier(g, t).length + (g.player.tier === t ? 1 : 0);
            const req = promotionRequirements(t);
            return (
              <div key={t} className={`item ${g.player.tier === t ? 'selected' : ''}`}>
                <span className="rank-badge" style={{ color: tierColor(t), borderColor: tierColor(t) }}>
                  <span className="gem" style={{ background: tierColor(t) }} />
                  {tierName(t)}
                </span>
                <div className="grow small">
                  <div>{societyName(t)}</div>
                  <div className="tiny muted">
                    {t < NAMED_TIERS ? `Divisions III/II/I at ${divisionThreshold(t, 0)}/${divisionThreshold(t, 1)}/${divisionThreshold(t, 2)} rating · ` : 'Numbered ascension · '}
                    promotion: {req.rating} rating, {req.qualifyingWins} qualifying wins, {req.componentsInvented} inventions, guardian
                  </div>
                </div>
                <span className="small muted">{count} wizards</span>
                {g.player.tier === t && <span className="gold small">You · {rankLabel(g.player.tier, g.player.div)}</span>}
              </div>
            );
          })}
      </div>
      <p className="tiny muted">After the {TIERS[NAMED_TIERS - 1].name} tier the Endless Ascent begins: numbered ascension circles with ever-smarter guardians. Attribute caps rise very slowly, so victory comes from better builds, counters and tactics.</p>
    </Panel>
  );
}

function Respect() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  return (
    <div className="grid cols-2">
      <Panel title="Respect">
        <div className="row">
          <span className="num violet" style={{ fontSize: 40 }}>
            {p.respect}
          </span>
          <span className="small muted">Earned by beating stronger wizards, winning tournaments, discoveries, promotions and historic upsets. It cannot be bought.</span>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {RESPECT_PRIVILEGES.map((r) => (
            <div key={r.id} className={`item ${p.respect >= r.respect ? 'selected' : ''}`}>
              <div className="grow small">
                <div className={p.respect >= r.respect ? 'gold' : ''}>{r.name}</div>
                <div className="tiny muted">{r.desc}</div>
              </div>
              <span className="small num">{r.respect}</span>
            </div>
          ))}
        </div>
        {p.respect >= 800 && (
          <button className="btn" style={{ marginTop: 8 }} onClick={() => act((s) => G.claimStipend(s), 'Stipend claimed.')}>
            Claim today's stipend
          </button>
        )}
      </Panel>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Titles">
          {p.titles.length === 0 && <div className="small muted">Titles are earned through achievements, tournaments and promotions.</div>}
          <div className="row wrap">
            {p.titles.map((t) => (
              <button key={t} className={`btn small ${p.activeTitle === t ? 'primary' : ''}`} onClick={() => act((s) => ((s.player.activeTitle = s.player.activeTitle === t ? null : t), { ok: true }))}>
                {t}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Rivals">
          {p.rivals.length === 0 && <div className="small muted">Rivalries form when a wizard beats you twice — or you beat them three times.</div>}
          <div className="list">
            {p.rivals.map((id) => {
              const n = g.npcs[id];
              if (!n) return null;
              return (
                <div key={id} className="item">
                  <Portrait look={n.look} size={40} flip />
                  <div className="grow small">
                    <div>{n.name}</div>
                    <div className="tiny muted">
                      {tierName(n.tier)} · {n.rating} · you {n.memory.lostToPlayer}–{n.memory.beatPlayer} them
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Chronicle() {
  const g = useGame();
  return (
    <div className="grid cols-2">
      <Panel title="News from the halls">
        <div className="list">
          {g.news.slice(0, 30).map((n, i) => (
            <div key={i} className="item small">
              <span className="muted">Day {n.day}</span>
              <span className="grow">{n.text}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Champions">
        <div className="list">
          {g.champions.slice(0, 30).map((c, i) => (
            <div key={i} className="item small">
              <span className="muted">Day {c.day}</span>
              <span className="grow">{c.tournament}</span>
              <span className="gold">{c.champion}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
