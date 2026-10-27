// M01 Sprint 3 — Menu WebSocket subscription
//
// AG-002: 3초 reconnect. AG-003: 정본 콜론+소문자 이벤트명.
// 메뉴 관련 mutating 이벤트 수신 시 TanStack Query cache invalidate.
// 자신의 mutation 직후 발사된 이벤트도 동일하게 처리 — 다른 디바이스/POS/import 변경 cover.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';

// AG-003: broadcast.ts WS_EVENTS allowlist와 동기화
const MENU_MUTATING_EVENTS = new Set<string>([
  'display:menu_item_added',
  'display:menu_item_updated',
  'display:menu_item_removed',
  'display:menu_item_sold_out_toggled',
  'display:full_refresh',
  'display:category_reordered',
  'display:item_toggle',                   // legacy mirror
  'display:daypart_changed',               // windows 변경 → 클라가 daypart filter 재평가 필요
  'display:featured_config_changed',       // F.A — rules/interval 변경 → preview/rules invalidate
  'display:combo_updated',                 // G.A — combo create/update/delete → list/detail invalidate
]);

export function useMenuWsSubscription(): void {
  const qc      = useQueryClient();
  const storeId = useAuthStore((s) => s.storeId);
  const token   = useAuthStore((s) => s.token);
  const apiUrl  = useAuthStore((s) => s.apiUrl);

  useEffect(() => {
    if (!storeId || !token || !apiUrl) return;

    const wsUrl = apiUrl.replace(/^http/, 'ws')
      + `/ws?store_id=${encodeURIComponent(storeId)}`
      + `&token=${encodeURIComponent(token)}`
      + '&device_type=tablet';

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const open = () => {
      let sock: WebSocket;
      try { sock = new WebSocket(wsUrl); } catch { return; }
      ws = sock;
      sock.onmessage = (e: MessageEvent) => {
        try {
          const raw = typeof e.data === 'string' ? e.data : '';
          if (!raw) return;
          const msg = JSON.parse(raw) as { event?: string };
          if (msg.event && MENU_MUTATING_EVENTS.has(msg.event)) {
            qc.invalidateQueries({ queryKey: ['menu', 'items'] });
            // Page B 단일 item cache (['menu','item',id])도 invalidate. partial key는 모든 id 매칭.
            qc.invalidateQueries({ queryKey: ['menu', 'item'] });
            if (msg.event === 'display:category_reordered' || msg.event === 'display:full_refresh') {
              qc.invalidateQueries({ queryKey: ['menu', 'categories'] });
            }
            if (msg.event === 'display:featured_config_changed' || msg.event === 'display:full_refresh') {
              qc.invalidateQueries({ queryKey: ['menu', 'featured'] });
            }
            if (msg.event === 'display:combo_updated' || msg.event === 'display:full_refresh') {
              qc.invalidateQueries({ queryKey: ['menu', 'combos'] });
            }
          }
        } catch { /* non-JSON ping — ignore */ }
      };
      sock.onclose = () => {
        if (cancelled) return;
        // AG-002: reconnect after 3s
        reconnectTimer = setTimeout(open, 3000);
      };
    };
    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* noop */ }
    };
  }, [storeId, token, apiUrl, qc]);
}
