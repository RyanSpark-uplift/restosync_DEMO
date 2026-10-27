import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useAuthStore } from '../../../src/store/auth';
import { api } from '../../../src/api/client';
import type { Order } from '../../../src/api/client';
import { Section, rowStyles } from '../../../src/components/SettingsRow';

type OrderSource = 'pos' | 'kiosk' | 'manual' | 'doordash';
const SOURCES: OrderSource[] = ['pos', 'kiosk', 'manual', 'doordash'];

type WsStatus = 'connecting' | 'live' | 'closed' | 'error';

interface LogEntry {
  t:        number;
  event:    string;
  store_id?: string;
  payload?: unknown;
}

const MAX_LOG = 200;

export default function EngineerScreen() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const storeId = useAuthStore((st) => st.storeId);
  const token   = useAuthStore((st) => st.token);
  const apiUrl  = useAuthStore((st) => st.apiUrl);

  // shared async state
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);
  const [busy,     setBusy]     = useState<string | null>(null);

  // Order Lab form state
  const [oName,      setOName]      = useState('Henry');
  const [oItem,      setOItem]      = useState('Crispy Sandwich');
  const [oSource,    setOSource]    = useState<OrderSource>('pos');
  const [oAutoReady, setOAutoReady] = useState(true);

  // WS Live Log
  const [log,         setLog]         = useState<LogEntry[]>([]);
  const [wsStatus,    setWsStatus]    = useState<WsStatus>('closed');
  const [wsAttempt,   setWsAttempt]   = useState(0);    // bump to force a fresh connection
  const wsRef = useRef<WebSocket | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2500);
  }, []);

  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, okMsg?: (r: T) => string) => {
    setError(null);
    setBusy(key);
    try {
      const r = await fn();
      // Engineer ops mutate orders — invalidate Dashboard's cache so the new state shows up.
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (okMsg) flashToast(okMsg(r));
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [flashToast, qc]);

  const createTestOrder = useCallback(async (opts: {
    name: string; item: string; source: OrderSource;
    /** Stop after this status. 'new' = no transition, 'prep' = +prep, 'ready' = +prep+ready */
    advance?: 'new' | 'prep' | 'ready';
  }) => {
    const order = await api.post<Order>('/api/orders', {
      customer_name: opts.name,
      source:        opts.source,
      items:         [{ name: opts.item, qty: 1 }],
    });
    const advance = opts.advance ?? 'prep';
    if (advance === 'prep' || advance === 'ready') {
      await api.patch(`/api/orders/${order.id}/status`, { status: 'prep' });
    }
    if (advance === 'ready') {
      await api.patch(`/api/orders/${order.id}/status`, { status: 'ready' });
    }
    return order;
  }, []);

  const bulkOrders = useCallback(async (n: number) => {
    const names = ['Henry', 'Anna', 'Carlos', 'Dmitri', 'Eva'];
    const created: Order[] = [];
    // Sequential — avoid rate-limit and keep the Live Log readable.
    for (let i = 0; i < n; i++) {
      const o = await createTestOrder({
        name:    names[i % names.length],
        item:    'Burger',
        source:  'pos',
        advance: 'prep',
      });
      created.push(o);
    }
    return created;
  }, [createTestOrder]);

  const advanceAllPrep = useCallback(async () => {
    // Server defaults limit=50 ordered by created_at ASC — without an explicit
    // status filter the response is dominated by old cancelled rows and the
    // active preps get truncated, so nothing advances. Filter server-side.
    const preps = await api.get<Order[]>('/api/orders?status=prep&limit=100');
    for (const o of preps) {
      await api.patch(`/api/orders/${o.id}/status`, { status: 'ready' });
    }
    return preps.length;
  }, []);

  const clearAllActive = useCallback(async () => {
    // 서버측 일괄 UPDATE — 50건 limit / Redis 카운터 modulo 충돌 회피 (M05 / Engineer Mode 계획 참조).
    const r = await api.post<{ cancelled: number }>('/api/orders/_purge_active');
    return r.cancelled;
  }, []);

  // ── WS Live Log subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!storeId || !token) return;

    const wsUrl = apiUrl.replace(/^http/, 'ws')
      + `/ws?store_id=${encodeURIComponent(storeId)}`
      + `&token=${encodeURIComponent(token)}`
      + '&device_type=tablet';

    let cancelled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      setWsStatus('error');
      setError(e instanceof Error ? e.message : 'WS construct failed');
      return;
    }
    wsRef.current = ws;
    setWsStatus('connecting');

    ws.onopen  = () => { if (!cancelled) setWsStatus('live'); };
    ws.onerror = () => { if (!cancelled) setWsStatus('error'); };
    ws.onclose = () => { if (!cancelled) setWsStatus('closed'); };
    ws.onmessage = (e: MessageEvent) => {
      try {
        const raw = typeof e.data === 'string' ? e.data : '';
        if (!raw) return;
        const msg = JSON.parse(raw) as { event?: string; payload?: unknown; store_id?: string };
        if (!msg.event) return;
        setLog((prev) => [
          { t: Date.now(), event: msg.event!, store_id: msg.store_id, payload: msg.payload },
          ...prev,
        ].slice(0, MAX_LOG));
      } catch {
        // defensive — server may send a non-JSON ping in future
      }
    };

    return () => {
      cancelled = true;
      try { ws.close(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [storeId, token, apiUrl, wsAttempt]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* noop */ }
    }
    setWsAttempt((n) => n + 1);
  }, []);

  // ── render helpers ─────────────────────────────────────────────────────────
  const renderLogItem = useCallback(({ item }: { item: LogEntry }) => {
    const ts = formatTs(item.t);
    const payload = JSON.stringify(item.payload ?? {});
    const oneLine = payload.length > 80 ? payload.slice(0, 77) + '…' : payload;
    return (
      <View style={s.logRow}>
        <Text style={s.logTs}>{ts}</Text>
        <Text style={s.logEvent}>{item.event}</Text>
        <Text style={s.logPayload} numberOfLines={1}>{oneLine}</Text>
      </View>
    );
  }, []);

  // ── view ───────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={T.color.t0} />
          <Text style={s.backText}>Settings</Text>
        </TouchableOpacity>
        <Text style={s.pageTitle}>Engineer Mode</Text>
      </View>

      {error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={14} color={T.color.error} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} hitSlop={6}>
            <Ionicons name="close" size={14} color={T.color.error} />
          </TouchableOpacity>
        </View>
      )}

      {toast && (
        <View style={s.toastBox}>
          <Ionicons name="checkmark-circle" size={14} color={T.color.success} />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}

      {/* Quick Actions */}
      <Section title="Quick Actions">
        <ActionRow
          icon="flash-outline"
          label="Create + ready (visible on Pickup TV)"
          hint="new → prep → ready in one tap — Pickup TV flashes immediately"
          busy={busy === 'createReady'}
          onPress={() => run('createReady',
            () => createTestOrder({ name: 'TestUser', item: 'Burger', source: 'pos', advance: 'ready' }),
            (o) => `→ #${o.display_number} ready · Pickup TV should flash`,
          )}
        />
        <ActionRow
          icon="add-circle-outline"
          label="Create (stop at prep)"
          hint="Stays in prep — use Dashboard keypad READY to fire it"
          busy={busy === 'createPrep'}
          onPress={() => run('createPrep',
            () => createTestOrder({ name: 'TestUser', item: 'Burger', source: 'pos', advance: 'prep' }),
            (o) => `→ #${o.display_number} prep · advance via Dashboard or below`,
          )}
        />
        <ActionRow
          icon="layers-outline"
          label="Bulk 5 orders (stop at prep)"
          hint="Sequential — fills the Dashboard, advance with the action below"
          busy={busy === 'bulk'}
          onPress={() => run('bulk',
            () => bulkOrders(5),
            (list) => `→ ${list.length} orders prepped`,
          )}
        />
        <ActionRow
          icon="rocket-outline"
          label="Bulk 5 → ready"
          hint="Pickup TV flashes 5 cards at once"
          busy={busy === 'bulkReady'}
          onPress={() => run('bulkReady',
            async () => {
              const list = await bulkOrders(5);
              for (const o of list) {
                await api.patch(`/api/orders/${o.id}/status`, { status: 'ready' });
              }
              return list;
            },
            (list) => `→ ${list.length} orders ready on Pickup TV`,
          )}
        />
        <ActionRow
          icon="checkmark-done-outline"
          label="Advance all prep → ready"
          hint="Fires display:order_ready for every prep-state order"
          busy={busy === 'advance'}
          onPress={() => run('advance',
            () => advanceAllPrep(),
            (n) => `→ ${n} order(s) marked ready`,
          )}
        />
        <ActionRow
          icon="trash-outline"
          label="Clear all active orders"
          hint="Cancel every new/prep/ready order — frees display_number for re-test"
          busy={busy === 'clear'}
          onPress={() => run('clear',
            () => clearAllActive(),
            (n) => `→ ${n} order(s) cancelled`,
          )}
        />
      </Section>

      {/* Order Lab */}
      <Section title="Order Lab">
        <View style={s.formBlock}>
          <Text style={s.fieldLabel}>Customer name</Text>
          <TextInput
            style={s.input}
            value={oName}
            onChangeText={setOName}
            placeholder="Henry"
            placeholderTextColor={T.color.t2}
          />

          <Text style={s.fieldLabel}>Item label</Text>
          <TextInput
            style={s.input}
            value={oItem}
            onChangeText={setOItem}
            placeholder="Crispy Sandwich"
            placeholderTextColor={T.color.t2}
          />

          <Text style={s.fieldLabel}>Source</Text>
          <View style={s.chipRow}>
            {SOURCES.map((src) => {
              const active = src === oSource;
              return (
                <TouchableOpacity
                  key={src}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setOSource(src)}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>{src}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={s.toggleRow}
            onPress={() => setOAutoReady((v) => !v)}
          >
            <Ionicons
              name={oAutoReady ? 'checkbox' : 'square-outline'}
              size={20}
              color={oAutoReady ? T.color.brand : T.color.t2}
            />
            <Text style={s.toggleLabel}>
              auto-ready (advance new → prep → ready — Pickup TV shows immediately)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.primaryBtn, busy === 'orderlab' && s.btnDisabled]}
            disabled={busy === 'orderlab'}
            onPress={() => run('orderlab',
              () => createTestOrder({
                name:    oName.trim() || 'Guest',
                item:    oItem.trim() || 'Item',
                source:  oSource,
                advance: oAutoReady ? 'ready' : 'prep',
              }),
              (o) => `→ #${o.display_number} ${oName.trim() || 'Guest'} ${oAutoReady ? 'ready · TV flashed' : 'prep'}`,
            )}
          >
            {busy === 'orderlab'
              ? <ActivityIndicator color={T.color.t0} />
              : <Text style={s.primaryBtnText}>Create order</Text>
            }
          </TouchableOpacity>
        </View>
      </Section>

      {/* WS Live Log */}
      <Section title="WS Live Log">
        <View style={s.logHeader}>
          <View style={s.statusRow}>
            <View style={[s.dot, dotStyle(wsStatus)]} />
            <Text style={s.statusLabel}>{wsStatus}</Text>
            <Text style={s.statusMeta}>· {log.length} event{log.length === 1 ? '' : 's'}</Text>
          </View>
          <View style={s.logActions}>
            {wsStatus !== 'live' && (
              <TouchableOpacity onPress={reconnect} style={s.smallBtn}>
                <Text style={s.smallBtnText}>Reconnect</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setLog([])} style={s.smallBtn}>
              <Text style={s.smallBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.logBox}>
          {log.length === 0 ? (
            <Text style={s.logEmpty}>(waiting for events…)</Text>
          ) : (
            <FlatList
              data={log}
              keyExtractor={(it, idx) => `${it.t}-${idx}-${it.event}`}
              renderItem={renderLogItem}
              removeClippedSubviews
              windowSize={5}
              initialNumToRender={20}
              style={{ maxHeight: 360 }}
            />
          )}
        </View>
      </Section>

      <Text style={s.footer}>
        Engineer mode is gated by license key suffix `:dev`. To disable, log out
        and remove the suffix in Configure API.
      </Text>
    </ScrollView>
  );
}

// ── ActionRow ────────────────────────────────────────────────────────────────
function ActionRow({
  icon, label, hint, busy, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onPress} disabled={busy}>
      <Ionicons name={icon} size={18} color={T.color.brand} />
      <View style={rowStyles.rowBody}>
        <Text style={rowStyles.rowLabel}>{label}</Text>
        {hint && <Text style={rowStyles.rowValue}>{hint}</Text>}
      </View>
      {busy
        ? <ActivityIndicator size="small" color={T.color.brand} />
        : <Ionicons name="play" size={14} color={T.color.t2} />
      }
    </TouchableOpacity>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function formatTs(t: number): string {
  const d = new Date(t);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function dotStyle(st: WsStatus) {
  switch (st) {
    case 'live':       return { backgroundColor: T.color.success };
    case 'connecting': return { backgroundColor: T.color.warn };
    case 'error':      return { backgroundColor: T.color.error };
    default:           return { backgroundColor: T.color.t2 };
  }
}

// ── styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.color.bg1 },
  content: { padding: T.sp[4], gap: T.sp[4], paddingBottom: T.sp[12] },
  header:  { gap: T.sp[2] },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: T.sp[1], alignSelf: 'flex-start' },
  backText: { color: T.color.t0, fontSize: T.fs.md },
  pageTitle: { color: T.color.t0, fontSize: T.fs['2xl'], fontWeight: T.fw.bold },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    padding: T.sp[3], borderRadius: T.r.sm,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1, borderColor: T.color.error,
  },
  errorText: { color: T.color.error, fontSize: T.fs.sm, flex: 1 },

  toastBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    padding: T.sp[3], borderRadius: T.r.sm,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1, borderColor: T.color.success,
  },
  toastText: { color: T.color.success, fontSize: T.fs.sm, fontWeight: T.fw.medium },

  formBlock: { padding: T.sp[4], gap: T.sp[3] },
  fieldLabel: { color: T.color.t1, fontSize: T.fs.sm },
  input: {
    backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1,
    borderColor: T.color.border, color: T.color.t0, padding: T.sp[3], fontSize: T.fs.sm,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip: {
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: 99, borderWidth: 1, borderColor: T.color.border,
    backgroundColor: T.color.bg3,
  },
  chipActive:     { borderColor: T.color.brand, backgroundColor: T.color.brand + '22' },
  chipText:       { color: T.color.t1, fontSize: T.fs.sm },
  chipTextActive: { color: T.color.brand, fontWeight: T.fw.semibold },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], marginTop: T.sp[1] },
  toggleLabel: { color: T.color.t1, fontSize: T.fs.sm, flex: 1 },

  primaryBtn: {
    backgroundColor: T.color.brand, borderRadius: T.r.sm,
    padding: T.sp[3], alignItems: 'center', marginTop: T.sp[2],
  },
  primaryBtnText: { color: T.color.t0, fontWeight: T.fw.bold, fontSize: T.fs.md },
  btnDisabled: { opacity: 0.5 },

  logHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: T.sp[3], borderBottomWidth: 1, borderBottomColor: T.color.borderS,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { color: T.color.t0, fontSize: T.fs.sm, fontWeight: T.fw.semibold, textTransform: 'capitalize' },
  statusMeta:  { color: T.color.t2, fontSize: T.fs.sm },
  logActions: { flexDirection: 'row', gap: T.sp[2] },
  smallBtn: {
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[1],
    borderRadius: T.r.sm, backgroundColor: T.color.bg3,
    borderWidth: 1, borderColor: T.color.border,
  },
  smallBtnText: { color: T.color.t0, fontSize: T.fs.xs },

  logBox: { padding: T.sp[3], minHeight: 80 },
  logEmpty: { color: T.color.t2, fontSize: T.fs.sm, fontStyle: 'italic' },
  logRow: {
    flexDirection: 'row', gap: T.sp[2],
    paddingVertical: T.sp[1],
    borderBottomWidth: 1, borderBottomColor: T.color.borderS,
  },
  logTs:      { color: T.color.t2, fontSize: T.fs.xs, fontFamily: undefined, minWidth: 92 },
  logEvent:   { color: T.color.brand, fontSize: T.fs.xs, fontWeight: T.fw.semibold, minWidth: 140 },
  logPayload: { color: T.color.t1, fontSize: T.fs.xs, flex: 1 },

  footer: { color: T.color.t2, fontSize: T.fs.xs, textAlign: 'center', marginTop: T.sp[2] },
});
