// M01 Sprint 4 S4.4 — Display tab (Page B).
//
// PRD §3.2 #4: show_on_tv, sort_order, is_featured, is_hot, kitchen_name.
// Featured: BR-15 — 항목당 1 slot, 중복은 서버에서 거부. UI는 토글만 (rule편집은 Page F).
// sort_order: ASC + 동률 시 created_at ASC (BR-13). 같은 카테고리 내에서만 의미.

import React from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';

export interface DisplayFormState {
  show_on_tv:   boolean;
  is_featured:  boolean;
  is_hot:       boolean;
  sort_order:   number;
  kitchen_name: string | null;
}

interface Props {
  value:    DisplayFormState;
  onChange: (patch: Partial<DisplayFormState>) => void;
}

export function DisplayTab({ value, onChange }: Props) {
  const onSortOrderChange = (txt: string) => {
    const trimmed = txt.trim();
    if (trimmed.length === 0) {
      onChange({ sort_order: 0 });
      return;
    }
    const n = parseInt(trimmed.replace(/[^\d-]/g, ''), 10);
    if (Number.isNaN(n)) return;
    onChange({ sort_order: n });
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      {/* Show on TV */}
      <Toggle
        label="Show on TV"
        hint="When OFF, item is hidden on customer-facing menu board but still orderable via tablet."
        value={value.show_on_tv}
        onChange={(v) => onChange({ show_on_tv: v })}
        icon="tv-outline"
      />

      {/* Is featured */}
      <Toggle
        label="Featured"
        hint="Eligible for Zone B rotation (8s). BR-15: each item holds 1 slot; rule details on /menu/featured page."
        value={value.is_featured}
        onChange={(v) => onChange({ is_featured: v })}
        icon="star-outline"
      />

      {/* Is hot */}
      <Toggle
        label="Hot / new"
        hint="Adds a 🔥 badge on the TV card. Independent of spice level."
        value={value.is_hot}
        onChange={(v) => onChange({ is_hot: v })}
        icon="flame-outline"
      />

      {/* Sort order */}
      <Field label="Sort order (within category)">
        <View style={s.sortRow}>
          <TouchableOpacity
            style={s.sortStep}
            onPress={() => onChange({ sort_order: value.sort_order - 1 })}
            accessibilityRole="button"
            accessibilityLabel="Decrease sort order"
          >
            <Ionicons name="remove" size={18} color={T.color.t0} />
          </TouchableOpacity>
          <TextInput
            style={[s.input, { flex: 1, textAlign: 'center' }]}
            value={String(value.sort_order)}
            onChangeText={onSortOrderChange}
            keyboardType="numbers-and-punctuation"
          />
          <TouchableOpacity
            style={s.sortStep}
            onPress={() => onChange({ sort_order: value.sort_order + 1 })}
            accessibilityRole="button"
            accessibilityLabel="Increase sort order"
          >
            <Ionicons name="add" size={18} color={T.color.t0} />
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>Lower = earlier. BR-13: ties resolve by created_at ASC.</Text>
      </Field>

      {/* Kitchen name (KDS short label) */}
      <Field label="Kitchen name (KDS short label)">
        <TextInput
          style={s.input}
          placeholder="(optional — e.g. SCB)"
          placeholderTextColor={T.color.t2}
          value={value.kitchen_name ?? ''}
          onChangeText={(t) => {
            // RN autoCapitalize는 mobile 키보드 힌트 — web desktop에선 무시됨. onChange에서 강제 변환.
            const upper = t.toUpperCase();
            onChange({ kitchen_name: upper.trim().length === 0 ? null : upper });
          }}
          autoCapitalize="characters"
        />
        <Text style={s.hint}>Shown on Kitchen Display System if installed.</Text>
      </Field>
    </ScrollView>
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

function Toggle({
  label, hint, value, onChange, icon,
}: {
  label: string; hint: string; value: boolean;
  onChange: (v: boolean) => void; icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity
      style={s.toggleRow}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={s.toggleIcon}>
        <Ionicons name={icon} size={20} color={value ? T.color.brand : T.color.t2} />
      </View>
      <View style={s.toggleText}>
        <Text style={s.toggleLabel}>{label}</Text>
        <Text style={s.toggleHint}>{hint}</Text>
      </View>
      <View style={[s.switch, value && s.switchOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  body:   { padding: T.sp[5], gap: T.sp[3] },
  field:  { gap: T.sp[2], marginTop: T.sp[2] },
  fieldLabel: { color: T.color.t1, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  hint:       { color: T.color.t2, fontSize: 11, marginTop: 4 },
  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[3],
    fontSize: 14,
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingVertical: T.sp[3], paddingHorizontal: T.sp[3],
    backgroundColor: T.color.bg2,
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  toggleIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: T.color.bg3,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleText:  { flex: 1, gap: 2 },
  toggleLabel: { color: T.color.t0, fontSize: 14, fontWeight: '600' },
  toggleHint:  { color: T.color.t2, fontSize: 11 },
  switch: {
    width: 40, height: 22,
    backgroundColor: T.color.bg3,
    borderRadius: 12, padding: 2, justifyContent: 'center',
    borderWidth: 1, borderColor: T.color.border,
  },
  switchOn: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  knob:     { width: 16, height: 16, borderRadius: 8, backgroundColor: T.color.t1 },
  knobOn:   { backgroundColor: '#fff', transform: [{ translateX: 18 }] },

  sortRow:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  sortStep: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
