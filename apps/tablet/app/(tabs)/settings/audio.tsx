import React from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useStoreSettings } from '../../../src/hooks/useStoreSettings';

const TTS_LANGS   = ['en', 'es', 'bilingual'] as const;
const TTS_GENDERS = ['female', 'male', 'auto'] as const;
const MODES       = ['tts', 'bell', 'both'] as const;

export default function AudioSettingsScreen() {
  const router = useRouter();
  const { settings, isLoading, patch, isPatching } = useStoreSettings();
  const audio = (settings?.audio ?? {}) as Record<string, unknown>;

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>;
  }

  const enabled = (audio.enabled as boolean) ?? true;
  const mode    = (audio.mode as string) ?? 'tts';
  const ttsLang = (audio.tts_lang as string) ?? 'en';
  const ttsGender = (audio.tts_gender as string) ?? 'auto';
  const recallEnabled = (audio.recall_enabled as boolean) ?? true;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Ionicons name="chevron-back" size={20} color={T.color.t0} />
        <Text style={s.title}>Audio</Text>
      </TouchableOpacity>

      <Section title="Master">
        <ToggleRow
          label="Audio enabled"
          value={enabled}
          onChange={(v) => patch({ audio: { enabled: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="Mode">
        <ChipRow
          options={MODES}
          selected={mode}
          onSelect={(v) => patch({ audio: { mode: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="TTS Language">
        <ChipRow
          options={TTS_LANGS}
          selected={ttsLang}
          onSelect={(v) => patch({ audio: { tts_lang: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="Voice">
        <ChipRow
          options={TTS_GENDERS}
          selected={ttsGender}
          onSelect={(v) => patch({ audio: { tts_gender: v } })}
          disabled={isPatching}
        />
        <Text style={s.hint}>
          Picks a natural (enhanced) voice matching the selected gender when the
          TV device has one installed. “auto” = best available.
        </Text>
      </Section>

      <Section title="Recall">
        <ToggleRow
          label="Auto-recall after delay"
          value={recallEnabled}
          onChange={(v) => patch({ audio: { recall_enabled: v } })}
          disabled={isPatching}
        />
      </Section>
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

function ToggleRow({ label, value, onChange, disabled }: {
  label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

function ChipRow<T extends string>({ options, selected, onSelect, disabled }: {
  options: readonly T[]; selected: string; onSelect: (v: T) => void; disabled?: boolean;
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

  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel:  { color: T.color.t0, fontSize: T.fs.md },
  hint:      { color: T.color.t2, fontSize: T.fs.sm, lineHeight: 18 },

  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip:      { borderWidth: 1, borderColor: T.color.border, borderRadius: T.r.full,
               paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], backgroundColor: T.color.bg3 },
  chipActive:{ backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText:  { color: T.color.t1, fontSize: T.fs.sm },
  chipTextActive: { color: T.color.t0, fontWeight: T.fw.bold },
});
