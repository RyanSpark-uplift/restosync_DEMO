// M01 Sprint G.B — Page G `/menu/combos` (PRD §4.2 / §5.1 / BR-18/23).
//
// 단일 페이지: 상단 콤보 리스트 + 하단 inline editor. BR-23 실시간 합계 + 422 inline warning.
// items picker는 search-able dropdown (existing menu_items에서 선택).
// AG-014 4-state UI / AM01-020 parent _layout이 Stack wrap / AM01-019 list tie-break은 서버 보장.

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput, Platform, Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchCombos, createCombo, patchCombo, deleteCombo,
  fetchMenuItems,
  type Combo, type ComboCreateInput, type ComboPatchInput, type MenuItem,
} from '../../../../src/api/menu';
import { useMenuWsSubscription } from '../../../../src/hooks/useMenuWsSubscription';
import { useIsOnline } from '../../../../src/hooks/useIsOnline';
import { renderI18n } from '../../../../src/lib/i18nFallback';
import type { Daypart } from '@restosync/shared';

const COMBOS_KEY = ['menu', 'combos'] as const;
const ITEMS_KEY  = ['menu', 'items', 'all-for-combos'] as const;

const DAYPARTS: Daypart[] = ['breakfast', 'lunch', 'snack', 'dinner', 'late', 'all'];
const GROUP_NAMES = ['Main', 'Side', 'Drink', 'Dessert', 'Extra'] as const;

// ── Draft type (local-only, before save) ──────────────────────────────────────
interface DraftLine {
  item_id:          string;
  quantity:         number;
  is_substitutable: boolean;
  group_name:       string | null;
  sort_order:       number;
}
interface Draft {
  id?:           string;                 // undefined = new combo
  name_en:       string;
  desc_en:       string;
  price_dollars: string;                 // input as string for keypad freedom
  dayparts_arr:  Daypart[];
  is_featured:   boolean;
  is_sold_out:   boolean;
  show_on_tv:    boolean;
  sort_order:    number;
  items:         DraftLine[];
}

function newDraft(): Draft {
  return {
    name_en: '', desc_en: '', price_dollars: '',
    dayparts_arr: ['all'], is_featured: false, is_sold_out: false,
    show_on_tv: true, sort_order: 0, items: [],
  };
}

function comboToDraft(c: Combo): Draft {
  return {
    id:           c.id,
    name_en:      c.name?.en ?? '',
    desc_en:      c.description?.en ?? '',
    price_dollars: (c.price_cents / 100).toFixed(2),
    dayparts_arr: c.dayparts_arr.length > 0 ? c.dayparts_arr : ['all'],
    is_featured:  c.is_featured,
    is_sold_out:  c.is_sold_out,
    show_on_tv:   c.show_on_tv,
    sort_order:   c.sort_order,
    items: c.items.map((i) => ({
      item_id: i.item_id, quantity: i.quantity,
      is_substitutable: i.is_substitutable, group_name: i.group_name,
      sort_order: i.sort_order,
    })),
  };
}

function parsePrice(dollars: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(dollars.trim())) return null;
  return Math.round(Number(dollars) * 100);
}

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
    return;
  }
  Alert.alert(title, msg);
}

function confirmAsync(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${msg}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK',     style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function CombosScreen() {
  const router = useRouter();
  const qc     = useQueryClient();
  const online = useIsOnline();

  useMenuWsSubscription();

  const combosQ = useQuery({
    queryKey: COMBOS_KEY,
    queryFn:  () => fetchCombos({ status: 'all' }),
  });
  const itemsQ = useQuery<MenuItem[]>({
    queryKey: ITEMS_KEY,
    queryFn:  () => fetchMenuItems({ status: 'any', limit: 500 }),
  });

  const itemsById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    for (const it of (itemsQ.data ?? [])) m.set(it.id, it);
    return m;
  }, [itemsQ.data]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [serverErr, setServerErr] = useState<string | null>(null);

  // ── BR-23 real-time calculation ──────────────────────────────────────────────
  const calc = useMemo(() => {
    if (!draft) return null;
    const priceCents = parsePrice(draft.price_dollars);
    let total = 0;
    let hasMissingItem = false;
    for (const line of draft.items) {
      const it = itemsById.get(line.item_id);
      if (!it || it.price_cents == null) { hasMissingItem = true; continue; }
      total += it.price_cents * line.quantity;
    }
    const violatesBR23 = priceCents != null && priceCents > total && draft.items.length > 0;
    const savings = (priceCents != null && total > 0) ? Math.max(0, total - priceCents) : 0;
    const discountPct = (total > 0 && priceCents != null) ? Math.round((savings / total) * 1000) / 10 : 0;
    return {
      priceCents, total, savings, discountPct,
      violatesBR23, hasMissingItem,
    };
  }, [draft, itemsById]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (input: ComboCreateInput) => createCombo(input),
    onSuccess: () => {
      setServerErr(null); setDraft(null);
      qc.invalidateQueries({ queryKey: COMBOS_KEY });
    },
    onError: (e: unknown) => setServerErr(e instanceof Error ? e.message : 'Create failed'),
  });
  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ComboPatchInput }) => patchCombo(id, patch),
    onSuccess: () => {
      setServerErr(null); setDraft(null);
      qc.invalidateQueries({ queryKey: COMBOS_KEY });
    },
    onError: (e: unknown) => setServerErr(e instanceof Error ? e.message : 'Save failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCombo(id),
    onSuccess: () => {
      setServerErr(null); setDraft(null);
      qc.invalidateQueries({ queryKey: COMBOS_KEY });
    },
    onError: (e: unknown) => setServerErr(e instanceof Error ? e.message : 'Delete failed'),
  });
  const saving = createMut.isPending || patchMut.isPending || deleteMut.isPending;

  const onNew     = () => { setDraft(newDraft()); setServerErr(null); };
  const onSelect  = (c: Combo) => { setDraft(comboToDraft(c)); setServerErr(null); };
  const onDiscard = () => { setDraft(null); setServerErr(null); };

  const onSave = () => {
    if (!draft) return;
    setServerErr(null);
    const priceCents = parsePrice(draft.price_dollars);
    if (!draft.name_en.trim())       return setServerErr('Name (en) is required');
    if (priceCents == null || priceCents <= 0) return setServerErr('Price must be a positive number with up to 2 decimal places');
    if (draft.items.length === 0)    return setServerErr('At least one item is required');
    if (calc?.hasMissingItem)        return setServerErr('Some selected items are missing or have no price — remove them');
    if (calc?.violatesBR23)          return setServerErr(
      `BR-23: combo price ($${(priceCents / 100).toFixed(2)}) cannot exceed items total ($${(calc.total / 100).toFixed(2)})`,
    );

    const namePayload  = { en: draft.name_en.trim() };
    const descPayload  = draft.desc_en.trim() ? { en: draft.desc_en.trim() } : null;
    const itemsPayload = draft.items.map((l) => ({
      item_id: l.item_id, quantity: l.quantity,
      is_substitutable: l.is_substitutable,
      group_name: l.group_name && l.group_name.trim() ? l.group_name.trim() : null,
      sort_order: l.sort_order,
    }));

    if (draft.id) {
      const patch: ComboPatchInput = {
        name:         namePayload,
        description:  descPayload,
        price_cents:  priceCents,
        dayparts_arr: draft.dayparts_arr,
        is_featured:  draft.is_featured,
        is_sold_out:  draft.is_sold_out,
        show_on_tv:   draft.show_on_tv,
        sort_order:   draft.sort_order,
        items:        itemsPayload,
      };
      patchMut.mutate({ id: draft.id, patch });
    } else {
      const input: ComboCreateInput = {
        name:         namePayload,
        description:  descPayload,
        price_cents:  priceCents,
        dayparts_arr: draft.dayparts_arr,
        is_featured:  draft.is_featured,
        show_on_tv:   draft.show_on_tv,
        sort_order:   draft.sort_order,
        items:        itemsPayload,
      };
      createMut.mutate(input);
    }
  };

  const onDelete = async () => {
    if (!draft?.id) return;
    const ok = await confirmAsync('Delete combo', `Soft-delete "${draft.name_en || 'this combo'}"? It will no longer appear on TV.`);
    if (ok) deleteMut.mutate(draft.id);
  };

  // ── Item picker ──────────────────────────────────────────────────────────────
  const filteredPickerItems = useMemo(() => {
    const list = itemsQ.data ?? [];
    const q = pickerQuery.trim().toLowerCase();
    const used = new Set(draft?.items.map((l) => l.item_id) ?? []);
    return list
      .filter((it) => !used.has(it.id))
      .filter((it) => {
        if (it.price_cents == null) return false;
        if (!q) return true;
        const name = (renderI18n(it.name_i18n) || it.name || '').toLowerCase();
        return name.includes(q);
      })
      .slice(0, 30);
  }, [itemsQ.data, pickerQuery, draft]);

  const addLine = (item: MenuItem) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: [...draft.items, {
        item_id: item.id, quantity: 1, is_substitutable: false, group_name: null,
        sort_order: draft.items.length,
      }],
    });
    setItemPickerOpen(false); setPickerQuery('');
  };
  const removeLine = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) });
  };
  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.map((l, i) => i === idx ? { ...l, ...patch } : l) });
  };
  const toggleDaypart = (d: Daypart) => {
    if (!draft) return;
    const has = draft.dayparts_arr.includes(d);
    let next = has
      ? draft.dayparts_arr.filter((x) => x !== d)
      : [...draft.dayparts_arr, d];
    if (next.length === 0) next = ['all'];
    setDraft({ ...draft, dayparts_arr: next });
  };

  const list = combosQ.data?.combos ?? [];

  return (
    <View style={st.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={T.color.t0} />
        </TouchableOpacity>
        <Text style={st.title}>Combos</Text>
        <View style={{ flex: 1 }} />
        {!online && <Text style={st.offline}>Offline</Text>}
        <TouchableOpacity
          style={[st.btn, st.btnPrimary]}
          onPress={onNew}
          accessibilityRole="button"
          accessibilityLabel="New combo"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={st.btnPrimaryText}>New combo</Text>
        </TouchableOpacity>
      </View>

      {combosQ.isLoading && <View style={st.center}><ActivityIndicator color={T.color.t1} /></View>}

      {combosQ.error && !combosQ.isLoading && (
        <View style={st.center}>
          <Text style={st.errorText}>{(combosQ.error as Error).message}</Text>
          <TouchableOpacity onPress={() => combosQ.refetch()} style={st.retryBtn}>
            <Text style={st.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!combosQ.isLoading && !combosQ.error && (
        <ScrollView contentContainerStyle={st.body}>
          {/* List section */}
          <Text style={st.sectionTitle}>Combos ({list.length})</Text>
          {list.length === 0 ? (
            <View style={st.empty}>
              <Ionicons name="layers-outline" size={32} color={T.color.t2} />
              <Text style={st.emptyText}>No combos yet — click "New combo" to create a bundle.</Text>
            </View>
          ) : (
            <View style={st.cardRow}>
              {list.map((c) => {
                const selected = draft?.id === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[st.card, selected && st.cardSelected]}
                    onPress={() => onSelect(c)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit combo ${renderI18n(c.name) || '(unnamed)'}`}
                  >
                    <Text style={st.cardName} numberOfLines={1}>{renderI18n(c.name) || '(unnamed)'}</Text>
                    <Text style={st.cardMeta}>
                      ${(c.price_cents / 100).toFixed(2)}
                      {c.savings_cents > 0 ? <Text style={st.savings}> · save ${(c.savings_cents / 100).toFixed(2)}</Text> : null}
                    </Text>
                    <Text style={st.cardMeta}>
                      {c.items.length} item{c.items.length !== 1 ? 's' : ''} · {c.dayparts_arr.join(', ')}
                    </Text>
                    <View style={st.badgeRow}>
                      {c.is_sold_out && <Text style={[st.badge, st.badgeWarn]}>86</Text>}
                      {c.is_featured && <Text style={[st.badge, st.badgeOk]}>Featured</Text>}
                      {!c.show_on_tv && <Text style={[st.badge, st.badgeMute]}>Hidden</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Editor section */}
          {draft && (
            <View style={st.editor}>
              <View style={st.editorHeader}>
                <Text style={st.sectionTitle}>{draft.id ? 'Edit combo' : 'New combo'}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={[st.btn, st.btnGhost]} onPress={onDiscard} disabled={saving}>
                  <Text style={st.btnGhostText}>Discard</Text>
                </TouchableOpacity>
                {draft.id && (
                  <TouchableOpacity style={[st.btn, st.btnDanger]} onPress={onDelete} disabled={saving}>
                    <Ionicons name="trash-outline" size={14} color="#fff" />
                    <Text style={st.btnPrimaryText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[st.btn, st.btnPrimary]} onPress={onSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
                  <Text style={st.btnPrimaryText}>Save</Text>
                </TouchableOpacity>
              </View>

              {serverErr && <Text style={st.errorBanner}>{serverErr}</Text>}

              {/* Name + description */}
              <View style={st.field}>
                <Text style={st.label}>Name (en) *</Text>
                <TextInput
                  style={st.input}
                  value={draft.name_en}
                  onChangeText={(t) => setDraft({ ...draft, name_en: t })}
                  placeholder="e.g. Lunch Special"
                  placeholderTextColor={T.color.t2}
                  maxLength={200}
                />
              </View>
              <View style={st.field}>
                <Text style={st.label}>Description (en)</Text>
                <TextInput
                  style={[st.input, { minHeight: 60 }]}
                  value={draft.desc_en}
                  onChangeText={(t) => setDraft({ ...draft, desc_en: t })}
                  placeholder="Optional"
                  placeholderTextColor={T.color.t2}
                  multiline
                  maxLength={2000}
                />
              </View>

              {/* Price + sort */}
              <View style={st.row}>
                <View style={[st.field, { flex: 1 }]}>
                  <Text style={st.label}>Combo price (USD) *</Text>
                  <TextInput
                    style={st.input}
                    value={draft.price_dollars}
                    onChangeText={(t) => setDraft({ ...draft, price_dollars: t })}
                    placeholder="12.99"
                    placeholderTextColor={T.color.t2}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[st.field, { width: 120 }]}>
                  <Text style={st.label}>Sort order</Text>
                  <TextInput
                    style={st.input}
                    value={String(draft.sort_order)}
                    onChangeText={(t) => setDraft({ ...draft, sort_order: Number.parseInt(t || '0', 10) || 0 })}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* BR-23 summary */}
              {calc && draft.items.length > 0 && (
                <View style={[st.summary, calc.violatesBR23 && st.summaryError]}>
                  <Text style={st.summaryLine}>
                    Items total: ${(calc.total / 100).toFixed(2)}
                    {calc.priceCents != null
                      ? <>  ·  Combo price: <Text style={st.bold}>${(calc.priceCents / 100).toFixed(2)}</Text></>
                      : null}
                  </Text>
                  {calc.violatesBR23
                    ? <Text style={st.errorText}>⚠ BR-23: combo price exceeds items total</Text>
                    : calc.priceCents != null && calc.priceCents > 0
                      ? <Text style={st.ok}>Customer saves ${(calc.savings / 100).toFixed(2)} ({calc.discountPct}%)</Text>
                      : null}
                </View>
              )}

              {/* Items list */}
              <View style={st.field}>
                <View style={st.itemsHeader}>
                  <Text style={st.label}>Items ({draft.items.length})</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    style={[st.btn, st.btnSecondary]}
                    onPress={() => setItemPickerOpen((v) => !v)}
                  >
                    <Ionicons name={itemPickerOpen ? 'close' : 'add'} size={14} color={T.color.t0} />
                    <Text style={st.btnText}>{itemPickerOpen ? 'Close picker' : 'Add item'}</Text>
                  </TouchableOpacity>
                </View>

                {itemPickerOpen && (
                  <View style={st.picker}>
                    <TextInput
                      style={st.input}
                      value={pickerQuery}
                      onChangeText={setPickerQuery}
                      placeholder="Search menu items by name…"
                      placeholderTextColor={T.color.t2}
                      autoFocus
                    />
                    {itemsQ.isLoading
                      ? <ActivityIndicator color={T.color.t1} style={{ marginTop: T.sp[3] }} />
                      : filteredPickerItems.length === 0
                        ? <Text style={st.muted}>No matching items (items without `price_cents` are excluded).</Text>
                        : (
                          <ScrollView style={st.pickerList} nestedScrollEnabled>
                            {filteredPickerItems.map((it) => {
                              const name = renderI18n(it.name_i18n) || it.name || '(unnamed)';
                              return (
                                <TouchableOpacity
                                  key={it.id}
                                  style={st.pickerRow}
                                  onPress={() => addLine(it)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Add ${name}`}
                                >
                                  <Text style={st.pickerName} numberOfLines={1}>{name}</Text>
                                  <Text style={st.pickerPrice}>
                                    {it.price_cents != null ? `$${(it.price_cents / 100).toFixed(2)}` : '—'}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        )}
                  </View>
                )}

                {draft.items.length === 0 ? (
                  <Text style={st.muted}>No items yet. Click "Add item" to select from your menu.</Text>
                ) : (
                  draft.items.map((line, idx) => {
                    const item = itemsById.get(line.item_id);
                    const name = item ? (renderI18n(item.name_i18n) || item.name || '(unnamed)') : '(missing item)';
                    const price = item?.price_cents ?? null;
                    const lineTotal = price != null ? price * line.quantity : null;
                    return (
                      <View key={`${line.item_id}-${idx}`} style={st.lineRow}>
                        <View style={st.lineMain}>
                          <Text style={st.lineName} numberOfLines={1}>{name}</Text>
                          <Text style={st.lineMeta}>
                            {price != null ? `$${(price / 100).toFixed(2)} × ${line.quantity}` : '— (no price)'}
                            {lineTotal != null && line.quantity > 1 ? `  =  $${(lineTotal / 100).toFixed(2)}` : null}
                          </Text>
                          <View style={st.lineControls}>
                            <Text style={st.lineSubLabel}>Qty</Text>
                            <TouchableOpacity
                              style={st.qtyBtn}
                              onPress={() => updateLine(idx, { quantity: Math.max(1, line.quantity - 1) })}
                              accessibilityLabel="Decrease quantity"
                            >
                              <Ionicons name="remove" size={14} color={T.color.t0} />
                            </TouchableOpacity>
                            <Text style={st.qtyText}>{line.quantity}</Text>
                            <TouchableOpacity
                              style={st.qtyBtn}
                              onPress={() => updateLine(idx, { quantity: Math.min(99, line.quantity + 1) })}
                              accessibilityLabel="Increase quantity"
                            >
                              <Ionicons name="add" size={14} color={T.color.t0} />
                            </TouchableOpacity>
                            <View style={st.gap} />
                            <Text style={st.lineSubLabel}>Group</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              <View style={st.chipRow}>
                                <TouchableOpacity
                                  style={[st.chip, line.group_name == null && st.chipActive]}
                                  onPress={() => updateLine(idx, { group_name: null })}
                                >
                                  <Text style={[st.chipText, line.group_name == null && st.chipActiveText]}>None</Text>
                                </TouchableOpacity>
                                {GROUP_NAMES.map((g) => (
                                  <TouchableOpacity
                                    key={g}
                                    style={[st.chip, line.group_name === g && st.chipActive]}
                                    onPress={() => updateLine(idx, { group_name: g })}
                                  >
                                    <Text style={[st.chipText, line.group_name === g && st.chipActiveText]}>{g}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                          <TouchableOpacity
                            style={st.subRow}
                            onPress={() => updateLine(idx, { is_substitutable: !line.is_substitutable })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: line.is_substitutable }}
                          >
                            <Ionicons
                              name={line.is_substitutable ? 'checkbox' : 'square-outline'}
                              size={16}
                              color={line.is_substitutable ? T.color.brand : T.color.t2}
                            />
                            <Text style={st.lineSubLabel}>
                              Substitutable (BR-18 — customer can swap within group)
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={st.removeBtn}
                          onPress={() => removeLine(idx)}
                          accessibilityRole="button"
                          accessibilityLabel="Remove item"
                        >
                          <Ionicons name="close" size={16} color={T.color.t1} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Dayparts */}
              <View style={st.field}>
                <Text style={st.label}>Dayparts (AG-013)</Text>
                <View style={st.chipRow}>
                  {DAYPARTS.map((d) => {
                    const active = draft.dayparts_arr.includes(d);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[st.chip, active && st.chipActive]}
                        onPress={() => toggleDaypart(d)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                      >
                        <Text style={[st.chipText, active && st.chipActiveText]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Toggles */}
              <View style={st.toggleRow}>
                <TouchableOpacity
                  style={st.toggle}
                  onPress={() => setDraft({ ...draft, show_on_tv: !draft.show_on_tv })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: draft.show_on_tv }}
                >
                  <Ionicons
                    name={draft.show_on_tv ? 'tv' : 'tv-outline'}
                    size={16}
                    color={draft.show_on_tv ? T.color.brand : T.color.t2}
                  />
                  <Text style={st.toggleText}>Show on TV</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.toggle}
                  onPress={() => setDraft({ ...draft, is_featured: !draft.is_featured })}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: draft.is_featured }}
                >
                  <Ionicons
                    name={draft.is_featured ? 'star' : 'star-outline'}
                    size={16}
                    color={draft.is_featured ? T.color.brand : T.color.t2}
                  />
                  <Text style={st.toggleText}>Featured</Text>
                </TouchableOpacity>
                {draft.id && (
                  <TouchableOpacity
                    style={st.toggle}
                    onPress={() => setDraft({ ...draft, is_sold_out: !draft.is_sold_out })}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: draft.is_sold_out }}
                  >
                    <Ionicons
                      name={draft.is_sold_out ? 'ban' : 'ban-outline'}
                      size={16}
                      color={draft.is_sold_out ? '#d32' : T.color.t2}
                    />
                    <Text style={st.toggleText}>Sold out (86)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.bg1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[3],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
  },
  title:   { color: T.color.t0, fontSize: 20, fontWeight: '700' },
  offline: { color: '#d32', fontSize: 12, fontWeight: '600' },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[3] },
  body:    { padding: T.sp[4], paddingBottom: T.sp[8], gap: T.sp[4] },

  sectionTitle: { color: T.color.t0, fontSize: 16, fontWeight: '700' },

  cardRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[3] },
  card: {
    width: 240, padding: T.sp[3], gap: T.sp[1],
    borderRadius: 10, borderWidth: 1, borderColor: T.color.border,
    backgroundColor: T.color.bg2,
  },
  cardSelected: { borderColor: T.color.brand, borderWidth: 2 },
  cardName: { color: T.color.t0, fontSize: 14, fontWeight: '700' },
  cardMeta: { color: T.color.t1, fontSize: 12 },
  savings:  { color: '#0a0', fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: T.sp[1], marginTop: T.sp[2] },
  badge:    { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeWarn: { backgroundColor: '#fdd', color: '#d32' },
  badgeOk:   { backgroundColor: '#fed', color: '#a60' },
  badgeMute: { backgroundColor: T.color.bg3, color: T.color.t2 },

  empty: { alignItems: 'center', padding: T.sp[6], gap: T.sp[2] },
  emptyText: { color: T.color.t2, fontSize: 13, textAlign: 'center' },

  editor: {
    marginTop: T.sp[5], padding: T.sp[4], gap: T.sp[3],
    borderRadius: 12, borderWidth: 1, borderColor: T.color.border,
    backgroundColor: T.color.bg2,
  },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  errorBanner: {
    color: '#a02', backgroundColor: '#fdd', padding: T.sp[3], borderRadius: 6, fontSize: 13,
  },
  errorText: { color: '#d32', fontSize: 13 },
  retryBtn:  { paddingHorizontal: T.sp[4], paddingVertical: T.sp[2], backgroundColor: T.color.bg3, borderRadius: 6 },
  retryText: { color: T.color.t0, fontSize: 13 },

  field: { gap: T.sp[2] },
  row:   { flexDirection: 'row', gap: T.sp[3] },
  label: { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  input: {
    color: T.color.t0, fontSize: 14,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderWidth: 1, borderColor: T.color.border, borderRadius: 6,
    backgroundColor: T.color.bg1,
  },
  muted: { color: T.color.t2, fontSize: 12 },
  bold:  { fontWeight: '700' },
  ok:    { color: '#0a0' },

  summary: {
    padding: T.sp[3], borderRadius: 6, gap: T.sp[1],
    backgroundColor: T.color.bg3,
  },
  summaryError: { backgroundColor: '#fdd' },
  summaryLine:  { color: T.color.t0, fontSize: 13 },

  itemsHeader: { flexDirection: 'row', alignItems: 'center' },
  picker: {
    padding: T.sp[3], borderRadius: 6, gap: T.sp[2],
    borderWidth: 1, borderColor: T.color.border, backgroundColor: T.color.bg1,
  },
  pickerList: { maxHeight: 240, marginTop: T.sp[2] },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: T.sp[2], paddingHorizontal: T.sp[3],
    borderTopWidth: 1, borderTopColor: T.color.border,
  },
  pickerName:  { color: T.color.t0, fontSize: 13, flex: 1 },
  pickerPrice: { color: T.color.t1, fontSize: 12, fontWeight: '600' },

  lineRow: {
    flexDirection: 'row', gap: T.sp[2], padding: T.sp[3], borderRadius: 6,
    borderWidth: 1, borderColor: T.color.border, backgroundColor: T.color.bg1,
  },
  lineMain:     { flex: 1, gap: T.sp[1] },
  lineName:     { color: T.color.t0, fontSize: 14, fontWeight: '600' },
  lineMeta:     { color: T.color.t1, fontSize: 12 },
  lineControls: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], flexWrap: 'wrap' },
  lineSubLabel: { color: T.color.t2, fontSize: 12 },
  qtyBtn: {
    width: 24, height: 24, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
  },
  qtyText: { color: T.color.t0, fontSize: 13, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  gap:     { width: T.sp[3] },
  removeBtn: { padding: T.sp[1] },
  subRow:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[1] },
  chip: {
    paddingHorizontal: T.sp[3], paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, borderColor: T.color.border,
    backgroundColor: T.color.bg3,
  },
  chipActive:     { backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText:       { color: T.color.t1, fontSize: 11, fontWeight: '600' },
  chipActiveText: { color: '#fff' },

  toggleRow: { flexDirection: 'row', gap: T.sp[4], flexWrap: 'wrap', marginTop: T.sp[2] },
  toggle:     { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  toggleText: { color: T.color.t0, fontSize: 13 },

  btn: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[1],
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8, minHeight: 32,
  },
  btnPrimary:     { backgroundColor: T.color.brand },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnSecondary:   { backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border },
  btnText:        { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  btnGhost:       { backgroundColor: 'transparent' },
  btnGhostText:   { color: T.color.t1, fontSize: 13, fontWeight: '600' },
  btnDanger:      { backgroundColor: '#d32' },
});
