// WS room 관리 + broadcast — store_id 기반 in-memory 채널
// WebSocket.WebSocket 타입 직접 의존 없이 최소 인터페이스로 처리
//
// AG-003: event names must use colon-separated lowercase (e.g. 'order:status_changed').
// WsEvent below is the canonical list — add new events here BEFORE emitting from a route
// so TypeScript catches typos and accidental dialect drift.
interface WsSock {
  send(data: string, cb?: (err?: Error) => void): void;
  readyState: number; // 1 = OPEN
}

export interface WsClient {
  socket: WsSock;
  device_type: 'tablet' | 'tv';
  role?: string;   // tv screen role: menu | pickup | event | ai_ads
  store_id: string;
}

// ── WS event registry (AG-003) ───────────────────────────────────────────────
// All emitted events must appear here. `broadcast` accepts plain string for backward
// compat with legacy call sites; new code should pass a WsEvent value.
export const WS_EVENTS = [
  // Order lifecycle (spec sec.3)
  'order:new',
  'order:status_changed',
  'order:accepted',
  'order:auto_accepted',
  'order:rejected',
  'order:pending_accept',
  'order:cancelled',
  'order:expired',
  'order:undo',
  'order:remake_started',
  'order:scheduled_promoted',
  'order:modified',
  // Display targets — pickup TV (spec sec.4, sec.12)
  'display:order_ready',
  'display:order_expedite',
  'display:order_remove',
  'display:daypart_changed',
  'display:per_tv_settings_changed',
  'display:emergency_message',
  'display:recall_tts',
  'display:ticker_update',
  // Display targets — menu TV (M01 PRD v1.2 §6, Sprint 1 S1.9~S1.16)
  'display:menu_item_added',
  'display:menu_item_updated',
  'display:menu_item_removed',
  'display:menu_item_sold_out_toggled',
  'display:menu_refresh',                  // legacy — kept for backward compat (M02/M04)
  'display:item_toggle',                   // legacy
  'display:full_refresh',                  // M01 §6 — bulk import 등 직후
  'display:config_changed',                // tv_content_profiles 변경
  'display:category_reordered',
  'display:variant_toggled',               // v1.1
  'display:combo_updated',                 // v1.1
  'display:featured_rotation',             // v1.1 — Featured Banner pool 갱신
  'display:featured_config_changed',       // Sprint F.A — rules/interval edited (TV refetches /featured/current)
  'display:ingredient_low',                // P1.5 — auto 86
  // Display targets — event TV (M03 — AG-015 cron flow + manual active toggle)
  'display:event_push',                    // start_at reached or PATCH active=true
  'display:event_clear',                   // end_at reached or PATCH active=false / DELETE
  // Tablet 알림
  'tablet:analytics_updated',              // P2
  // Notification side-channel
  'notification:sms_sent',
  // Settings
  'settings:updated',
  // TV heartbeat
  'tv:heartbeat',
  'tv:heartbeat:ack',
] as const;

export type WsEvent = (typeof WS_EVENTS)[number];

// Map<store_id, Set<WsClient>>
const rooms = new Map<string, Set<WsClient>>();

export function joinRoom(client: WsClient): void {
  if (!rooms.has(client.store_id)) rooms.set(client.store_id, new Set());
  rooms.get(client.store_id)!.add(client);
}

export function leaveRoom(client: WsClient): void {
  rooms.get(client.store_id)?.delete(client);
}

export function broadcast(
  storeId: string,
  event: WsEvent | string,
  payload: unknown,
  filter?: (c: WsClient) => boolean,
): void {
  const clients = rooms.get(storeId);
  if (!clients?.size) return;

  const msg = JSON.stringify({
    event,
    store_id: storeId,
    ts: new Date().toISOString(),
    payload,
  });

  for (const client of clients) {
    if (client.socket.readyState !== 1) continue;  // OPEN only
    if (filter && !filter(client)) continue;
    client.socket.send(msg);
  }
}

export function roomSize(storeId: string): number {
  return rooms.get(storeId)?.size ?? 0;
}
