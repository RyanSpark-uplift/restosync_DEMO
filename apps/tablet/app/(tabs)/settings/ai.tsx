// AI prep time admin — edit store_settings.ai (spec sec.26).
// Stage 1 today: prep_time_lookup map + peak_multiplier + range_buffer_minutes.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useStoreSettings } from '../../../src/hooks/useStoreSettings';

const MODES = ['static', 'statistical', 'ml'] as const;
const FORMATS = ['range', 'single', 'hidden'] as const;

interface LookupRow { id: string; name: string; minutes: string }

export default function AiSettingsScreen() {
  const router = useRouter();
  const { settings, isLoading, patch, isPatching } = useStoreSettings();
  const ai = (settings?.ai ?? {}) as Record<string, unknown>;

  const [peakMultiplier, setPeakMultiplier] = useState('');
  const [rangeBuffer,    setRangeBuffer]    = useState('');
  const [rows,           setRows]           = useState<LookupRow[]>([]);

  useEffect(() => {
    setPeakMultiplier(String(ai.peak_multiplier ?? '1.3'));
    setRangeBuffer(String(ai.range_buffer_minutes ?? '3'));
    const lookup = (ai.prep_time_lookup as Record<string, number> | undefined) ?? {};
    setRows(Object.entries(lookup).map(([name, minutes], i) => ({
      id: `${i}-${name}`, name, minutes: String(minutes),
    })));
  }, [ai.peak_multiplier, ai.range_buffer_minutes, ai.prep_time_lookup]);

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>;
  }

  const onAddRow   = () => setRows((r) => [...r, { id: `new-${Date.now()}`, name: '', minutes: '' }]);
  const onUpdate   = (id: string, k: 'name' | 'minutes', v: string) =>
    setRows((r) => r.map((row) => row.id === id ? { ...row, [k]: v } : row));
  const onRemove   = (id: string) => setRows((r) => r.filter((row) => row.id !== id));

  const onSave = () => {
    // Collapse rows into the lookup map, skipping blanks.
    const lookup: Record<string, number> = {};
    for (const r of rows) {
      const name = r.name.trim();
      const m    = Number(r.minutes);
      if (!name || !Number.isFinite(m) || m <= 0) continue;
      lookup[name] = m;
    }
    const pm = Number(peakMultiplier);
    const rb = Number(rangeBuffer);
    if (!Number.isFinite(pm) || pm < 1) {
      Alert.alert('Invalid value', 'Peak multiplier must be >= 1.0'); return;
    }
    if (!Number.isFinite(rb) || rb < 0) {
      Alert.alert('Invalid value', 'Range buffer must be >= 0'); return;
    }
    patch({ ai: {
      peak_multiplier:      pm,
      range_buffer_minutes: rb,
      prep_time_lookup:     lookup,
    } });
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Ionicons name="chevron-back" size={20} color={T.color.t0} />
        <Text style={s.title}>AI Prep Time</Text>
      </TouchableOpacity>

      <Section title="Mode">
        <ChipRow
          options={MODES}
          selected={(ai.prep_time_mode as string) ?? 'static'}
          onSelect={(v) => patch({ ai: { prep_time_mode: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="Display format">
        <ChipRow
          options={FORMATS}
          selected={(ai.display_format as string) ?? 'range'}
          onSelect={(v) => patch({ ai: { display_format: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="Multipliers">
        <View style={s.field}>
          <Text style={s.fieldLabel}>Peak multiplier (e.g. 1.3)</Text>
          <TextInput
            style={s.input} value={peakMultiplier} onChangeText={setPeakMultiplier}
            keyboardType="decimal-pad" placeholderTextColor={T.color.t2}
          />
        </View>
        <View style={s.field}>
          <Text style={s.fieldLabel}>Range buffer (± minutes)</Text>
          <TextInput
            style={s.input} value={rangeBuffer} onChangeText={setRangeBuffer}
            keyboardType="number-pad" placeholderTextColor={T.color.t2}
          />
        </View>
      </Section>

      <Section title="Item prep time lookup">
        {rows.map((r) => (
          <View key={r.id} style={s.lookupRow}>
            <TextInput
              style={[s.input, { flex: 2 }]} placeholder="Item name"
              placeholderTextColor={T.color.t2}
              value={r.name} onChangeText={(v) => onUpdate(r.id, 'name', v)}
            />
            <TextInput
              style={[s.input, { width: 80 }]} placeholder="min"
              placeholderTextColor={T.color.t2}
              keyboardType="number-pad"
              value={r.minutes} onChangeText={(v) => onUpdate(r.id, 'minutes', v)}
            />
            <TouchableOpacity onPress={() => onRemove(r.id)} style={s.removeBtn}>
              <Ionicons name="trash-outline" size={18} color={T.color.error} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.addBtn} onPress={onAddRow}>
          <Ionicons name="add" size={18} color={T.color.brand} />
          <Text style={s.addText}>Add item</Text>
        </TouchableOpacity>
      </Section>

      <TouchableOpacity style={s.saveBtn} onPress={onSave} disabled={isPatching}>
        {isPatching ? <ActivityIndicator color={T.color.t0} /> : <Text style={s.saveText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function ChipRow<U extends string>({ options, selected, onSelect, disabled }: {
  options: readonly U[]; selected: string; onSelect: (v: U) => void; disabled?: boolean;
}) {
  return (
    <View style={s.chipRow}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          style={[s.chip, selected === o && s.chipActive]}
          onPress={() => onSelect(o)}
          disabled={disabled}
        >
          <Text style={[s.chipText, selected === o && s.chipTextActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: T.color.bg1 },
  body:  { padding: T.sp[4], gap: T.sp[4] },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  back:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  title: { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },

  section:     { gap: T.sp[2] },
  sectionTitle:{ color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  sectionBody: { backgroundColor: T.color.bg2, borderRadius: T.r.md, borderWidth: 1, borderColor: T.color.border, padding: T.sp[3], gap: T.sp[3] },

  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip:      { borderWidth: 1, borderColor: T.color.border, borderRadius: T.r.full,
               paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], backgroundColor: T.color.bg3 },
  chipActive:{ backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText:  { color: T.color.t1, fontSize: T.fs.sm },
  chipTextActive: { color: T.color.t0, fontWeight: T.fw.bold },

  field:      { gap: 4 },
  fieldLabel: { color: T.color.t1, fontSize: T.fs.sm },
  input:      { backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1, borderColor: T.color.border,
                paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], color: T.color.t0, fontSize: T.fs.md },

  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  removeBtn: { padding: T.sp[2] },
  addBtn:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
               paddingVertical: T.sp[2], alignSelf: 'flex-start' },
  addText:   { color: T.color.brand, fontSize: T.fs.sm, fontWeight: T.fw.semibold },

  saveBtn: { backgroundColor: T.color.brand, borderRadius: T.r.md, paddingVertical: T.sp[3], alignItems: 'center' },
  saveText:{ color: T.color.t0, fontWeight: T.fw.bold, fontSize: T.fs.md },
});
