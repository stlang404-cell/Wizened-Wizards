import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { useStore, type ArenaSession } from '../../state/store';
import { compileSpec } from '../../sim/world';
import { MATERIAL_MAP } from '../../sim/data/materials';
import { CONDITION_LABEL, ACTION_LABEL } from '../../sim/combat';
import { MatIcon, Panel } from '../components/common';
import { sfx } from '../../art/audio';
import type { BattleScene } from '../../phaser/BattleScene';

export function ArenaView({ session, onClose, onRematch }: { session: ArenaSession; onClose: () => void; onRematch?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const game = useStore((s) => s.game)!;

  useEffect(() => {
    let destroyed = false;
    setEnded(false);
    (async () => {
      const mod = await import('../../phaser/BattleScene');
      if (destroyed || !host.current) return;
      const a = compileSpec(session.setup.a, game.lib);
      const b = compileSpec(session.setup.b, game.lib);
      const tier = Math.min(8, session.setup.context === 'guardian' ? game.player.tier : game.npcs[session.setup.opponentId]?.tier ?? game.player.tier);
      gameRef.current = mod.createBattleGame(host.current, {
        result: session.result,
        spells: [a.spells, b.spells],
        names: [a.name, b.name],
        looks: [a.look, b.look],
        tier,
        showDecisions: session.playerSide,
        onEnd: () => {
          setEnded(true);
          if (session.playerSide !== null) (session.result.winner === session.playerSide ? sfx.victory : sfx.defeat)();
        },
      });
      if (session.instant && replayKey === 0) setTimeout(() => (gameRef.current?.scene.getScene('battle') as BattleScene | undefined)?.skipToEnd(), 120);
    })();
    return () => {
      destroyed = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, replayKey]);

  const scene = () => gameRef.current?.scene.getScene('battle') as BattleScene | undefined;
  useEffect(() => {
    scene()?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    scene()?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === 'Escape' && ended) onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ended, onClose]);

  return (
    <div className="arena-wrap">
      <div className="arena-canvas" ref={host}>
        {ended && <Results session={session} onClose={onClose} onRematch={onRematch} onReplay={() => setReplayKey((k) => k + 1)} />}
      </div>
      <div className="arena-controls">
        <span className="muted small" style={{ marginRight: 12 }}>
          {session.title}
        </span>
        <button className="btn small" onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        {[1, 2, 4].map((s) => (
          <button key={s} className={`btn small ${speed === s ? 'primary' : ''}`} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
        <button className="btn small" onClick={() => scene()?.skipToEnd()}>
          ⏭ Skip to result
        </button>
        <button className="btn small" onClick={() => setReplayKey((k) => k + 1)}>
          ↺ Replay
        </button>
        <button className="btn small ghost" onClick={onClose}>
          Leave arena
        </button>
      </div>
    </div>
  );
}

function Results({ session, onClose, onRematch, onReplay }: { session: ArenaSession; onClose: () => void; onRematch?: () => void; onReplay: () => void }) {
  const game = useStore((s) => s.game)!;
  const r = session.result;
  const me = session.playerSide ?? 0;
  const won = r.winner === me;
  const o = session.outcome;
  const a = compileSpec(me === 0 ? session.setup.a : session.setup.b, game.lib);
  const rep = r.reports[me];
  const spectator = session.playerSide === null;
  return (
    <div className="results">
      <Panel className="glow-in">
        {spectator ? (
          <div className="banner win">{r.winner === 0 ? session.setup.a.name : session.setup.b.name} wins</div>
        ) : (
          <div className={`banner ${won ? 'win' : 'lose'}`}>{won ? 'VICTORY' : 'DEFEAT'}</div>
        )}
        <p className="center muted" style={{ marginTop: 0 }}>
          {Math.round(r.duration)}s · final health {r.finalHp[0]} / {r.finalHp[1]}
        </p>
        {o && (
          <div className="grid cols-2">
            <div className="subpanel">
              <h3>Rewards</h3>
              <div className="col small">
                <div>
                  Purse: <span className="gold num">${o.money}</span>
                </div>
                <div>
                  Rating:{' '}
                  <span className={o.ratingDelta >= 0 ? 'green num' : 'red num'}>
                    {o.ratingDelta >= 0 ? '+' : ''}
                    {o.ratingDelta}
                  </span>
                </div>
                {o.respect > 0 && (
                  <div>
                    Respect: <span className="violet num">+{o.respect}</span>
                  </div>
                )}
                {Object.entries(o.materials).length > 0 && (
                  <div className="row wrap">
                    {Object.entries(o.materials).map(([m, c]) => (
                      <span key={m} className="row" style={{ gap: 3 }}>
                        <MatIcon id={m} size={2} />
                        {c}× {MATERIAL_MAP[m]?.name}
                      </span>
                    ))}
                  </div>
                )}
                {o.promoted && <div className="gold">PROMOTED to {o.promoted}!</div>}
                {o.achievements.map((x) => (
                  <div key={x} className="gold">
                    Achievement: {x}
                  </div>
                ))}
                {o.notes.map((n, i) => (
                  <div key={i} className="violet">
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div className="subpanel">
              <h3>Battle analysis</h3>
              <ul className="desc-list" style={{ paddingLeft: 16 }}>
                {r.insights[me].map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              {o.adaptations.length > 0 && (
                <p className="small" style={{ color: '#ffb070' }}>
                  Your opponent adapted before this duel: {o.adaptations.join('; ')}.
                </p>
              )}
            </div>
          </div>
        )}
        {!spectator && (
          <div className="subpanel" style={{ marginTop: 10 }}>
            <h3>Spell performance</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Spell</th>
                  <th>Casts</th>
                  <th>Damage</th>
                  <th>Hits</th>
                  <th>Dodged</th>
                  <th>Absorbed</th>
                  <th>Heal/Ward</th>
                  <th>Interrupts</th>
                </tr>
              </thead>
              <tbody>
                {a.spells.map((s, i) => {
                  const st = rep.spells[i];
                  return (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td>{st?.casts}</td>
                      <td>{Math.round(st?.damage ?? 0)}</td>
                      <td>{st?.hits}</td>
                      <td>{st?.dodged}</td>
                      <td>{Math.round(st?.absorbed ?? 0)}</td>
                      <td>{Math.round((st?.healing ?? 0) + (st?.shielding ?? 0))}</td>
                      <td>{st?.interrupts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {a.tactics.length > 0 && (
              <div className="small" style={{ marginTop: 8 }}>
                <span className="muted">Grimoire rules fired: </span>
                {a.tactics.map((t, i) => (
                  <span key={i} style={{ marginRight: 12 }}>
                    #{i + 1} {CONDITION_LABEL[t.condition]} → {ACTION_LABEL[t.action]}: <b className="gold">{rep.tacticFires[i] ?? 0}×</b>
                  </span>
                ))}
              </div>
            )}
            <div className="small muted" style={{ marginTop: 6 }}>
              Damage dealt {Math.round(rep.damageDealt)} · taken {Math.round(rep.damageTaken)} · dodges {rep.dodges} · frozen {rep.timesFrozen}× · interrupted {rep.interruptsSuffered}×
            </div>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="btn" onClick={onReplay}>
            ↺ Watch again
          </button>
          {onRematch && (
            <button className="btn arcane" onClick={onRematch}>
              Rematch
            </button>
          )}
          <button className="btn primary big" onClick={onClose}>
            Continue
          </button>
        </div>
      </Panel>
    </div>
  );
}
