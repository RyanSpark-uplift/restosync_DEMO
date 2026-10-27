// Portrait (9:16) pickup display — spec sec.22.
// READY column on top (eye-level), PREPARING on bottom. Single column each.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Animated, StyleSheet,
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

function sourceColor(src: string): string { return SOURCE_COLOR[src] ?? '#475569'; }

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

function OrderCard({ order, isReady }: { order: Order; isReady: boolean }) {
  const flashAnim = useRef(new Animated.Value(1)).current;
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isReady) {
      animRef.current = Animated.loop(Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ]));
      animRef.current.start();
    } else {
      animRef.current?.stop();
      flashAnim.setValue(1);
    }
    return () => { animRef.current?.stop(); };
  }, [isReady, flashAnim]);

  const sc = sourceColor(order.source);

  return (
    <Animated.View style={[
      s.card, isReady ? s.cardReady : s.cardPrep,
      isReady && { opacity: flashAnim },
    ]}>
      <Text style={[s.cardNum, isReady && s.cardNumReady]}>{order.display_number}</Text>
      <View style={[s.srcBadge, { backgroundColor: sc }]}>
        <Text style={s.srcText}>{order.source.toUpperCase()}</Text>
      </View>
      {order.customer_name ? (
        <Text style={s.customer} numberOfLines={1}>{order.customer_name}</Text>
      ) : null}
      <Text style={s.time}>{timeAgo(order.created_at)}</Text>
    </Animated.View>
  );
}

export default function PortraitPickupScreen() {
  const { preparing, expediting, ready, remaking, tvRow, storeSettings, wsStatus } = useTVStore();
  const clock = useClock();

  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync().catch(() => {});
    return () => { KeepAwake?.deactivateKeepAwake(); };
  }, []);

  // Portrait fits fewer cards per column — show last 4 ready, last 6 preparing/expediting.
  // Remaking surfaces in the PREPARING section (kitchen redo, not a separate state).
  const displayReady = ready.slice(-4);
  const nonReady     = [...preparing, ...remaking, ...expediting];
  const displayPrep  = nonReady.slice(-6);

  const screenName = tvRow?.instance.display_name ?? 'KITCHEN';
  const footerMsg = ((storeSettings as Record<string, Record<string, string>> | null)?.theme?.footer_message) ?? '';

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.restaurantName}>{screenName.toUpperCase()}</Text>
        <Text style={s.clock}>{clock}</Text>
      </View>

      {wsStatus !== 'connected' && (
        <View style={[s.offlineBanner, wsStatus === 'disconnected' && s.offlineBannerDisc]}>
          <Text style={s.offlineBannerText}>
            {wsStatus === 'connecting' ? '⏳  Reconnecting…' : `⚠  Disconnected — last update ${clock}`}
          </Text>
        </View>
      )}

      {/* READY (top, biggest) */}
      <View style={[s.section, s.sectionReady]}>
        <View style={[s.sectionHeader, s.sectionHeaderReady]}>
          <Text style={s.sectionTitle}>✅  READY FOR PICKUP</Text>
          <View style={[s.countBadge, s.countBadgeReady]}>
            <Text style={s.countText}>{ready.length}</Text>
          </View>
        </View>
        {displayReady.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🍽</Text>
            <Text style={s.emptyText}>No orders ready yet</Text>
          </View>
        ) : (
          <FlatList
            data={displayReady}
            keyExtractor={(o) => o.id}
            renderItem={({ item }) => <OrderCard order={item} isReady />}
            contentContainerStyle={s.cardList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* PREPARING (bottom, smaller) */}
      <View style={[s.section, s.sectionPrep]}>
        <View style={[s.sectionHeader, s.sectionHeaderPrep]}>
          <Text style={s.sectionTitle}>🕐  PREPARING</Text>
          <View style={s.countBadge}><Text style={s.countText}>{nonReady.length}</Text></View>
        </View>
        {displayPrep.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🍳</Text>
            <Text style={s.emptyText}>No orders preparing</Text>
          </View>
        ) : (
          <FlatList
            data={displayPrep}
            keyExtractor={(o) => o.id}
            renderItem={({ item }) => <OrderCard order={item} isReady={false} />}
            contentContainerStyle={s.cardList}
            showsVerticalScrollIndicator={false}
            numColumns={2}
            columnWrapperStyle={s.prepRow}
          />
        )}
      </View>

      {/* Footer (spec sec.4.6) */}
      <View style={s.footer}>
        <Text style={s.footerMsg} numberOfLines={1}>{footerMsg}</Text>
        <View style={[s.connectionDot, { backgroundColor: wsStatus === 'connected' ? '#10B981' : '#EF4444' }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, backgroundColor: '#0a0f1e',
    borderBottomWidth: 3, borderBottomColor: T.color.brand,
  },
  restaurantName: { fontSize: 26, fontWeight: T.fw.bold, color: T.color.brand, letterSpacing: 1 },
  clock: { fontSize: 24, fontWeight: T.fw.semibold, color: T.color.t0, fontVariant: ['tabular-nums'] },

  offlineBanner:     { paddingVertical: 6, paddingHorizontal: 16, backgroundColor: '#451a03',
                       borderBottomWidth: 1, borderBottomColor: '#92400e' },
  offlineBannerDisc: { backgroundColor: '#7f1d1d', borderBottomColor: '#dc2626' },
  offlineBannerText: { color: '#fef3c7', fontSize: 13, fontWeight: T.fw.semibold },

  section: { padding: 16 },
  sectionReady: { flex: 3, backgroundColor: '#14532d' },
  sectionPrep:  { flex: 2, backgroundColor: '#1e293b' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingBottom: 12, borderBottomWidth: 2, marginBottom: 12 },
  sectionHeaderReady: { borderBottomColor: '#15803d' },
  sectionHeaderPrep:  { borderBottomColor: '#334155' },
  sectionTitle: { fontSize: 22, fontWeight: T.fw.bold, color: T.color.t0,
                  textTransform: 'uppercase', letterSpacing: 2 },

  countBadge:      { backgroundColor: '#0f172a', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 2 },
  countBadgeReady: { backgroundColor: '#052e16' },
  countText:       { fontSize: 16, fontWeight: T.fw.semibold, color: T.color.t1 },

  cardList: { gap: 10 },
  prepRow:  { gap: 10 },

  card:        { backgroundColor: '#0f172a', borderRadius: 14, padding: 16, gap: 6, borderLeftWidth: 5, flex: 1 },
  cardPrep:    { borderLeftColor: '#334155' },
  cardReady:   { backgroundColor: '#052e16', borderLeftColor: '#15803d' },
  cardNum:     { fontSize: 56, fontWeight: '900', color: T.color.t0, lineHeight: 60 },
  cardNumReady:{ color: '#4ade80' },
  srcBadge:    { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  srcText:     { fontSize: 12, fontWeight: T.fw.bold, color: T.color.t0, letterSpacing: 1 },
  customer:    { fontSize: 16, color: T.color.t1 },
  time:        { fontSize: 13, color: T.color.t2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 0.4 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { fontSize: 18, color: T.color.t1 },

  footer: {
    height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, backgroundColor: '#0a0f1e', borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  footerMsg:    { fontSize: 12, color: T.color.t1, flex: 1, marginRight: 12 },
  connectionDot:{ width: 8, height: 8, borderRadius: 4 },
});
