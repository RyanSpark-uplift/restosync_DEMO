// M01 Sprint 4 S4.5b — Modifiers/Variants tab (Page B).
//
// PRD §3.2 #5 + BR-16/17:
//   - Variants: size variants per item. effective price = base + price_delta_cents.
//   - Modifier groups: store-scoped reusable groups attached N:M to item.
//
// Persistence is **inline** (not tied to parent Save button) because variants and
// attachments use dedicated endpoints. Parent dirty/save tracks only menu_items columns.
// WS `display:menu_item_updated` from server triggers query invalidation through
// useMenuWsSubscription on the parent screen — this tab simply uses TanStack Query.

import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchVariants, createVariant, patchVariant, deleteVariant,
  fetchAttachedModifierGroups, fetchModifierGroups,
  attachModifierGroup, detachModifierGroup,
  type MenuVariant, type ModifierGroup,
} from '../../../api/menu';

interface Props {
  itemId: string;
  // True when server returned EXTERNAL_SYNC_LOCKED on the item; UI shows read-only state.
  syncSource?: string | null;
}

const VARIANTS_KEY = (id: string) => ['menu', 'item', id, 'variants'] as const;
const ATTACHED_KEY = (id: string) => ['menu', 'item', id, 'modifier-groups'] as const;
const ALL_GROUPS_KEY = ['menu', 'modifier-groups'] as const;

function centsToDollarStr(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs  = Math.abs(cents);
  return `${sign}${(abs / 100).toFixed(2)}`;
}

function parseDeltaDollar(txt: string): number | null {
  const cleaned = txt.replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const f = parseFloat(cleaned);
  if (Number.isNaN(f)) return null;
  return Math.round(f * 100);
}

export function ModifiersTab({ itemId, syncSource }: Props) {
  const locked = !!syncSource && syncSource !== 'restosync';
  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      {locked && (
        <View style={s.lockedBanner}>
          <Ionicons name="lock-closed" size={14} color={T.color.warn} />
          <Text style={s.lockedText}>
            Item is mastered by external POS ({syncSource}). Modifiers are read-only here (BR-20).
          </Text>
        </View>
      )}

      <View style={s.tabHint}>
        <Ionicons name="information-circle-outline" size={14} color={T.color.t2} />
        <Text style={s.tabHintText}>
          Variants and modifier-group changes save inline — each row commits on its own.
          The page Save button at the top applies only to Basic / Schedule / Allergens / Display tabs.
        </Text>
      </View>

      <VariantsSection itemId={itemId} locked={locked} />

      <View style={s.divider} />

      <AttachedGroupsSection itemId={itemId} locked={locked} />
    </ScrollView>
  );
}

// ── Variants section ──────────────────────────────────────────────────────────

function VariantsSection({ itemId, locked }: { itemId: string; locked: boolean }) {
  const qc = useQueryClient();
  const { data: variants, isLoading, error } = useQuery<MenuVariant[]>({
    queryKey: VARIANTS_KEY(itemId),
    queryFn:  () => fetchVariants(itemId),
  });

  const [newName, setNewName]   = useState('');
  const [newDelta, setNewDelta] = useState('');
  const [createErr, setCreateErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const delta = newDelta.trim() === '' ? 0 : parseDeltaDollar(newDelta);
      if (delta === null) throw new Error('Invalid price delta');
      return createVariant(itemId, {
        name: { en: newName.trim() },
        price_delta_cents: delta,
        sort_order: (variants?.length ?? 0) + 1,
      });
    },
    onSuccess: () => {
      setNewName(''); setNewDelta(''); setCreateErr(null);
      qc.invalidateQueries({ queryKey: VARIANTS_KEY(itemId) });
    },
    onError: (e: unknown) => setCreateErr(e instanceof Error ? e.message : 'Create failed'),
  });

  const canCreate = !locked && newName.trim().length > 0 && !create.isPending;

  return (
    <View style={s.section}>
      <SectionHeader icon="resize-outline" title="Variants" hint="Size options — effective price = base + delta (BR-16)." />

      {isLoading && <ActivityIndicator color={T.color.t1} />}
      {error && <Text style={s.errorText}>{(error as Error).message}</Text>}

      {variants && variants.length === 0 && !isLoading && (
        <Text style={s.emptyText}>No variants yet. Add one below — e.g. Small / Medium / Large.</Text>
      )}

      {variants && variants.map((v) => (
        <VariantRow key={v.id} itemId={itemId} variant={v} locked={locked} />
      ))}

      {!locked && (
        <View style={s.addRow}>
          <TextInput
            style={[s.input, { flex: 2 }]}
            placeholder="Variant name (e.g. Small)"
            placeholderTextColor={T.color.t2}
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="±$"
            placeholderTextColor={T.color.t2}
            value={newDelta}
            onChangeText={setNewDelta}
            keyboardType="numbers-and-punctuation"
          />
          <TouchableOpacity
            style={[s.addBtn, !canCreate && { opacity: 0.4 }]}
            onPress={() => create.mutate()}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Add variant"
          >
            {create.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="add" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      )}
      {createErr && <Text style={s.errorText}>{createErr}</Text>}
    </View>
  );
}

function VariantRow({ itemId, variant, locked }: { itemId: string; variant: MenuVariant; locked: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState(variant.name.en ?? '');
  const [delta, setDelta] = useState(centsToDollarStr(variant.price_delta_cents));
  const [err, setErr] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (input: { name?: string; price_delta_cents?: number; is_default?: boolean }) => {
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = { ...variant.name, en: input.name };
      if (input.price_delta_cents !== undefined) payload.price_delta_cents = input.price_delta_cents;
      if (input.is_default !== undefined) payload.is_default = input.is_default;
      return patchVariant(itemId, variant.id, payload);
    },
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: VARIANTS_KEY(itemId) });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Save failed'),
  });

  const remove = useMutation({
    mutationFn: () => deleteVariant(itemId, variant.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VARIANTS_KEY(itemId) });
      qc.invalidateQueries({ queryKey: ['menu', 'item', itemId] });  // has_variants may flip
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Delete failed'),
  });

  const onBlurName = () => {
    if (name.trim().length > 0 && name !== (variant.name.en ?? '')) patch.mutate({ name: name.trim() });
  };
  const onBlurDelta = () => {
    const parsed = parseDeltaDollar(delta);
    if (parsed !== null && parsed !== variant.price_delta_cents) patch.mutate({ price_delta_cents: parsed });
  };

  const onRemove = () => {
    if (Platform.OS === 'web') {
      if (!globalThis.confirm(`Delete variant "${variant.name.en}"?`)) return;
      remove.mutate(); return;
    }
    remove.mutate();
  };

  return (
    <View style={s.variantRow}>
      <TextInput
        style={[s.input, { flex: 2 }]}
        value={name}
        onChangeText={setName}
        onBlur={onBlurName}
        editable={!locked}
      />
      <TextInput
        style={[s.input, { flex: 1 }]}
        value={delta}
        onChangeText={setDelta}
        onBlur={onBlurDelta}
        keyboardType="numbers-and-punctuation"
        editable={!locked}
      />
      <TouchableOpacity
        style={[s.defaultBtn, variant.is_default && s.defaultBtnOn]}
        onPress={() => !variant.is_default && patch.mutate({ is_default: true })}
        disabled={locked || variant.is_default}
        accessibilityRole="button"
        accessibilityLabel={variant.is_default ? 'Default variant' : 'Make default'}
      >
        <Ionicons name={variant.is_default ? 'star' : 'star-outline'}
          size={16}
          color={variant.is_default ? '#fff' : T.color.t1} />
      </TouchableOpacity>
      {!locked && (
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={onRemove}
          disabled={remove.isPending}
          accessibilityRole="button"
          accessibilityLabel="Delete variant"
        >
          {remove.isPending
            ? <ActivityIndicator size="small" color={T.color.t1} />
            : <Ionicons name="trash-outline" size={16} color={T.color.error} />}
        </TouchableOpacity>
      )}
      {err && <Text style={s.errorText}>{err}</Text>}
    </View>
  );
}

// ── Attached modifier groups section ─────────────────────────────────────────

function AttachedGroupsSection({ itemId, locked }: { itemId: string; locked: boolean }) {
  const qc = useQueryClient();
  const { data: attached, isLoading } = useQuery<ModifierGroup[]>({
    queryKey: ATTACHED_KEY(itemId),
    queryFn:  () => fetchAttachedModifierGroups(itemId),
  });
  const { data: allGroups } = useQuery<ModifierGroup[]>({
    queryKey: ALL_GROUPS_KEY,
    queryFn:  () => fetchModifierGroups(false),
    staleTime: 30_000,
  });

  const [pickerId, setPickerId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const attached_ids = new Set((attached ?? []).map((g) => g.id));
  const candidates = (allGroups ?? []).filter((g) => !attached_ids.has(g.id));

  const attach = useMutation({
    mutationFn: (groupId: string) => attachModifierGroup(itemId, groupId, attached?.length ?? 0),
    onSuccess: () => {
      setPickerId(null); setErr(null);
      qc.invalidateQueries({ queryKey: ATTACHED_KEY(itemId) });
      qc.invalidateQueries({ queryKey: ['menu', 'item', itemId] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Attach failed'),
  });

  const detach = useMutation({
    mutationFn: (groupId: string) => detachModifierGroup(itemId, groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ATTACHED_KEY(itemId) });
      qc.invalidateQueries({ queryKey: ['menu', 'item', itemId] });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Detach failed'),
  });

  return (
    <View style={s.section}>
      <SectionHeader
        icon="layers-outline"
        title="Modifier groups"
        hint="Reusable add-on groups (Toppings, Sauce, etc.). BR-17 min/max enforced at order time."
      />

      {isLoading && <ActivityIndicator color={T.color.t1} />}

      {attached && attached.length === 0 && !isLoading && (
        <Text style={s.emptyText}>No groups attached yet. Pick one below to attach.</Text>
      )}

      {attached?.map((g) => (
        <View key={g.id} style={s.groupRow}>
          <View style={s.groupInfo}>
            <Text style={s.groupName}>{g.name.en ?? '(unnamed)'}</Text>
            <Text style={s.groupMeta}>
              {g.is_required ? 'Required • ' : 'Optional • '}
              min {g.min_select} / max {g.max_select ?? '∞'}
            </Text>
          </View>
          {!locked && (
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={() => detach.mutate(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`Detach ${g.name.en}`}
            >
              <Ionicons name="close" size={16} color={T.color.error} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {!locked && candidates.length > 0 && (
        <View style={s.pickerWrap}>
          {candidates.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[s.pickerChip, pickerId === g.id && s.pickerChipActive]}
              onPress={() => setPickerId(pickerId === g.id ? null : g.id)}
              accessibilityRole="button"
            >
              <Text style={[s.pickerChipText, pickerId === g.id && s.pickerChipTextActive]}>
                {g.name.en ?? '(unnamed)'}
              </Text>
            </TouchableOpacity>
          ))}
          {pickerId && (
            <TouchableOpacity
              style={s.attachBtn}
              onPress={() => attach.mutate(pickerId)}
              disabled={attach.isPending}
              accessibilityRole="button"
              accessibilityLabel="Attach group"
            >
              {attach.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.attachBtnText}>Attach</Text>}
            </TouchableOpacity>
          )}
        </View>
      )}

      {!locked && (allGroups?.length ?? 0) === 0 && (
        <Text style={s.emptyText}>
          No modifier groups exist in this store yet. Create groups on the modifier-groups page.
        </Text>
      )}

      {err && <Text style={s.errorText}>{err}</Text>}
    </View>
  );
}

function SectionHeader({ icon, title, hint }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; hint: string;
}) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={18} color={T.color.brand} />
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionHint}>{hint}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: T.sp[5], gap: T.sp[4] },

  lockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: '#3a2c1a',
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: 8,
  },
  lockedText: { color: T.color.warn, fontSize: 12, flex: 1 },

  tabHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
  },
  tabHintText: { color: T.color.t2, fontSize: 11, flex: 1, lineHeight: 16 },
  tabHintBold: { color: T.color.t1, fontWeight: '700' },

  section: { gap: T.sp[2] },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.sp[2], marginBottom: T.sp[2],
  },
  sectionTitle: { color: T.color.t0, fontSize: 14, fontWeight: '700' },
  sectionHint:  { color: T.color.t2, fontSize: 11 },

  divider: { height: 1, backgroundColor: T.color.border, marginVertical: T.sp[2] },

  emptyText: { color: T.color.t2, fontSize: 12, fontStyle: 'italic' },
  errorText: { color: T.color.error, fontSize: 11 },

  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    fontSize: 13,
  },

  variantRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingVertical: T.sp[1],
  },
  defaultBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  defaultBtnOn: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingTop: T.sp[2],
    borderTopWidth: 1, borderTopColor: T.color.border,
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    padding: T.sp[3],
    backgroundColor: T.color.bg2,
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  groupInfo: { flex: 1, gap: 2 },
  groupName: { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  groupMeta: { color: T.color.t2, fontSize: 11 },

  pickerWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2],
    paddingTop: T.sp[2],
    borderTopWidth: 1, borderTopColor: T.color.border,
  },
  pickerChip: {
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    backgroundColor: T.color.bg3,
    borderRadius: 16, borderWidth: 1, borderColor: T.color.border,
  },
  pickerChipActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  pickerChipText:   { color: T.color.t1, fontSize: 12, fontWeight: '600' },
  pickerChipTextActive: { color: '#fff' },
  attachBtn: {
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    backgroundColor: T.color.brand,
    borderRadius: 16,
  },
  attachBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
