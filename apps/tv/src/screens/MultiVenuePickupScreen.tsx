import React, { useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet,
} from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';
import type { Order } from '../store/tvStore';
import { useClock } from '../hooks/useClock';

let KeepAwake: typeof import('expo-keep-awake') | null = null;
try { KeepAwake = require('expo-keep-awake'); } catch { /* not available */ }

const SOURCE_COLOR: Record<string, string> = {
  pos: '#2563eb', kiosk: '#7c3aed', manual: '#ea580c',
  grubhub: '#dc2626', doordash: '#7c3aed', ubereats: '#16a34a',
  fantuan: '#0891b2', hungrypanda: '#d97706',
};

// venue_label이 있으면 venue_color 사용, 없으면 source 기반 fallback
function getColumnKey(o: Order): string { return o.venue_label ?? o.source; }
function getColumnColor(o: Order): string { return o.venue_color ?? SOURCE_COLOR[o.source] ?? '#475569'; }

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  return mins < 1 ? 'Just now' : mins === 1 ? '1 min ago' : `${mins} min ago`;
}

function OrderCard({ order, isReady }: { order: Order; isReady: boolean }) {
  const color = getColumnColor(order);
  return (
    <View style={[s.card, isReady ? s.cardReady : s.cardPrep]}>
      <Text style={[s.num, isReady && s.numReady]}>{order.display_number}</Text>
      <View style={[s.srcBadge, { backgroundColor: color }]}>
        <Text style={s.srcText}>{(order.venue_label ?? order.source).toUpperCase()}</Text>
      </View>
      {order.customer_name ? (
        <Text style={s.customer} numberOfLines={1}>{order.customer_name}</Text>
      ) : null}
      <Text style={s.time}>{timeAgo(order.created_at)}</Text>
      {isReady && <Text style={s.readyCheck}>✅</Text>}
    </View>
  );
}

export default function MultiVenuePickupScreen() {
  const { preparing, expediting, ready, remaking, scheduled, tvRow, wsStatus, storeSettings } = useTVStore();
  const clock = useClock();

  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync().catch(() => {});
    return () => { KeepAwake?.deactivateKeepAwake(); };
  }, []);

  // venue_label 우선, 없으면 source 기반 컬럼 grouping.
  // All non-terminal statuses are surfaced (sec.3 9-state machine). Within each venue
  // column, ready cards retain the highlight; expediting/remaking/scheduled mix in.
  const allOrders = [...preparing, ...expediting, ...ready, ...remaking, ...scheduled];
  const colKeys = Array.from(new Set(allOrders.map(getColumnKey))).sort();

  const footerMsg = ((storeSettings as Record<string, Record<string, string>> | null)?.theme?.footer_message) ?? '';

  const screenName = tvRow?.instance.display_name ?? 'KITCHEN';

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.name}>{screenName.toUpperCase()}</Text>
          <Text style={s.headerTitle}>MULTI-VENUE PICKUP</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.activeCount}>
            Active: <Text style={s.activeNum}>{allOrders.length}</Text>
          </Text>
          <Text style={s.clock}>{clock}</Text>
        </View>
      </View>

      {/* Offline banner — spec sec.13 */}
      {wsStatus !== 'connected' && (
        <View style={[s.offlineBanner, wsStatus === 'disconnected' && s.offlineBannerDisc]}>
          <Text style={s.offlineBannerText}>
            {wsStatus === 'connecting'
              ? '⏳  Reconnecting…'
              : `⚠  Disconnected — last update ${clock}`}
          </Text>
        </View>
      )}

      {/* Venue columns */}
      {colKeys.length === 0 ? (
        <View style={s.emptyRoot}>
          <Text style={s.emptyIcon}>🍽</Text>
          <Text style={s.emptyText}>All caught up!</Text>
        </View>
      ) : (
        <View style={s.venueRow}>
          {colKeys.map((key) => {
            // Non-ready buckets surface together (preparing + expediting + remaking + scheduled).
            const nonReady = [...preparing, ...expediting, ...remaking, ...scheduled];
            const prepCol  = nonReady.filter((o) => getColumnKey(o) === key).slice(-6);
            const readyCol = ready.filter((o) => getColumnKey(o) === key).slice(-6);
            // color comes from first matching order
            const sampleOrder = allOrders.find((o) => getColumnKey(o) === key);
            const color = sampleOrder ? getColumnColor(sampleOrder) : '#475569';

            return (
              <View key={key} style={[s.venueCol, { borderTopColor: color }]}>
                <View style={s.venueHeader}>
                  <View style={[s.venueDot, { backgroundColor: color }]} />
                  <Text style={[s.venueName, { color }]}>{key.toUpperCase()}</Text>
                  <Text style={s.venueCount}>{prepCol.length + readyCol.length}</Text>
                </View>
                <FlatList
                  data={[
                    ...prepCol.map((o) => ({ ...o, _ready: false })),
                    ...readyCol.map((o) => ({ ...o, _ready: true })),
                  ]}
                  keyExtractor={(o) => o.id}
                  renderItem={({ item }) => <OrderCard order={item} isReady={item._ready} />}
                  contentContainerStyle={s.cardList}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            );
          })}
        </View>
      )}

      {/* Footer — spec sec.4.6 */}
      <View style={s.footer}>
        <Text style={s.footerMsg} numberOfLines={1}>{footerMsg}</Text>
        <View style={s.footerRight}>
          <Text style={s.footerMeta}>v0.1.0 · {tvRow?.instance.id?.slice(0, 8) ?? '—'}</Text>
          <View style={[s.connectionDot, { backgroundColor: wsStatus === 'connected' ? '#10B981' : '#EF4444' }]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0f172a' },
  header:      { height: 86, flexDirection: 'row', alignItems: 'center',
                 justifyContent: 'space-between', paddingHorizontal: 48,
                 backgroundColor: '#0a0f1e', borderBottomWidth: 3, borderBottomColor: T.color.brand },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 24 },
  name:        { fontSize: 28, fontWeight: T.fw.bold, color: T.color.brand, letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: T.fw.semibold, color: T.color.t1,
                 textTransform: 'uppercase', letterSpacing: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 40 },
  activeCount: { fontSize: 20, color: T.color.t1 },
  activeNum:   { color: '#34d399', fontWeight: T.fw.bold, fontSize: 26 },
  clock:       { fontSize: 30, fontWeight: T.fw.semibold, color: T.color.t0,
                 fontVariant: ['tabular-nums'] },

  venueRow:    { flex: 1, flexDirection: 'row' },
  venueCol:    { flex: 1, backgroundColor: '#1a2035', borderTopWidth: 4,
                 padding: 20, borderRightWidth: 1, borderRightColor: '#0a0f1e' },
  venueHeader: { flexDirection: 'row', alignItems: 'center', gap: 10,
                 paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#334155', marginBottom: 16 },
  venueDot:    { width: 10, height: 10, borderRadius: 5 },
  venueName:   { fontSize: 20, fontWeight: T.fw.bold, textTransform: 'uppercase', letterSpacing: 2, flex: 1 },
  venueCount:  { color: T.color.t2, fontSize: 15,
                 backgroundColor: '#0a0f1e', borderRadius: 20,
                 paddingHorizontal: 12, paddingVertical: 2 },
  cardList:    { gap: 10 },

  card:        { backgroundColor: '#0f172a', borderRadius: 12, padding: 16,
                 borderLeftWidth: 4, gap: 6 },
  cardPrep:    { borderLeftColor: '#334155' },
  cardReady:   { backgroundColor: '#052e16', borderLeftColor: '#15803d' },
  num:         { fontSize: 52, fontWeight: '900', color: T.color.t0, lineHeight: 56 },
  numReady:    { color: '#4ade80' },
  srcBadge:    { borderRadius: 4, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  srcText:     { fontSize: 12, fontWeight: T.fw.bold, color: T.color.t0,
                 textTransform: 'uppercase', letterSpacing: 1 },
  customer:    { fontSize: 14, color: T.color.t1 },
  time:        { fontSize: 13, color: T.color.t2 },
  readyCheck:  { fontSize: 28, position: 'absolute', right: 16, top: 16 },

  emptyRoot:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, opacity: 0.4 },
  emptyIcon:   { fontSize: 80 },
  emptyText:   { fontSize: 28, color: T.color.t1 },

  // Offline banner (spec sec.13)
  offlineBanner:     {
    paddingVertical: 6, paddingHorizontal: 24, backgroundColor: '#451a03',
    borderBottomWidth: 1, borderBottomColor: '#92400e',
  },
  offlineBannerDisc: { backgroundColor: '#7f1d1d', borderBottomColor: '#dc2626' },
  offlineBannerText: { color: '#fef3c7', fontSize: 14, fontWeight: T.fw.semibold },

  // Footer (spec sec.4.6)
  footer: {
    height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, backgroundColor: '#0a0f1e', borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  footerMsg:    { fontSize: 14, color: T.color.t1, flex: 1, marginRight: 16 },
  footerRight:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerMeta:   { fontSize: 12, color: T.color.t1, fontVariant: ['tabular-nums'] },
  connectionDot:{ width: 10, height: 10, borderRadius: 5 },
});
