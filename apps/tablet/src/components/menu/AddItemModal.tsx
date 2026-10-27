// M01 Sprint 3 — Add Item modal (RN Modal — web/native 양쪽 안전).
//
// 최소 필드: name (en), price ($→cents), category, dayparts multi-select 6값.
// 이미지 업로드는 별도 UX — item 생성 후 카드에서 PATCH (Sprint 4 또는 Edit page B).
// inline error (AM01 web Alert no-op 회피).

import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { T } from '@restosync/ui';
import { DAYPART, type Daypart } from '@restosync/shared';
import {
  createMenuItem, fetchCategories, type MenuItemCreateInput, type MenuCategory,
} from '../../api/menu';
import { renderI18n } from '../../lib/i18nFallback';

interface Props {
  visible:  boolean;
  onClose:  () => void;
  onCreated?: (id: string) => void;
}

export function AddItemModal({ visible, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName]               = useState('');
  const [priceStr, setPriceStr]       = useState('');
  const [categoryId, setCategoryId]   = useState<string | null>(null);
  const [dayparts, setDayparts]       = useState<Set<Daypart>>(new Set(['all']));
  const [error, setError]             = useState<string | null>(null);

  const { data: cats } = useQuery<MenuCategory[]>({
    queryKey: ['menu', 'categories'],
    queryFn:  () => fetchCategories({ is_active: true }),
    enabled:  visible,
  });

  const priceCents = useMemo(() => {
    const n = parseFloat(priceStr);
    if (Number.isNaN(n) || n < 0) return null;
    return Math.round(n * 100);
  }, [priceStr]);

  const canSubmit = name.trim().length > 0 && priceCents !== null && dayparts.size > 0;

  const resetForm = () => {
    setName(''); setPriceStr(''); setCategoryId(null);
    setDayparts(new Set(['all'])); setError(null);
  };

  const create = useMutation({
    mutationFn: () => {
      const input: MenuItemCreateInput = {
        name_i18n:    { en: name.trim() },
        price_cents:  priceCents!,
        dayparts_arr: Array.from(dayparts),
        ...(categoryId ? { category_id: categoryId } : {}),
      };
      return createMenuItem(input);
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ['menu', 'items'] });
      onCreated?.(item.id);
      resetForm();
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Failed to create item'),
  });

  const submit = () => {
    setError(null);
    if (!canSubmit) {
      setError('Name + price + at least one daypart required.');
      return;
    }
    create.mutate();
  };

  const toggleDaypart = (d: Daypart) => {
    setDayparts((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Add Menu Item</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={T.color.t1} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={s.body}>
            {/* Name */}
            <Field label="Name (English)">
              <TextInput
                style={s.input}
                placeholder="e.g. Spicy Chicken Burger"
                placeholderTextColor={T.color.t2}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </Field>

            {/* Price */}
            <Field label="Price (USD)">
              <View style={s.priceRow}>
                <Text style={s.priceSym}>$</Text>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="0.00"
                  placeholderTextColor={T.color.t2}
                  value={priceStr}
                  onChangeText={setPriceStr}
                  keyboardType="decimal-pad"
                />
              </View>
              {priceCents !== null && (
                <Text style={s.hint}>Saved as {priceCents}¢ (cents integer — BR-01)</Text>
              )}
            </Field>

            {/* Category */}
            <Field label="Category">
              <View style={s.chipWrap}>
                <Chip label="(none)" active={categoryId === null} onPress={() => setCategoryId(null)} />
                {(cats ?? []).map((c) => (
                  <Chip
                    key={c.id}
                    label={renderI18n(c.name)}
                    active={categoryId === c.id}
                    onPress={() => setCategoryId(c.id)}
                  />
                ))}
              </View>
            </Field>

            {/* Dayparts multi-select */}
            <Field label="Dayparts (multi-select)">
              <View style={s.chipWrap}>
                {DAYPART.map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    active={dayparts.has(d as Daypart)}
                    onPress={() => toggleDaypart(d as Daypart)}
                  />
                ))}
              </View>
              <Text style={s.hint}>'all' = always available regardless of time of day</Text>
            </Field>

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color={T.color.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onClose} disabled={create.isPending}>
              <Text style={s.btnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, (!canSubmit || create.isPending) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[s.btnText, { color: '#fff' }]}>Add Item</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[chipStyle.chip, active && chipStyle.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[chipStyle.text, active && chipStyle.textActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const chipStyle = StyleSheet.create({
  chip: {
    paddingHorizontal: T.sp[3], paddingVertical: 6,
    backgroundColor: T.color.bg3,
    borderRadius: 12, borderWidth: 1, borderColor: T.color.border,
  },
  chipActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  text:       { color: T.color.t1, fontSize: 12, textTransform: 'capitalize' },
  textActive: { color: '#fff', fontWeight: '700' },
});

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet:    { backgroundColor: T.color.bg1, borderRadius: 16, width: '90%', maxWidth: 560, padding: T.sp[5], gap: T.sp[3] },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:    { color: T.color.t0, fontSize: 18, fontWeight: '700' },
  body:     { gap: T.sp[4] },
  field:    { gap: T.sp[2] },
  fieldLabel: { color: T.color.t1, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[3],
    fontSize: 14,
  },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8, paddingHorizontal: T.sp[3],
  },
  priceSym: { color: T.color.brand, fontSize: 16, fontWeight: '700' },
  hint:     { color: T.color.t2, fontSize: 11, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: '#3a1a1a', borderRadius: 8, padding: T.sp[3],
  },
  errorText: { color: T.color.error, fontSize: 12, flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: T.sp[2], marginTop: T.sp[2] },
  btn: {
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[3],
    borderRadius: 8, minWidth: 100, alignItems: 'center', justifyContent: 'center',
  },
  btnGhost:   { backgroundColor: T.color.bg3 },
  btnPrimary: { backgroundColor: T.color.brand },
  btnText:    { color: T.color.t0, fontSize: 13, fontWeight: '600' },
});
