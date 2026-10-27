// M01 Sprint 4 polish — Page D `/menu/daypart` Windows editor.
//
// PRD §3.4 / §4.3 — 6-Daypart × HH:MM start/end. BR-02 stores.timezone 기준.
// Overlap 검증은 서버 Zod refine (422 INVALID_WINDOWS). 클라는 표면 표시만.
// AG-014 4-state UI.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchDayparts, updateDayparts,
  type DaypartsResponse, type DaypartWindow,
} from '../../../../src/api/menu';
import { useIsOnline } from '../../../../src/hooks/useIsOnline';
import { DAYPART, type Daypart } from '@restosync/shared/enums';

const DAYPARTS_KEY = ['menu', 'dayparts'] as const;

// AG-013 6-value 정본. 'all'은 wildcard라서 windows 편집 비활성.
const EDITABLE_DAYPARTS: Daypart[] = DAYPART.filter((d) => d !== 'all');

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

interface DraftWindow { start: string; end: string }
type DraftMap = Partial<Record<Daypart, DraftWindow>>;

function isValidTime(t: string): boolean {
  return TIME_RE.test(t.trim());
}

function windowsEqual(a: DraftMap, b: DraftMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<Daypart>;
  for (const k of keys) {
    if (!a[k] && !b[k]) continue;
    if (!a[k] || !b[k]) return false;
    if (a[k]!.start !== b[k]!.start || a[k]!.end !== b[k]!.end) return false;
  }
  return true;
}

export default function DaypartScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const online = useIsOnline();

  const { data, isLoading, error, refetch } = useQuery<DaypartsResponse>({
    queryKey: DAYPARTS_KEY,
    queryFn:  () => fetchDayparts(),
  });

  const serverWindows = useMemo<DraftMap>(() => (data?.windows ?? {}) as DraftMap, [data]);
  const [draft, setDraft] = useState<DraftMap | null>(null);
  const effective = draft ?? serverWindows;
  const dirty = useMemo(() => draft !== null && !windowsEqual(draft, serverWindows), [draft, serverWindows]);

  const [serverErr, setServerErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      // Drop daypart entries where either start/end is invalid or empty.
      const clean: DraftMap = {};
      for (const dp of EDITABLE_DAYPARTS) {
        const w = effective[dp];
        if (w && isValidTime(w.start) && isValidTime(w.end)) {
          clean[dp] = { start: w.start.trim(), end: w.end.trim() };
        }
      }
      return updateDayparts(clean);
    },
    onSuccess: () => {
      setServerErr(null);
      setDraft(null);
      qc.invalidateQueries({ queryKey: DAYPARTS_KEY });
    },
    onError: (e: unknown) => setServerErr(e instanceof Error ? e.message : 'Save failed'),
  });

  const setWindow = (dp: Daypart, patch: Partial<DraftWindow>) => {
    setDraft((prev) => {
      const base = prev ?? serverWindows;
      const cur = base[dp] ?? { start: '', end: '' };
      return { ...base, [dp]: { ...cur, ...patch } };
    });
  };
  const clearWindow = (dp: Daypart) => {
    setDraft((prev) => {
      const base = prev ?? serverWindows;
      const next: DraftMap = { ...base };
      delete next[dp];
      return next;
    });
  };
  const discard = () => { setDraft(null); setServerErr(null); };

  // Local validity check before allowing save
  const localValid = useMemo(() => {
    for (const dp of EDITABLE_DAYPARTS) {
      const w = effective[dp];
      if (!w) continue;
      const both = w.start.trim() === '' && w.end.trim() === '';
      if (both) continue;
      if (!isValidTime(w.start) || !isValidTime(w.end)) return false;
    }
    return true;
  }, [effective]);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={T.color.t0} />
        </TouchableOpacity>
        <Text style={s.title}>Daypart windows</Text>
        <View style={{ flex: 1 }} />
        {!online && <Text style={s.offline}>Offline</Text>}
      </View>

      {isLoading && <View style={s.center}><ActivityIndicator color={T.color.t1} /></View>}

      {error && !isLoading && (
        <View style={s.center}>
          <Text style={s.errorText}>{(error as Error).message}</Text>
          <TouchableOpacity onPress={() => refetch()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !error && data && (
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.tzBar}>
            <Ionicons name="time-outline" size={16} color={T.color.t1} />
            <Text style={s.tzText}>
              Store timezone: <Text style={s.tzValue}>{data.timezone ?? 'UTC'}</Text>
            </Text>
          </View>
          <Text style={s.hint}>
            Set start/end (HH:MM 24h) per daypart. Overlapping windows are rejected (BR-09). Leave blank to unset.
            "all" is a wildcard (always visible) and isn't time-bounded.
          </Text>

          {EDITABLE_DAYPARTS.map((dp) => {
            const w = effective[dp];
            const start = w?.start ?? '';
            const end   = w?.end ?? '';
            const startBad = start.trim() !== '' && !isValidTime(start);
            const endBad   = end.trim() !== '' && !isValidTime(end);
            return (
              <View key={dp} style={s.dpRow}>
                <Text style={s.dpLabel}>{dp}</Text>
                <TextInput
                  style={[s.timeInput, startBad && s.inputBad]}
                  value={start}
                  onChangeText={(t) => setWindow(dp, { start: t })}
                  placeholder="HH:MM"
                  placeholderTextColor={T.color.t2}
                  maxLength={5}
                />
                <Text style={s.tilde}>→</Text>
                <TextInput
                  style={[s.timeInput, endBad && s.inputBad]}
                  value={end}
                  onChangeText={(t) => setWindow(dp, { end: t })}
                  placeholder="HH:MM"
                  placeholderTextColor={T.color.t2}
                  maxLength={5}
                />
                {Boolean(start || end) && (
                  <TouchableOpacity
                    onPress={() => clearWindow(dp)}
                    style={s.clearBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear ${dp} window`}
                  >
                    <Ionicons name="close" size={14} color={T.color.t1} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {dirty && (
            <View style={s.saveBar}>
              <TouchableOpacity
                style={s.discardBtn}
                onPress={discard}
                disabled={save.isPending}
                accessibilityRole="button"
                accessibilityLabel="Discard changes"
              >
                <Text style={s.discardText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, (!localValid || save.isPending) && { opacity: 0.4 }]}
                onPress={() => save.mutate()}
                disabled={!localValid || save.isPending}
                accessibilityRole="button"
                accessibilityLabel="Save windows"
              >
                {save.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          )}
          {serverErr && <Text style={s.errText}>{serverErr}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.bg1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[4],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
  },
  title: { color: T.color.t0, fontSize: 18, fontWeight: '700' },
  offline: { color: T.color.warn, fontSize: 12, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[3] },
  errorText: { color: T.color.error, fontSize: 13 },
  retryBtn: { paddingHorizontal: T.sp[4], paddingVertical: T.sp[2], backgroundColor: T.color.bg3, borderRadius: 8 },
  retryText: { color: T.color.t0, fontSize: 12, fontWeight: '600' },
  errText: { color: T.color.error, fontSize: 12 },

  body: { padding: T.sp[5], gap: T.sp[3] },

  tzBar: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg2,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: 8,
  },
  tzText:  { color: T.color.t1, fontSize: 12 },
  tzValue: { color: T.color.t0, fontWeight: '700' },

  hint: { color: T.color.t2, fontSize: 11, lineHeight: 16 },

  dpRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    padding: T.sp[3],
    backgroundColor: T.color.bg2,
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  dpLabel: { width: 80, color: T.color.t0, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  timeInput: {
    width: 88, backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    fontSize: 13, textAlign: 'center',
  },
  inputBad: { borderWidth: 1, borderColor: T.color.error },
  tilde: { color: T.color.t2, fontSize: 14 },
  clearBtn: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },

  saveBar: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingTop: T.sp[3], marginTop: T.sp[2],
    borderTopWidth: 1, borderTopColor: T.color.border,
    justifyContent: 'flex-end',
  },
  discardBtn: {
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  discardText: { color: T.color.t1, fontSize: 13, fontWeight: '600' },
  saveBtn: {
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[2],
    borderRadius: 8, backgroundColor: T.color.brand,
  },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
