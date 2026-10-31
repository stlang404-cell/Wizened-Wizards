// Save serialization, validation, checksums and schema migrations (pure, testable).
import { hashString } from './rng';
import type { GameState } from './state';
import { SCHEMA_VERSION } from './state';

export const SAVE_FORMAT = 'wizened-wizards-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: number;
  checksum: string;
  state: GameState;
}

export function checksum(json: string): string {
  return hashString(json, 99).toString(36) + hashString(json, 7).toString(36);
}

export function serialize(state: GameState): string {
  const body = JSON.stringify(state);
  const file = { format: SAVE_FORMAT, version: state.version, savedAt: Date.now(), checksum: checksum(body), state: '__STATE__' };
  return JSON.stringify(file).replace('"__STATE__"', body);
}

type Migration = (s: Record<string, unknown>) => void;

/** Ordered migrations: index i upgrades version i+1 → i+2. */
const MIGRATIONS: Record<number, Migration> = {
  1: (s) => {
    const st = s as unknown as GameState;
    st.contracts ??= [];
    st.exhibitions ??= [];
  },
  2: (s) => {
    const st = s as unknown as GameState;
    st.counters.npc ??= Object.keys(st.npcs).length;
    st.player.lastStipendDay ??= 0;
    st.season ??= 1;
  },
};

export function migrate(raw: Record<string, unknown>): GameState {
  let v = Number(raw.version ?? 1);
  while (v < SCHEMA_VERSION) {
    MIGRATIONS[v]?.(raw);
    v++;
    raw.version = v;
  }
  return raw as unknown as GameState;
}

export function validateState(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'Save is not an object.';
  const g = s as Partial<GameState>;
  if (!g.player || !g.npcs || !g.lib || !g.market || !g.clock) return 'Save is missing core sections.';
  if (typeof g.player.money !== 'number' || !Number.isFinite(g.player.money) || g.player.money < 0) return 'Corrupt money value.';
  if (!Array.isArray(g.player.spells) || !Array.isArray(g.player.spellbook)) return 'Corrupt spellbook.';
  if (typeof g.version === 'number' && g.version > SCHEMA_VERSION) return 'Save is from a newer version of the game.';
  return null;
}

export function deserialize(text: string): { ok: true; state: GameState } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  const f = parsed as Partial<SaveFile>;
  if (f.format !== SAVE_FORMAT || !f.state) return { ok: false, error: 'Not a Wizened Wizards save file.' };
  const body = JSON.stringify(f.state);
  if (f.checksum && f.checksum !== checksum(body)) return { ok: false, error: 'Checksum mismatch: the save file was modified or damaged.' };
  const err = validateState(f.state);
  if (err) return { ok: false, error: err };
  return { ok: true, state: migrate(f.state as unknown as Record<string, unknown>) };
}
