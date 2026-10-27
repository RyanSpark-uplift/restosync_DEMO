// M01 Sprint 4 — Page B `/menu/item/[id]` Item Edit (6-tab shell, S4.1 Basic only).
//
// S4.1 scope:
//   ✓ Route + GET single item + 4-state UI (AG-014)
//   ✓ 6-tab shell (Basic active; 5 placeholders for S4.2~S4.6)
//   ✓ Basic tab: 5-lang name/desc, category, priceCents, kitchen_name
//   ✓ Save mutation — PATCH dirty fields only; server enforces AM01-010/013 strict order
//   ✓ Optimistic cache patch + rollback on error
//
// Save flow (server enforces): commit → audit → invalidateSnapshot → broadcast (AM01-013).
// 86 toggle stays on dashboard fast-path (AM01-008) — Page B does NOT include sold_out edit.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import type { SupportedLang, I18nString } from '@restosync/shared';

import {
  fetchMenuItem, patchMenuItem, type MenuItem, type MenuItemPatchInput,
} from '../../../../src/api/menu';
import { useMenuWsSubscription } from '../../../../src/hooks/useMenuWsSubscription';
import { useIsOnline } from '../../../../src/hooks/useIsOnline';
import {
  LoadingState, ErrorState, OfflineBanner,
} from '../../../../src/components/menu/StatusViews';
import { BasicTab, type BasicFormState } from '../../../../src/components/menu/ItemEdit/BasicTab';
import { ScheduleTab, type ScheduleFormState } from '../../../../src/components/menu/ItemEdit/ScheduleTab';
import { AllergensTab, type AllergensFormState } from '../../../../src/components/menu/ItemEdit/AllergensTab';
import { DisplayTab, type DisplayFormState } from '../../../../src/components/menu/ItemEdit/DisplayTab';
import { ModifiersTab } from '../../../../src/components/menu/ItemEdit/ModifiersTab';
import { IngredientsTab } from '../../../../src/components/menu/ItemEdit/IngredientsTab';

type TabKey = 'basic' | 'schedule' | 'allergens' | 'display' | 'modifiers' | 'ingredients';

const TABS: { key: TabKey; label: string; sprint: string; ready: boolean }[] = [
  { key: 'basic',       label: 'Basic',       sprint: 'S4.1', ready: true  },
  { key: 'schedule',    label: 'Schedule',    sprint: 'S4.2', ready: true  },
  { key: 'allergens',   label: 'Allergens',   sprint: 'S4.3', ready: true  },
  { key: 'display',     label: 'Display',     sprint: 'S4.4', ready: true  },
  { key: 'modifiers',   label: 'Modifiers',   sprint: 'S4.5', ready: true  },
  { key: 'ingredients', label: 'Ingredients', sprint: 'S4.6', ready: true  },
];

type ItemFormState = BasicFormState & ScheduleFormState & AllergensFormState & DisplayFormState;

function itemToForm(item: MenuItem): ItemFormState {
  return {
    name_i18n:        item.name_i18n ?? (item.name ? { en: item.name } : {}),
    description_i18n: item.description_i18n ?? (item.description ? { en: item.description } : {}),
    category_id:      item.category_id,
    price_cents:      item.price_cents,
    dayparts_arr:     item.dayparts_arr ?? [],
    available_from:   item.available_from,
    available_until:  item.available_until,
    allergens:        item.allergens ?? [],
    calories:         item.calories,
    spice_level:      item.spice_level,
    show_on_tv:       item.show_on_tv,
    is_featured:      item.is_featured,
    is_hot:           item.is_hot,
    sort_order:       item.sort_order,
    kitchen_name:     item.kitchen_name,
  };
}

// Diff: emit only fields that changed. i18n + dayparts arrays compared by JSON shape.
function diffForm(orig: ItemFormState, next: ItemFormState): MenuItemPatchInput {
  const patch: MenuItemPatchInput = {};
  if (JSON.stringify(orig.name_i18n) !== JSON.stringify(next.name_i18n)) {
    patch.name_i18n = next.name_i18n;
  }
  if (JSON.stringify(orig.description_i18n) !== JSON.stringify(next.description_i18n)) {
    patch.description_i18n = next.description_i18n;
  }
  if (orig.category_id !== next.category_id) {
    patch.category_id = next.category_id ?? undefined;
  }
  if (orig.price_cents !== next.price_cents && next.price_cents !== null) {
    patch.price_cents = next.price_cents;
  }
  if (JSON.stringify(orig.dayparts_arr) !== JSON.stringify(next.dayparts_arr)) {
    patch.dayparts_arr = next.dayparts_arr;
  }
  if (orig.available_from !== next.available_from) {
    // Server accepts `null` to clear; Zod schema treats absent === undefined as "no change".
    patch.available_from = next.available_from;
  }
  if (orig.available_until !== next.available_until) {
    patch.available_until = next.available_until;
  }
  if (JSON.stringify(orig.allergens) !== JSON.stringify(next.allergens)) {
    patch.allergens = next.allergens;
  }
  if (orig.calories !== next.calories) {
    patch.calories = next.calories ?? undefined;
  }
  if (orig.spice_level !== next.spice_level) {
    patch.spice_level = next.spice_level ?? undefined;
  }
  if (orig.show_on_tv !== next.show_on_tv)   patch.show_on_tv  = next.show_on_tv;
  if (orig.is_featured !== next.is_featured) patch.is_featured = next.is_featured;
  if (orig.is_hot !== next.is_hot)           patch.is_hot      = next.is_hot;
  if (orig.sort_order !== next.sort_order)   patch.sort_order  = next.sort_order;
  if (orig.kitchen_name !== next.kitchen_name) {
    patch.kitchen_name = next.kitchen_name ?? undefined;
  }
  return patch;
}

export default function ItemEditScreen() {
  const params  = useLocalSearchParams<{ id: string }>();
  const id      = params.id;
  const router  = useRouter();
  const qc      = useQueryClient();
  const online  = useIsOnline();

  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [lang, setLang]           = useState<SupportedLang>('en');
  const [form, setForm]           = useState<ItemFormState | null>(null);
  const [savedForm, setSavedForm] = useState<ItemFormState | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // WS subscription — other devices/POS/import may update this item; cache invalidate triggers refetch.
  useMenuWsSubscription();

  const { data: item, isLoading, error: queryErr, refetch } = useQuery<MenuItem>({
    queryKey: ['menu', 'item', id],
    queryFn:  () => fetchMenuItem(id),
    enabled:  !!id,
  });

  // Hydrate form when item arrives. WS-triggered refetch는 사용자가 편집 중이 아닐 때만 재hydrate
  // (dirty 상태 — 사용자 입력 보호). clean 상태에서는 다른 디바이스 변경 즉시 반영.
  useEffect(() => {
    if (!item) return;
    if (form === null) {
      const initial = itemToForm(item);
      setForm(initial);
      setSavedForm(initial);
      return;
    }
    // Re-hydrate only if clean (no in-progress edits).
    if (savedForm && JSON.stringify(form) === JSON.stringify(savedForm)) {
      const refreshed = itemToForm(item);
      setForm(refreshed);
      setSavedForm(refreshed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const patch = useMemo(() => {
    if (!form || !savedForm) return {};
    return diffForm(savedForm, form);
  }, [form, savedForm]);
  const isDirty = Object.keys(patch).length > 0;
  // BR-10: LTO 역전 시 Save 차단 (서버도 거부하지만 클라이언트 사전 가드)
  const isLtoInverted = !!form?.available_from && !!form?.available_until
    && new Date(form.available_from) >= new Date(form.available_until);
  const canSave = isDirty && form?.price_cents !== null && form !== null
    && (form.name_i18n.en?.trim().length ?? 0) > 0
    && !isLtoInverted;

  const save = useMutation({
    mutationFn: () => patchMenuItem(id, patch),
    onMutate: async () => {
      setError(null);
      // Optimistic patch into list caches; single-item cache updated on success.
      await qc.cancelQueries({ queryKey: ['menu', 'items'] });
      const previous = qc.getQueriesData<MenuItem[]>({ queryKey: ['menu', 'items'] });
      previous.forEach(([key, value]) => {
        if (!value || !form) return;
        qc.setQueryData<MenuItem[]>(key, value.map((it) =>
          it.id === id ? mergeForOptimistic(it, form) : it,
        ));
      });
      return { previous };
    },
    onSuccess: (updated) => {
      // Server is the source of truth; sync caches + reset dirty.
      qc.setQueryData(['menu', 'item', id], updated);
      const nextForm = itemToForm(updated);
      setForm(nextForm);
      setSavedForm(nextForm);
      // List caches get the canonical row via WS broadcast (display:menu_item_updated) → invalidate.
    },
    onError: (err: unknown, _vars, ctx) => {
      ctx?.previous?.forEach(([key, value]) => {
        if (value) qc.setQueryData(key, value);
      });
      setError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────
  const headerTitle = item
    ? renderTitle(item.name_i18n, item.name)
    : 'Loading…';

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: headerTitle, headerBackTitle: 'Menu' }} />

      {!online && <OfflineBanner />}

      {/* Header bar with back + save */}
      <View style={s.header}>
        {/* router.back()은 (tabs) 그룹 안에서 history에 따라 다른 탭으로 갈 수 있어 명시적 push 사용. */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/menus')} accessibilityRole="button" style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={T.color.t0} />
          <Text style={s.backText}>Menu</Text>
        </TouchableOpacity>

        <Text style={s.title} numberOfLines={1}>{headerTitle}</Text>

        <View style={s.saveWrap}>
          {isDirty && !save.isPending && (
            <Text style={s.dirtyDot}>● unsaved</Text>
          )}
          <TouchableOpacity
            style={[s.saveBtn, (!canSave || save.isPending) && { opacity: 0.5 }]}
            onPress={() => save.mutate()}
            disabled={!canSave || save.isPending}
            accessibilityRole="button"
          >
            {save.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveText}>Save</Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar (always visible) */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => setActiveTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === t.key }}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
            {!t.ready && <Text style={s.tabSprint}>{t.sprint}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {/* Body */}
      {isLoading ? (
        <LoadingState label="Loading item…" />
      ) : queryErr ? (
        <ErrorState
          message={queryErr instanceof Error ? queryErr.message : 'Failed to load item'}
          onRetry={() => refetch()}
        />
      ) : !item || !form ? (
        <ErrorState message="Item not found" onRetry={() => router.back()} />
      ) : (
        <>
          {activeTab === 'basic' && (
            <BasicTab
              value={form}
              onChange={(p) => setForm((prev) => prev ? { ...prev, ...p } : prev)}
              lang={lang}
              onLangChange={setLang}
            />
          )}
          {activeTab === 'schedule' && (
            <ScheduleTab
              value={form}
              onChange={(p) => setForm((prev) => prev ? { ...prev, ...p } : prev)}
            />
          )}
          {activeTab === 'allergens' && (
            <AllergensTab
              value={form}
              onChange={(p) => setForm((prev) => prev ? { ...prev, ...p } : prev)}
            />
          )}
          {activeTab === 'display' && (
            <DisplayTab
              value={form}
              onChange={(p) => setForm((prev) => prev ? { ...prev, ...p } : prev)}
            />
          )}
          {activeTab === 'modifiers' && (
            <ModifiersTab itemId={id} syncSource={item.sync_source} />
          )}
          {activeTab === 'ingredients' && (
            <IngredientsTab itemId={id} syncSource={item.sync_source} />
          )}
          {activeTab !== 'basic' && activeTab !== 'schedule' && activeTab !== 'allergens' && activeTab !== 'display' && activeTab !== 'modifiers' && activeTab !== 'ingredients' && (
            <View style={s.placeholder}>
              <Ionicons name="construct-outline" size={48} color={T.color.t2} />
              <Text style={s.placeholderTitle}>
                {TABS.find((t) => t.key === activeTab)?.label} — coming in {TABS.find((t) => t.key === activeTab)?.sprint}
              </Text>
              <Text style={s.placeholderHint}>
                {placeholderHint(activeTab)}
              </Text>
            </View>
          )}
        </>
      )}

      {error && (
        <View style={s.errorBar}>
          <Ionicons name="alert-circle" size={14} color={T.color.error} />
          <Text style={s.errorText} numberOfLines={2}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// Merge form into list-cache row optimistically — mirror canonical + legacy columns.
function mergeForOptimistic(it: MenuItem, form: ItemFormState): MenuItem {
  return {
    ...it,
    name_i18n:        form.name_i18n,
    description_i18n: form.description_i18n,
    category_id:      form.category_id,
    price_cents:      form.price_cents,
    dayparts_arr:     form.dayparts_arr,
    available_from:   form.available_from,
    available_until:  form.available_until,
    allergens:        form.allergens,
    calories:         form.calories,
    spice_level:      form.spice_level,
    show_on_tv:       form.show_on_tv,
    is_featured:      form.is_featured,
    is_hot:           form.is_hot,
    sort_order:       form.sort_order,
    kitchen_name:     form.kitchen_name,
    // Legacy mirrors (server will return canonical row on broadcast).
    name:             form.name_i18n.en ?? it.name,
    description:      form.description_i18n.en ?? it.description,
    price:            form.price_cents != null ? (form.price_cents / 100).toFixed(2) : it.price,
  };
}

function renderTitle(i18n: I18nString | null | undefined, legacy?: string | null): string {
  return i18n?.en?.trim() || legacy?.trim() || '(unnamed item)';
}

function placeholderHint(tab: TabKey): string {
  switch (tab) {
    case 'modifiers':   return 'Size variants + modifier groups attach (BR-16/17).';
    case 'ingredients': return 'Recipe link + auto-86 from inventory (P1.5, BR-19).';
    default:            return '';
  }
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.color.bg1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[3],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
    backgroundColor: T.color.bg1,
  },
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[1] },
  backText: { color: T.color.t0, fontSize: 14, fontWeight: '600' },
  title:    { flex: 1, color: T.color.t0, fontSize: 18, fontWeight: '700' },
  saveWrap: { flexDirection: 'row', alignItems: 'center', gap: T.sp[3] },
  dirtyDot: { color: T.color.warn, fontSize: 11, fontWeight: '600' },
  saveBtn: {
    backgroundColor: T.color.brand,
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8, minWidth: 80, alignItems: 'center', justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: T.color.border,
    backgroundColor: T.color.bg2,
  },
  tab: {
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[3],
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: T.color.brand },
  tabText:       { color: T.color.t1, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: T.color.brand },
  tabSprint:     { color: T.color.t2, fontSize: 10, fontWeight: '500' },

  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: T.sp[6], gap: T.sp[3],
  },
  placeholderTitle: { color: T.color.t0, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  placeholderHint:  { color: T.color.t1, fontSize: 13, textAlign: 'center', maxWidth: 360 },

  errorBar: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: '#3a1a1a',
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
  },
  errorText: { color: T.color.error, fontSize: 12, flex: 1 },
});
