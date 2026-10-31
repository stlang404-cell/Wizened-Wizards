import { useEffect, type ReactNode } from 'react';
import { componentIcon, elementIcon, equipIcon, hex, materialIcon, wizardDataUrl } from '../../art/pixel';
import { ELEMENT_INFO, MATERIAL_MAP } from '../../sim/data/materials';
import { EQUIP_MAP, PERK_INFO } from '../../sim/data/equipment';
import type { ComponentLib } from '../../sim/genetics';
import type { CompiledSpell, Element, Ingredient, WizardLook } from '../../sim/types';
import { RARITY_NAMES } from '../../sim/types';
import { FORM_INFO, DELIVERY_INFO, BEHAVIOR_INFO } from '../../sim/compiler';
import { tierColor, rankLabel } from '../../sim/hierarchy';

export function Panel({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={`panel ${className}`}>
      {title && (
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {right && <div className="right row">{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function ElIcon({ el, size = 2 }: { el: Element; size?: number }) {
  return <img className="px" src={elementIcon(el, size)} alt={ELEMENT_INFO[el].name} title={ELEMENT_INFO[el].name} style={{ verticalAlign: 'middle' }} />;
}

export function MatIcon({ id, size = 3 }: { id: string; size?: number }) {
  return <img className="px" src={materialIcon(id, size)} alt="" />;
}

export function CompIcon({ el, sec, gen, size = 3 }: { el: Element; sec?: Element; gen: number; size?: number }) {
  return <img className="px" src={componentIcon(el, sec, gen, size)} alt="" />;
}

export function EquipIcon({ defId, size = 3 }: { defId: string; size?: number }) {
  const d = EQUIP_MAP[defId];
  const accent = d?.affinity ? ELEMENT_INFO[d.affinity].color : d?.slot === 'robe' ? 0x5a4a8a : 0xd9b44a;
  return <img className="px" src={equipIcon(d?.slot ?? 'relic', d?.tier ?? 0, accent, size)} alt="" />;
}

export function IngredientIcon({ ing, lib, size = 3 }: { ing: Ingredient; lib: ComponentLib; size?: number }) {
  if (ing.kind === 'material') return <MatIcon id={ing.id} size={size} />;
  const c = lib[ing.id];
  return c ? <CompIcon el={c.element} sec={c.secondary} gen={c.generation} size={size} /> : null;
}

export function ingredientName(ing: Ingredient, lib: ComponentLib) {
  return ing.kind === 'material' ? MATERIAL_MAP[ing.id]?.name ?? ing.id : lib[ing.id]?.name ?? ing.id;
}

export function Portrait({ look, size = 110, pose = 'idle0' as const, flip = false }: { look: WizardLook; size?: number; pose?: 'idle0' | 'cast'; flip?: boolean }) {
  return (
    <div className="portrait" style={{ width: size, height: size * 1.15 }}>
      <img className="px" src={wizardDataUrl(look, 4, pose)} alt="" style={{ height: '92%', transform: flip ? 'scaleX(-1)' : undefined }} />
    </div>
  );
}

export function Money({ v, className = '' }: { v: number; className?: string }) {
  return <span className={`num gold ${className}`}>${Math.round(v).toLocaleString()}</span>;
}

export function RankBadge({ tier, div }: { tier: number; div: number }) {
  const c = tierColor(tier);
  return (
    <span className="rank-badge" style={{ color: c, borderColor: c }}>
      <span className="gem" style={{ background: c }} />
      {rankLabel(tier, div)}
    </span>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="bar">
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

export function Sparkline({ data, w = 220, h = 56, color = '#d9b44a' }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * (w - 4) + 2},${h - 4 - ((v - min) / span) * (h - 10)}`).join(' ');
  const last = data[data.length - 1];
  const first = data[0];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <rect x="0" y="0" width={w} height={h} rx="6" fill="rgba(0,0,0,0.3)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      <text x={4} y={12} fill="#a8977a" fontSize="10">
        ${max}
      </text>
      <text x={4} y={h - 3} fill="#a8977a" fontSize="10">
        ${min}
      </text>
      <text x={w - 4} y={12} fill={last >= first ? '#6fd38a' : '#e05a4a'} fontSize="11" textAnchor="end">
        {last >= first ? '▲' : '▼'} {Math.round(((last - first) / Math.max(1, first)) * 100)}%
      </text>
    </svg>
  );
}

export function SpellCard({ spell, compact = false, extra, onClick, selected }: { spell: CompiledSpell; compact?: boolean; extra?: ReactNode; onClick?: () => void; selected?: boolean }) {
  const el = hex(ELEMENT_INFO[spell.element].color);
  return (
    <div className={`spellcard ${onClick ? 'clickable' : ''}`} style={{ ['--el' as string]: el, cursor: onClick ? 'pointer' : undefined, outline: selected ? '2px solid #f5d77a' : undefined }} onClick={onClick}>
      <div className="row">
        <ElIcon el={spell.element} size={2} />
        {spell.secondary && <ElIcon el={spell.secondary} size={1} />}
        <span className="name">{spell.name}</span>
        <span className="right tiny muted">
          {FORM_INFO[spell.form].name} · {DELIVERY_INFO[spell.delivery].name} · {BEHAVIOR_INFO[spell.behavior].name}
        </span>
      </div>
      <div className="stats">
        {spell.damage > 0 && (
          <span className="stat">
            DMG<b>{Math.round(spell.damage)}{spell.hits > 1 ? `×${spell.hits}` : ''}</b>
          </span>
        )}
        {spell.heal > 0 && (
          <span className="stat">
            HEAL<b className="green">{Math.round(spell.heal)}</b>
          </span>
        )}
        {spell.shield > 0 && (
          <span className="stat">
            WARD<b className="blue">{Math.round(spell.shield)}</b>
          </span>
        )}
        <span className="stat">
          MANA<b className="blue">{spell.manaCost}</b>
        </span>
        <span className="stat">
          CAST<b>{spell.castTime}s</b>
        </span>
        <span className="stat">
          CD<b>{spell.cooldown}s</b>
        </span>
        <span className="stat">
          POWER<b className="gold">{Math.round(spell.power)}</b>
        </span>
      </div>
      {!compact && (
        <ul className="desc-list">
          {spell.description.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {spell.tags.length > 0 && (
        <div className="row wrap" style={{ marginTop: 6, gap: 4 }}>
          {spell.tags.map((t) => (
            <span key={t} className="tag" style={{ color: '#cbb98f' }}>
              {t}
            </span>
          ))}
        </div>
      )}
      {extra}
    </div>
  );
}

export function rarityLabel(r: number) {
  return <span className={`rarity-${r} small`}>{RARITY_NAMES[r]}</span>;
}

export function perkText(defId: string) {
  const d = EQUIP_MAP[defId];
  if (!d) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d.attrs)) parts.push(`${v! > 0 ? '+' : ''}${v} ${k}`);
  if (d.affinity) parts.push(`+${Math.round((d.affinityBonus ?? 0) * 100)}% ${ELEMENT_INFO[d.affinity].name} damage`);
  if (d.resist) for (const [k, v] of Object.entries(d.resist)) parts.push(`${v! > 0 ? '+' : ''}${Math.round(v! * 100)}% ${k} resist`);
  if (d.perk) parts.push(PERK_INFO[d.perk]);
  return parts.join(' · ') || 'No bonuses';
}
