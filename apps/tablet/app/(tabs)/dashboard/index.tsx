import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, Platform,
} from 'react-native';
// React Native built-in prompt isn't reliable on tablet; we use Alert.prompt on iOS
// and a single-line text input flow on Android via a basic prompt fallback.

// Alert.alert is a silent no-op on RN Web (Expo Web). Use the native confirm()
// dialog there so batch destructive actions actually run, and window.alert for
// one-way notifications so mutation errors surface in the web build too.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
function confirmAction(title: string, message: string, confirmLabel = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { T, statusColor } from '@restosync/ui';
import { api, orderActions } from '../../../src/api/client';
import type { Order } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { useStoreSettings } from '../../../src/hooks/useStoreSettings';
import { useLocalPickupStore } from '../../../src/store/localPickup';

// WS events that mutate the active-orders list — refetch on any of these.
const ORDER_MUTATING_EVENTS = new Set([
  'order:new', 'order:status_changed', 'order:cancelled', 'order:expired',
  'display:order_ready', 'display:order_remove', 'display:order_expedite',
]);

const ACTIVE_STATUSES = ['new', 'prep', 'ready_to_expedite', 'ready', 'remaking', 'scheduled'];
const DELIVERY_CHANNELS = new Set(['doordash', 'ubereats', 'grubhub', 'fantuan', 'hungrypanda']);
const UNDO_WINDOW_MS = 5000;

const DIGITS = ['1','2','3','4','5','6','7','8','9','⌫','0'];

function useIsOnline() {
  const [online, setOnline] = useState(true);
  React.useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(s.isConnected ?? true));
    return unsub;
  }, []);
  return online;
}

export default function DashboardScreen() {
  const qc        = useQueryClient();
  const isOnline  = useIsOnline();
  const storeId   = useAuthStore((st) => st.storeId);
  const token     = useAuthStore((st) => st.token);
  const apiUrl    = useAuthStore((st) => st.apiUrl);
  const { settings } = useStoreSettings();
  // Server-side workflow setting (stays for two_display/engineering only — the
  // 8-layout pickup screen ignores it).
  const pickupFlow: 'two_stage' | 'ready_only' =
    ((settings?.workflow as Record<string, unknown> | undefined)?.pickup_flow === 'two_stage')
      ? 'two_stage'
      : 'ready_only';
  // v1 deliberately keeps every mode networked (no offline standalone) so all
  // tablets — including the customer's Onn 4K pair — route through the API and
  // light up the TV via WS. Offline-first can come back behind a separate flag
  // once we have a real customer asking for it.
  const isStandalone = false;
  // Dashboard control surface follows the *pickup flow* (the product-version
  // toggle the TV also follows), NOT loginMode — otherwise flipping Pickup Flow
  // changes the TV but leaves the keypad stale.
  //   ready_only → single Manual→Ready button (number → instant ready on TV)
  //   two_stage  → READY + MANUAL + M→READY (full prep → ready flow)
  // loginMode still gates other surfaces (settings, ENG badge) elsewhere.
  const showReadyButton  = pickupFlow === 'two_stage';
  const showManualButton = pickupFlow === 'two_stage';
  const showManualReady  = true;  // visible in every flow (the only button for ready_only)

  // Local-only standalone state. Subscribed in both modes (cheap), but only
  // rendered + mutated in ready_only mode.
  const localReady    = useLocalPickupStore((s) => s.ready);
  const addLocalReady = useLocalPickupStore((s) => s.addReady);
  const removeLocal   = useLocalPickupStore((s) => s.removeReady);
  const clearLocal    = useLocalPickupStore((s) => s.clearAll);
  const [num, setNum] = useState('');
  const [undoFor, setUndoFor] = useState<{ id: string; display_number: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear undo banner when the 5s window expires.
  useEffect(() => {
    if (!undoFor) return;
    undoTimer.current = setTimeout(() => setUndoFor(null), UNDO_WINDOW_MS);
    return () => { if (undoTimer.current) clearTimeout(undoTimer.current); };
  }, [undoFor]);

  // WS subscription — refetch orders on any mutating event from any source
  // (POS / kiosk / TV / Engineer Test Mode / another Dashboard).
  // Standalone mode has no API/WS, so the whole effect short-circuits.
  useEffect(() => {
    if (isStandalone) return;
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
      try {
        sock = new WebSocket(wsUrl);
      } catch {
        return;
      }
      ws = sock;
      sock.onmessage = (e: MessageEvent) => {
        try {
          const raw = typeof e.data === 'string' ? e.data : '';
          if (!raw) return;
          const msg = JSON.parse(raw) as { event?: string };
          if (msg.event && ORDER_MUTATING_EVENTS.has(msg.event)) {
            qc.invalidateQueries({ queryKey: ['orders'] });
          }
        } catch { /* non-JSON ping etc. — ignore */ }
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
  }, [storeId, token, apiUrl, qc, isStandalone]);

  // Active orders — full 9-state visibility (excluding terminal). Server-side
  // status filter + max limit so we don't get crowded out by old cancelled
  // orders (default API limit is 50, ordered ASC by created_at).
  const { data: orders, isLoading, error, refetch } = useQuery<Order[]>({
    queryKey: ['orders', 'active'],
    queryFn:  () => api.get(`/api/orders?status=${ACTIVE_STATUSES.join(',')}&limit=100`),
    select:   (rows: Order[]) =>
      rows.filter((o) => ACTIVE_STATUSES.includes(o.status))
          .sort((a, b) => Number(a.display_number) - Number(b.display_number)),
    // Standalone mode has no API. Disabling the query avoids the fetch + the
    // 401/timeout error states that would otherwise show in the right panel.
    enabled: !isStandalone,
  });

  // Banner-style error for the keypad path. Alert.alert is a no-op on RN web
  // (rn-web-compat-audit) so we surface failures on-screen instead.
  const [readyError, setReadyError] = useState<string | null>(null);

  const readyMutation = useMutation({
    mutationFn: async (displayNumber: string) => {
      // Fresh fetch with server-side status filter. The API defaults to
      // limit=50 ordered by created_at ASC, so without a filter the response
      // is dominated by old cancelled orders and recent active ones get
      // truncated. Explicitly request only active statuses + max limit.
      const activeQuery = ACTIVE_STATUSES.join(',');
      const list = await api.get<Order[]>(`/api/orders?status=${activeQuery}&limit=100`);

      // Display numbers recycle, so the API returns multiple orders for the
      // same number across the day. Pick the most-recently created one.
      const candidates = list.filter(
        (o) => o.display_number === displayNumber && ACTIVE_STATUSES.includes(o.status),
      );
      if (candidates.length === 0) {
        throw new Error(`No active order #${displayNumber}`);
      }
      const match = candidates.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];

      // Quick Ready must work from any active status. The 9-state machine
      // (shared/enums.ts ORDER_STATUS_TRANSITIONS) forbids direct new→ready,
      // so chain through prep when needed.
      const patch = (status: string) =>
        api.patch(`/api/orders/${match.id}/status`, { status });

      switch (match.status) {
        case 'ready':
          return; // already ready — no-op, just reset the keypad below
        case 'new':
          await patch('prep');
          return patch('ready');
        case 'scheduled':
          await patch('new');
          await patch('prep');
          return patch('ready');
        case 'remaking':
          await patch('prep');
          return patch('ready');
        case 'prep':
        case 'ready_to_expedite':
          return patch('ready');
        default:
          return patch('ready');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      setNum('');
      setReadyError(null);
    },
    onError: (err: Error) => {
      setReadyError(err.message);
      notify('Error', err.message);
    },
  });

  // Spec sec.3.5 + sec.11.3 — per-order actions wired to new endpoints.
  const acceptMutation = useMutation({
    mutationFn: (id: string) => orderActions.accept(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['orders'] }),
    onError:    (err: Error) => notify('Accept failed', err.message),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => orderActions.reject(id, reason),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['orders'] }),
    onError:    (err: Error) => notify('Reject failed', err.message),
  });
  const pickedUpMutation = useMutation({
    mutationFn: (order: Order) => orderActions.markPickedUp(order.id),
    onSuccess:  (_data, order) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      setUndoFor({ id: order.id, display_number: order.display_number });
    },
    onError:    (err: Error) => notify('Pickup failed', err.message),
  });
  const undoMutation = useMutation({
    mutationFn: (id: string) => orderActions.undo(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['orders'] }); setUndoFor(null); },
    onError:    (err: Error) => { notify('Undo failed', err.message); setUndoFor(null); },
  });

  // Spec sec.11.5 — batch operations.
  const completeAllMutation = useMutation({
    mutationFn: () => orderActions.completeAllReady(),
    onSuccess:  (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      notify('Completed', `Marked ${data.completed} ready orders as picked up.`);
    },
    onError:    (err: Error) => notify('Complete all failed', err.message),
  });
  const purgeMutation = useMutation({
    mutationFn: () => orderActions.purgeActive(),
    onSuccess:  (data) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      notify('Reset', `Cancelled ${data.cancelled} active orders.`);
    },
    onError:    (err: Error) => notify('Reset failed', err.message),
  });
  const remakeMutation = useMutation({
    mutationFn: (id: string) => orderActions.remake(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['orders'] }),
    onError:    (err: Error) => notify('Remake failed', err.message),
  });
  // Recall — flash the button for 0.5s so staff sees their press actually fired
  // the TTS announcement (otherwise the only feedback is the TV speaker, which
  // they may not hear in a noisy kitchen).
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const recallMutation = useMutation({
    mutationFn: (id: string) => orderActions.recallTts(id),
    onError:    (err: Error) => notify('Recall failed', err.message),
  });
  const handleRecall = (id: string) => {
    setRecallingId(id);
    setTimeout(() => setRecallingId((curr) => (curr === id ? null : curr)), 500);
    recallMutation.mutate(id);
  };

  // Manual entry — create a new manual order with the keypad number.
  const manualMutation = useMutation({
    mutationFn: (displayNumber: string) => orderActions.createManual(displayNumber),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['orders'] }); setNum(''); setReadyError(null); },
    onError:    (err: Error) => { setReadyError(err.message); notify('Manual entry failed', err.message); },
  });
  const handleManual = () => { if (num) manualMutation.mutate(num); };

  // Manual → Ready in one tap. Used when a walk-in order is already prepared
  // (paper ticket arrives, food is already plated). Creates the order then
  // chains new→prep→ready since the state machine forbids new→ready directly.
  const manualReadyMutation = useMutation({
    mutationFn: async (displayNumber: string) => {
      const created = await orderActions.createManual(displayNumber);
      await api.patch(`/api/orders/${created.id}/status`, { status: 'prep' });
      return api.patch(`/api/orders/${created.id}/status`, { status: 'ready' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setNum(''); setReadyError(null); },
    onError:   (err: Error) => { setReadyError(err.message); notify('Manual→Ready failed', err.message); },
  });
  const handleManualReady = () => { if (num) manualReadyMutation.mutate(num); };

  const emergencyMutation = useMutation({
    mutationFn: (message: string) => orderActions.emergencyMessage(message),
    onSuccess:  () => notify('Sent', 'Emergency message broadcast to all displays.'),
    onError:    (err: Error) => notify('Broadcast failed', err.message),
  });

  const onCompleteAll = async () => {
    if (await confirmAction('Complete all ready?', 'Mark every READY order as picked up.', 'Complete', true)) {
      completeAllMutation.mutate();
    }
  };
  const onResetAll = async () => {
    if (await confirmAction('Reset all active orders?', 'Cancels every order in any non-terminal status. Used for testing.', 'Reset', true)) {
      purgeMutation.mutate();
    }
  };
  const onEmergency = () => {
    // Alert.prompt is iOS-only and Alert.alert no-ops on web; fall back to a
    // fixed message on Android + web. Full text input arrives in P3.
    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt('Broadcast message', 'Shown on all TVs', (text) => {
        if (text?.trim()) emergencyMutation.mutate(text.trim());
      });
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const text = window.prompt('Broadcast message — shown on all TVs');
      if (text?.trim()) emergencyMutation.mutate(text.trim());
    } else {
      emergencyMutation.mutate('Closing in 5 minutes — please pick up your order');
    }
  };

  // Phantom-digit guard: on RN-Web a single user tap can fire onPress twice
  // (pointerdown + click), or a slow drag-tap can route through two adjacent
  // keys. Lock for 80ms after every accepted press so "11" never becomes "811".
  const keyLockRef = useRef(0);
  const handleDigit = useCallback((d: string) => {
    const now = Date.now();
    if (now - keyLockRef.current < 80) return;
    keyLockRef.current = now;
    if (d === '⌫') { setNum((n) => n.slice(0, -1)); return; }
    if (num.length >= 3) return;
    setNum((n) => n + d);
  }, [num]);

  const handleReady = () => {
    if (!num) return;
    readyMutation.mutate(num);
  };

  return (
    <View style={s.root}>
      {!isOnline && !isStandalone && (
        <View style={s.offline}>
          <Ionicons name="cloud-offline" size={14} color={T.color.warn} />
          <Text style={s.offlineText}>Offline — reconnecting…</Text>
        </View>
      )}

      {undoFor && (
        <View style={s.undoBar}>
          <Text style={s.undoText}>
            Order #{undoFor.display_number} marked picked up
          </Text>
          <TouchableOpacity
            style={s.undoBtn}
            onPress={() => undoMutation.mutate(undoFor.id)}
            disabled={undoMutation.isPending}
          >
            <Text style={s.undoBtnText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.body}>
        {/* Left: number pad */}
        <View style={s.padPanel}>
          <Text style={s.title}>Quick Ready</Text>
          <View style={s.display}>
            <Text style={s.displayNum}>{num || '—'}</Text>
          </View>
          {readyError && (
            <View style={s.padError}>
              <Text style={s.padErrorText}>{readyError}</Text>
            </View>
          )}
          <View style={s.pad}>
            {DIGITS.map((d) => (
              <TouchableOpacity key={d} style={s.key} onPress={() => handleDigit(d)}>
                <Text style={s.keyText}>{d}</Text>
              </TouchableOpacity>
            ))}
            {isStandalone ? (
              // Standalone — single MANUAL writes to the local AsyncStorage-backed
              // store. No API/mutation involved, so no pending state.
              <TouchableOpacity
                style={[s.key, s.manualKey, !num && s.keyDisabled]}
                onPress={() => { if (num) { addLocalReady(num); setNum(''); } }}
                disabled={!num}
              >
                <Text style={[s.keyText, s.manualKeyText]}>MANUAL</Text>
              </TouchableOpacity>
            ) : (
              <>
                {showReadyButton && (
                  <TouchableOpacity
                    style={[s.key, s.readyKey, !num && s.keyDisabled]}
                    onPress={handleReady}
                    disabled={!num || readyMutation.isPending}
                  >
                    {readyMutation.isPending
                      ? <ActivityIndicator color={T.color.t0} />
                      : <Text style={[s.keyText, s.readyKeyText]}>READY</Text>
                    }
                  </TouchableOpacity>
                )}
                {showManualButton && (
                  <TouchableOpacity
                    style={[s.key, s.manualKey, !num && s.keyDisabled]}
                    onPress={handleManual}
                    disabled={!num || manualMutation.isPending}
                  >
                    {manualMutation.isPending
                      ? <ActivityIndicator color={T.color.t0} />
                      : <Text style={[s.keyText, s.manualKeyText]}>MANUAL</Text>
                    }
                  </TouchableOpacity>
                )}
                {showManualReady && (
                  <TouchableOpacity
                    style={[s.key, s.manualReadyKey, !num && s.keyDisabled]}
                    onPress={handleManualReady}
                    disabled={!num || manualReadyMutation.isPending}
                  >
                    {manualReadyMutation.isPending
                      ? <ActivityIndicator color={T.color.t0} />
                      : <Text style={[s.keyText, s.manualReadyKeyText]}>{pickupFlow === 'ready_only' ? 'READY' : 'M→READY'}</Text>
                    }
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Right: active orders list + batch ops (networked) — or local Ready list (standalone) */}
        <View style={s.listPanel}>
          {isStandalone ? (
            <StandalonePanel
              ready={localReady}
              onRemove={removeLocal}
              onClearAll={async () => {
                if (await confirmAction('Clear all ready?', 'Remove every ready order from this tablet.', 'Clear', true)) {
                  clearLocal();
                }
              }}
            />
          ) : (
            <>
          {/* Spec sec.11.5 — batch operations */}
          <View style={s.batchRow}>
            <TouchableOpacity style={[s.batchBtn, s.batchPrimary]} onPress={onCompleteAll}
                              disabled={completeAllMutation.isPending}>
              <Text style={s.batchPrimaryText}>Complete All Ready</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.batchBtn, s.batchSecondary]} onPress={onResetAll}
                              disabled={purgeMutation.isPending}>
              <Text style={s.batchSecondaryText}>Reset All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.batchBtn, s.batchWarning]} onPress={onEmergency}
                              disabled={emergencyMutation.isPending}>
              <Text style={s.batchWarningText}>Emergency</Text>
            </TouchableOpacity>
          </View>
          <View style={s.listHeader}>
            <Text style={s.title}>Active Orders</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Ionicons name="refresh" size={18} color={T.color.t1} />
            </TouchableOpacity>
          </View>

          {isLoading && (
            <View style={s.center}>
              <ActivityIndicator color={T.color.brand} size="large" />
            </View>
          )}
          {error && (
            <View style={s.center}>
              <Ionicons name="alert-circle" size={32} color={T.color.error} />
              <Text style={s.errorText}>Failed to load orders</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isLoading && !error && (
            <FlatList
              data={orders ?? []}
              keyExtractor={(o) => o.id}
              ListEmptyComponent={
                <View style={s.center}>
                  <Ionicons name="checkmark-circle" size={40} color={T.color.success} />
                  <Text style={s.emptyText}>All caught up!</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isNewDelivery = item.status === 'new' && DELIVERY_CHANNELS.has(item.source);
                const isReady       = item.status === 'ready';
                return (
                  <TouchableOpacity
                    style={s.orderCard}
                    onPress={() => setNum(item.display_number)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.numBadge, { backgroundColor: statusColor(item.status) + '22' }]}>
                      <Text style={[s.numText, { color: statusColor(item.status) }]}>
                        #{item.display_number}
                      </Text>
                    </View>
                    <View style={s.orderInfo}>
                      <Text style={s.customerName}>{item.customer_name ?? 'Guest'}</Text>
                      <Text style={s.orderSource}>{item.source}</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: statusColor(item.status) + '22' }]}>
                      <Text style={[s.statusText, { color: statusColor(item.status) }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>

                    {isNewDelivery && (
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionBtn, s.acceptBtn]}
                          onPress={() => acceptMutation.mutate(item.id)}
                          disabled={acceptMutation.isPending}
                        >
                          <Text style={s.acceptText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, s.rejectBtn]}
                          onPress={() => rejectMutation.mutate({ id: item.id })}
                          disabled={rejectMutation.isPending}
                        >
                          <Text style={s.rejectText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isReady && (
                      <View style={s.actionRow}>
                        <TouchableOpacity
                          style={[s.actionBtn, s.pickedUpBtn]}
                          onPress={() => pickedUpMutation.mutate(item)}
                          disabled={pickedUpMutation.isPending}
                        >
                          <Text style={s.acceptText}>Picked Up</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.actionBtn, s.recallBtn, recallingId === item.id && s.recallBtnActive]}
                          onPress={() => handleRecall(item.id)}
                          disabled={recallMutation.isPending}
                        >
                          <Text style={[s.recallText, recallingId === item.id && s.recallTextActive]}>Recall</Text>
                        </TouchableOpacity>
                        {pickupFlow === 'two_stage' && (
                          <TouchableOpacity
                            style={[s.actionBtn, s.remakeBtn]}
                            onPress={() => remakeMutation.mutate(item.id)}
                            disabled={remakeMutation.isPending}
                          >
                            <Text style={s.remakeText}>Remake</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// Standalone right-panel — local Ready cards. Tapping a card removes it
// (the only "next state" in offline walk-in mode is "picked up = gone").
function StandalonePanel({
  ready, onRemove, onClearAll,
}: {
  ready: { id: string; display_number: string; created_at: string }[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}) {
  return (
    <>
      <View style={s.batchRow}>
        <View style={[s.batchBtn, { backgroundColor: 'transparent', borderColor: 'transparent' }]} />
        <View style={[s.batchBtn, { backgroundColor: 'transparent', borderColor: 'transparent' }]} />
        <TouchableOpacity
          style={[s.batchBtn, s.batchSecondary]}
          onPress={onClearAll}
          disabled={ready.length === 0}
        >
          <Text style={s.batchSecondaryText}>Clear All</Text>
        </TouchableOpacity>
      </View>
      <View style={s.listHeader}>
        <Text style={s.title}>Ready for Pickup</Text>
        <Text style={{ color: T.color.t1, fontSize: T.fs.sm }}>{ready.length} active</Text>
      </View>
      <FlatList
        data={ready}
        keyExtractor={(o) => o.id}
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="checkmark-circle" size={40} color={T.color.success} />
            <Text style={s.emptyText}>No orders waiting</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.orderCard}
            onPress={() => onRemove(item.id)}
            activeOpacity={0.7}
          >
            <View style={[s.numBadge, { backgroundColor: T.color.success + '22' }]}>
              <Text style={[s.numText, { color: T.color.success }]}>
                #{item.display_number}
              </Text>
            </View>
            <View style={s.orderInfo}>
              <Text style={s.customerName}>Tap to mark picked up</Text>
              <Text style={s.orderSource}>{timeAgo(item.created_at)}</Text>
            </View>
            <View style={[s.statusPill, { backgroundColor: T.color.success + '22' }]}>
              <Text style={[s.statusText, { color: T.color.success }]}>READY</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: T.color.bg1 },
  offline:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
                backgroundColor: T.color.warn + '22', padding: T.sp[2], paddingHorizontal: T.sp[4] },
  offlineText:{ color: T.color.warn, fontSize: T.fs.sm },
  body:       { flex: 1, flexDirection: 'row', padding: T.sp[4], gap: T.sp[4] },
  padPanel:   { width: 300, gap: T.sp[4] },
  listPanel:  { flex: 1, gap: T.sp[3] },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:      { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },
  display:    {
    backgroundColor: T.color.bg3, borderRadius: T.r.lg, padding: T.sp[6],
    alignItems: 'center', borderWidth: 1, borderColor: T.color.border,
  },
  displayNum: { color: T.color.t0, fontSize: T.fs['4xl'], fontWeight: T.fw.bold, letterSpacing: 8 },
  padError:   { backgroundColor: T.color.error + '22', borderWidth: 1, borderColor: T.color.error,
                borderRadius: T.r.md, padding: T.sp[3] },
  padErrorText:{ color: T.color.error, fontSize: T.fs.sm, fontWeight: T.fw.medium },
  pad:        { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  key: {
    width: 88, height: 64, backgroundColor: T.color.bg3,
    borderRadius: T.r.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.color.border,
  },
  keyText:     { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.medium },
  readyKey:    { width: 88, backgroundColor: T.color.success },
  readyKeyText:{ fontWeight: T.fw.bold, fontSize: T.fs.md },
  manualKey:   { width: 88, backgroundColor: T.color.brand },
  manualKeyText:{ fontWeight: T.fw.bold, fontSize: T.fs.md, color: T.color.t0 },
  manualReadyKey: { width: 88, backgroundColor: T.color.success, borderColor: T.color.brand, borderWidth: 2 },
  manualReadyKeyText: { fontWeight: T.fw.bold, fontSize: T.fs.md, color: T.color.t0 },
  keyDisabled: { opacity: 0.4 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[3] },
  errorText:   { color: T.color.error, fontSize: T.fs.md },
  emptyText:   { color: T.color.t1, fontSize: T.fs.md },
  retryBtn:    { backgroundColor: T.color.brand, borderRadius: T.r.sm, paddingHorizontal: T.sp[4], paddingVertical: T.sp[2] },
  retryText:   { color: T.color.t0, fontWeight: T.fw.semibold },
  orderCard: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    backgroundColor: T.color.bg2, borderRadius: T.r.md, padding: T.sp[3],
    marginBottom: T.sp[2], borderWidth: 1, borderColor: T.color.border,
  },
  numBadge:    { borderRadius: T.r.sm, paddingHorizontal: T.sp[3], paddingVertical: T.sp[1] },
  numText:     { fontSize: T.fs.lg, fontWeight: T.fw.bold },
  orderInfo:   { flex: 1 },
  customerName:{ color: T.color.t0, fontSize: T.fs.md, fontWeight: T.fw.medium },
  orderSource: { color: T.color.t1, fontSize: T.fs.sm },
  statusPill:  { borderRadius: T.r.full, paddingHorizontal: T.sp[2], paddingVertical: 3 },
  statusText:  { fontSize: T.fs.xs, fontWeight: T.fw.bold },

  // Per-order action buttons (spec sec.3.5 + sec.11)
  actionRow:   { flexDirection: 'row', gap: T.sp[2], marginLeft: T.sp[2] },
  actionBtn:   { borderRadius: T.r.sm, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2] },
  acceptBtn:   { backgroundColor: T.color.success },
  rejectBtn:   { backgroundColor: T.color.error + '22', borderWidth: 1, borderColor: T.color.error },
  pickedUpBtn: { backgroundColor: T.color.brand },
  recallBtn:   { backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border },
  recallBtnActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  recallText:  { color: T.color.t0, fontSize: T.fs.sm, fontWeight: T.fw.semibold },
  recallTextActive: { color: T.color.t0 },
  remakeBtn:   { backgroundColor: T.color.warn + '22', borderWidth: 1, borderColor: T.color.warn },
  remakeText:  { color: T.color.warn, fontSize: T.fs.sm, fontWeight: T.fw.bold },
  acceptText:  { color: T.color.t0, fontSize: T.fs.sm, fontWeight: T.fw.bold },
  rejectText:  { color: T.color.error, fontSize: T.fs.sm, fontWeight: T.fw.bold },

  // 5-second undo toast (spec sec.11.3)
  undoBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.color.bg3, borderColor: T.color.brand, borderWidth: 1,
    borderRadius: T.r.md, padding: T.sp[3], margin: T.sp[3],
  },
  undoText:    { color: T.color.t0, fontSize: T.fs.sm, flex: 1 },
  undoBtn:     { backgroundColor: T.color.brand, borderRadius: T.r.sm,
                 paddingHorizontal: T.sp[4], paddingVertical: T.sp[2] },
  undoBtnText: { color: T.color.t0, fontWeight: T.fw.bold },

  // Batch ops row (spec sec.11.5)
  batchRow:        { flexDirection: 'row', gap: T.sp[2] },
  batchBtn:        { flex: 1, alignItems: 'center', paddingVertical: T.sp[2],
                     borderRadius: T.r.sm, borderWidth: 1 },
  batchPrimary:    { backgroundColor: T.color.success, borderColor: T.color.success },
  batchPrimaryText:{ color: T.color.t0, fontWeight: T.fw.bold },
  batchSecondary:  { backgroundColor: T.color.bg3, borderColor: T.color.border },
  batchSecondaryText:{ color: T.color.t1, fontWeight: T.fw.semibold },
  batchWarning:    { backgroundColor: T.color.warn + '22', borderColor: T.color.warn },
  batchWarningText:{ color: T.color.warn, fontWeight: T.fw.bold },
});
