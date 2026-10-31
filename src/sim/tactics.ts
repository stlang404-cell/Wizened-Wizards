import type { TacticAction, TacticCondition, TacticRule } from './types';

export const GRIMOIRE_LEVELS = [
  {
    slots: 2,
    cost: 0,
    tier: 0,
    conditions: ['always', 'selfHpLow', 'enemyShielded', 'selfManaLow'] as TacticCondition[],
    actions: ['preferPierce', 'preferHeal', 'preferDefense', 'preferEfficient', 'preferBurst'] as TacticAction[],
  },
  {
    slots: 4,
    cost: 120,
    tier: 0,
    conditions: ['enemyFrozen', 'enemyChilled', 'enemyLongCast', 'fightStart'] as TacticCondition[],
    actions: ['preferShatter', 'interrupt', 'preferControl', 'conserveMana'] as TacticAction[],
  },
  {
    slots: 6,
    cost: 700,
    tier: 1,
    conditions: ['enemyHpLow', 'enemyPoisoned', 'selfUnshielded', 'enemyHealing'] as TacticCondition[],
    actions: ['preferDot', 'preferBlight', 'keepDistance', 'closeDistance'] as TacticAction[],
  },
  {
    slots: 8,
    cost: 2500,
    tier: 3,
    conditions: ['enemyClose', 'enemyFar', 'enemyConductive', 'selfHpMid'] as TacticCondition[],
    actions: ['preferStorm'] as TacticAction[],
  },
];

export function grimoireUnlocks(level: number) {
  const conditions: TacticCondition[] = [];
  const actions: TacticAction[] = [];
  for (let i = 0; i <= level && i < GRIMOIRE_LEVELS.length; i++) {
    conditions.push(...GRIMOIRE_LEVELS[i].conditions);
    actions.push(...GRIMOIRE_LEVELS[i].actions);
  }
  return { conditions, actions, slots: GRIMOIRE_LEVELS[Math.min(level, GRIMOIRE_LEVELS.length - 1)].slots };
}

const R = (condition: TacticCondition, action: TacticAction): TacticRule => ({ condition, action, enabled: true });

export const TACTIC_PRESETS: { id: string; name: string; desc: string; level: number; rules: TacticRule[] }[] = [
  { id: 'balanced', name: 'Balanced Duelist', desc: 'Heal when hurt, pierce shields.', level: 0, rules: [R('selfHpLow', 'preferHeal'), R('enemyShielded', 'preferPierce')] },
  { id: 'aggressor', name: 'Aggressor', desc: 'Burst damage, efficient when low on mana.', level: 0, rules: [R('selfManaLow', 'preferEfficient'), R('always', 'preferBurst')] },
  { id: 'fortress', name: 'Fortress', desc: 'Shield up early, heal when low.', level: 0, rules: [R('selfHpLow', 'preferHeal'), R('always', 'preferDefense')] },
  {
    id: 'spellbreaker',
    name: 'Spellbreaker',
    desc: 'Interrupt long casts, pierce shields, conserve mana.',
    level: 1,
    rules: [R('enemyLongCast', 'interrupt'), R('enemyShielded', 'preferPierce'), R('selfHpLow', 'preferHeal'), R('selfManaLow', 'conserveMana')],
  },
  {
    id: 'cryomancer',
    name: 'Cryomancer',
    desc: 'Chill, freeze, then shatter.',
    level: 1,
    rules: [R('enemyFrozen', 'preferShatter'), R('fightStart', 'preferControl'), R('enemyChilled', 'preferControl'), R('selfHpLow', 'preferDefense')],
  },
  {
    id: 'plaguebearer',
    name: 'Plaguebearer',
    desc: 'Stack damage over time, blight healers.',
    level: 2,
    rules: [R('enemyHealing', 'interrupt'), R('enemyHpLow', 'preferBurst'), R('always', 'preferDot'), R('selfHpLow', 'preferHeal'), R('selfManaLow', 'preferEfficient'), R('enemyShielded', 'preferPierce')],
  },
];

export function validateTactics(rules: TacticRule[], level: number): string | null {
  const u = grimoireUnlocks(level);
  if (rules.length > u.slots) return `Your Grimoire holds ${u.slots} rules.`;
  for (const r of rules) {
    if (!u.conditions.includes(r.condition)) return `Condition locked: ${r.condition}`;
    if (!u.actions.includes(r.action)) return `Action locked: ${r.action}`;
  }
  return null;
}
