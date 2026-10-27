// M01 Sprint F.B — Page F `/menu/featured` Rules + Active Rotation Preview.
//
// PRD §3.6 / §4.2 / BR-21 — chef_pick / lto / low_inventory(P1.5 stub) / daypart 토글 +
// rotation interval 5/8/10/12s + active 풀 preview (TV Zone B 미리보기).
// AG-014 4-state UI. AM01-020 부모 _layout이 Stack wrap.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchFeaturedRules, fetchFeaturedCurrent, putFeaturedRules,
  type FeaturedRule, type FeaturedRuleType, type FeaturedRotationSeconds,
  type FeaturedRulesResponse, type FeaturedCurrentResponse,
} from '../../../../src/api/menu';
import { useIsOnline } from '../../../../src/hooks/useIsOnline';
import { renderI18n } from '../../../../src/lib/i18nFallback';

const RULES_KEY   = ['menu', 'featured', 'rules']   as const;
const CURRENT_KEY = ['menu', 'featured', 'current'] as const;

// P1 active 4 rule types — analytics_star/puzzle은 P2 (UI에서 disabled badge로 표시)
interface RuleDef {
  type:        FeaturedRuleType;
  label:       string;
  hint:        string;
  icon:        keyof typeof Ionicons.glyphMap;
  p2?:         true;                                     // P2 stub
  paramHint?:  string;
}

const RULE_DEFS: RuleDef[] = [
  { type: 'chef_pick',        label: "Chef's Pick (always)",   icon: 'star-outline',
    hint: '`is_featured = true` 항목을 풀에 포함.' },
  { type: 'lto',              label: 'Limited Time Offer',     icon: 'time-outline',
    hint: 'available_until 이 임박한 LTO 메뉴 자동 노출.',
    paramHint: 'threshold_days: 2 (남은 일수)' },
  { type: 'daypart',          label: 'Daypart-matched',        icon: 'sunny-outline',
    hint: '현재 daypart (매장 timezone) 매칭 메뉴 노출.' },
  { type: 'low_inventory',    label: 'Low Inventory (P1.5)',   icon: 'alert-circle-outline',
    hint: '재고 부족 메뉴 — recipe 연동 (P1.5 활성).',
    p2: true,
    paramHint: 'threshold_multiplier: 5 (재고 / 1인분 × N)' },
  { type: 'analytics_star',   label: 'Engineering: Star (P2)', icon: 'sparkles-outline', p2: true,
    hint: 'High margin + High popularity (P2).' },
  { type: 'analytics_puzzle', label: 'Engineering: Puzzle (P2)', icon: 'help-circle-outline', p2: true,
    hint: 'High margin + Low popularity (P2).' },
];

const INTERVALS: FeaturedRotationSeconds[] = [5, 8, 10, 12];

type Draft = Map<FeaturedRuleType, FeaturedRule>;

function rulesToDraft(rules: FeaturedRule[]): Draft {
  return new Map(rules.map((r) => [r.rule_type, { ...r, params: { ...(r.params ?? {}) } }]));
}

function draftToList(d: Draft): FeaturedRule[] {
  return [...d.values()];
}

function defaultRule(type: FeaturedRuleType): FeaturedRule {
  const params: FeaturedRule['params'] = {};
  if (type === 'lto') params.threshold_days = 2;
  if (type === 'low_inventory') params.threshold_multiplier = 5;
  return { rule_type: type, is_active: true, priority: 100, params };
}

function rulesEqual(a: FeaturedRule[], b: FeaturedRule[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.rule_type.localeCompare(y.rule_type));
  const sb = [...b].sort((x, y) => x.rule_type.localeCompare(y.rule_type));
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i], y = sb[i];
    if (x.rule_type !== y.rule_type) return false;
    if (x.is_active !== y.is_active) return false;
    if (x.priority !== y.priority) return false;
    if (JSON.stringify(x.params ?? {}) !== JSON.stringify(y.params ?? {})) return false;
  }
  return true;
}

export default function FeaturedScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const online = useIsOnline();

  const rulesQ = useQuery<FeaturedRulesResponse>({
    queryKey: RULES_KEY,
    queryFn:  () => fetchFeaturedRules(),
  });
  const previewQ = useQuery<FeaturedCurrentResponse>({
    queryKey: CURRENT_KEY,
    queryFn:  () => fetchFeaturedCurrent(8),
    refetchInterval: 60_000,                                              // 매 1분 풀 재평가 (BR-21)
  });

  const serverRules = rulesQ.data?.rules ?? [];
  const serverInterval: FeaturedRotationSeconds = (rulesQ.data?.rotation_seconds ?? 8) as FeaturedRotationSeconds;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [intervalDraft, setIntervalDraft] = useState<FeaturedRotationSeconds | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);

  // Sync server → local on first load / external refresh
  useEffect(() => {
    if (rulesQ.data && draft == null && intervalDraft == null) {
      // initial sync — leave draft null (effective from server)
    }
  }, [rulesQ.data, draft, intervalDraft]);

  const effective: Draft = draft ?? rulesToDraft(serverRules);
  const effectiveInterval = intervalDraft ?? serverInterval;
  const dirty = (
    (draft !== null && !rulesEqual(draftToList(effective), serverRules)) ||
    (intervalDraft !== null && intervalDraft !== serverInterval)
  );

  const toggleRule = (type: FeaturedRuleType) => {
    const base = draft ?? rulesToDraft(serverRules);
    const next = new Map(base);
    const existing = next.get(type);
    if (existing) {
      next.set(type, { ...existing, is_active: !existing.is_active });
    } else {
      next.set(type, defaultRule(type));
    }
    setDraft(next);
  };

  const removeRule = (type: FeaturedRuleType) => {
    const base = draft ?? rulesToDraft(serverRules);
    const next = new Map(base);
    next.delete(type);
    setDraft(next);
  };

  const setLtoDays = (v: number) => {
    const base = draft ?? rulesToDraft(serverRules);
    const next = new Map(base);
    const cur = next.get('lto') ?? defaultRule('lto');
    next.set('lto', { ...cur, params: { ...cur.params, threshold_days: v } });
    setDraft(next);
  };

  const discard = () => { setDraft(null); setIntervalDraft(null); setServerErr(null); };

  const save = useMutation({
    mutationFn: () => putFeaturedRules({
      // P2 rule types는 서버에서 enum allow 하지만 P1에서는 저장 안 함
      rules: draftToList(effective)
        .filter((r) => !['analytics_star', 'analytics_puzzle'].includes(r.rule_type))
        .map((r) => ({
          rule_type: r.rule_type,
          is_active: r.is_active,
          priority:  r.priority,
          params:    r.params,
        })),
      rotation_seconds: effectiveInterval,
    }),
    onSuccess: () => {
      setServerErr(null);
      setDraft(null);
      setIntervalDraft(null);
      qc.invalidateQueries({ queryKey: RULES_KEY });
      qc.invalidateQueries({ queryKey: CURRENT_KEY });
    },
    onError: (e: unknown) => setServerErr(e instanceof Error ? e.message : 'Save failed'),
  });

  const isLoading = rulesQ.isLoading;
  const error = rulesQ.error;

  return (
    <View style={st.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={T.color.t0} />
        </TouchableOpacity>
        <Text style={st.title}>Featured rotation</Text>
        <View style={{ flex: 1 }} />
        {!online && <Text style={st.offline}>Offline</Text>}
      </View>

      {isLoading && <View style={st.center}><ActivityIndicator color={T.color.t1} /></View>}

      {error && !isLoading && (
        <View style={st.center}>
          <Text style={st.errorText}>{(error as Error).message}</Text>
          <TouchableOpacity onPress={() => rulesQ.refetch()} style={st.retryBtn}>
            <Text style={st.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !error && rulesQ.data && (
        <ScrollView contentContainerStyle={st.body}>
          {/* Active Preview (TV Zone B 미리보기) */}
          <View style={st.section}>
            <Text style={st.sectionTitle}>Active rotation preview</Text>
            <Text style={st.sectionHint}>
              매장 timezone {previewQ.data?.timezone ?? '...'} · 현재 daypart{' '}
              <Text style={st.tzValue}>{previewQ.data?.current_daypart ?? '— (closed)'}</Text> ·{' '}
              풀 재평가 60s · 회전 {effectiveInterval}s
            </Text>
            {previewQ.isLoading ? (
              <ActivityIndicator color={T.color.t1} style={{ marginTop: T.sp[3] }} />
            ) : (previewQ.data?.items.length ?? 0) === 0 ? (
              <View style={st.emptyPool}>
                <Ionicons name="film-outline" size={32} color={T.color.t2} />
                <Text style={st.emptyPoolText}>풀이 비어 있습니다. 규칙을 활성화하거나 메뉴에서 Featured 토글하세요.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.preview}>
                {previewQ.data!.items.map((it) => {
                  const name = renderI18n(it.name_i18n) || it.name || '(no name)';
                  return (
                    <View key={it.id} style={st.previewCard}>
                      <View style={st.previewImg}>
                        {it.image_url || it.photo_url_nobg
                          ? <Image source={{ uri: it.photo_url_nobg ?? it.image_url ?? '' }} style={st.previewImgFill} resizeMode="cover" />
                          : <Ionicons name="restaurant-outline" size={28} color={T.color.t2} />}
                      </View>
                      <Text style={st.previewName} numberOfLines={1}>{name}</Text>
                      {it.price_cents != null
                        ? <Text style={st.previewPrice}>${(it.price_cents / 100).toFixed(2)}</Text>
                        : null}
                      <View style={st.previewBadges}>
                        {it.matched_rules.map((r) => (
                          <Text key={r} style={st.previewBadge}>{r}</Text>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Rotation interval */}
          <View style={st.section}>
            <Text style={st.sectionTitle}>Rotation interval</Text>
            <Text style={st.sectionHint}>매 N초마다 카드 회전 (PRD §3.6).</Text>
            <View style={st.intervalRow}>
              {INTERVALS.map((n) => {
                const active = n === effectiveInterval;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[st.intervalBtn, active && st.intervalBtnActive]}
                    onPress={() => setIntervalDraft(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} seconds`}
                  >
                    <Text style={[st.intervalText, active && st.intervalTextActive]}>{n}s</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Rules */}
          <View style={st.section}>
            <Text style={st.sectionTitle}>Rules</Text>
            <Text style={st.sectionHint}>
              풀에 포함할 메뉴를 결정. 여러 규칙이 같은 항목을 매칭하면 우선순위가 더 높은 규칙으로 정렬.
              규칙이 하나도 없으면 기본적으로 Chef's Pick 활성으로 동작.
            </Text>
            <View style={{ marginTop: T.sp[3], gap: T.sp[2] }}>
              {RULE_DEFS.map((def) => {
                const r = effective.get(def.type);
                const enabled = r?.is_active ?? false;
                const disabled = def.p2 === true;
                return (
                  <View key={def.type} style={[st.ruleRow, disabled && { opacity: 0.5 }]}>
                    <View style={st.ruleIcon}>
                      <Ionicons name={def.icon} size={18} color={T.color.t0} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.ruleLabel}>{def.label}</Text>
                      <Text style={st.ruleHint}>{def.hint}</Text>
                      {def.paramHint && <Text style={st.ruleParam}>{def.paramHint}</Text>}
                      {def.type === 'lto' && r?.is_active && (
                        <View style={st.ltoDaysRow}>
                          <Text style={st.ltoDaysLabel}>Threshold days:</Text>
                          {[1, 2, 3, 7].map((d) => {
                            const isOn = (r.params.threshold_days ?? 2) === d;
                            return (
                              <TouchableOpacity
                                key={d}
                                style={[st.ltoDaysChip, isOn && st.ltoDaysChipActive]}
                                onPress={() => setLtoDays(d)}
                                accessibilityRole="button"
                                accessibilityLabel={`${d} days threshold`}
                              >
                                <Text style={[st.ltoDaysText, isOn && st.ltoDaysTextActive]}>{d}d</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[st.toggle, enabled && st.toggleOn, disabled && { opacity: 0.5 }]}
                      onPress={() => !disabled && toggleRule(def.type)}
                      disabled={disabled}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: enabled, disabled }}
                      accessibilityLabel={`${def.label} ${enabled ? 'on' : 'off'}`}
                    >
                      <View style={[st.toggleKnob, enabled && st.toggleKnobOn]} />
                    </TouchableOpacity>
                    {r && (
                      <TouchableOpacity
                        style={st.removeBtn}
                        onPress={() => removeRule(def.type)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${def.label} rule`}
                      >
                        <Ionicons name="trash-outline" size={14} color={T.color.t2} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Save bar */}
          {dirty && (
            <View style={st.saveBar}>
              <TouchableOpacity
                style={st.discardBtn}
                onPress={discard}
                disabled={save.isPending}
                accessibilityRole="button"
                accessibilityLabel="Discard changes"
              >
                <Text style={st.discardText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.saveBtn, save.isPending && { opacity: 0.4 }]}
                onPress={() => save.mutate()}
                disabled={save.isPending}
                accessibilityRole="button"
                accessibilityLabel="Save featured rules"
              >
                {save.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={st.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          )}
          {serverErr && <Text style={st.errText}>{serverErr}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
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
  errText: { color: T.color.error, fontSize: 12, marginTop: T.sp[2] },

  body: { padding: T.sp[5], gap: T.sp[4] },

  section: {
    backgroundColor: T.color.bg2,
    borderRadius: 10, padding: T.sp[4],
    borderWidth: 1, borderColor: T.color.border,
    gap: T.sp[2],
  },
  sectionTitle: { color: T.color.t0, fontSize: 15, fontWeight: '700' },
  sectionHint:  { color: T.color.t2, fontSize: 11, lineHeight: 16 },
  tzValue:      { color: T.color.t0, fontWeight: '700' },

  preview: { gap: T.sp[3], paddingVertical: T.sp[2] },
  previewCard: {
    width: 130, padding: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8,
    borderWidth: 1, borderColor: T.color.border,
    gap: T.sp[1],
  },
  previewImg: {
    width: '100%', height: 80,
    backgroundColor: T.color.bg1, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImgFill: { width: '100%', height: '100%' },
  previewName: { color: T.color.t0, fontSize: 12, fontWeight: '600' },
  previewPrice: { color: T.color.brand, fontSize: 12, fontWeight: '700' },
  previewBadges: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  previewBadge: {
    color: T.color.t1, fontSize: 9, fontWeight: '600',
    backgroundColor: T.color.bg1, paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4, overflow: 'hidden',
  },
  emptyPool: {
    alignItems: 'center', gap: T.sp[2], padding: T.sp[4],
    borderWidth: 1, borderColor: T.color.border, borderStyle: 'dashed',
    borderRadius: 8, marginTop: T.sp[2],
  },
  emptyPoolText: { color: T.color.t2, fontSize: 11, textAlign: 'center' },

  intervalRow: { flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[2] },
  intervalBtn: {
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8, backgroundColor: T.color.bg3,
    borderWidth: 1, borderColor: T.color.border,
    minWidth: 56, alignItems: 'center',
  },
  intervalBtnActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  intervalText:  { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  intervalTextActive: { color: '#fff' },

  ruleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.sp[3],
    padding: T.sp[3],
    backgroundColor: T.color.bg3, borderRadius: 8,
    borderWidth: 1, borderColor: T.color.border,
  },
  ruleIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: T.color.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  ruleLabel: { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  ruleHint:  { color: T.color.t2, fontSize: 11, lineHeight: 15, marginTop: 2 },
  ruleParam: { color: T.color.t1, fontSize: 10, marginTop: 2, fontStyle: 'italic' },

  ltoDaysRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], marginTop: T.sp[2], flexWrap: 'wrap' },
  ltoDaysLabel: { color: T.color.t2, fontSize: 11 },
  ltoDaysChip: {
    paddingHorizontal: T.sp[2], paddingVertical: 2,
    borderRadius: 6, backgroundColor: T.color.bg1,
    borderWidth: 1, borderColor: T.color.border,
  },
  ltoDaysChipActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  ltoDaysText: { color: T.color.t0, fontSize: 11, fontWeight: '600' },
  ltoDaysTextActive: { color: '#fff' },

  toggle: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: T.color.bg1, borderWidth: 1, borderColor: T.color.border,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleOn:    { backgroundColor: T.color.brand, borderColor: T.color.brand },
  toggleKnob:  {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: T.color.t1,
  },
  toggleKnobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },

  removeBtn: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: T.color.bg2, borderWidth: 1, borderColor: T.color.border,
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
