import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { api } from '../../../src/api/client';
import type { Event } from '../../../src/api/client';
import { fetchEvents } from '../../../src/api/events';
import { EventEditorModal } from '../../../src/components/event/EventEditorModal';

const EVENT_TYPE_ICON: Record<string, { icon: string; color: string }> = {
  happy_hour:  { icon: 'beer',        color: T.color.warn },
  live_event:  { icon: 'musical-notes', color: T.color.info },
  lto:         { icon: 'time',        color: T.color.brand },
  alert:       { icon: 'warning',     color: T.color.error },
  promo:       { icon: 'pricetag',    color: T.color.success },
};

function Countdown({ endAt }: { endAt: string }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, new Date(endAt).getTime() - now);
  if (!diff) return <Text style={s.countdown}>Ended</Text>;

  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const sec = Math.floor((diff % 60_000) / 1000);
  return (
    <Text style={s.countdown}>
      {`${h}h ${m.toString().padStart(2, '0')}m ${sec.toString().padStart(2, '0')}s`}
    </Text>
  );
}

export default function EventsScreen() {
  const qc    = useQueryClient();
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing,    setEditing]    = useState<Event | null>(null);

  const { data: events, isLoading, error, refetch } = useQuery<Event[]>({
    queryKey: ['events'],
    queryFn:  fetchEvents,                          // AG-021
  });

  const openCreate = () => { setEditing(null);   setEditorOpen(true); };
  const openEdit   = (ev: Event) => { setEditing(ev); setEditorOpen(true); };
  const closeEditor = () => setEditorOpen(false);

  const filtered = (events ?? []).filter((e) =>
    tab === 'active' ? e.active : true,
  );

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/api/events/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Events & Promotions</Text>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.newBtn}
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="New event"
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.newBtnText}>New Event</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => refetch()} accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={18} color={T.color.t1} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.tabs}>
        {(['active', 'all'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'active' ? 'Active' : 'All Events'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>}
      {error && (
        <View style={s.center}>
          <Ionicons name="alert-circle" size={36} color={T.color.error} />
          <Text style={s.errorText}>Failed to load events</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {!isLoading && !error && (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="calendar-outline" size={40} color={T.color.t2} />
              <Text style={s.emptyText}>
                {tab === 'active' ? 'No active events' : 'No events created yet'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const typeInfo = EVENT_TYPE_ICON[item.type] ?? { icon: 'star', color: T.color.t1 };
            return (
              <TouchableOpacity
                style={[s.card, item.active && s.cardActive]}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.title ?? item.type}`}
              >
                {/* Type icon */}
                <View style={[s.typeIcon, { backgroundColor: typeInfo.color + '22' }]}>
                  <Ionicons
                    name={typeInfo.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={22} color={typeInfo.color}
                  />
                </View>

                <View style={s.cardBody}>
                  <View style={s.cardRow}>
                    <Text style={s.eventTitle}>{item.title ?? item.type}</Text>
                    <View
                      onStartShouldSetResponder={() => true}
                      onTouchEnd={(e) => e.stopPropagation()}
                    >
                      <Switch
                        value={item.active}
                        onValueChange={(v) => toggleActive.mutate({ id: item.id, active: v })}
                        trackColor={{ false: T.color.border, true: T.color.success + '55' }}
                        thumbColor={item.active ? T.color.success : T.color.t2}
                      />
                    </View>
                  </View>

                  <View style={s.meta}>
                    <View style={[s.typeBadge, { borderColor: typeInfo.color }]}>
                      <Text style={[s.typeText, { color: typeInfo.color }]}>
                        {item.type.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                    {item.start_at && item.end_at && (
                      <Text style={s.timeRange}>
                        {new Date(item.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(item.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>

                  {item.ticker_text && (
                    <Text style={s.ticker} numberOfLines={1}>"{item.ticker_text}"</Text>
                  )}

                  {item.active && item.end_at && (
                    <View style={s.countdownRow}>
                      <Ionicons name="timer-outline" size={13} color={T.color.warn} />
                      <Countdown endAt={item.end_at} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <EventEditorModal
        visible={editorOpen}
        initial={editing}
        onClose={closeEditor}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.color.bg1, padding: T.sp[4] },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.sp[3] },
  title:   { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: T.sp[3] },
  newBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[1],
    backgroundColor: T.color.brand,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: T.r.sm,
  },
  newBtnText: { color: '#fff', fontSize: T.fs.sm, fontWeight: T.fw.semibold },
  tabs:    { flexDirection: 'row', gap: T.sp[2], marginBottom: T.sp[4] },
  tabBtn:  { borderRadius: T.r.sm, borderWidth: 1, borderColor: T.color.border,
             paddingHorizontal: T.sp[4], paddingVertical: T.sp[2] },
  tabBtnActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  tabText:      { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.medium },
  tabTextActive:{ color: T.color.t0, fontWeight: T.fw.semibold },
  list:    { gap: T.sp[3], paddingBottom: T.sp[8] },
  card: {
    flexDirection: 'row', gap: T.sp[3],
    backgroundColor: T.color.bg2, borderRadius: T.r.lg, padding: T.sp[4],
    borderWidth: 1, borderColor: T.color.border, ...T.shadow.sm,
  },
  cardActive: { borderColor: T.color.success + '55' },
  typeIcon:   { width: 48, height: 48, borderRadius: T.r.md, alignItems: 'center', justifyContent: 'center' },
  cardBody:   { flex: 1, gap: T.sp[2] },
  cardRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventTitle: { color: T.color.t0, fontSize: T.fs.lg, fontWeight: T.fw.semibold, flex: 1 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: T.sp[3] },
  typeBadge:  { borderRadius: T.r.full, borderWidth: 1, paddingHorizontal: T.sp[2], paddingVertical: 2 },
  typeText:   { fontSize: T.fs.xs, fontWeight: T.fw.bold },
  timeRange:  { color: T.color.t1, fontSize: T.fs.sm },
  ticker:     { color: T.color.t1, fontSize: T.fs.sm, fontStyle: 'italic' },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[1] },
  countdown:  { color: T.color.warn, fontSize: T.fs.sm, fontWeight: T.fw.semibold, fontVariant: ['tabular-nums'] },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[3], paddingTop: T.sp[12] },
  errorText:  { color: T.color.error, fontSize: T.fs.md },
  emptyText:  { color: T.color.t1, fontSize: T.fs.md },
  retryBtn:   { backgroundColor: T.color.brand, borderRadius: T.r.sm, paddingHorizontal: T.sp[4], paddingVertical: T.sp[2] },
  retryText:  { color: T.color.t0, fontWeight: T.fw.semibold },
});
