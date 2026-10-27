import React, { useCallback, useEffect, useRef } from 'react';
import { useTVStore } from './store/tvStore';
import type { TvRow } from './store/tvStore';
import { enqueueReady, type TtsLang, type TtsGender } from './utils/tts';
import { t } from '@restosync/shared';
import { useThemeFonts } from './hooks/useThemeFonts';
import SetupScreen       from './screens/SetupScreen';
import PairingScreen     from './screens/PairingScreen';
import BootScreen        from './screens/BootScreen';
import ErrorScreen       from './screens/ErrorScreen';
import MenuBoardScreen   from './screens/MenuBoardScreen';
import SingleVenuePickupScreen from './screens/SingleVenuePickupScreen';
import MultiVenuePickupScreen  from './screens/MultiVenuePickupScreen';
import PortraitPickupScreen    from './screens/PortraitPickupScreen';
import EventBoardScreen  from './screens/EventBoardScreen';

const WS_MAX_RETRY   = 5;
const HEARTBEAT_MS   = 30_000;
const REMOVE_DELAY   = 30_000;

export default function App() {
  const store = useTVStore();
  const fontsReady = useThemeFonts();

  const wsRef          = useRef<WebSocket | null>(null);
  const heartbeatRef   = useRef<ReturnType<typeof setInterval>  | null>(null);
  const retryRef       = useRef<ReturnType<typeof setTimeout>   | null>(null);
  const removeTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const recallTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── 1. Hydrate from AsyncStorage on mount ─────────────────────────────────
  useEffect(() => { useTVStore.getState().hydrate(); }, []);

  // ── 2. Fetch profile when tvInstanceId becomes available in boot state ─────
  useEffect(() => {
    const { appState, tvInstanceId, apiUrl } = useTVStore.getState();
    if (appState !== 'boot' || !tvInstanceId) return;
    fetchProfile(tvInstanceId, apiUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.appState, store.tvInstanceId]);

  // ── 3. Connect WS once profile is loaded (storeId known) ──────────────────
  useEffect(() => {
    if (store.appState !== 'running' || !store.tvRow) return;
    connectWs();
    return () => destroyWs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.appState, store.tvRow?.instance.store_id]);

  // ── 4. Reload data when function_type changes (hot-swap) ──────────────────
  useEffect(() => {
    if (store.appState !== 'running') return;
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.tvRow?.instance.function_type]);

  // ─── Profile fetch ─────────────────────────────────────────────────────────
  async function fetchProfile(id: string, url: string) {
    try {
      const res = await fetch(`${url}/api/tv-instances/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row: TvRow = await res.json();
      useTVStore.getState().setTvRow(row);
    } catch (e) {
      useTVStore.getState().setAppState('error', e instanceof Error ? e.message : 'Failed to load profile');
    }
  }

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    const { tvRow, tvInstanceId, apiUrl } = useTVStore.getState();
    if (!tvRow || !tvInstanceId) return;

    const wsBase = apiUrl.replace(/^http/, 'ws');
    const url = `${wsBase}/ws?store_id=${tvRow.instance.store_id}&device_type=tv&tv_instance_id=${tvInstanceId}`;

    useTVStore.getState().setWsStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      useTVStore.getState().resetWsRetry();
      useTVStore.getState().setWsStatus('connected');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.onmessage = (e: any) => {
      try {
        const { event, payload } = JSON.parse(e.data as string) as { event: string; payload: unknown };
        handleWsEvent(event, payload);
      } catch { /* malformed message */ }
    };

    ws.onclose = () => {
      stopHeartbeat();
      useTVStore.getState().setWsStatus('disconnected');
      const retry = useTVStore.getState().wsRetry;
      if (retry < WS_MAX_RETRY) {
        useTVStore.getState().incWsRetry();
        const delay = Math.min(3_000 * Math.pow(2, retry), 30_000); // AG-002: exponential backoff
        retryRef.current = setTimeout(connectWs, delay);
      } else {
        useTVStore.getState().setWsStatus('error');
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  function destroyWs() {
    stopHeartbeat();
    wsRef.current?.close();
    wsRef.current = null;
    removeTimers.current.forEach(clearTimeout);
    removeTimers.current.clear();
    recallTimers.current.forEach(clearTimeout);
    recallTimers.current.clear();
  }

  function stopHeartbeat() {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (retryRef.current)     { clearTimeout(retryRef.current);      retryRef.current = null; }
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event: 'tv:heartbeat', payload: { ts: Date.now() } }));
      }
    }, HEARTBEAT_MS);
  }

  // ─── WS event dispatch ─────────────────────────────────────────────────────
  function handleWsEvent(event: string, payload: unknown) {
    const p = payload as Record<string, unknown>;
    const s = useTVStore.getState();

    switch (event) {
      case 'connection:ack':
        loadInitialData();
        startHeartbeat();
        break;

      case 'order:new':
        s.addOrder(p as unknown as Parameters<typeof s.addOrder>[0]);
        break;

      case 'order:status_changed': {
        const { status, display_number } = p as { status: string; display_number: string };
        if (status === 'prep')                    s.markPreparing(display_number);
        else if (status === 'ready_to_expedite')  s.markExpedite(display_number);
        else if (status === 'ready')              s.markReady(display_number);
        else if (status === 'remaking')           s.markRemaking(display_number);
        else if (status === 'scheduled')          s.markScheduled(display_number);
        else if (status === 'expired')            { clearRemoveTimer(display_number); s.expireOrder(display_number); }
        else if (status === 'collected' || status === 'cancelled') {
          clearRemoveTimer(display_number);
          s.removeOrder(display_number);
        }
        break;
      }

      case 'display:order_expedite': {
        const { display_number } = p as { display_number: string };
        s.markExpedite(display_number);
        break;
      }

      case 'display:order_ready': {
        const { display_number, recall } = p as { display_number: string; recall?: boolean };
        s.markReady(display_number);
        // Queue the spoken announcement — while one is playing, numbers that go
        // ready are collected and then called together (see enqueueReady/tts.ts).
        if (s.tvRow?.profile?.tts_enabled !== false) {
          const audio = (s.storeSettings as Record<string, Record<string, string>> | null)?.audio;
          const ttsLang   = (audio?.tts_lang as TtsLang | undefined) ?? 'en';
          const ttsGender = (audio?.tts_gender as TtsGender | undefined) ?? 'auto';
          enqueueReady(display_number, ttsLang, ttsGender, readyFormat);
        }
        // ready_auto_remove_enabled / ready_auto_remove_seconds — unified
        // configurable auto-clear keys. Default: disabled (numbers stay until
        // staff taps Picked Up). Per-TV overrides win over store-wide values.
        const settingsBlob  = s.storeSettings as Record<string, unknown> | null;
        const display       = (settingsBlob?.display ?? {}) as {
          ready_auto_remove_enabled?: boolean;
          ready_auto_remove_seconds?: number;
        };
        const tvId          = s.tvRow?.instance.id ?? null;
        const perTv         = (settingsBlob?.per_tv ?? {}) as Record<string, {
          display?: { ready_auto_remove_enabled?: boolean; ready_auto_remove_seconds?: number };
        }>;
        const perTvOverride = tvId ? perTv[tvId]?.display : undefined;
        const enabled       = perTvOverride?.ready_auto_remove_enabled
          ?? display.ready_auto_remove_enabled
          ?? false;
        const seconds       = perTvOverride?.ready_auto_remove_seconds
          ?? display.ready_auto_remove_seconds
          ?? 60;
        if (enabled && seconds > 0) {
          scheduleRemove(display_number, seconds * 1000);
        }
        // enabled=false → "Manual (keep)" — no auto-remove timer.

        // Recall flash — a recall re-announce doesn't change the order's bucket,
        // so the normal fresh-pulse won't re-fire. Force the card to flash for the
        // configured duration (display.recall_flash_seconds, per-TV override wins).
        if (recall) {
          const perTvFlash = tvId
            ? (perTv[tvId]?.display as { recall_flash_seconds?: number } | undefined)?.recall_flash_seconds
            : undefined;
          const flashSec = perTvFlash
            ?? (display as { recall_flash_seconds?: number }).recall_flash_seconds
            ?? 15;
          if (flashSec > 0) scheduleRecallFlash(display_number, flashSec * 1000);
        }
        break;
      }

      case 'display:order_remove': {
        const { display_number } = p as { display_number: string };
        clearRemoveTimer(display_number);
        s.removeOrder(display_number);
        break;
      }

      case 'order:expired':
        s.expireOrder((p as { display_number: string }).display_number);
        break;

      case 'order:cancelled':
        s.cancelOrder((p as { display_number: string }).display_number);
        break;

      case 'display:daypart_changed':
        s.setDaypart((p as { daypart: 'breakfast' | 'lunch' | 'dinner' | 'all' }).daypart);
        break;

      case 'settings:updated':
        // Refresh full settings on any change — payload only carries the keys list.
        loadStoreSettings(useTVStore.getState().apiUrl);
        break;

      case 'display:menu_refresh':
        loadMenuItems(useTVStore.getState().apiUrl);
        loadFeatured(useTVStore.getState().apiUrl);    // F.C — featured pool re-evaluated on refresh
        break;

      case 'display:item_toggle': {
        const { item_id, available } = p as { item_id: string; available: boolean };
        s.toggleMenuItem(item_id, available);
        break;
      }

      // M01 F.C — Featured rules/interval edited on Tablet → TV re-fetches pool.
      case 'display:featured_config_changed':
      case 'display:full_refresh':
        loadFeatured(useTVStore.getState().apiUrl);
        break;

      case 'display:event_push':
        s.setEvent(p as unknown as Parameters<typeof s.setEvent>[0]);
        break;

      case 'display:event_clear':
        s.clearEvent();
        break;

      case 'display:config_push':
        s.applyHotSwap(p as unknown as TvRow);
        break;
    }
  }

  // ─── Initial data load ─────────────────────────────────────────────────────
  function loadInitialData() {
    const { tvRow, apiUrl } = useTVStore.getState();
    if (!tvRow) return;
    // Every TV pulls store settings — they drive theme, language, audio, daypart.
    loadStoreSettings(apiUrl);
    const ft = tvRow.instance.function_type;
    if (ft === 'pickup') loadOrders(apiUrl);
    else if (ft === 'menu') {
      loadMenuItems(apiUrl);
      loadFeatured(apiUrl);              // M01 F.C — TV Zone B rotation pool
      loadActiveEvents(apiUrl);          // D1 — Zone D ticker pulls from currentEvent
    }
    else if (ft === 'event' || ft === 'ad') loadActiveEvents(apiUrl);
  }

  async function loadOrders(apiUrl: string) {
    try {
      // 9-state machine: pull all non-terminal statuses so PREPARING / EXPEDITING /
      // READY / REMAKING / SCHEDULED columns can all populate on reconnect.
      const statuses = 'new,prep,ready_to_expedite,ready,remaking,scheduled';
      const res = await fetch(`${apiUrl}/api/orders?status=${statuses}&limit=100`);
      if (res.ok) useTVStore.getState().setOrders(await res.json());
    } catch { /* silently ignore — WS will keep state fresh */ }
  }

  async function loadStoreSettings(apiUrl: string) {
    try {
      const { tvInstanceId } = useTVStore.getState();
      const url = tvInstanceId
        ? `${apiUrl}/api/store_settings?tv_instance_id=${tvInstanceId}`
        : `${apiUrl}/api/store_settings`;
      const res = await fetch(url);
      if (res.ok) useTVStore.getState().setStoreSettings(await res.json());
    } catch { /* silently ignore */ }
  }

  async function loadMenuItems(apiUrl: string) {
    try {
      // AG-021: explicit limit prevents default truncation by terminal/inactive items
      const res = await fetch(`${apiUrl}/api/menu/items?limit=100`);
      if (res.ok) useTVStore.getState().setMenuItems(await res.json());
    } catch { /* silently ignore */ }
  }

  async function loadActiveEvents(apiUrl: string) {
    try {
      const res = await fetch(`${apiUrl}/api/events/active`);
      if (res.ok) {
        const list = (await res.json()) as unknown[];
        if (list.length > 0) {
          const s = useTVStore.getState();
          s.setEvent(list[0] as Parameters<typeof s.setEvent>[0]);
        }
      }
    } catch { /* silently ignore */ }
  }

  // M01 F.C — Featured rotation pool. /api/menu/featured/current returns
  // { items: MenuItemData[], rotation_seconds: 5|8|10|12, current_daypart }.
  // We refresh on boot, on display:full_refresh, and on display:featured_config_changed.
  async function loadFeatured(apiUrl: string) {
    try {
      const res = await fetch(`${apiUrl}/api/menu/featured/current?limit=8`);
      if (!res.ok) return;
      const body = await res.json() as {
        items?: unknown[];
        rotation_seconds?: 5 | 8 | 10 | 12;
      };
      const s = useTVStore.getState();
      s.setFeaturedItems((body.items ?? []) as Parameters<typeof s.setFeaturedItems>[0]);
      if (body.rotation_seconds && [5, 8, 10, 12].includes(body.rotation_seconds)) {
        s.setFeaturedRotationSeconds(body.rotation_seconds);
      }
    } catch { /* silently ignore */ }
  }

  // ─── Remove timer helpers ─────────────────────────────────────────────────
  function scheduleRemove(displayNumber: string, ms: number) {
    clearRemoveTimer(displayNumber);
    const id = setTimeout(() => useTVStore.getState().removeOrder(displayNumber), ms);
    removeTimers.current.set(displayNumber, id);
  }

  function clearRemoveTimer(displayNumber: string) {
    const id = removeTimers.current.get(displayNumber);
    if (id !== undefined) { clearTimeout(id); removeTimers.current.delete(displayNumber); }
  }

  // ─── Ready-announce formatting ────────────────────────────────────────────
  // Returns the utterance PIECES per language. The queue (tts.ts) speaks them
  // with a silence gap between pieces, so a multi-number call pauses between
  // numbers: "Orders 1 … 2 … 3 … are ready for pickup". One number → one piece.
  function readyFormat(nums: string[]): { en: string[]; es: string[] } {
    if (nums.length === 1) {
      return {
        en: [t('tts.ready_announce', 'en', { number: nums[0] })],
        es: [t('tts.ready_announce', 'es', { number: nums[0] })],
      };
    }
    return { en: piecesFor(nums, 'en'), es: piecesFor(nums, 'es') };
  }

  // ["Orders 1", "2", "3", "4", "5 are ready for pickup"] — prefix glued to the
  // first number, suffix to the last, so gaps fall only between numbers.
  function piecesFor(nums: string[], lang: 'en' | 'es'): string[] {
    const prefix = t('tts.ready_prefix', lang);
    const suffix = t('tts.ready_suffix', lang);
    if (nums.length === 1) return [`${prefix} ${nums[0]} ${suffix}`];
    return nums.map((n, i) => {
      if (i === 0) return `${prefix} ${n}`;
      if (i === nums.length - 1) return `${n} ${suffix}`;
      return n;
    });
  }

  // ─── Recall flash helpers ─────────────────────────────────────────────────
  // Stamp a flash window in the store and schedule its clear so the card stops
  // flashing exactly when the window ends. A repeat recall restarts the window.
  function scheduleRecallFlash(displayNumber: string, ms: number) {
    const prev = recallTimers.current.get(displayNumber);
    if (prev !== undefined) clearTimeout(prev);
    useTVStore.getState().startRecallFlash(displayNumber, Date.now() + ms);
    const id = setTimeout(() => {
      useTVStore.getState().clearRecallFlash(displayNumber);
      recallTimers.current.delete(displayNumber);
    }, ms);
    recallTimers.current.set(displayNumber, id);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const { appState, tvRow } = store;

  // Block on ttf load so the 12-theme display never flashes wrong fonts.
  // useThemeFonts resolves immediately when no ttfs are bundled yet.
  if (!fontsReady) return <BootScreen />;

  if (appState === 'pairing') return <PairingScreen />;
  if (appState === 'setup')   return <SetupScreen />;
  if (appState === 'boot')    return <BootScreen />;
  if (appState === 'error') return (
    <ErrorScreen
      message={store.errorMsg ?? 'Unknown error'}
      onRetry={() => { useTVStore.getState().setAppState('boot'); }}
      onReset={() => { useTVStore.getState().reset(); }}
    />
  );

  const ft          = tvRow?.instance.function_type;
  const pickupMode  = tvRow?.profile?.pickup_mode;
  // Spec sec.22 — portrait switches layout entirely. Per-TV override via
  // storeSettings.per_tv[id].display.orientation takes precedence in the future;
  // for P2 we read the store-wide setting only.
  const orientation = ((store.storeSettings as Record<string, Record<string, string>> | null)?.display?.orientation) ?? 'landscape';

  if (ft === 'menu')   return <MenuBoardScreen />;
  if (ft === 'pickup') {
    if (orientation === 'portrait') return <PortraitPickupScreen />;
    return pickupMode === 'multi_venue'
      ? <MultiVenuePickupScreen />
      : <SingleVenuePickupScreen />;
  }
  if (ft === 'event' || ft === 'ad') return <EventBoardScreen />;

  return <BootScreen />;
}
