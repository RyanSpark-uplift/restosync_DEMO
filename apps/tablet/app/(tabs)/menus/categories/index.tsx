// M01 Sprint 4 polish — Page C `/menu/categories`.
//
// PRD §3.3 / §4.3 — 5-lang name + emoji icon + is_active toggle + sort_order(BR-13).
// AG-017 drag-drop 라이브러리 미설치 → ↑/↓ 버튼 reorder로 대체. BR-14: 연결 item이 있는 카테고리 삭제 → 409.
// AG-014 4-state UI (Loading/Empty/Error/Offline).

import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchCategories, createCategory, patchCategory, deleteCategory, reorderCategories,
  type MenuCategory,
} from '../../../../src/api/menu';
import { useIsOnline } from '../../../../src/hooks/useIsOnline';
import { SUPPORTED_LANG, type SupportedLang } from '@restosync/shared/enums';

const CATEGORIES_KEY = ['menu', 'categories', 'edit'] as const;

export default function CategoriesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const online = useIsOnline();

  const { data: categories, isLoading, error, refetch } = useQuery<MenuCategory[]>({
    queryKey: CATEGORIES_KEY,
    queryFn:  () => fetchCategories({ limit: 200 }),
  });

  const reorder = useMutation({
    mutationFn: (orders: { id: string; sort_order: number }[]) => reorderCategories(orders),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      qc.invalidateQueries({ queryKey: ['menu', 'categories'] });
    },
  });

  const sorted = useMemo(
    () => [...(categories ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [categories],
  );

  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= sorted.length) return;
    const a = sorted[idx], b = sorted[next];
    reorder.mutate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={T.color.t0} />
        </TouchableOpacity>
        <Text style={s.title}>Categories</Text>
        <View style={{ flex: 1 }} />
        {!online && <Text style={s.offline}>Offline</Text>}
      </View>

      {isLoading && <View style={s.center}><ActivityIndicator color={T.color.t1} /></View>}

      {error && !isLoading && (
        <View style={s.center}>
          <Text style={s.errorText}>{(error as Error).message}</Text>
          <TouchableOpacity onPress={() => refetch()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !error && (
        <ScrollView contentContainerStyle={s.list}>
          {sorted.length === 0 && (
            <Text style={s.emptyText}>No categories yet. Add one below.</Text>
          )}
          {sorted.map((cat, idx) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              isFirst={idx === 0}
              isLast={idx === sorted.length - 1}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              reordering={reorder.isPending}
            />
          ))}

          <AddCategoryForm
            existingSortMax={sorted.length > 0 ? sorted[sorted.length - 1].sort_order : 0}
          />
        </ScrollView>
      )}
    </View>
  );
}

// ── Category row (inline edit + reorder + delete) ────────────────────────────
function CategoryRow({
  category, isFirst, isLast, onMoveUp, onMoveDown, reordering,
}: {
  category:   MenuCategory;
  isFirst:    boolean;
  isLast:     boolean;
  onMoveUp:   () => void;
  onMoveDown: () => void;
  reordering: boolean;
}) {
  const qc = useQueryClient();
  const [lang, setLang] = useState<SupportedLang>('en');
  const [draftName, setDraftName] = useState<string>(category.name[lang] ?? '');
  const [icon, setIcon] = useState<string>(category.icon ?? '');
  const [err, setErr] = useState<string | null>(null);

  React.useEffect(() => {
    setDraftName(category.name[lang] ?? '');
  }, [lang, category.name]);

  const patch = useMutation({
    mutationFn: (input: Partial<{ name: Record<string, string>; icon: string | null; is_active: boolean }>) =>
      patchCategory(category.id, input as never),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      qc.invalidateQueries({ queryKey: ['menu', 'categories'] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Save failed'),
  });

  const remove = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      qc.invalidateQueries({ queryKey: ['menu', 'categories'] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Delete failed'),
  });

  const onBlurName = () => {
    const t = draftName.trim();
    if (t === (category.name[lang] ?? '')) return;
    if (lang === 'en' && t === '') {
      setErr('English name is required');
      setDraftName(category.name.en ?? '');
      return;
    }
    patch.mutate({ name: { ...category.name, [lang]: t } });
  };
  const onBlurIcon = () => {
    if (icon === (category.icon ?? '')) return;
    // RN-Web TextInput drops 4-byte chars to "?" — treat pure-ASCII fallback as no icon.
    const cleaned = icon.trim();
    const hasEmoji = [...cleaned].some((ch) => ch.codePointAt(0)! > 127);
    patch.mutate({ icon: hasEmoji ? cleaned : null });
  };
  const toggleActive = () => patch.mutate({ is_active: !category.is_active });

  const onRemove = () => {
    if (Platform.OS === 'web') {
      if (!globalThis.confirm(`Delete category "${category.name.en}"?`)) return;
    }
    remove.mutate();
  };

  return (
    <View style={[s.row, !category.is_active && s.rowInactive]}>
      <View style={s.reorderCol}>
        <TouchableOpacity
          onPress={onMoveUp}
          disabled={isFirst || reordering}
          style={[s.reorderBtn, (isFirst || reordering) && { opacity: 0.3 }]}
          accessibilityRole="button"
          accessibilityLabel="Move up"
        >
          <Ionicons name="chevron-up" size={16} color={T.color.t1} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onMoveDown}
          disabled={isLast || reordering}
          style={[s.reorderBtn, (isLast || reordering) && { opacity: 0.3 }]}
          accessibilityRole="button"
          accessibilityLabel="Move down"
        >
          <Ionicons name="chevron-down" size={16} color={T.color.t1} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={s.iconInput}
        value={icon}
        onChangeText={setIcon}
        onBlur={onBlurIcon}
        placeholder="🍔"
        placeholderTextColor={T.color.t2}
        maxLength={4}
      />

      <View style={{ flex: 1 }}>
        <View style={s.langRow}>
          {SUPPORTED_LANG.map((l) => (
            <TouchableOpacity
              key={l}
              onPress={() => setLang(l)}
              style={[s.langChip, lang === l && s.langChipOn]}
              accessibilityRole="button"
              accessibilityLabel={`Language ${l}`}
            >
              <Text style={[s.langChipText, lang === l && s.langChipTextOn]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={s.nameInput}
          value={draftName}
          onChangeText={setDraftName}
          onBlur={onBlurName}
          placeholder={`Category name (${lang})`}
          placeholderTextColor={T.color.t2}
        />
        {err && <Text style={s.errText}>{err}</Text>}
      </View>

      <TouchableOpacity
        onPress={toggleActive}
        style={[s.activeBtn, category.is_active && s.activeBtnOn]}
        accessibilityRole="button"
        accessibilityLabel={category.is_active ? 'Deactivate' : 'Activate'}
      >
        <Ionicons name={category.is_active ? 'eye' : 'eye-off'} size={16}
          color={category.is_active ? '#fff' : T.color.t1} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onRemove}
        disabled={remove.isPending}
        style={s.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel="Delete category"
      >
        {remove.isPending
          ? <ActivityIndicator size="small" color={T.color.t1} />
          : <Ionicons name="trash-outline" size={16} color={T.color.error} />}
      </TouchableOpacity>
    </View>
  );
}

// ── Add new category ─────────────────────────────────────────────────────────
function AddCategoryForm({ existingSortMax }: { existingSortMax: number }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const cleaned = icon.trim();
      const hasEmoji = [...cleaned].some((ch) => ch.codePointAt(0)! > 127);
      return createCategory({
        name: { en: name.trim() },
        icon: hasEmoji ? cleaned : undefined,
        sort_order: existingSortMax + 10,
        is_active: true,
      });
    },
    onSuccess: () => {
      setName(''); setIcon(''); setErr(null);
      qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      qc.invalidateQueries({ queryKey: ['menu', 'categories'] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Create failed'),
  });

  const canCreate = name.trim().length > 0 && !create.isPending;

  return (
    <View style={s.addRow}>
      <TextInput
        style={s.iconInput}
        value={icon}
        onChangeText={setIcon}
        placeholder="🍔"
        placeholderTextColor={T.color.t2}
        maxLength={4}
      />
      <TextInput
        style={[s.nameInput, { flex: 1 }]}
        value={name}
        onChangeText={setName}
        placeholder="New category name (en)"
        placeholderTextColor={T.color.t2}
      />
      <TouchableOpacity
        onPress={() => create.mutate()}
        disabled={!canCreate}
        style={[s.addBtn, !canCreate && { opacity: 0.4 }]}
        accessibilityRole="button"
        accessibilityLabel="Add category"
      >
        {create.isPending
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="add" size={18} color="#fff" />}
      </TouchableOpacity>
      {err && <Text style={s.errText}>{err}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.bg1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[4],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
  },
  title: { color: T.color.t0, fontSize: 18, fontWeight: '700' },
  offline: { color: T.color.warn, fontSize: 12, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[3] },
  errorText: { color: T.color.error, fontSize: 13 },
  retryBtn: { paddingHorizontal: T.sp[4], paddingVertical: T.sp[2], backgroundColor: T.color.bg3, borderRadius: 8 },
  retryText: { color: T.color.t0, fontSize: 12, fontWeight: '600' },
  emptyText: { color: T.color.t2, fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: T.sp[5] },
  errText: { color: T.color.error, fontSize: 11 },

  list: { padding: T.sp[5], gap: T.sp[3] },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    padding: T.sp[3],
    backgroundColor: T.color.bg2,
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  rowInactive: { opacity: 0.55 },

  reorderCol: { gap: T.sp[1] },
  reorderBtn: {
    width: 28, height: 22, borderRadius: 4,
    backgroundColor: T.color.bg3,
    alignItems: 'center', justifyContent: 'center',
  },

  iconInput: {
    width: 44, height: 44,
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, textAlign: 'center', fontSize: 20,
  },

  langRow: { flexDirection: 'row', gap: T.sp[1], marginBottom: T.sp[1] },
  langChip: {
    paddingHorizontal: T.sp[2], paddingVertical: 2,
    backgroundColor: T.color.bg3, borderRadius: 4,
  },
  langChipOn: { backgroundColor: T.color.brand },
  langChipText: { color: T.color.t2, fontSize: 10, fontWeight: '600' },
  langChipTextOn: { color: '#fff' },

  nameInput: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    fontSize: 13,
  },

  activeBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  activeBtnOn: { backgroundColor: T.color.brand, borderColor: T.color.brand },

  deleteBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    padding: T.sp[3],
    backgroundColor: T.color.bg2,
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border, borderStyle: 'dashed',
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: T.color.brand,
    alignItems: 'center', justifyContent: 'center',
  },
});
