// IndexedDB persistence with autosave slot + rotating backup.
import { deserialize, serialize } from '../sim/save';
import type { GameState } from '../sim/state';

const DB_NAME = 'wizened-wizards';
const STORE = 'saves';
const MAIN = 'main';
const BACKUP = 'backup';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const req = fn(st);
    t.oncomplete = () => {
      db.close();
      resolve(req ? (req.result as T) : undefined);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

let saveCount = 0;

export async function saveGame(state: GameState): Promise<void> {
  const text = serialize(state);
  saveCount++;
  await tx('readwrite', (st) => {
    if (saveCount % 10 === 1) {
      const get = st.get(MAIN);
      get.onsuccess = () => {
        if (get.result) st.put(get.result, BACKUP);
        st.put(text, MAIN);
      };
      return;
    }
    st.put(text, MAIN);
  });
}

export async function loadGame(): Promise<{ state: GameState | null; error?: string; fromBackup?: boolean }> {
  const text = await tx<string>('readonly', (st) => st.get(MAIN));
  if (!text) return { state: null };
  const r = deserialize(text);
  if (r.ok) return { state: r.state };
  const backup = await tx<string>('readonly', (st) => st.get(BACKUP));
  if (backup) {
    const b = deserialize(backup);
    if (b.ok) return { state: b.state, fromBackup: true, error: `Main save damaged (${r.error}); restored backup.` };
  }
  return { state: null, error: r.error };
}

export async function hasBackup(): Promise<boolean> {
  return !!(await tx<string>('readonly', (st) => st.get(BACKUP)));
}

export async function restoreBackup(): Promise<GameState | null> {
  const backup = await tx<string>('readonly', (st) => st.get(BACKUP));
  if (!backup) return null;
  const b = deserialize(backup);
  return b.ok ? b.state : null;
}

export async function deleteSave(): Promise<void> {
  await tx('readwrite', (st) => {
    st.delete(MAIN);
  });
}

export function exportText(state: GameState): string {
  return serialize(state);
}
