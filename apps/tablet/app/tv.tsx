// TV display route for standalone (workflow.pickup_flow === 'ready_only') mode.
//
// Use case: keypad tab on PC browser + second tab open at /tv, Chromecast'd to
// the TV. localStorage 'storage' event keeps both tabs in sync (see
// startCrossTabSync in src/store/localPickup.ts) so this view auto-refreshes
// without an API or WebSocket.
//
// Intentionally renders nothing chrome-y: no header bar, no tabs nav, no auth
// gate. The whole viewport is the customer-facing ready list.

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { T } from '@restosync/ui';
import { useLocalPickupStore, type LocalReadyOrder } from '../src/store/localPickup';

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minsAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

export default function TvDisplayRoute() {
  const ready = useLocalPickupStore((s) => s.ready);
  const clock = useClock();
  const { width } = useWindowDimensions();

  // Adapt grid columns to viewport so a 4K cast and a 720p Chromecast both
  // render legible numbers. Roughly one card per 280px of width.
  const numColumns = Math.max(2, Math.min(6, Math.floor(width / 280)));

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>ORDER READY</Text>
        <View style={s.headerRight}>
          <Text style={s.activeLabel}>Active</Text>
          <Text style={s.activeNum}>{ready.length}</Text>
          <Text style={s.clock}>{clock}</Text>
        </View>
      </View>

      {ready.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>☕</Text>
          <Text style={s.emptyText}>Waiting for orders</Text>
        </View>
      ) : (
        <FlatList
          data={ready}
          keyExtractor={(o) => o.id}
          numColumns={numColumns}
          // numColumns can change at runtime (viewport resize) — give FlatList
          // a key tied to it so it remounts cleanly instead of throwing.
          key={`cols-${numColumns}`}
          contentContainerStyle={s.grid}
          columnWrapperStyle={numColumns > 1 ? s.gridRow : undefined}
          renderItem={({ item }) => <ReadyCard order={item} />}
        />
      )}

      <View style={s.footer}>
        <Text style={s.footerText}>RestoSync · Standalone mode</Text>
      </View>
    </View>
  );
}

function ReadyCard({ order }: { order: LocalReadyOrder }) {
  return (
    <View style={s.card}>
      <Text style={s.cardNum}>{order.display_number}</Text>
      <Text style={s.cardTime}>{minsAgo(order.created_at)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#0a0f1e' },

  header: {
    paddingHorizontal: 40, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 3, borderBottomColor: '#15803d',
    backgroundColor: '#0f172a',
  },
  title:       { color: '#10B981', fontSize: 36, fontWeight: '900', letterSpacing: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  activeLabel: { color: T.color.t1, fontSize: 16 },
  activeNum:   { color: '#34d399', fontSize: 28, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  clock:       { color: T.color.t0, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '600' },

  grid:        { padding: 24, gap: 18 },
  gridRow:     { gap: 18 },

  card: {
    flex: 1,
    backgroundColor: '#052e16',
    borderColor: '#15803d', borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 36, paddingHorizontal: 24,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 180, gap: 12,
  },
  cardNum:  { color: '#4ade80', fontSize: 96, fontWeight: '900', letterSpacing: -2, lineHeight: 100 },
  cardTime: { color: '#a7f3d0', fontSize: 16 },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, opacity: 0.5 },
  emptyIcon: { fontSize: 96 },
  emptyText: { color: T.color.t1, fontSize: 28 },

  footer: {
    paddingHorizontal: 24, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#1e293b',
    backgroundColor: '#0a0f1e',
  },
  footerText: { color: T.color.t2, fontSize: 12 },
});
