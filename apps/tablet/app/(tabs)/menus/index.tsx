// M01 Sprint 3 — Page A `/menu` Dashboard.
// Sidebar (240) + Grid + Header actions. 4-state UI (AG-014). WS subscription (AG-002/003).
// Server-side filter (AG-021) — client-side는 search만 보조.

import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { T } from '@restosync/ui';

import { fetchMenuItems, toggleSoldOut, type MenuItem } from '../../../src/api/menu';
import { useMenuStore } from '../../../src/store/menuStore';
import { useMenuWsSubscription } from '../../../src/hooks/useMenuWsSubscription';
import { useIsOnline } from '../../../src/hooks/useIsOnline';
import { renderI18n } from '../../../src/lib/i18nFallback';

import { MenuSidebar } from '../../../src/components/menu/MenuSidebar';
import { MenuGrid } from '../../../src/components/menu/MenuGrid';
import { HeaderActions } from '../../../src/components/menu/HeaderActions';
import { AddItemModal } from '../../../src/components/menu/AddItemModal';
import {
  LoadingState, ErrorState, EmptyState, OfflineBanner,
} from '../../../src/components/menu/StatusViews';

export default function MenusScreen() {
  const qc       = useQueryClient();
  const router   = useRouter();
  const online   = useIsOnline();
  const filters  = useMenuStore((s) => s.filters);
  const openAdd  = useMenuStore((s) => s.openAddModal);
  const closeAdd = useMenuStore((s) => s.closeAddModal);
  const isOpen   = useMenuStore((s) => s.isAddModalOpen);

  // Server-side filter (AG-021)
  const { data: items, isLoading, error, refetch } = useQuery<MenuItem[]>({
    queryKey: ['menu', 'items', filters.daypart, filters.category_id],
    queryFn:  () => fetchMenuItems({
      ...(filters.daypart     ? { daypart:     filters.daypart }     : {}),
      ...(filters.category_id ? { category_id: filters.category_id } : {}),
      status: 'any',  // 86 토글된 항목도 화면에서 보이도록 — UI에서 sold_out 표시
      limit:  100,
    }),
  });

  // WS 실시간 갱신 (다른 디바이스/POS/import 변경 cover)
  useMenuWsSubscription();

  // Client-side search filter — server endpoint 미지원이라 보조 (≤100 items 가정)
  const filtered = useMemo(() => {
    const list = items ?? [];
    const q = filters.search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((it) => {
      const name = (renderI18n(it.name_i18n) || it.name || '').toLowerCase();
      return name.includes(q);
    });
  }, [items, filters.search]);

  // 86 토글 — optimistic update
  const [inflight, setInflight] = useState<Set<string>>(new Set());
  const toggleMutation = useMutation({
    mutationFn: ({ id, sold_out }: { id: string; sold_out: boolean }) =>
      toggleSoldOut(id, sold_out),
    onMutate: async ({ id, sold_out }) => {
      setInflight((prev) => new Set(prev).add(id));
      await qc.cancelQueries({ queryKey: ['menu', 'items'] });
      const previous = qc.getQueriesData<MenuItem[]>({ queryKey: ['menu', 'items'] });
      // 모든 ['menu','items', *] 변형 cache patch
      previous.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<MenuItem[]>(key, value.map((it) =>
          it.id === id ? { ...it, sold_out } : it,
        ));
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, value]) => {
        if (value) qc.setQueryData(key, value);
      });
    },
    onSettled: (_data, _err, vars) => {
      setInflight((prev) => {
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
      // WS 이벤트가 곧 invalidate를 호출하므로 별도 refetch 불필요
    },
  });

  const onToggleSoldOut = useCallback((item: MenuItem) => {
    toggleMutation.mutate({ id: item.id, sold_out: !item.sold_out });
  }, [toggleMutation]);

  const onPressItem = useCallback((item: MenuItem) => {
    router.push({ pathname: '/(tabs)/menus/item/[id]', params: { id: item.id } });
  }, [router]);

  return (
    <View style={s.root}>
      {!online && <OfflineBanner />}

      <View style={s.layout}>
        <MenuSidebar />

        <View style={s.main}>
          <View style={s.header}>
            <Text style={s.title}>
              Menu Items
              {items && items.length > 0 ? <Text style={s.count}>  ·  {filtered.length}/{items.length}</Text> : null}
            </Text>
            <HeaderActions
              onAddItem={openAdd}
              onCategories={() => router.push('/menus/categories' as never)}
              onDayparts={() => router.push('/menus/daypart' as never)}
              onFeatured={() => router.push('/menus/featured' as never)}
              onCombos={() => router.push('/menus/combos' as never)}
              onImportWizard={() => router.push('/menus/import' as never)}
            />
          </View>

          {isLoading ? (
            <LoadingState label="Loading menu…" />
          ) : error ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Failed to load menu'}
              onRetry={() => refetch()}
            />
          ) : filtered.length === 0 && (items?.length ?? 0) === 0 ? (
            <EmptyState
              icon="restaurant-outline"
              title="No menu items yet"
              hint="Click + Add Item to create your first dish, or use Import to bring an existing menu."
            />
          ) : (
            <MenuGrid
              items={filtered}
              onPressItem={onPressItem}
              onToggleSoldOut={onToggleSoldOut}
              inflightItemIds={inflight}
            />
          )}
        </View>
      </View>

      <AddItemModal visible={isOpen} onClose={closeAdd} />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.color.bg1 },
  layout:  { flex: 1, flexDirection: 'row' },
  main:    { flex: 1, flexDirection: 'column' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[3],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
    backgroundColor: T.color.bg1,
  },
  title:   { color: T.color.t0, fontSize: 20, fontWeight: '700' },
  count:   { color: T.color.t1, fontSize: 13, fontWeight: '400' },
});
