import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { T } from '@restosync/ui';
import { api } from '../../../src/api/client';

interface AnalyticsResp {
  window: { from: string; to: string };
  total: number;
  collected: number;
  expired: number;
  cancelled: number;
  avg_wait_seconds: number;
  max_wait_seconds: number;
  avg_prep_seconds: number;
  pickup_rate_pct: number;
  expired_rate_pct: number;
  orders_per_hour: number;
  peak_concurrent: number;
  per_hour: Array<{ hour: string; n: number }>;
}

function fmtSeconds(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (m < 60)  return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function AnalyticsScreen() {
  const { data, isLoading, error, refetch } = useQuery<AnalyticsResp>({
    queryKey: ['analytics', 'orders'],
    queryFn:  () => api.get('/api/analytics/orders'),
  });

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>;
  }
  if (error || !data) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Failed to load analytics</Text>
      </View>
    );
  }

  const maxBar = Math.max(1, ...data.per_hour.map((p) => p.n));
  const screenW = Dimensions.get('window').width;
  const chartW  = screenW - 32 - 24; // page padding minus inner padding
  const barW    = data.per_hour.length === 0 ? 0 : Math.max(8, Math.floor(chartW / data.per_hour.length) - 4);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <Text style={s.title}>Analytics</Text>
      <Text style={s.windowText}>
        {new Date(data.window.from).toLocaleDateString()} → {new Date(data.window.to).toLocaleDateString()}
      </Text>

      <View style={s.kpiRow}>
        <Kpi label="Total" value={String(data.total)} />
        <Kpi label="Picked up" value={String(data.collected)} tint={T.color.success} />
        <Kpi label="Expired" value={String(data.expired)} tint={T.color.warn} />
        <Kpi label="Cancelled" value={String(data.cancelled)} tint={T.color.error} />
      </View>

      <View style={s.kpiRow}>
        <Kpi label="Pickup rate" value={`${data.pickup_rate_pct}%`} tint={T.color.success} />
        <Kpi label="Expired rate" value={`${data.expired_rate_pct}%`} tint={T.color.warn} />
        <Kpi label="Avg wait" value={fmtSeconds(data.avg_wait_seconds)} />
        <Kpi label="Avg prep" value={fmtSeconds(data.avg_prep_seconds)} />
      </View>

      <View style={s.kpiRow}>
        <Kpi label="Orders / hr" value={String(data.orders_per_hour)} />
        <Kpi label="Peak concurrent" value={String(data.peak_concurrent)} />
      </View>

      <View style={s.chartCard}>
        <Text style={s.sectionLabel}>Orders by hour</Text>
        {data.per_hour.length === 0 ? (
          <Text style={s.emptyText}>No data in selected window</Text>
        ) : (
          <View style={[s.chartRow, { width: chartW }]}>
            {data.per_hour.map((p) => {
              const h = Math.max(4, Math.round((p.n / maxBar) * 120));
              return (
                <View key={p.hour} style={[s.bar, { width: barW, height: h }]}>
                  <Text style={s.barValue}>{p.n}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Kpi({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={[s.kpiValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: T.color.bg1 },
  body:  { padding: T.sp[4], gap: T.sp[4] },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:{ color: T.color.error, fontSize: T.fs.md },

  title:      { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },
  windowText: { color: T.color.t1, fontSize: T.fs.sm },

  kpiRow: { flexDirection: 'row', gap: T.sp[3], flexWrap: 'wrap' },
  kpi: {
    flex: 1, minWidth: 120, padding: T.sp[3],
    backgroundColor: T.color.bg2, borderRadius: T.r.md,
    borderWidth: 1, borderColor: T.color.border,
  },
  kpiValue: { color: T.color.t0, fontSize: T.fs['2xl'], fontWeight: T.fw.bold, fontVariant: ['tabular-nums'] },
  kpiLabel: { color: T.color.t1, fontSize: T.fs.sm, marginTop: 2 },

  chartCard: { padding: T.sp[3], backgroundColor: T.color.bg2, borderRadius: T.r.md,
               borderWidth: 1, borderColor: T.color.border, gap: T.sp[2] },
  sectionLabel: { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.semibold,
                  textTransform: 'uppercase', letterSpacing: 1 },
  emptyText:    { color: T.color.t2, fontSize: T.fs.sm, textAlign: 'center', padding: T.sp[4] },

  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: T.sp[2], height: 140 },
  bar: { backgroundColor: T.color.brand, borderTopLeftRadius: 2, borderTopRightRadius: 2,
         alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 },
  barValue: { color: T.color.t0, fontSize: 10, fontWeight: T.fw.semibold },
});
