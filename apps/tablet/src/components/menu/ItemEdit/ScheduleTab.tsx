// M01 Sprint 4 S4.2 — Schedule tab (Page B).
//
// 6-Daypart multi-select + LTO (Limited Time Offer) available_from/until window.
// AG-013: daypart 정본 6값만 입력 가능. BR-02 / AG-024: 서버는 UTC 저장, 입력은 매장 timezone hint 표시.
// 빈 dayparts 권장: ['all'] (항상 노출). LTO 비우면 무기한.
//
// LTO 입력 포맷: 'YYYY-MM-DDTHH:MM' (local-ish) — 서버는 new Date(string) 으로 파싱.
// 정밀 timezone-aware 변환은 P1.5 (date-fns-tz)에서 추가. 현재는 디바이스 로컬 → UTC 자동.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { DAYPART, type Daypart } from '@restosync/shared';
import { fetchDayparts, type DaypartsResponse } from '../../../api/menu';

export interface ScheduleFormState {
  dayparts_arr:    Daypart[];
  available_from:  string | null;   // ISO 8601 or null
  available_until: string | null;
}

interface Props {
  value:    ScheduleFormState;
  onChange: (patch: Partial<ScheduleFormState>) => void;
}

// 'YYYY-MM-DDTHH:MM' (24h) → ISO 8601. Empty/invalid → null.
function localToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ISO 8601 → 'YYYY-MM-DDTHH:MM' for display in TextInput.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DDTHH:MM in local tz
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleTab({ value, onChange }: Props) {
  const { data: dp } = useQuery<DaypartsResponse>({
    queryKey: ['menu', 'dayparts'],
    queryFn:  fetchDayparts,
  });

  const tz = dp?.timezone ?? '(store timezone)';

  const toggleDaypart = (d: Daypart) => {
    const set = new Set(value.dayparts_arr);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    onChange({ dayparts_arr: Array.from(set) });
  };

  // Raw text local state — partial 입력 중 reformat 금지 [AM01-016].
  // 외부 source(load/+24h/Clear) 변경 시만 display 동기화.
  const [fromText,  setFromText]  = useState<string>(isoToLocalInput(value.available_from));
  const [untilText, setUntilText] = useState<string>(isoToLocalInput(value.available_until));
  const lastFromRef  = useRef<string | null>(value.available_from);
  const lastUntilRef = useRef<string | null>(value.available_until);

  useEffect(() => {
    if (value.available_from !== lastFromRef.current) {
      setFromText(isoToLocalInput(value.available_from));
      lastFromRef.current = value.available_from;
    }
  }, [value.available_from]);

  useEffect(() => {
    if (value.available_until !== lastUntilRef.current) {
      setUntilText(isoToLocalInput(value.available_until));
      lastUntilRef.current = value.available_until;
    }
  }, [value.available_until]);

  const onFromChange = (txt: string) => {
    setFromText(txt);
    const iso = localToIso(txt);
    lastFromRef.current = iso;
    onChange({ available_from: iso });
  };

  const onUntilChange = (txt: string) => {
    setUntilText(txt);
    const iso = localToIso(txt);
    lastUntilRef.current = iso;
    onChange({ available_until: iso });
  };

  const isLtoInverted = !!value.available_from && !!value.available_until
    && new Date(value.available_from) >= new Date(value.available_until);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      {/* Daypart multi-select */}
      <Field label="Dayparts (when this item appears)">
        <View style={s.chipWrap}>
          {DAYPART.map((d) => (
            <Chip
              key={d}
              label={d}
              active={value.dayparts_arr.includes(d)}
              onPress={() => toggleDaypart(d as Daypart)}
            />
          ))}
        </View>
        <Text style={s.hint}>
          'all' = always available regardless of time of day.
          {value.dayparts_arr.length === 0 && (
            <Text style={{ color: T.color.warn }}>  ·  Empty = item hidden on TV.</Text>
          )}
        </Text>
      </Field>

      {/* Daypart windows preview (read-only — edit on Page D) */}
      {dp && (
        <Field label={`Store daypart windows — ${tz}`}>
          <View style={s.windowList}>
            {DAYPART.filter((d) => d !== 'all').map((d) => {
              const w = dp.windows[d as Daypart];
              return (
                <View key={d} style={s.windowRow}>
                  <Text style={s.windowName}>{d}</Text>
                  <Text style={s.windowTime}>
                    {w ? `${w.start} – ${w.end}` : '(not set)'}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={s.hint}>Edit windows on /menu/daypart page.</Text>
        </Field>
      )}

      {/* LTO */}
      <Field label="Limited time offer (LTO)">
        <Text style={s.hint}>
          Optional. Item auto-hides outside this window (BR-10). Times entered in device local — saved as UTC.
        </Text>

        <View style={s.ltoRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.subLabel}>Available from</Text>
            <TextInput
              style={[s.input, isLtoInverted && s.inputError]}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={T.color.t2}
              value={fromText}
              onChangeText={onFromChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.subLabel}>Available until</Text>
            <TextInput
              style={[s.input, isLtoInverted && s.inputError]}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={T.color.t2}
              value={untilText}
              onChangeText={onUntilChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Inline error — 입력 바로 아래에 둬서 짧은 viewport에서도 보이도록 [SMOKE 2026-05-19] */}
        {isLtoInverted && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={14} color={T.color.error} />
            <Text style={s.errorText}>'Available until' must be after 'available from'.</Text>
          </View>
        )}

        <View style={s.ltoBtnRow}>
          <SmallBtn
            label="+24h"
            onPress={() => {
              const now = new Date();
              const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
              onChange({
                available_from:  now.toISOString(),
                available_until: end.toISOString(),
              });
            }}
          />
          <SmallBtn
            label="+7d"
            onPress={() => {
              const now = new Date();
              const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              onChange({
                available_from:  now.toISOString(),
                available_until: end.toISOString(),
              });
            }}
          />
          <SmallBtn
            label="Clear"
            ghost
            onPress={() => onChange({ available_from: null, available_until: null })}
          />
        </View>
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

function SmallBtn({
  label, onPress, ghost,
}: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <TouchableOpacity
      style={[smallBtn.btn, ghost ? smallBtn.ghost : smallBtn.solid]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[smallBtn.text, ghost && smallBtn.textGhost]}>{label}</Text>
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

const smallBtn = StyleSheet.create({
  btn: {
    paddingHorizontal: T.sp[3], paddingVertical: 6,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  solid:    { backgroundColor: T.color.brand },
  ghost:    { backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border },
  text:     { color: '#fff', fontSize: 12, fontWeight: '600' },
  textGhost:{ color: T.color.t1 },
});

const s = StyleSheet.create({
  root:   { flex: 1 },
  body:   { padding: T.sp[5], gap: T.sp[4] },
  field:  { gap: T.sp[2] },
  fieldLabel: { color: T.color.t1, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  subLabel:   { color: T.color.t2, fontSize: 11, marginBottom: 4 },
  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[3],
    fontSize: 14,
    borderWidth: 1, borderColor: 'transparent',
  },
  inputError: { borderColor: T.color.error },
  hint:      { color: T.color.t2, fontSize: 11, marginTop: 4 },
  chipWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },

  windowList: { gap: 4, marginTop: 4 },
  windowRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  windowName: { color: T.color.t0, fontSize: 12, textTransform: 'capitalize' },
  windowTime: { color: T.color.t1, fontSize: 12, fontVariant: ['tabular-nums'] },

  ltoRow:    { flexDirection: 'row', gap: T.sp[3], marginTop: T.sp[2] },
  ltoBtnRow: { flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[2] },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: '#3a1a1a', borderRadius: 8, padding: T.sp[3], marginTop: T.sp[2],
  },
  errorText: { color: T.color.error, fontSize: 12, flex: 1 },
});
