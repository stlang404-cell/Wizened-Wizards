// Zustand store: holds the authoritative GameState and routes UI intents to sim actions.
import { create } from 'zustand';
import type { GameState, DuelSetup } from '../sim/state';
import type { CombatResult } from '../sim/combat';
import type { DuelOutcome } from '../sim/game';
import { saveGame } from '../persist/db';

export type Screen = 'DUEL' | 'FORGE' | 'MARKET' | 'ASCEND' | 'WIZARD';

export interface ArenaSession {
  setup: DuelSetup;
  result: CombatResult;
  outcome?: DuelOutcome;
  title: string;
  playerSide: 0 | 1 | null; // null = spectating
  instant?: boolean;
}

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success' | 'discovery';
}

interface UIState {
  game: GameState | null;
  rev: number;
  screen: Screen;
  arena: ArenaSession | null;
  toasts: Toast[];
  saving: boolean;
  lastSaved: number;
  setGame: (g: GameState | null) => void;
  setScreen: (s: Screen) => void;
  setArena: (a: ArenaSession | null) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  /** Run a mutating sim action, then re-render and autosave. */
  act: <T extends { ok: boolean; error?: string } | void>(fn: (g: GameState) => T, success?: string) => T | undefined;
}

let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<UIState>((set, get) => ({
  game: null,
  rev: 0,
  screen: 'DUEL',
  arena: null,
  toasts: [],
  saving: false,
  lastSaved: 0,
  setGame: (g) => {
    set({ game: g, rev: get().rev + 1 });
    if (g) scheduleSave(true);
  },
  setScreen: (screen) => set({ screen }),
  setArena: (arena) => set({ arena }),
  toast: (text, kind = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 4200 : 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  act: (fn, success) => {
    const g = get().game;
    if (!g) return undefined;
    let r: ReturnType<typeof fn>;
    try {
      r = fn(g);
    } catch (e) {
      console.error(e);
      get().toast(`Something went wrong: ${(e as Error).message}`, 'error');
      return undefined;
    }
    set({ rev: get().rev + 1 });
    if (r && typeof r === 'object' && 'ok' in r) {
      if (!r.ok) get().toast(r.error ?? 'Failed.', 'error');
      else if (success) get().toast(success, 'success');
    }
    scheduleSave();
    return r;
  },
}));

function scheduleSave(immediate = false) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(
    async () => {
      const g = useStore.getState().game;
      if (!g) return;
      useStore.setState({ saving: true });
      try {
        await saveGame(g);
        useStore.setState({ lastSaved: Date.now() });
      } catch (e) {
        console.error('Save failed', e);
        useStore.getState().toast('Autosave failed — export a backup from the Wizard screen.', 'error');
      } finally {
        useStore.setState({ saving: false });
      }
    },
    immediate ? 10 : 350,
  );
}

export function flushSave() {
  scheduleSave(true);
}

/** Subscribe a component to game changes. */
export function useGame(): GameState {
  useStore((s) => s.rev);
  return useStore.getState().game!;
}
