import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { CACHE_KEY, buildSnapshot, serialize, deserialize, isRenderable } from './tvPersist';

// ── Domain types ──────────────────────────────────────────────────────────────
export interface TvInstance {
  id: string; store_id: string; display_name: string | null;
  function_type: 'menu' | 'pickup' | 'event' | 'ad';
  profile_id: string | null; ip_address: string | null;
  is_active: boolean; last_ping_at: string | null; sort_order: number;
}

export interface TvProfile {
  id: string; store_id: string; profile_name: string; profile_type: string;
  pickup_mode: 'single' | 'multi_venue' | null;
  tts_enabled: boolean; slide_interval_sec: number;
}

export interface TvRow { instance: TvInstance; profile: TvProfile | null; }

export type OrderPriority = 'normal' | 'rush' | 'scheduled' | 'catering';

export interface Order {
  id: string; display_number: string; customer_name: string | null;
  customer_phone?: string | null;
  status: string; source: string; created_at: string;
  // Spec sec.3.4 timestamps — sparse, server fills as transitions happen.
  accepted_at?: string | null;
  preparing_at?: string | null;
  expedite_at?: string | null;
  ready_at?: string | null;
  collected_at?: string | null;
  picked_up_at?: string | null;
  expired_at?: string | null;
  // Spec sec.3, 18, 19.
  priority?: OrderPriority | null;
  pickup_location?: string | null;
  pickup_time?: string | null;
  items_summary?: string | null;
  estimated_prep_minutes?: number | null;
  // Multi-venue layout metadata.
  venue_label: string | null; venue_color: string | null;
}

// Loose shape — server may evolve store_settings independently of TV release.
// Treat as readonly opaque blob and read via well-known keys.
export type StoreSettingsShape = Record<string, unknown> | null;

export interface MenuItemData {
  id: string; name: string; category: string | null;
  price: string | null; image_url: string | null; photo_url_nobg: string | null;
  available: boolean; is_featured: boolean; is_hot: boolean; sold_out: boolean;
}

export interface EventData {
  id: string; title: string | null; type: string; image_url: string | null;
  ticker_text: string | null; cta_url: string | null;
  start_at: string | null; end_at: string | null;
}

export type WsStatus  = 'disconnected' | 'connecting' | 'connected' | 'error';
// 'pairing' = first-boot UX: TV shows 6-char code + QR, polls server until staff
// claims from tablet. 'setup' is preserved for engineering/dev mode where the
// operator types the API URL + TV instance UUID by hand (USB keyboard required).
export type AppState  = 'pairing' | 'setup' | 'boot' | 'running' | 'error';

// ── Storage keys ─────────────────────────────────────────────────────────────
const K = { id: 'tv_instance_id', url: 'tv_api_url' } as const;

// Default API base. In production the cloud URL is injected at build time via
// EXPO_PUBLIC_API_URL (inlined by babel-preset-expo). Falls back to localhost
// for same-host dev only — a separate device (the TV) must be given a real
// network address (LAN IP in local testing, cloud domain in prod), never
// localhost, which would resolve to the TV itself.
const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Bucket helpers ───────────────────────────────────────────────────────────
// 9-state machine: PREPARING | READY_TO_EXPEDITE | READY | REMAKING | SCHEDULED.
// Terminal states (collected/expired/cancelled) are not buffered — dropped.
type BucketKey = 'preparing' | 'expediting' | 'ready' | 'remaking' | 'scheduled';
const ALL_BUCKETS: BucketKey[] = ['preparing', 'expediting', 'ready', 'remaking', 'scheduled'];

interface BucketState {
  preparing:  Order[];
  expediting: Order[];
  ready:      Order[];
  remaking:   Order[];
  scheduled:  Order[];
}

function dropFromAllBuckets(s: BucketState, displayNumber: string): Partial<BucketState> {
  const out: Partial<BucketState> = {};
  for (const k of ALL_BUCKETS) {
    const arr = s[k];
    const filtered = arr.filter((o) => o.display_number !== displayNumber);
    if (filtered.length !== arr.length) out[k] = filtered;
  }
  return out;
}

function moveToBucket(
  s: BucketState,
  displayNumber: string,
  newStatus: Order['status'],
  target: BucketKey,
): Partial<BucketState> {
  // Find the order in any bucket.
  let found: Order | null = null;
  const out: Partial<BucketState> = {};
  for (const k of ALL_BUCKETS) {
    const arr = s[k];
    const idx = arr.findIndex((o) => o.display_number === displayNumber);
    if (idx === -1) continue;
    if (!found) found = { ...arr[idx], status: newStatus };
    out[k] = arr.filter((_, i) => i !== idx);
  }
  if (!found) return {};
  out[target] = [...(out[target] ?? s[target]), found];
  return out;
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface State {
  tvInstanceId: string | null;
  apiUrl:       string;
  tvRow:        TvRow | null;
  appState:     AppState;
  errorMsg:     string | null;
  wsStatus:     WsStatus;
  wsRetry:      number;
  // Pickup buckets — 9-state machine (spec sec.3). Terminal states are not buffered.
  preparing:    Order[];   // 'new' | 'prep'
  expediting:   Order[];   // 'ready_to_expedite'
  ready:        Order[];   // 'ready'
  remaking:     Order[];   // 'remaking'
  scheduled:    Order[];   // 'scheduled'
  // Recall flash — order id → epoch ms until which the card flashes after a
  // recall re-announcement (manual or auto). Merged into the screen's fresh-pulse.
  recallFlash:  Record<string, number>;
  // Store-wide operator settings (last received from /api/store_settings or settings:updated WS).
  storeSettings: StoreSettingsShape;
  currentDaypart: 'breakfast' | 'lunch' | 'dinner' | 'all';
  // Menu
  menuItems:    MenuItemData[];
  // Featured (M01 F.C — TV Zone B Banner rotation)
  featuredItems:           MenuItemData[];
  featuredRotationSeconds: 5 | 8 | 10 | 12;
  // Event
  currentEvent: EventData | null;
}

interface Actions {
  hydrate(): Promise<void>;
  saveCredentials(tvInstanceId: string, apiUrl: string): void;
  setTvRow(row: TvRow): void;
  applyHotSwap(row: TvRow): void;
  setAppState(s: AppState, error?: string): void;
  setWsStatus(s: WsStatus): void;
  incWsRetry(): void;
  resetWsRetry(): void;
  reset(): void;
  // Pickup
  setOrders(orders: Order[]): void;
  addOrder(order: Order): void;
  markPreparing(displayNumber: string): void;
  markExpedite(displayNumber: string): void;
  markReady(displayNumber: string): void;
  markRemaking(displayNumber: string): void;
  markScheduled(displayNumber: string): void;
  expireOrder(displayNumber: string): void;
  removeOrder(displayNumber: string): void;
  cancelOrder(displayNumber: string): void;
  // Recall flash
  startRecallFlash(displayNumber: string, untilMs: number): void;
  clearRecallFlash(displayNumber: string): void;
  // Settings + daypart
  setStoreSettings(settings: StoreSettingsShape): void;
  setDaypart(d: 'breakfast' | 'lunch' | 'dinner' | 'all'): void;
  // Menu
  setMenuItems(items: MenuItemData[]): void;
  toggleMenuItem(itemId: string, available: boolean): void;
  // Featured
  setFeaturedItems(items: MenuItemData[]): void;
  setFeaturedRotationSeconds(sec: 5 | 8 | 10 | 12): void;
  // Event
  setEvent(event: EventData): void;
  clearEvent(): void;
}

export const useTVStore = create<State & Actions>()((set) => ({
  tvInstanceId: null,
  apiUrl:       DEFAULT_API_URL,
  tvRow:        null,
  appState:     'boot',
  errorMsg:     null,
  wsStatus:     'disconnected',
  wsRetry:      0,
  preparing:    [],
  expediting:   [],
  ready:        [],
  remaking:     [],
  scheduled:    [],
  recallFlash:  {},
  storeSettings:  null,
  currentDaypart: 'all',
  menuItems:    [],
  featuredItems:           [],
  featuredRotationSeconds: 8,
  currentEvent: null,

  hydrate: async () => {
    try {
      const [id, url, cacheRaw] = await Promise.all([
        AsyncStorage.getItem(K.id),
        AsyncStorage.getItem(K.url),
        AsyncStorage.getItem(CACHE_KEY),
      ]);
      const base = { tvInstanceId: id, apiUrl: url ?? DEFAULT_API_URL };
      const snap = deserialize(cacheRaw);

      // Offline-first (resilience R2/R3): if we have credentials AND a renderable
      // cache, boot straight into 'running' and paint the last loaded content
      // immediately — before, and regardless of, the server being reachable.
      // The background WS + refetch (App.tsx) reconcile once connectivity returns;
      // a failed refresh never clears what's on screen.
      if (id && isRenderable(snap)) {
        set({
          ...base,
          tvRow:        snap.tvRow,
          preparing:    snap.preparing,
          expediting:   snap.expediting,
          ready:        snap.ready,
          remaking:     snap.remaking,
          scheduled:    snap.scheduled,
          storeSettings:           snap.storeSettings,
          currentDaypart:          snap.currentDaypart,
          menuItems:               snap.menuItems,
          featuredItems:           snap.featuredItems,
          featuredRotationSeconds: snap.featuredRotationSeconds,
          currentEvent:            snap.currentEvent,
          appState: 'running',
        });
        return;
      }

      // First-boot (no saved instance id) defaults to 'pairing' — TV shows
      // a 6-char code that staff enters on the tablet. The legacy 'setup'
      // flow (manual URL+UUID entry) remains reachable for engineering use
      // via a long-press / hidden gesture from PairingScreen.
      set({ ...base, appState: id ? 'boot' : 'pairing' });
    } catch {
      set({ appState: 'pairing' });
    }
  },

  saveCredentials: (tvInstanceId, apiUrl) => {
    set({ tvInstanceId, apiUrl, appState: 'boot' });
    Promise.all([
      AsyncStorage.setItem(K.id,  tvInstanceId),
      AsyncStorage.setItem(K.url, apiUrl),
    ]).catch(() => {});
  },

  setTvRow:     (tvRow)     => set({ tvRow, appState: 'running' }),
  applyHotSwap: (tvRow)     => set({ tvRow }),
  setAppState:  (appState, errorMsg) => set({ appState, errorMsg: errorMsg ?? null }),
  setWsStatus:  (wsStatus)  => set({ wsStatus }),
  incWsRetry:   ()          => set((s) => ({ wsRetry: s.wsRetry + 1 })),
  resetWsRetry: ()          => set({ wsRetry: 0 }),

  reset: () => {
    Promise.all([
      AsyncStorage.removeItem(K.id),
      AsyncStorage.removeItem(K.url),
      AsyncStorage.removeItem(CACHE_KEY),
    ]).catch(() => {});
    set({
      tvInstanceId: null, tvRow: null, appState: 'setup',
      errorMsg: null, wsStatus: 'disconnected', wsRetry: 0,
      preparing: [], expediting: [], ready: [], remaking: [], scheduled: [], recallFlash: {},
      storeSettings: null, currentDaypart: 'all',
      menuItems: [], featuredItems: [], featuredRotationSeconds: 8, currentEvent: null,
    });
  },

  // ── Pickup ──────────────────────────────────────────────────────────────────
  setOrders: (orders) => set({
    preparing:  orders.filter((o) => o.status === 'new' || o.status === 'prep'),
    expediting: orders.filter((o) => o.status === 'ready_to_expedite'),
    ready:      orders.filter((o) => o.status === 'ready'),
    remaking:   orders.filter((o) => o.status === 'remaking'),
    scheduled:  orders.filter((o) => o.status === 'scheduled'),
  }),

  addOrder: (order) => set((s) => {
    const seen = (arr: Order[]) => arr.some((o) => o.id === order.id);
    if (seen(s.preparing) || seen(s.expediting) || seen(s.ready) || seen(s.remaking) || seen(s.scheduled)) {
      return s;
    }
    if (order.status === 'scheduled')         return { scheduled:  [...s.scheduled,  order] };
    if (order.status === 'ready_to_expedite') return { expediting: [...s.expediting, order] };
    if (order.status === 'ready')             return { ready:      [...s.ready,      order] };
    if (order.status === 'remaking')          return { remaking:   [...s.remaking,   order] };
    return { preparing: [...s.preparing, order] };
  }),

  // generic bucket move helper — extracted in place via inline filter to keep set() readable.
  markPreparing: (displayNumber) => set((s) => moveToBucket(s, displayNumber, 'prep', 'preparing')),
  markExpedite:  (displayNumber) => set((s) => moveToBucket(s, displayNumber, 'ready_to_expedite', 'expediting')),
  markReady:     (displayNumber) => set((s) => moveToBucket(s, displayNumber, 'ready', 'ready')),
  markRemaking:  (displayNumber) => set((s) => moveToBucket(s, displayNumber, 'remaking', 'remaking')),
  markScheduled: (displayNumber) => set((s) => moveToBucket(s, displayNumber, 'scheduled', 'scheduled')),
  expireOrder:   (displayNumber) => set((s) => dropFromAllBuckets(s, displayNumber)),

  removeOrder: (displayNumber) => set((s) => dropFromAllBuckets(s, displayNumber)),
  cancelOrder: (displayNumber) => set((s) => dropFromAllBuckets(s, displayNumber)),

  // ── Recall flash ──────────────────────────────────────────────────────────────
  // Resolve the display_number to its order id (the card is in the ready bucket on
  // recall) and stamp an expiry so the screen's isCardFresh() flashes it.
  startRecallFlash: (displayNumber, untilMs) => set((s) => {
    const all = [...s.ready, ...s.preparing, ...s.expediting, ...s.remaking, ...s.scheduled];
    const order = all.find((o) => o.display_number === displayNumber);
    if (!order) return s;
    return { recallFlash: { ...s.recallFlash, [order.id]: untilMs } };
  }),
  clearRecallFlash: (displayNumber) => set((s) => {
    const all = [...s.ready, ...s.preparing, ...s.expediting, ...s.remaking, ...s.scheduled];
    const order = all.find((o) => o.display_number === displayNumber);
    if (!order || !(order.id in s.recallFlash)) return s;
    const next = { ...s.recallFlash };
    delete next[order.id];
    return { recallFlash: next };
  }),

  setStoreSettings: (storeSettings) => set({ storeSettings }),
  setDaypart:       (currentDaypart) => set({ currentDaypart }),

  // ── Menu ─────────────────────────────────────────────────────────────────────
  setMenuItems: (menuItems) => set({ menuItems }),

  toggleMenuItem: (itemId, available) => set((s) => ({
    menuItems: s.menuItems.map((i) =>
      i.id === itemId ? { ...i, available, sold_out: !available } : i,
    ),
  })),

  // ── Featured (M01 F.C) ────────────────────────────────────────────────────────
  setFeaturedItems:           (featuredItems)           => set({ featuredItems }),
  setFeaturedRotationSeconds: (featuredRotationSeconds) => set({ featuredRotationSeconds }),

  // ── Event ─────────────────────────────────────────────────────────────────────
  setEvent:   (currentEvent) => set({ currentEvent }),
  clearEvent: ()             => set({ currentEvent: null }),
}));

// ── Offline-first persistence (resilience R1/R2/R3) ───────────────────────────
// Debounced snapshot of the display slice to AsyncStorage on every change, so a
// TV power-cycle or tablet/server reboot resumes from the last loaded content
// (see hydrate + tvPersist.ts). Debounced to coalesce bursts (WS replay, refetch)
// into a single write. Credentials + volatile connection fields are excluded by
// buildSnapshot, so this never persists half-connected junk.
let persistTimer: ReturnType<typeof setTimeout> | null = null;
useTVStore.subscribe((state) => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(CACHE_KEY, serialize(buildSnapshot(state))).catch(() => {});
  }, 400);
});
