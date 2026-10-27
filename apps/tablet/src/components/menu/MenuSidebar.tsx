// M01 Sprint 3 — Left panel: search + daypart filter + category list.
//
// 카테고리 fetch는 여기서 직접 (다른 화면에서 재사용 없음). flat list — nested는 P1.5.
// menuStore filters를 직접 patch — TanStack Query refetch는 useMenuWsSubscription 훅이 처리.

import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { T } from '@restosync/ui';
import { DAYPART } from '@restosync/shared';
import type { Daypart } from '@restosync/shared';
import { fetchCategories, type MenuCategory } from '../../api/menu';
import { useMenuStore } from '../../store/menuStore';
import { renderI18n } from '../../lib/i18nFallback';

export function MenuSidebar() {
  const filters       = useMenuStore((s) => s.filters);
  const setDaypart    = useMenuStore((s) => s.setDaypart);
  const setCategoryId = useMenuStore((s) => s.setCategoryId);
  const setSearch     = useMenuStore((s) => s.setSearch);

  const { data: cats, isLoading } = useQuery<MenuCategory[]>({
    queryKey: ['menu', 'categories'],
    queryFn:  () => fetchCategories({ is_active: true }),
  });

  return (
    <View style={s.root}>
      {/* Search */}
      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={T.color.t2} />
        <TextInput
          style={s.searchInput}
          placeholder="Search menu…"
          placeholderTextColor={T.color.t2}
          value={filters.search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {filters.search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={T.color.t2} />
          </TouchableOpacity>
        )}
      </View>

      {/* Daypart filter */}
      <Text style={s.sectionLabel}>DAYPART</Text>
      <View style={s.chipRow}>
        {/* "All" = filter 해제 (모든 daypart 노출). DAYPART의 'all'은 wildcard 값 — 필터 칩에서는 중복이므로 제외. */}
        <Chip label="All" active={filters.daypart === null} onPress={() => setDaypart(null)} />
        {DAYPART.filter((d) => d !== 'all').map((d) => (
          <Chip
            key={d}
            label={d}
            active={filters.daypart === d}
            onPress={() => setDaypart(d as Daypart)}
          />
        ))}
      </View>

      {/* Categories */}
      <Text style={s.sectionLabel}>CATEGORIES</Text>
      <ScrollView style={{ flex: 1 }}>
        <CategoryRow
          label="All categories"
          active={filters.category_id === null}
          onPress={() => setCategoryId(null)}
        />
        {isLoading ? (
          <View style={{ padding: T.sp[3], alignItems: 'center' }}>
            <ActivityIndicator size="small" color={T.color.brand} />
          </View>
        ) : (
          (cats ?? []).map((c) => (
            <CategoryRow
              key={c.id}
              icon={c.icon ?? undefined}
              label={renderI18n(c.name)}
              active={filters.category_id === c.id}
              onPress={() => setCategoryId(c.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CategoryRow({
  icon, label, active, onPress,
}: { icon?: string; label: string; active: boolean; onPress: () => void }) {
  // RN-Web TextInput drops 4-byte UTF-8 to "?" — filter pure-ASCII icons (e.g. "??") so
  // mangled values render as no-icon instead of literal "??" prefix.
  const hasEmoji = !!icon && [...icon].some((ch) => ch.codePointAt(0)! > 127);
  return (
    <TouchableOpacity
      style={[s.catRow, active && s.catRowActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {hasEmoji ? <Text style={s.catIcon}>{icon}</Text> : <View style={{ width: 20 }} />}
      <Text style={[s.catLabel, active && s.catLabelActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: {
    width: 240,
    backgroundColor: T.color.bg1,
    borderRightWidth: 1,
    borderRightColor: T.color.border,
    padding: T.sp[3],
    gap: T.sp[3],
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg3,
    borderRadius: 8,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
  },
  searchInput: { flex: 1, color: T.color.t0, fontSize: 13 },
  sectionLabel: {
    color: T.color.t2, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, marginTop: T.sp[2],
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip: {
    paddingHorizontal: T.sp[3], paddingVertical: 4,
    backgroundColor: T.color.bg3,
    borderRadius: 12,
    borderWidth: 1, borderColor: T.color.border,
  },
  chipActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText: { color: T.color.t1, fontSize: 11, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingHorizontal: T.sp[2], paddingVertical: T.sp[2],
    borderRadius: 6,
  },
  catRowActive: { backgroundColor: T.color.bg3 },
  catIcon: { fontSize: 16, width: 20, textAlign: 'center' },
  catLabel: { color: T.color.t1, fontSize: 13, flex: 1 },
  catLabelActive: { color: T.color.t0, fontWeight: '600' },
});
