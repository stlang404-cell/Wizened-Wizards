export interface SkillNode {
  id: string;
  school: 'Evocation' | 'Abjuration' | 'Sorcery';
  tier: number;
  name: string;
  desc: string;
  exclusive?: string; // cannot take both
}

export const SKILLS: SkillNode[] = [
  { id: 'e1', school: 'Evocation', tier: 1, name: 'Kindled Will', desc: '+6% spell damage.' },
  { id: 'e2a', school: 'Evocation', tier: 2, name: 'Glass Cannon', desc: '+14% damage, −10% max health.', exclusive: 'e2b' },
  { id: 'e2b', school: 'Evocation', tier: 2, name: 'Steady Hand', desc: 'Backlash chance halved, +5% damage.', exclusive: 'e2a' },
  { id: 'e3', school: 'Evocation', tier: 3, name: 'Overflow', desc: '+8% echo chance on all spells.' },
  { id: 'e4a', school: 'Evocation', tier: 4, name: 'Executioner', desc: '+25% damage vs foes below 30% health.', exclusive: 'e4b' },
  { id: 'e4b', school: 'Evocation', tier: 4, name: 'Opening Gambit', desc: '+25% damage in the first 10 seconds.', exclusive: 'e4a' },
  { id: 'a1', school: 'Abjuration', tier: 1, name: 'Thick Skin', desc: '+8% max health.' },
  { id: 'a2a', school: 'Abjuration', tier: 2, name: 'Bastion', desc: 'Shields +25% and decay 50% slower.', exclusive: 'a2b' },
  { id: 'a2b', school: 'Abjuration', tier: 2, name: 'Mirror Mind', desc: 'Reflect +10% of damage while shielded.', exclusive: 'a2a' },
  { id: 'a3', school: 'Abjuration', tier: 3, name: 'Second Wind', desc: 'Healing +20%.' },
  { id: 'a4a', school: 'Abjuration', tier: 4, name: 'Iron Focus', desc: '+25% interrupt resistance.', exclusive: 'a4b' },
  { id: 'a4b', school: 'Abjuration', tier: 4, name: 'Evasion Drills', desc: '+6% dodge chance.', exclusive: 'a4a' },
  { id: 's1', school: 'Sorcery', tier: 1, name: 'Deep Reserves', desc: '+20 max mana.' },
  { id: 's2a', school: 'Sorcery', tier: 2, name: "Cryomancer's Patience", desc: 'Chill and Frozen last 40% longer.', exclusive: 's2b' },
  { id: 's2b', school: 'Sorcery', tier: 2, name: 'Toxicologist', desc: 'Burn and poison +20%.', exclusive: 's2a' },
  { id: 's3', school: 'Sorcery', tier: 3, name: 'Quick Study', desc: '+8% cast speed.' },
  { id: 's4a', school: 'Sorcery', tier: 4, name: 'Spellbreaker', desc: 'Your interrupts add 2s to the interrupted spell cooldown.', exclusive: 's4b' },
  { id: 's4b', school: 'Sorcery', tier: 4, name: 'Conduit', desc: '+15% mana regeneration.', exclusive: 's4a' },
];

export const SKILL_MAP: Record<string, SkillNode> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function canLearnSkill(id: string, owned: string[], points: number): string | null {
  const s = SKILL_MAP[id];
  if (!s) return 'Unknown skill.';
  if (owned.includes(id)) return 'Already learned.';
  if (points < 1) return 'No skill points. Earn them through promotions.';
  if (s.exclusive && owned.includes(s.exclusive)) return `Exclusive with ${SKILL_MAP[s.exclusive].name}.`;
  if (s.tier > 1 && !owned.some((o) => SKILL_MAP[o]?.school === s.school && SKILL_MAP[o].tier === s.tier - 1))
    return `Requires a tier ${s.tier - 1} ${s.school} skill.`;
  return null;
}
