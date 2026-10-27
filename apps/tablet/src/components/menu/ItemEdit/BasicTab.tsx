// M01 Sprint 4 S4.1b — Basic tab (Page B Item Edit)
//
// 5-lang i18n: language chips toggle which lang you're editing; English required (BR-11 fallback root).
// Price input is dollars; sent to server as price_cents integer (BR-01 / BR-25).
// Form is controlled — parent receives onChange callbacks for dirty tracking + Save mutation.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { T } from '@restosync/ui';
import { SUPPORTED_LANG, type SupportedLang, type I18nString } from '@restosync/shared';
import { fetchCategories, type MenuCategory } from '../../../api/menu';
import { renderI18n } from '../../../lib/i18nFallback';

const LANG_LABELS: Record<SupportedLang, string> = {
  en: 'English', ko: '한국어', es: 'Español', zh: '中文', ja: '日本語',
};

export interface BasicFormState {
  name_i18n:        I18nString;
  description_i18n: I18nString;
  category_id:      string | null;
  price_cents:      number | null;     // null = invalid input (Save disabled)
}

interface Props {
  value:   BasicFormState;
  onChange: (patch: Partial<BasicFormState>) => void;
  // Active i18n editing language (lives in parent so Schedule/Allergens can reuse).
  lang:    SupportedLang;
  onLangChange: (l: SupportedLang) => void;
}

export function BasicTab({ value, onChange, lang, onLangChange }: Props) {
  const { data: cats } = useQuery<MenuCategory[]>({
    queryKey: ['menu', 'categories'],
    queryFn:  () => fetchCategories({ is_active: true }),
  });

  // Raw text local state — input 중 reformat 금지 (cursor 위치 + toFixed 충돌 회피 [AM01-016]).
  // 외부 price_cents 변경(load/reset)일 때만 display 동기화.
  const [priceText, setPriceText] = useState<string>(
    value.price_cents != null ? (value.price_cents / 100).toFixed(2) : '',
  );
  const lastCentsRef = useRef<number | null>(value.price_cents);

  useEffect(() => {
    if (value.price_cents !== lastCentsRef.current) {
      setPriceText(value.price_cents != null ? (value.price_cents / 100).toFixed(2) : '');
      lastCentsRef.current = value.price_cents;
    }
  }, [value.price_cents]);

  const onPriceChange = (txt: string) => {
    setPriceText(txt);
    const cleaned = txt.trim();
    if (cleaned.length === 0) {
      lastCentsRef.current = null;
      onChange({ price_cents: null });
      return;
    }
    const n = parseFloat(cleaned);
    if (Number.isNaN(n) || n < 0) {
      lastCentsRef.current = null;
      onChange({ price_cents: null });
      return;
    }
    const cents = Math.round(n * 100);
    lastCentsRef.current = cents;
    onChange({ price_cents: cents });
  };

  const setNameForLang = (l: SupportedLang, txt: string) => {
    const next: I18nString = { ...value.name_i18n };
    if (txt.trim().length === 0) delete next[l];
    else next[l] = txt;
    onChange({ name_i18n: next });
  };

  const setDescForLang = (l: SupportedLang, txt: string) => {
    const next: I18nString = { ...value.description_i18n };
    if (txt.trim().length === 0) delete next[l];
    else next[l] = txt;
    onChange({ description_i18n: next });
  };

  const filledLangs = useMemo(
    () => SUPPORTED_LANG.filter((l) => value.name_i18n[l]?.trim().length),
    [value.name_i18n],
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      {/* Language selector */}
      <Field label="Editing language">
        <View style={s.chipWrap}>
          {SUPPORTED_LANG.map((l) => (
            <Chip
              key={l}
              label={LANG_LABELS[l]}
              active={lang === l}
              filled={value.name_i18n[l]?.trim().length ? true : false}
              onPress={() => onLangChange(l)}
            />
          ))}
        </View>
        <Text style={s.hint}>
          Filled: {filledLangs.length > 0 ? filledLangs.join(', ') : '(none)'}
          {filledLangs.length > 0 && !filledLangs.includes('en') && (
            <Text style={{ color: T.color.warn }}>  ·  English required for BR-11 fallback</Text>
          )}
        </Text>
      </Field>

      {/* Name (current lang) */}
      <Field label={`Name (${LANG_LABELS[lang]})${lang === 'en' ? ' *' : ''}`}>
        <TextInput
          style={s.input}
          placeholder={lang === 'en' ? 'e.g. Spicy Chicken Burger' : '(optional)'}
          placeholderTextColor={T.color.t2}
          value={value.name_i18n[lang] ?? ''}
          onChangeText={(t) => setNameForLang(lang, t)}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </Field>

      {/* Description (current lang) */}
      <Field label={`Description (${LANG_LABELS[lang]})`}>
        <TextInput
          style={[s.input, s.inputMulti]}
          placeholder="(optional)"
          placeholderTextColor={T.color.t2}
          value={value.description_i18n[lang] ?? ''}
          onChangeText={(t) => setDescForLang(lang, t)}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </Field>

      {/* Category */}
      <Field label="Category">
        <View style={s.chipWrap}>
          <Chip label="(none)" active={value.category_id === null} onPress={() => onChange({ category_id: null })} />
          {(cats ?? []).map((c) => (
            <Chip
              key={c.id}
              label={renderI18n(c.name)}
              active={value.category_id === c.id}
              onPress={() => onChange({ category_id: c.id })}
            />
          ))}
        </View>
      </Field>

      {/* Price */}
      <Field label="Price (USD) *">
        <View style={s.priceRow}>
          <Text style={s.priceSym}>$</Text>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="0.00"
            placeholderTextColor={T.color.t2}
            value={priceText}
            onChangeText={onPriceChange}
            keyboardType="decimal-pad"
          />
        </View>
        {value.price_cents !== null && (
          <Text style={s.hint}>Saved as {value.price_cents}¢ (cents integer — BR-01)</Text>
        )}
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

function Chip({
  label, active, filled, onPress,
}: { label: string; active: boolean; filled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[chipStyle.chip, active && chipStyle.chipActive, filled && !active && chipStyle.chipFilled]}
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
  chipFilled: { borderColor: T.color.brand },
  text:       { color: T.color.t1, fontSize: 12 },
  textActive: { color: '#fff', fontWeight: '700' },
});

const s = StyleSheet.create({
  root:   { flex: 1 },
  body:   { padding: T.sp[5], gap: T.sp[4] },
  field:  { gap: T.sp[2] },
  fieldLabel: { color: T.color.t1, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[3],
    fontSize: 14,
  },
  inputMulti: { minHeight: 80 },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8, paddingHorizontal: T.sp[3],
  },
  priceSym:  { color: T.color.brand, fontSize: 16, fontWeight: '700' },
  hint:      { color: T.color.t2, fontSize: 11, marginTop: 4 },
  chipWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
});
