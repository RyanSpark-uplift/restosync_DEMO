// Theme picker — 12-theme system per DevGuide/Theme handoff. Operators choose:
//   1. Apply to (store default vs one specific TV instance) — per-TV override.
//   2. Theme key (one of 12 brand looks).
//   3. Columns (2 / 3 / 4 / 5 / 6 / 7 / 8 cards per side).
//   4. Store info (storeLabel + pickupLabel) — separate per README spec.10 to keep
//      visual theme and brand identity independent.
//
// No more mode / card_style / individual hex colors — the theme tokens own the
// full visual surface so each tile is a complete coherent look.

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, StyleSheet, Image,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import {
  THEMES, THEME_DEFAULT_COLUMNS,
  type ThemeKey, type PickupFlow,
} from '@restosync/shared';
import { useStoreSettings } from '../../../src/hooks/useStoreSettings';
import { api, type TvInstanceRow } from '../../../src/api/client';
import { useAuthStore, isEngineerMode } from '../../../src/store/auth';

// Real-screen thumbnails captured from /tv-view per theme. Order maps 1:1 to
// THEMES key order so the picker shows each theme's actual look instead of a
// synthesised approximation. Update by replacing the file at the matching
// index in apps/tablet/assets/themes/.
//
// resolveThumb pulls width/height out of the Metro asset registry so each tile
// gets its own aspectRatio — required because not every screenshot has the
// same dimensions (bistro is 1912×910, others ~1260×900). Combined with
// resizeMode="contain", this guarantees the whole image fits inside the tile,
// regardless of which JPG ships in apps/tablet/assets/themes/.
type Thumb = { src: number; aspectRatio: number };

// react-native-web 0.21 dropped Image.resolveAssetSource (only getSize/prefetch/
// queryCache remain), so calling it on web throws at module load and the whole
// ExpoRoot mount fails. Fall back to a uniform aspect ratio on web — combined
// with resizeMode="contain" below, the tile letterboxes any screenshot.
function resolveThumb(req: number): Thumb {
  if (Platform.OS !== 'web' && typeof Image.resolveAssetSource === 'function') {
    const meta = Image.resolveAssetSource(req) as { width?: number; height?: number } | null;
    const w = meta?.width  ?? 1260;
    const h = meta?.height ?? 900;
    return { src: req, aspectRatio: w / h };
  }
  return { src: req, aspectRatio: 1260 / 900 };
}

const THEME_THUMBS: Record<ThemeKey, Thumb> = {
  bistro:     resolveThumb(require('../../../assets/themes/1.jpg')),
  cafe:       resolveThumb(require('../../../assets/themes/2.jpg')),
  steakhouse: resolveThumb(require('../../../assets/themes/3.jpg')),
  sushi:      resolveThumb(require('../../../assets/themes/4.jpg')),
  burger:     resolveThumb(require('../../../assets/themes/5.jpg')),
  sage:       resolveThumb(require('../../../assets/themes/6.jpg')),
  neon:       resolveThumb(require('../../../assets/themes/7.jpg')),
  riviera:    resolveThumb(require('../../../assets/themes/8.jpg')),
  boba:       resolveThumb(require('../../../assets/themes/9.jpg')),
  lodge:      resolveThumb(require('../../../assets/themes/10.jpg')),
  speakeasy:  resolveThumb(require('../../../assets/themes/11.jpg')),
  diner:      resolveThumb(require('../../../assets/themes/12.jpg')),
};

const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
const COLUMN_OPTIONS: number[] = [2, 3, 4, 5, 6, 7, 8];

type ThemeShape = {
  theme_key?: string;
  columns?: number;
  storeLabel?: string;
  pickupLabel?: string;
};

function pickTheme(settings: unknown, tvId: string | null): ThemeShape {
  const root = (settings ?? {}) as Record<string, unknown>;
  const base = (root.theme ?? {}) as ThemeShape;
  if (!tvId) return base;
  const perTv = (root.per_tv ?? {}) as Record<string, { theme?: ThemeShape }>;
  const override = perTv[tvId]?.theme ?? {};
  return { ...base, ...override };
}

// pickup_flow drives whether the picker renders the 12-theme grid (two_stage)
// or the 8 ready-only layout grid (ready_only). Stored in workflow.pickup_flow.
function pickFlow(settings: unknown): PickupFlow {
  const root = (settings ?? {}) as Record<string, unknown>;
  const wf = (root.workflow ?? {}) as { pickup_flow?: PickupFlow };
  return wf.pickup_flow ?? 'ready_only';
}

function ftPillStyle(ft: string): { backgroundColor: string } {
  const map: Record<string, string> = {
    menu: T.color.ftMenu, pickup: T.color.ftPickup, event: T.color.ftEvent, ad: T.color.ftAd,
  };
  return { backgroundColor: map[ft] ?? T.color.t2 };
}

export default function ThemeSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ force?: string }>();
  const licenseKey = useAuthStore((s) => s.licenseKey);
  const loginMode  = useAuthStore((s) => s.loginMode);
  const engineerVisible = isEngineerMode(licenseKey);
  const { settings, isLoading, patch, isPatching } = useStoreSettings();
  const tvList = useQuery<TvInstanceRow[]>({
    queryKey: ['tv-instances'],
    queryFn:  () => api.get('/api/tv-instances'),
  });

  const [targetTvId, setTargetTvId] = useState<string | null>(null);
  const themeCfg = useMemo(() => pickTheme(settings, targetTvId), [settings, targetTvId]);
  const storedFlow = useMemo(() => pickFlow(settings), [settings]);
  // Engineer mode can toggle pickup_flow; non-engineer always follows stored flow.
  const pickupFlow: PickupFlow = engineerVisible && params.force === 'two_stage'
    ? 'two_stage'
    : storedFlow;

  const currentKey   = (themeCfg.theme_key as ThemeKey) || 'bistro';
  const currentCols  = (themeCfg.columns as number) || THEME_DEFAULT_COLUMNS[currentKey] || 2;

  const [storeLabel,  setStoreLabel]  = useState('');
  const [pickupLabel, setPickupLabel] = useState('');

  useEffect(() => {
    setStoreLabel(themeCfg.storeLabel   ?? '');
    setPickupLabel(themeCfg.pickupLabel ?? '');
  }, [themeCfg.storeLabel, themeCfg.pickupLabel]);

  // Save button enabled only when the local draft differs from the saved
  // settings — operator gets clear feedback that nothing's pending.
  const isLabelsDirty =
    storeLabel.trim()  !== (themeCfg.storeLabel  ?? '').trim() ||
    pickupLabel.trim() !== (themeCfg.pickupLabel ?? '').trim();

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>;
  }

  // Patch builder — TV-specific changes go under per_tv.{id}.theme.
  const patchTheme = (themePatch: ThemeShape) => {
    if (targetTvId) {
      patch({ per_tv: { [targetTvId]: { theme: themePatch } } } as unknown as Record<string, unknown>);
    } else {
      patch({ theme: themePatch } as unknown as Record<string, unknown>);
    }
  };

  const onPickTheme = (key: ThemeKey) => {
    // Auto-default columns to the theme's recommended count when user hasn't
    // explicitly set one yet. Preserves existing columns if user already changed it.
    const next: ThemeShape = { theme_key: key };
    if (!themeCfg.columns) next.columns = THEME_DEFAULT_COLUMNS[key];
    patchTheme(next);
  };
  const onPickColumns = (cols: number) => patchTheme({ columns: cols });
  const onSaveLabels  = () => patchTheme({ storeLabel: storeLabel.trim(), pickupLabel: pickupLabel.trim() });
  // Engineer-only: flip pickup_flow between ready_only and two_stage.
  const onChangeFlow  = (flow: PickupFlow) => {
    patch({ workflow: { pickup_flow: flow } } as unknown as Record<string, unknown>);
  };
  const onClearOverride = () => {
    if (!targetTvId) return;
    patch({ per_tv: { [targetTvId]: { theme: {} } } } as unknown as Record<string, unknown>);
  };

  // ready_only mode = single-screen pickup product. Hide menu/event/ad TV
  // instances left over from prior tests so the operator doesn't accidentally
  // apply a layout to a non-pickup TV that won't render it.
  const tvOptionsRaw = tvList.data ?? [];
  const tvOptions = loginMode === 'ready_only'
    ? tvOptionsRaw.filter((row) => row.instance.function_type === 'pickup')
    : tvOptionsRaw;

  const pageTitle = pickupFlow === 'ready_only' ? 'TV Display' : 'Brand Themes';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Ionicons name="chevron-back" size={20} color={T.color.t0} />
        <Text style={s.title}>{pageTitle}</Text>
        {engineerVisible && pickupFlow === 'two_stage' && (
          <View style={s.engBadge}><Text style={s.engBadgeText}>ENG</Text></View>
        )}
      </TouchableOpacity>

      {/* Workflow toggle — engineer only. Lets dev flip between ready_only and
          two_stage without leaving this screen. Hidden from non-engineer users. */}
      {engineerVisible && (
        <Section title="Workflow (engineer)">
          <View style={s.chipRow}>
            <TouchableOpacity
              style={[s.chip, storedFlow === 'ready_only' && s.chipActive]}
              onPress={() => onChangeFlow('ready_only')}
              disabled={isPatching}
            >
              <Text style={[s.chipText, storedFlow === 'ready_only' && s.chipTextActive]}>Ready Only (v1)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.chip, storedFlow === 'two_stage' && s.chipActive]}
              onPress={() => onChangeFlow('two_stage')}
              disabled={isPatching}
            >
              <Text style={[s.chipText, storedFlow === 'two_stage' && s.chipTextActive]}>Two-Stage (dev)</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.help}>
            v1 production: ready_only. two_stage is hidden from customer-facing settings
            and developed via this engineer panel.
          </Text>
        </Section>
      )}

      {/* TV target picker */}
      <Section title={`Apply to${tvOptions.length ? ` (${tvOptions.length} TVs registered)` : ''}`}>
        <TouchableOpacity
          style={[s.chip, targetTvId === null && s.chipActive, { alignSelf: 'flex-start' }]}
          onPress={() => setTargetTvId(null)}
          disabled={isPatching}
        >
          <Text style={[s.chipText, targetTvId === null && s.chipTextActive]}>All TVs (store default)</Text>
        </TouchableOpacity>

        {tvOptions.length > 0 && (
          <ScrollView style={s.tvList} nestedScrollEnabled>
            {tvOptions.map((row) => {
              const id     = row.instance.id;
              const ft     = row.instance.function_type;
              const name   = row.instance.display_name || `TV ${id.slice(0, 6)}`;
              const active = targetTvId === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[s.tvRow, active && s.tvRowActive]}
                  onPress={() => setTargetTvId(id)}
                  disabled={isPatching}
                >
                  <View style={[s.ftPill, ftPillStyle(ft)]}>
                    <Text style={s.ftPillText}>{ft}</Text>
                  </View>
                  <Text style={[s.tvRowName, active && s.tvRowNameActive]} numberOfLines={1}>{name}</Text>
                  <Text style={s.tvRowId}>{id.slice(0, 8)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {targetTvId && (
          <Text style={s.help}>
            Changes apply only to this TV. Empty fields fall back to store-wide.
            {' '}
            <Text onPress={onClearOverride} style={s.linkText}>Clear this TV's override</Text>
          </Text>
        )}
      </Section>

      {/* Theme tile picker — always shows the 12-theme grid (both ready_only and
          two_stage pickup modes use ThemedPickup). */}
      <Section title={`Brand Theme (${THEME_KEYS.length} themes)`}>
        <Text style={s.help}>
          Choose the visual theme for this TV. Both ready-only and two-stage pickup
          modes use the themed pickup screen — select a theme that matches your venue.
        </Text>
        <View style={s.tileGrid}>
          {THEME_KEYS.map((key) => {
            const th = THEMES[key];
            const active = currentKey === key;
            return (
              <TouchableOpacity
                key={key}
                style={[s.tile, active && s.tileActive]}
                onPress={() => onPickTheme(key)}
                disabled={isPatching}
              >
                <ThemePreview themeKey={key} />
                <View style={s.tileMeta}>
                  <Text style={s.tileName} numberOfLines={1}>{th.name}</Text>
                  <Text style={s.tileDesc} numberOfLines={2}>{th.desc}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {/* Columns picker */}
      <Section title={`Columns (recommended: ${THEME_DEFAULT_COLUMNS[currentKey]})`}>
        <View style={s.chipRow}>
          {COLUMN_OPTIONS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[s.chip, currentCols === c && s.chipActive]}
              onPress={() => onPickColumns(c)}
              disabled={isPatching}
            >
              <Text style={[s.chipText, currentCols === c && s.chipTextActive]}>{c} per side</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.help}>
          2 = public-facing waiting area (4m+ readable). 3 = balanced. 4 = staff/kitchen. 5–8 = ultra-dense (compact cards).
        </Text>
      </Section>

      {/* Store info (label + sublabel — independent from theme per README) */}
      <Section title="Store info">
        <Text style={s.help}>
          These show on the TV header. Independent of theme — change either without affecting the other.
        </Text>
        <LabeledInput label="Headline word"   value={storeLabel}  onChangeText={setStoreLabel}  placeholder="KITCHEN" />
        <LabeledInput label="Sublabel"        value={pickupLabel} onChangeText={setPickupLabel} placeholder="ORDER PICKUP" />
        <TouchableOpacity
          style={[s.saveBtn, (!isLabelsDirty || isPatching) && { opacity: 0.45 }]}
          onPress={onSaveLabels}
          disabled={!isLabelsDirty || isPatching}
        >
          {isPatching
            ? <ActivityIndicator color={T.color.t0} />
            : <Text style={s.saveText}>{isLabelsDirty ? 'Save labels' : 'Saved'}</Text>
          }
        </TouchableOpacity>
      </Section>
    </ScrollView>
  );
}


// Theme preview — real-screen JPG captured from /tv-view per theme. No synth.
// Per-image aspectRatio prevents cropping when screenshots have different
// dimensions (resizeMode "contain" is paired with matching ratio so the tile
// fits the picture exactly, no letterbox bars).
function ThemePreview({ themeKey }: { themeKey: ThemeKey }) {
  const thumb = THEME_THUMBS[themeKey];
  return (
    <Image
      source={thumb.src}
      style={[s.preview, { aspectRatio: thumb.aspectRatio }]}
      resizeMode="contain"
      accessibilityLabel={`${THEMES[themeKey].name} preview`}
    />
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

function LabeledInput({ label, value, onChangeText, placeholder }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={T.color.t2}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: T.color.bg1 },
  body:  { padding: T.sp[4], gap: T.sp[4] },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  back:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  title: { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },
  engBadge: { backgroundColor: T.color.warn + '33', borderColor: T.color.warn, borderWidth: 1,
              paddingHorizontal: 6, paddingVertical: 1, borderRadius: T.r.xs, marginLeft: T.sp[2] },
  engBadgeText: { color: T.color.warn, fontSize: 10, fontWeight: T.fw.bold, letterSpacing: 0.8 },

  section:      { gap: T.sp[2] },
  sectionTitle: { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  sectionBody:  { backgroundColor: T.color.bg2, borderRadius: T.r.md, borderWidth: 1, borderColor: T.color.border, padding: T.sp[3], gap: T.sp[3] },

  help: { color: T.color.t2, fontSize: T.fs.sm, lineHeight: 18 },
  linkText: { color: T.color.brand, fontWeight: T.fw.semibold },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip:    { borderWidth: 1, borderColor: T.color.border, borderRadius: T.r.full,
             paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], backgroundColor: T.color.bg3 },
  chipActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText:   { color: T.color.t1, fontSize: T.fs.sm },
  chipTextActive: { color: T.color.t0, fontWeight: T.fw.bold },

  tvList: { maxHeight: 220, borderWidth: 1, borderColor: T.color.border,
            borderRadius: T.r.sm, backgroundColor: T.color.bg3 },
  tvRow:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
            paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
            borderBottomWidth: 1, borderBottomColor: T.color.borderS },
  tvRowActive: { backgroundColor: T.color.brand + '22' },
  tvRowName:  { flex: 1, color: T.color.t1, fontSize: T.fs.sm },
  tvRowNameActive: { color: T.color.t0, fontWeight: T.fw.semibold },
  tvRowId:    { color: T.color.t2, fontSize: T.fs.xs, fontVariant: ['tabular-nums'] },
  ftPill:     { paddingHorizontal: T.sp[2], paddingVertical: 2, borderRadius: T.r.xs },
  ftPillText: { color: '#fff', fontSize: 10, fontWeight: T.fw.bold,
                textTransform: 'uppercase', letterSpacing: 1 },

  // Theme tiles — 2-column grid showing real-screen JPGs
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[3] },
  tile: {
    width: '48.5%',
    borderWidth: 2, borderColor: 'transparent',
    borderRadius: T.r.md, overflow: 'hidden',
    backgroundColor: T.color.bg3,
  },
  tileActive: { borderColor: T.color.brand },
  tileMeta: { padding: T.sp[3], gap: 2 },
  tileName: { color: T.color.t0, fontSize: T.fs.md, fontWeight: T.fw.bold },
  tileDesc: { color: T.color.t2, fontSize: T.fs.xs, lineHeight: 14 },

  // aspectRatio is supplied per-image by ThemePreview so each tile matches its
  // own JPG dimensions. Background colour shows through when contain mode
  // letterboxes (only happens if a future screenshot has a different ratio).
  preview: { width: '100%', backgroundColor: T.color.bg3 },

  field:      { gap: 4 },
  fieldLabel: { color: T.color.t1, fontSize: T.fs.sm },
  input:      { backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1, borderColor: T.color.border,
                paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], color: T.color.t0, fontSize: T.fs.md },

  saveBtn:    { backgroundColor: T.color.brand, borderRadius: T.r.md,
                paddingVertical: T.sp[3], alignItems: 'center' },
  saveText:   { color: T.color.t0, fontWeight: T.fw.bold, fontSize: T.fs.md },
});
