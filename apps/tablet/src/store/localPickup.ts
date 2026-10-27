// Offline-only pickup state for the Standalone (workflow.pickup_flow === 'ready_only')
// mode. The tablet is the entire system: keypad creates ready orders directly into
// this store, the dashboard's right panel renders them, and tapping a card removes
// it. No API, no WebSocket, no order_status state machine — everything is just
// "in the ready list" or "removed".
//
// Persistence mirrors the auth store: SecureStore on native, localStorage on web.
// SecureStore is overkill for non-secret data but it's already a dep, and the
// payload (a JSON array of {id, display_number, created_at}) stays tiny.

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface LocalReadyOrder {
  id:              string;   // local uuid
  display_number:  string;
  created_at:      string;   // ISO
}

interface LocalPickupState {
  ready:    LocalReadyOrder[];
  hydrated: boolean;

  addReady:    (displayNumber: string) => void;
  removeReady: (id: string) => void;
  clearAll:    () => void;
  hydrate:     () => Promise<void>;
  /** Web-only — start listening for cross-tab localStorage updates. No-op on native. */
  startCrossTabSync: () => void;
}

const KEY = 'rs_local_pickup_ready';
const isWeb = Platform.OS === 'web';

const storage = {
  async get(): Promise<string | null> {
    if (isWeb) {
      try { return globalThis.localStorage?.getItem(KEY) ?? null; }
      catch { return null; }
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(value: string): Promise<void> {
    if (isWeb) {
      try { globalThis.localStorage?.setItem(KEY, value); } catch {}
      return;
    }
    await SecureStore.setItemAsync(KEY, value);
  },
};

function genId(): string {
  // crypto.randomUUID is available on Hermes (RN 0.74+) and modern web. Fall back
  // to a timestamp+random combo so a missing global never crashes the keypad.
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(ready: LocalReadyOrder[]): void {
  storage.set(JSON.stringify(ready)).catch((e) => console.warn('[localPickup] persist', e));
}

export const useLocalPickupStore = create<LocalPickupState>((set, get) => ({
  ready:    [],
  hydrated: false,

  addReady: (displayNumber) => {
    const trimmed = displayNumber.trim();
    if (!trimmed) return;
    const entry: LocalReadyOrder = {
      id:             genId(),
      display_number: trimmed,
      created_at:     new Date().toISOString(),
    };
    const next = [...get().ready, entry];
    set({ ready: next });
    persist(next);
  },

  removeReady: (id) => {
    const next = get().ready.filter((o) => o.id !== id);
    set({ ready: next });
    persist(next);
  },

  clearAll: () => {
    set({ ready: [] });
    persist([]);
  },

  hydrate: async () => {
    try {
      const raw = await storage.get();
      if (!raw) { set({ hydrated: true }); return; }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        // Defensive shape check — a legacy or corrupted blob should not crash boot.
        const safe = parsed.filter((x): x is LocalReadyOrder =>
          !!x && typeof x === 'object'
          && typeof (x as LocalReadyOrder).id === 'string'
          && typeof (x as LocalReadyOrder).display_number === 'string'
          && typeof (x as LocalReadyOrder).created_at === 'string',
        );
        set({ ready: safe, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch (err) {
      console.warn('[localPickup] hydrate failed', err);
      set({ hydrated: true });
    }
  },

  // Web-only: when another tab (e.g. /tv display) writes to localStorage, mirror
  // that change into our in-memory store. localStorage fires 'storage' only in
  // OTHER tabs of the same origin, never the tab that wrote. This is how the
  // keypad tab and the TV-display tab stay in sync without an API server.
  startCrossTabSync: () => {
    if (!isWeb) return;
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        const next = e.newValue ? (JSON.parse(e.newValue) as LocalReadyOrder[]) : [];
        if (Array.isArray(next)) set({ ready: next });
      } catch { /* malformed write — ignore */ }
    };
    try { globalThis.addEventListener?.('storage', handler); }
    catch { /* no DOM — bail */ }
  },
}));
