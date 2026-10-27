// M01 Sprint 3 — 4-state UI components (AG-014 / UX-001 / AM01-013 web compat)
//
// 같은 패턴이 dashboard에서 인라인으로 쓰임. 메뉴 화면용으로 분리해서 일관성 보장.
// 묶음 파일 — 모두 작은 컴포넌트라 단일 import.

import React, { type ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';

// ── LoadingState ────────────────────────────────────────────────────────────
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={T.color.brand} />
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({
  icon = 'restaurant-outline',
  title,
  hint,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.center}>
      <Ionicons name={icon} size={48} color={T.color.t2} />
      <Text style={s.title}>{title}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {action ? <View style={{ marginTop: T.sp[4] }}>{action}</View> : null}
    </View>
  );
}

// ── ErrorState ──────────────────────────────────────────────────────────────
export function ErrorState({
  message,
  onRetry,
}: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.center}>
      <Ionicons name="alert-circle" size={48} color={T.color.error} />
      <Text style={s.title}>Something went wrong</Text>
      <Text style={s.hint}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={s.retry} onPress={onRetry} accessibilityRole="button">
          <Ionicons name="refresh" size={16} color={T.color.t0} />
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── OfflineBanner ───────────────────────────────────────────────────────────
export function OfflineBanner() {
  return (
    <View style={s.offline}>
      <Ionicons name="cloud-offline" size={14} color={T.color.warn} />
      <Text style={s.offlineText}>Offline — reconnecting…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: T.sp[6], gap: T.sp[3],
  },
  label:  { color: T.color.t1, fontSize: 14, marginTop: T.sp[3] },
  title:  { color: T.color.t0, fontSize: 16, fontWeight: '600', marginTop: T.sp[3], textAlign: 'center' },
  hint:   { color: T.color.t1, fontSize: 13, marginTop: T.sp[1], textAlign: 'center', maxWidth: 320 },
  retry:  {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg3,
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8, marginTop: T.sp[4],
  },
  retryText: { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  offline: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg2,
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderBottomWidth: 1, borderBottomColor: T.color.warn,
  },
  offlineText: { color: T.color.warn, fontSize: 12, fontWeight: '600' },
});
