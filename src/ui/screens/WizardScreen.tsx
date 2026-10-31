import { useMemo, useRef, useState } from 'react';
import { useGame, useStore } from '../../state/store';
import * as G from '../../sim/game';
import { compileCached } from '../../sim/npc';
import { compileSpec, playerSpec, playerSpellbookSlots } from '../../sim/world';
import { deriveStats, CONDITION_LABEL, ACTION_LABEL } from '../../sim/combat';
import { attributeCap, rankLabel, tierName } from '../../sim/hierarchy';
import { SKILLS, canLearnSkill } from '../../sim/data/skills';
import { EQUIP_MAP, ENCHANT_COST, ENCHANT_INFO } from '../../sim/data/equipment';
import { ELEMENT_INFO } from '../../sim/data/materials';
import { GRIMOIRE_LEVELS, TACTIC_PRESETS, grimoireUnlocks } from '../../sim/tactics';
import { SPELLBOOK_LEVELS, attrTrainCost } from '../../sim/upgrades';
import { ATTRS, ELEMENTS, type TacticRule } from '../../sim/types';
import { ElIcon, EquipIcon, Modal, Money, Panel, Portrait, RankBadge, SpellCard, perkText } from '../components/common';
import { exportText, restoreBackup, deleteSave } from '../../persist/db';
import { deserialize } from '../../sim/save';
import { soundEnabled, setSoundEnabled } from '../../art/audio';

type Tab = 'profile' | 'spellbook' | 'grimoire' | 'equipment' | 'skills' | 'achievements' | 'career' | 'saves';

export function WizardScreen() {
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <div className="screen-inner">
      <div className="screen-title">
        <h1>WIZARD</h1>
        <p>Your profile, arsenal, tactics and history.</p>
      </div>
      <div className="tabs">
        {(
          [
            ['profile', 'Profile'],
            ['spellbook', 'Spellbook'],
            ['grimoire', 'Tactical Grimoire'],
            ['equipment', 'Equipment'],
            ['skills', 'Skills & Training'],
            ['achievements', 'Achievements'],
            ['career', 'Career'],
            ['saves', 'Saves & Settings'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`wizard-tab-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'profile' && <Profile />}
      {tab === 'spellbook' && <Spellbook />}
      {tab === 'grimoire' && <Grimoire />}
      {tab === 'equipment' && <Equipment />}
      {tab === 'skills' && <Skills />}
      {tab === 'achievements' && <Achievements />}
      {tab === 'career' && <Career />}
      {tab === 'saves' && <Saves />}
    </div>
  );
}

function Profile() {
  const g = useGame();
  const p = g.player;
  const w = useMemo(() => compileSpec(playerSpec(g), g.lib), [g, p.attrs, p.equipped, p.skills, p.spellbook.join()]);
  const st = deriveStats(w);
  return (
    <div className="grid cols-side-main">
      <Panel>
        <div className="col" style={{ alignItems: 'center' }}>
          <Portrait look={p.look} size={200} />
          <div style={{ fontFamily: 'Cinzel', fontSize: 22, color: '#f5d77a', textAlign: 'center' }}>{p.name}</div>
          {p.activeTitle && <div className="muted">“{p.activeTitle}”</div>}
          <RankBadge tier={p.tier} div={p.div} />
          <div className="small">
            Rating <b className="blue num">{p.rating}</b> (peak {p.peakRating}) · Respect <b className="violet num">{p.respect}</b>
          </div>
          <div className="small">
            Record {p.record.wins}W / {p.record.losses}L · best streak {p.record.bestStreak} · {p.record.tournamentsWon} tournaments won
          </div>
          <Money v={p.money} />
        </div>
      </Panel>
      <div className="col" style={{ gap: 14 }}>
        <Panel title="Combat profile">
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            <span className="stat">Health<b>{st.maxHp}</b></span>
            <span className="stat">Mana<b>{st.maxMana}</b></span>
            <span className="stat">Mana regen<b>{st.regen.toFixed(1)}/s</b></span>
            <span className="stat">Spell power<b>×{st.powerMult.toFixed(2)}</b></span>
            <span className="stat">Dodge<b>{Math.round(st.dodge * 100)}%</b></span>
            <span className="stat">Cast speed<b>×{st.castSpeed.toFixed(2)}</b></span>
            <span className="stat">Interrupt resist<b>{Math.round(st.interruptResist * 100)}%</b></span>
            <span className="stat">Move speed<b>{st.move.toFixed(0)}</b></span>
          </div>
          <div className="row wrap small" style={{ marginTop: 6 }}>
            {ELEMENTS.filter((e) => st.resist[e] !== 0 || st.affinity[e]).map((e) => (
              <span key={e} className="row" style={{ gap: 3 }}>
                <ElIcon el={e} size={1} /> {st.resist[e] ? `${Math.round(st.resist[e] * 100)}% resist` : ''} {st.affinity[e] ? `+${Math.round(st.affinity[e]! * 100)}% dmg` : ''}
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="Equipped spells">
          <div className="grid cols-2">
            {w.spells.map((s, i) => (
              <SpellCard key={i} spell={s} compact />
            ))}
          </div>
        </Panel>
        <Panel title="Statistics">
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            <span className="stat">Components invented<b>{p.stats.componentsInvented}</b></span>
            <span className="stat">Spells forged<b>{p.stats.spellsForged}</b></span>
            <span className="stat">Deepest generation<b>{p.stats.maxGeneration}</b></span>
            <span className="stat">Duels<b>{p.stats.duels}</b></span>
            <span className="stat">Upsets<b>{p.record.upsets}</b></span>
            <span className="stat">Guardians defeated<b>{p.record.guardiansDefeated.length}</b></span>
            <span className="stat">Bets won/lost<b>{p.stats.betsWon}/{p.stats.betsLost}</b></span>
            <span className="stat">Lifetime earnings<b>${p.stats.moneyEarned}</b></span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Spellbook() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  const slots = playerSpellbookSlots(p);
  const next = SPELLBOOK_LEVELS[p.upgrades.spellbook + 1];
  const book = p.spellbook;
  const set = (ids: string[]) => act((s) => G.setSpellbook(s, ids));
  const available = p.spells.filter((x) => !x.retired && !book.includes(x.id));
  return (
    <div className="grid cols-2">
      <Panel title={`Spellbook (${book.length}/${slots})`} right={next && <button className="btn small primary" disabled={p.money < next.cost || p.tier < next.tier} onClick={() => act((s) => G.upgradeSpellbook(s), 'Spellbook expanded!')}>+1 slot: {p.tier < next.tier ? tierName(next.tier) : `$${next.cost}`}</button>}>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Order matters only as a tie-breaker; your Grimoire and the battle situation decide what is cast.
        </p>
        <div className="col">
          {book.map((id, i) => {
            const e = p.spells.find((x) => x.id === id);
            const s = e ? compileCached(e.recipe, g.lib, e.name) : null;
            if (!s || !e) return null;
            return (
              <SpellCard
                key={id}
                spell={s}
                compact
                extra={
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="btn small" disabled={i === 0} onClick={() => set(book.map((x, j) => (j === i - 1 ? id : j === i ? book[i - 1] : x)))}>
                      ▲
                    </button>
                    <button className="btn small" disabled={i === book.length - 1} onClick={() => set(book.map((x, j) => (j === i + 1 ? id : j === i ? book[i + 1] : x)))}>
                      ▼
                    </button>
                    <button className="btn small right" onClick={() => set(book.filter((x) => x !== id))}>
                      Unequip
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      </Panel>
      <Panel title="Available spells">
        <div className="col">
          {available.length === 0 && <div className="muted small">Forge more spells in the FORGE.</div>}
          {available.map((e) => {
            const s = compileCached(e.recipe, g.lib, e.name);
            if (!s) return null;
            return (
              <SpellCard
                key={e.id}
                spell={s}
                compact
                extra={
                  <div className="row" style={{ marginTop: 6 }}>
                    <span className="tiny muted">mastery {e.mastery}</span>
                    <button className="btn small primary right" disabled={book.length >= slots} onClick={() => set([...book, e.id])} data-testid={`equip-${e.id}`}>
                      Equip
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Grimoire() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  const u = grimoireUnlocks(p.upgrades.grimoire);
  const next = GRIMOIRE_LEVELS[p.upgrades.grimoire + 1];
  const rules = p.tactics;
  const save = (r: TacticRule[]) => act((s) => G.setTactics(s, r));
  return (
    <div className="grid cols-main-side">
      <Panel title={`Tactical Grimoire (${rules.length}/${u.slots} rules)`} right={next && <button className="btn small primary" disabled={p.money < next.cost || p.tier < next.tier} onClick={() => act((s) => G.upgradeGrimoire(s), 'Grimoire expanded!')}>Expand: {p.tier < next.tier ? tierName(next.tier) : `$${next.cost}`}</button>}>
        <p className="small muted" style={{ marginTop: 0 }}>
          Rules are checked top to bottom every time your wizard chooses a spell. The first rule whose condition is true and which matches an available spell wins. Without a matching rule, your wizard uses its own judgement.
        </p>
        <div className="col">
          {rules.map((r, i) => (
            <div key={i} className="item">
              <span className="num gold">{i + 1}</span>
              <span className="small">IF</span>
              <select value={r.condition} onChange={(e) => save(rules.map((x, j) => (j === i ? { ...x, condition: e.target.value as never } : x)))}>
                {u.conditions.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABEL[c]}
                  </option>
                ))}
              </select>
              <span className="small">THEN</span>
              <select value={r.action} onChange={(e) => save(rules.map((x, j) => (j === i ? { ...x, action: e.target.value as never } : x)))}>
                {u.actions.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABEL[a]}
                  </option>
                ))}
              </select>
              <label className="small row right">
                <input type="checkbox" checked={r.enabled} onChange={(e) => save(rules.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />
                on
              </label>
              <button className="btn small" disabled={i === 0} onClick={() => save(rules.map((x, j) => (j === i - 1 ? r : j === i ? rules[i - 1] : x)))}>
                ▲
              </button>
              <button className="btn small ghost" onClick={() => save(rules.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn" disabled={rules.length >= u.slots} onClick={() => save([...rules, { condition: 'always', action: u.actions[0], enabled: true }])} data-testid="add-rule">
            + Add rule
          </button>
        </div>
      </Panel>
      <Panel title="Presets">
        <div className="list">
          {TACTIC_PRESETS.map((pr) => (
            <div key={pr.id} className="item">
              <div className="grow small">
                <div className="title">{pr.name}</div>
                <div className="tiny muted">{pr.desc}</div>
                <div className="tiny muted">{pr.rules.map((r) => `${CONDITION_LABEL[r.condition]} → ${ACTION_LABEL[r.action]}`).join(' · ')}</div>
              </div>
              <button className="btn small" disabled={pr.level > p.upgrades.grimoire} onClick={() => act((s) => G.setTactics(s, pr.rules.slice(0, u.slots)), `Applied ${pr.name}`)}>
                {pr.level > p.upgrades.grimoire ? `Grimoire ${pr.level}` : 'Apply'}
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Equipment() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  return (
    <div className="grid cols-2">
      {(['wand', 'core', 'robe', 'relic'] as const).map((slot) => {
        const eqUid = p.equipped[slot];
        const owned = p.ownedEquipment.filter((o) => EQUIP_MAP[o.defId]?.slot === slot);
        return (
          <Panel key={slot} title={slot[0].toUpperCase() + slot.slice(1)}>
            <div className="list">
              {owned.map((o) => {
                const d = EQUIP_MAP[o.defId];
                const on = o.uid === eqUid;
                const cost = Math.round((ENCHANT_COST[o.enchant + 1] ?? 0) * (1 + d.tier * 0.5));
                return (
                  <div key={o.uid} className={`item ${on ? 'selected' : ''}`}>
                    <EquipIcon defId={d.id} />
                    <div className="grow small">
                      <div className="title">
                        {d.name} {o.enchant > 0 && <span className="gold">+{o.enchant} {o.path}</span>}
                      </div>
                      <div className="tiny muted">{perkText(d.id)}</div>
                      <div className="tiny muted">{d.lore}</div>
                      {d.price > 0 && o.enchant < 3 && (
                        <div className="row" style={{ marginTop: 4, gap: 4 }}>
                          {(!o.path || o.path === 'attune') && (d.affinity || d.slot === 'wand') && (
                            <button className="btn small" title={ENCHANT_INFO.attune} onClick={() => act((s) => G.enchantItem(s, o.uid, 'attune'), 'Enchanted!')}>
                              Attune ${cost}
                            </button>
                          )}
                          {(!o.path || o.path === 'temper') && (
                            <button className="btn small" title={ENCHANT_INFO.temper} onClick={() => act((s) => G.enchantItem(s, o.uid, 'temper'), 'Enchanted!')}>
                              Temper ${cost}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {on ? (
                      <span className="tiny gold">Equipped</span>
                    ) : (
                      <button className="btn small primary" onClick={() => act((s) => G.equipItem(s, o.uid))}>
                        Equip
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Skills() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const p = g.player;
  const cap = attributeCap(p.tier);
  const cost = attrTrainCost(p.attrTrained);
  const ATTR_DESC: Record<string, string> = {
    vitality: '+50 health',
    wisdom: '+4 mana, +0.25 mana/s',
    power: '+2.5% spell power',
    agility: '+1% dodge, faster movement',
    focus: '+1.5% cast speed, +2% interrupt resist',
  };
  return (
    <div className="grid cols-side-main">
      <Panel title="Attribute training">
        <p className="small muted" style={{ marginTop: 0 }}>
          Your rank caps each attribute at <b>{cap}</b>. Promotions raise the cap.
        </p>
        <div className="col">
          {ATTRS.map((a) => (
            <div key={a} className="item">
              <div className="grow small">
                <div className="title">
                  {a[0].toUpperCase() + a.slice(1)} <span className="num gold">{p.attrs[a]}</span>
                </div>
                <div className="tiny muted">{ATTR_DESC[a]}</div>
              </div>
              <button className="btn small" disabled={p.attrs[a] >= cap || p.money < cost} onClick={() => act((s) => G.trainAttribute(s, a))} data-testid={`train-${a}`}>
                {p.attrs[a] >= cap ? 'Capped' : `Train $${cost}`}
              </button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={`Skill tree — ${p.skillPoints} point${p.skillPoints === 1 ? '' : 's'}`}>
        <p className="small muted" style={{ marginTop: 0 }}>
          Skill points come only from promotions. Paired skills are mutually exclusive — choose your specialisation.
        </p>
        <div className="grid cols-3">
          {(['Evocation', 'Abjuration', 'Sorcery'] as const).map((school) => (
            <div key={school} className="subpanel">
              <h3>{school}</h3>
              <div className="col">
                {SKILLS.filter((s) => s.school === school).map((s) => {
                  const owned = p.skills.includes(s.id);
                  const err = canLearnSkill(s.id, p.skills, p.skillPoints);
                  return (
                    <div key={s.id} className={`item ${owned ? 'selected' : ''}`} style={{ padding: '5px 8px' }}>
                      <div className="grow tiny">
                        <b className={owned ? 'gold' : ''}>
                          T{s.tier} {s.name}
                        </b>
                        <div className="muted">{s.desc}</div>
                      </div>
                      {!owned && (
                        <button className="btn small" disabled={!!err} title={err ?? ''} onClick={() => act((st) => G.learnSkill(st, s.id), `Learned ${s.name}`)}>
                          Learn
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Achievements() {
  const g = useGame();
  return (
    <Panel title="Achievements">
      <div className="grid cols-3">
        {G.ACHIEVEMENTS.map((a) => {
          const got = g.player.achievements[a.id];
          return (
            <div key={a.id} className={`item ${got !== undefined ? 'selected' : ''}`}>
              <div className="grow small">
                <div className={got !== undefined ? 'gold' : 'muted'}>{a.name}</div>
                <div className="tiny muted">
                  {a.desc}
                  {a.title ? ` · Title: “${a.title}”` : ''}
                </div>
              </div>
              {got !== undefined && <span className="tiny">Day {got}</span>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Career() {
  const g = useGame();
  return (
    <Panel title="Career history">
      <div className="list">
        {g.player.career.map((c, i) => (
          <div key={i} className="item small">
            <span className="muted" style={{ width: 54 }}>
              Day {c.day}
            </span>
            <span className="tag" style={{ color: '#cbb98f' }}>
              {c.kind}
            </span>
            <span className="grow">{c.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Saves() {
  const g = useGame();
  const setGame = useStore((s) => s.setGame);
  const toast = useStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [sound, setSound] = useState(soundEnabled());
  const lastSaved = useStore((s) => s.lastSaved);
  const exportSave = () => {
    const text = exportText(g);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wizened-wizards-${g.player.name.replace(/\W+/g, '_')}-day${g.clock.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Save exported.', 'success');
  };
  const importSave = async (f: File) => {
    const text = await f.text();
    const r = deserialize(text);
    if (!r.ok) return toast(`Import failed: ${r.error}`, 'error');
    setGame(r.state);
    toast(`Imported ${r.state.player.name}, day ${r.state.clock.day}.`, 'success');
  };
  return (
    <div className="grid cols-2">
      <Panel title="Saves">
        <p className="small muted" style={{ marginTop: 0 }}>
          The game autosaves to this browser (IndexedDB) after every action{lastSaved ? ` — last saved ${new Date(lastSaved).toLocaleTimeString()}` : ''}. A rotating backup is kept automatically. Export regularly to keep a copy outside the browser.
        </p>
        <div className="row wrap">
          <button className="btn primary" onClick={exportSave} data-testid="export-save">
            Export save file
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import save file
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importSave(e.target.files[0])} />
          <button
            className="btn"
            onClick={async () => {
              const b = await restoreBackup();
              if (b) {
                setGame(b);
                toast('Backup restored.', 'success');
              } else toast('No backup available yet.', 'error');
            }}
          >
            Restore backup
          </button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn danger" onClick={() => setConfirmNew(true)}>
            Start a new wizard…
          </button>
        </div>
      </Panel>
      <Panel title="Settings">
        <label className="row small">
          <input type="checkbox" checked={sound} onChange={(e) => (setSoundEnabled(e.target.checked), setSound(e.target.checked))} /> Sound effects
        </label>
        <p className="tiny muted">
          World seed {g.seed} · schema v{g.version} · {Object.keys(g.npcs).length} wizards · {Object.keys(g.lib).length} known components · {rankLabel(g.player.tier, g.player.div)}
        </p>
        <p className="tiny muted">Everything runs locally and offline. No accounts, no network calls, no real money.</p>
        <p className="tiny muted">Element palette: {ELEMENTS.map((e) => ELEMENT_INFO[e].name).join(', ')}.</p>
      </Panel>
      {confirmNew && (
        <Modal onClose={() => setConfirmNew(false)}>
          <Panel title="Start over?">
            <p>This replaces your current wizard in this browser. Export your save first if you want to keep it.</p>
            <div className="row">
              <button className="btn" onClick={exportSave}>
                Export first
              </button>
              <button
                className="btn danger right"
                onClick={async () => {
                  await deleteSave();
                  setGame(null);
                }}
              >
                Delete & start new
              </button>
            </div>
          </Panel>
        </Modal>
      )}
    </div>
  );
}
