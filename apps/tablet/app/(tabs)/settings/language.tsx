import React from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useStoreSettings } from '../../../src/hooks/useStoreSettings';

const LANGS = ['en', 'es'] as const;
const MODES = ['primary_only', 'bilingual', 'auto_detect'] as const;

export default function LanguageSettingsScreen() {
  const router = useRouter();
  const { settings, isLoading, patch, isPatching } = useStoreSettings();
  const bi = (settings?.bilingual ?? {}) as Record<string, unknown>;

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>;
  }

  const primaryLang = (bi.primary_lang as string) ?? 'en';
  const secondaryLang = (bi.secondary_lang as string | null) ?? null;
  const mode = (bi.mode as string) ?? 'primary_only';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Ionicons name="chevron-back" size={20} color={T.color.t0} />
        <Text style={s.title}>Language</Text>
      </TouchableOpacity>

      <Section title="Primary language">
        <ChipRow
          options={LANGS}
          selected={primaryLang}
          onSelect={(v) => patch({ bilingual: { primary_lang: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="Secondary language (optional)">
        <ChipRow
          options={['none', ...LANGS] as const}
          selected={secondaryLang ?? 'none'}
          onSelect={(v) => patch({ bilingual: { secondary_lang: v === 'none' ? null : v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="Display mode">
        <ChipRow
          options={MODES}
          selected={mode}
          onSelect={(v) => patch({ bilingual: { mode: v } })}
          disabled={isPatching}
        />
      </Section>

      <Section title="TTS Languages">
        <View>
          <ToggleRow
            label="English (en-US)"
            value={Array.isArray(bi.tts_langs) && (bi.tts_langs as string[]).includes('en')}
            onChange={(v) => {
              const cur = (bi.tts_langs as string[] | undefined) ?? [];
              const next = v ? Array.from(new Set([...cur, 'en'])) : cur.filter((x) => x !== 'en');
              patch({ bilingual: { tts_langs: next } });
            }}
            disabled={isPatching}
          />
          <ToggleRow
            label="Spanish (es-US)"
            value={Array.isArray(bi.tts_langs) && (bi.tts_langs as string[]).includes('es')}
            onChange={(v) => {
              const cur = (bi.tts_langs as string[] | undefined) ?? [];
              const next = v ? Array.from(new Set([...cur, 'es'])) : cur.filter((x) => x !== 'es');
              patch({ bilingual: { tts_langs: next } });
            }}
            disabled={isPatching}
          />
        </View>
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

  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: T.sp[2] },
  rowLabel:  { color: T.color.t0, fontSize: T.fs.md },

  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip:      { borderWidth: 1, borderColor: T.color.border, borderRadius: T.r.full,
               paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], backgroundColor: T.color.bg3 },
  chipActive:{ backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText:  { color: T.color.t1, fontSize: T.fs.sm },
  chipTextActive: { color: T.color.t0, fontWeight: T.fw.bold },
});
