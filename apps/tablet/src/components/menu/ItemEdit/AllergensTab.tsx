// M01 Sprint 4 S4.3 — Allergens tab (Page B).
//
// FDA 9 allergen multi-select + spice_level 5-segment + calories integer.
// AG-013 정본 enum 사용 (ALLERGEN, SPICE_LEVEL). 변형 입력 차단.
// calories: null = unset (서버는 unset 의미로 그대로 저장; 0과 구분).

import React from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import {
  ALLERGEN, SPICE_LEVEL, type Allergen, type SpiceLevel,
} from '@restosync/shared';

export interface AllergensFormState {
  allergens:   Allergen[];
  calories:    number | null;
  spice_level: SpiceLevel | null;
}

interface Props {
  value:    AllergensFormState;
  onChange: (patch: Partial<AllergensFormState>) => void;
}

const ALLERGEN_LABEL: Record<Allergen, string> = {
  milk:      'Milk',
  egg:       'Egg',
  fish:      'Fish',
  shellfish: 'Shellfish',
  tree_nut:  'Tree nut',
  peanut:    'Peanut',
  wheat:     'Wheat',
  soy:       'Soy',
  sesame:    'Sesame',
};

const ALLERGEN_ICON: Record<Allergen, keyof typeof Ionicons.glyphMap> = {
  milk:      'water-outline',
  egg:       'egg-outline',
  fish:      'fish-outline',
  shellfish: 'bug-outline',
  tree_nut:  'leaf-outline',
  peanut:    'nutrition-outline',
  wheat:     'restaurant-outline',
  soy:       'leaf-outline',
  sesame:    'ellipse-outline',
};

// Visual heat indicator — 0~4 stripes.
const SPICE_HEAT: Record<SpiceLevel, number> = {
  none: 0, mild: 1, medium: 2, hot: 3, extreme: 4,
};

export function AllergensTab({ value, onChange }: Props) {
  const toggleAllergen = (a: Allergen) => {
    const set = new Set(value.allergens);
    if (set.has(a)) set.delete(a);
    else set.add(a);
    onChange({ allergens: Array.from(set) });
  };

  const setSpice = (lvl: SpiceLevel | null) => {
    onChange({ spice_level: lvl });
  };

  const onCaloriesChange = (txt: string) => {
    if (txt.trim().length === 0) {
      onChange({ calories: null });
      return;
    }
    const n = parseInt(txt.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(n) || n < 0) {
      onChange({ calories: null });
      return;
    }
    onChange({ calories: n });
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      {/* FDA 9 allergens */}
      <Field label="Allergens (FDA 9 — US labeling law)">
        <View style={s.allergenGrid}>
          {ALLERGEN.map((a) => {
            const active = value.allergens.includes(a);
            return (
              <TouchableOpacity
                key={a}
                style={[s.allergenChip, active && s.allergenChipActive]}
                onPress={() => toggleAllergen(a as Allergen)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={ALLERGEN_ICON[a as Allergen]}
                  size={14}
                  color={active ? '#fff' : T.color.t1}
                />
                <Text style={[s.allergenText, active && s.allergenTextActive]}>
                  {ALLERGEN_LABEL[a as Allergen]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={s.hint}>
          Selected: {value.allergens.length === 0 ? '(none)' : value.allergens.length} ·
          Shown on TV/Tablet as warning badges.
        </Text>
      </Field>

      {/* Spice level (5-segment) */}
      <Field label="Spice level">
        <View style={s.spiceRow}>
          {(['none', ...SPICE_LEVEL.filter((l) => l !== 'none')] as SpiceLevel[]).map((lvl) => {
            const active = value.spice_level === lvl;
            const heat = SPICE_HEAT[lvl];
            return (
              <TouchableOpacity
                key={lvl}
                style={[s.spiceCell, active && s.spiceCellActive]}
                onPress={() => setSpice(lvl)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={s.spiceFlames}>
                  {heat === 0
                    ? <View style={{ height: 12 }} />  // None: spacer to keep label aligned
                    : Array.from({ length: heat }).map((_, i) => (
                        <Ionicons
                          key={i}
                          name="flame"
                          size={12}
                          color={active ? '#fff' : T.color.brand}
                        />
                      ))}
                </View>
                <Text style={[s.spiceLabel, active && s.spiceLabelActive]}>{lvl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {value.spice_level && (
          <TouchableOpacity onPress={() => setSpice(null)} style={s.clearLink}>
            <Text style={s.clearLinkText}>Clear spice level</Text>
          </TouchableOpacity>
        )}
      </Field>

      {/* Calories */}
      <Field label="Calories (per serving)">
        <View style={s.caloriesRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="e.g. 540"
            placeholderTextColor={T.color.t2}
            value={value.calories != null ? String(value.calories) : ''}
            onChangeText={onCaloriesChange}
            keyboardType="number-pad"
          />
          <Text style={s.unit}>kcal</Text>
        </View>
        <Text style={s.hint}>Optional — used by analytics (P2) and on-screen display.</Text>
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

const s = StyleSheet.create({
  root:   { flex: 1 },
  body:   { padding: T.sp[5], gap: T.sp[5] },
  field:  { gap: T.sp[2] },
  fieldLabel: { color: T.color.t1, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  hint:       { color: T.color.t2, fontSize: 11, marginTop: 4 },

  allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  allergenChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: T.sp[3], paddingVertical: 8,
    backgroundColor: T.color.bg3,
    borderRadius: 12, borderWidth: 1, borderColor: T.color.border,
    minWidth: 100,
  },
  allergenChipActive: { backgroundColor: T.color.error, borderColor: T.color.error },
  allergenText:       { color: T.color.t1, fontSize: 12, fontWeight: '500' },
  allergenTextActive: { color: '#fff', fontWeight: '700' },

  spiceRow: {
    flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[1],
  },
  spiceCell: {
    flex: 1,
    paddingVertical: T.sp[3], paddingHorizontal: T.sp[2],
    backgroundColor: T.color.bg3,
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', gap: 4,
  },
  spiceCellActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  spiceFlames:     { flexDirection: 'row', gap: 2 },
  spiceLabel:      { color: T.color.t1, fontSize: 11, textTransform: 'capitalize' },
  spiceLabelActive:{ color: '#fff', fontWeight: '700' },

  clearLink:     { marginTop: T.sp[2], alignSelf: 'flex-start' },
  clearLinkText: { color: T.color.t2, fontSize: 11, textDecorationLine: 'underline' },

  caloriesRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[3],
    fontSize: 14,
  },
  unit: { color: T.color.t1, fontSize: 13, fontWeight: '600' },
});
