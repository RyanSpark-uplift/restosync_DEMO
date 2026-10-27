import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, Animated, StyleSheet, AccessibilityInfo,
} from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';
import type { Order } from '../store/tvStore';
import { useClock } from '../hooks/useClock';
import { usePickupPulse, type PulseInputCard } from '../hooks/usePickupPulse';
import IdleScreen from '../components/IdleScreen';
import NewsTicker from '../components/NewsTicker';
import ThemedPickup from './pickup/ThemedPickup';
import { resolvePickupTheme } from '../utils/pickupTheme';

let KeepAwake: typeof import('expo-keep-awake') | null = null;
try { KeepAwake = require('expo-keep-awake'); } catch { /* not available */ }

// ── Source badge colors (matches ANTI-M02 palette) ───────────────────────────
const SOURCE_COLOR: Record<string, string> = {
  pos:         '#2563eb',
  kiosk:       '#7c3aed',
  manual:      '#ea580c',
  grubhub:     '#dc2626',
  doordash:    '#7c3aed',
  ubereats:    '#16a34a',
  fantuan:     '#0891b2',
  hungrypanda: '#d97706',
};

function sourceColor(src: string): string {
  return SOURCE_COLOR[src] ?? '#475569';
}

// Mix two hex colors. ratio 0..1 — 0=base, 1=tint. Used for tinted column backgrounds
// (mirrors color-mix() in tv-view.html CSS). Hex must be #RRGGBB.
function tintMix(tint: string, base: string, ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  const ht = tint.replace('#', ''); const hb = base.replace('#', '');
  if (ht.length !== 6 || hb.length !== 6) return base;
  const tn = parseInt(ht, 16); const bn = parseInt(hb, 16);
  const tr = (tn >> 16) & 0xff, tg = (tn >> 8) & 0xff, tb = tn & 0xff;
  const br = (bn >> 16) & 0xff, bg = (bn >> 8) & 0xff, bb = bn & 0xff;
  const mr = Math.round(tr * r + br * (1 - r));
  const mg = Math.round(tg * r + bg * (1 - r));
  const mb = Math.round(tb * r + bb * (1 - r));
  return '#' + [mr, mg, mb].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

// Compute the "About X-Y min" remaining range from estimated_prep_minutes (set at
// order create by aiPrepTime.ts) - elapsed minutes since created_at. Uses
// rangeBufferMin from store settings so the displayed range matches what the
// operator configured.
function etaRange(order: Order, rangeBufferMin: number): string | null {
  if (!order.estimated_prep_minutes || !order.created_at) return null;
  const elapsedMin = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000);
  const remaining = order.estimated_prep_minutes - elapsedMin;
  if (remaining <= 0) return 'Almost ready';
  const lo = Math.max(1, remaining - rangeBufferMin);
  const hi = remaining + rangeBufferMin;
  if (lo === hi) return `~${lo} min`;
  return `${lo}-${hi} min`;
}

type CardStyle = 'rounded' | 'square' | 'minimal' | 'glass';

function cardStyleOverride(style: CardStyle): Record<string, unknown> {
  switch (style) {
    case 'square':  return { borderRadius: 0 };
    case 'minimal': return { borderRadius: 0, backgroundColor: 'transparent' };
    case 'glass':   return { borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' };
    case 'rounded':
    default:        return { borderRadius: 16 };
  }
}

// ── OrderCard ─────────────────────────────────────────────────────────────────
function OrderCard({ order, isReady, isFresh, reduceMotion, etaBufferMin = 3,
  primaryColor, accentColor, cardStyle = 'rounded' }: {
  order: Order; isReady: boolean; isFresh: boolean; reduceMotion: boolean; etaBufferMin?: number;
  primaryColor?: string; accentColor?: string; cardStyle?: CardStyle;
}) {
  const flashAnim = useRef(new Animated.Value(1)).current;
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);

  const isRush      = order.priority === 'rush';
  const isScheduled = order.priority === 'scheduled' || order.status === 'scheduled';
  const isCatering  = order.priority === 'catering';

  useEffect(() => {
    // Fresh pulse (1s wave 1.0↔0.35) wins over ready/rush flash so a newly
    // arrived card always announces itself for the configured window.
    if (!reduceMotion && isFresh) {
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.35, duration: 500, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ]),
      );
      animRef.current.start();
    } else if (!reduceMotion && isRush) {
      // Rush orders keep flashing indefinitely to draw attention.
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.5, duration: 400, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 1,   duration: 400, useNativeDriver: true }),
        ]),
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
      flashAnim.setValue(1);
    }
    return () => { animRef.current?.stop(); };
  }, [isFresh, isRush, reduceMotion, flashAnim]);

  const sc = sourceColor(order.source);
  const csOverride = cardStyleOverride(cardStyle);
  // primary_color drives a coordinated palette (mirrors the color-mix() rules in
  // tv-view.html). One pick produces card bg + border + number color together so
  // operators don't have to fine-tune each layer. Unset → legacy emerald defaults.
  const readyTint = isReady && primaryColor
    ? { backgroundColor: tintMix(primaryColor, '#052e16', 0.22),
        borderLeftColor: primaryColor }
    : null;
  const prepTint = !isReady && primaryColor
    ? { backgroundColor: tintMix(primaryColor, '#0f172a', 0.14),
        borderLeftColor: tintMix(primaryColor, '#334155', 0.6) }
    : null;
  const readyNumTint = isReady && primaryColor
    ? { color: tintMix(primaryColor, '#ffffff', 0.4) }
    : null;

  return (
    <Animated.View style={[
      s.card,
      isReady ? s.cardReady : s.cardPrep,
      isRush      && s.cardRush,
      isCatering  && s.cardCatering,
      isScheduled && s.cardScheduled,
      csOverride,
      readyTint,
      prepTint,
      !reduceMotion && (isFresh || isRush) && { opacity: flashAnim },
    ]}>
      <View style={s.cardLeft}>
        <Text
          style={[s.cardNum, isReady && s.cardNumReady, readyNumTint]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.4}
        >
          {order.display_number}
        </Text>
        <View style={s.badges}>
          {isRush      && <View style={[s.badge, s.badgePriorityRush]}><Text style={s.badgeText}>RUSH</Text></View>}
          {isScheduled && <View style={[s.badge, s.badgePriorityScheduled]}><Text style={s.badgeText}>⏰ SCHEDULED</Text></View>}
          {isCatering  && <View style={[s.badge, s.badgePriorityCatering]}><Text style={s.badgeText}>📦 CATERING</Text></View>}
          <View style={[s.badge, { backgroundColor: sc }]}>
            <Text style={s.badgeText}>{order.source.toUpperCase()}</Text>
          </View>
          {order.customer_name ? (
            <View style={[s.badge, s.badgeName]}>
              <Text style={s.badgeText}>{order.customer_name}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.cardMetaRow}>
          <Text style={s.cardTime}>{timeAgo(order.created_at)}</Text>
          {!isReady && (() => {
            const eta = etaRange(order, etaBufferMin);
            return eta
              ? <Text style={[s.cardEta, accentColor ? { color: accentColor } : null]}>{eta}</Text>
              : null;
          })()}
        </View>
      </View>
      <Text style={s.cardEmoji}>{isRush ? '🔥' : isReady ? '✅' : '🍳'}</Text>
    </Animated.View>
  );
}

// Sort helper — rush first, then newest-first by created_at. The display shows
// the freshest manual entries at the top so staff never miss a just-typed
// number. Rush still pinned ahead of normal per spec sec.18.2.
function rushPinnedSort(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const ra = a.priority === 'rush' ? 0 : 1;
    const rb = b.priority === 'rush' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return b.created_at.localeCompare(a.created_at);
  });
}

// ── Read a setting path safely from the opaque storeSettings blob ────────────
// When tvId is provided, store_settings.per_tv[tvId] overrides win over store-wide
// values (mirrors resolveTvSettings() in packages/shared/storeSettings.ts).
function readSetting<T>(blob: unknown, path: string, fallback: T, tvId?: string | null): T {
  const segs = path.split('.');
  if (tvId && blob && typeof blob === 'object') {
    const perTv = (blob as Record<string, unknown>).per_tv as Record<string, unknown> | undefined;
    const ov = pickPath(perTv?.[tvId], segs);
    if (ov !== undefined && ov !== null) return ov as T;
  }
  const v = pickPath(blob, segs);
  return (v === undefined || v === null ? fallback : v) as T;
}
function pickPath(obj: unknown, segs: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of segs) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SingleVenuePickupScreen() {
  const { preparing, expediting, ready, remaking, tvRow, storeSettings, wsStatus, recallFlash } = useTVStore();
  const clock = useClock();
  const tvId = tvRow?.instance.id ?? null;

  // Spec sec.6.2 + sec.7.4 — accessibility:
  // - high_contrast theme swaps to AAA-contrast palette.
  // - prefers-reduced-motion disables pulse animations.
  const themeMode = readSetting<'dark' | 'light' | 'high_contrast'>(storeSettings, 'theme.mode', 'dark', tvId);
  const isHC = themeMode === 'high_contrast';
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => sub.remove();
  }, []);
  const animsEnabledSetting = readSetting<boolean>(storeSettings, 'display.animations_enabled', true, tvId);
  const reduceMotion = systemReduceMotion || animsEnabledSetting === false;
  const etaBufferMin = readSetting<number>(storeSettings, 'ai.range_buffer_minutes', 3, tvId);

  // Per-TV theme overrides (store-wide if not pinned). Empty string falls back to legacy hardcoded color.
  const primaryColor = readSetting<string>(storeSettings, 'theme.primary_color', '', tvId);
  const accentColor  = readSetting<string>(storeSettings, 'theme.accent_color',  '', tvId);
  const cardStyle    = readSetting<CardStyle>(storeSettings, 'theme.card_style', 'rounded', tvId);

  // Bucket-arrival pulse — new arrivals + prep→ready transitions both pulse.
  const pulseSec = readSetting<number>(storeSettings, 'display.new_order_pulse_seconds', 5, tvId);
  const pulseInputs = useMemo<PulseInputCard[]>(
    () => [
      ...preparing.map((o) => ({ id: o.id, bucket: 'prep' as const })),
      ...remaking.map((o) => ({ id: o.id, bucket: 'prep' as const })),
      ...expediting.map((o) => ({ id: o.id, bucket: 'prep' as const })),
      ...ready.map((o) => ({ id: o.id, bucket: 'ready' as const })),
    ],
    [preparing, remaking, expediting, ready],
  );
  const pulseMap = usePickupPulse(pulseInputs, pulseSec);
  // Fresh-pulse OR an active recall-flash window both make a card flash.
  const isCardFresh = (id: string) =>
    (pulseMap.get(id) ?? 0) > Date.now() || (recallFlash[id] ?? 0) > Date.now();

  // Spec sec.10 workflow.expedite_enabled — show the 3rd column only when configured.
  const expediteEnabled = readSetting<boolean>(storeSettings, 'workflow.expedite_enabled', false, tvId);
  // Pickup flow — 'ready_only' hides the preparing column entirely. Default 'ready_only'
  // matches packages/shared/storeSettings.ts defaultStoreSettings().
  const pickupFlow = readSetting<'two_stage' | 'ready_only'>(
    storeSettings, 'workflow.pickup_flow', 'ready_only', tvId,
  );
  const readyOnly = pickupFlow === 'ready_only';

  // Newest-first sort: sort ready orders by ready_at (most accurate for "just
  // marked ready"), falling back to created_at. Used by both the ThemedPickup
  // and legacy emerald render paths.
  const readySorted = useMemo(() => {
    const stamp = (o: Order) => o.ready_at ?? o.created_at;
    return [...ready].sort((a, b) => stamp(b).localeCompare(stamp(a)));
  }, [ready]);

  // Phase 2 — 12-theme handoff. When storeSettings.theme.theme_key is one of the
  // 12 keys, route to ThemedPickup. Otherwise fall through to the legacy emerald
  // render below so existing stores keep their current look.
  const themeBlob = readSetting<Record<string, unknown> | null>(storeSettings, 'theme', null, tvId);
  const resolvedTheme = resolvePickupTheme(themeBlob);

  // Activate keep-awake on mount
  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync().catch(() => {});
    return () => { KeepAwake?.deactivateKeepAwake(); };
  }, []);

  // Page rotation settings — read per-TV overrides, fall back to store-wide defaults.
  const pageIntervalSec = readSetting<number>(storeSettings, 'display.pickup_page_interval_seconds', 6, tvId);
  const cardsPerPage    = readSetting<number>(storeSettings, 'display.cards_per_page', 8, tvId);

  // Full sorted lists — pagination is now handled by ThemedPickup's Side component
  // (and the legacy columns below use cardsPerPage for their own slices).
  // rushPinnedSort keeps rush at top regardless of age. Remaking orders surface in
  // PREPARING — they're a kitchen redo, not a separate state for staff to track.
  const displayPrep      = rushPinnedSort([...preparing, ...remaking]);
  const displayExpedite  = rushPinnedSort(expediting);
  const displayReady     = rushPinnedSort(readySorted);

  const screenName = tvRow?.instance.display_name ?? 'KITCHEN';
  const totalActive = preparing.length + remaking.length + expediting.length + ready.length;
  const idleMode = readSetting<'welcome' | 'menu' | 'promo' | 'sns' | 'custom'>(
    storeSettings, 'display.idle_screen_mode', 'welcome', tvId);
  const footerMsg = readSetting<string>(storeSettings, 'theme.footer_message', '', tvId);
  const tickerEnabled = readSetting<boolean>(storeSettings, 'multi_zone.ticker_enabled', false, tvId);
  const tickerText    = readSetting<string>(storeSettings, 'multi_zone.ticker_text', '', tvId);
  const tickerSpeed   = readSetting<'slow' | 'medium' | 'fast'>(storeSettings, 'multi_zone.ticker_speed', 'medium', tvId);

  // Themed (12-theme) render path — bypass legacy emerald entirely.
  if (resolvedTheme.mode === 'themed') {
    return (
      <ThemedPickup
        resolved={resolvedTheme as Parameters<typeof ThemedPickup>[0]['resolved']}
        preparing={displayPrep}
        ready={displayReady}
        expediting={displayExpedite}
        expediteEnabled={expediteEnabled}
        readyOnly={readyOnly}
        totalActive={totalActive}
        clock={clock}
        wsStatus={wsStatus}
        storeIdShort={tvRow?.instance.store_id?.slice(0, 8) ?? ''}
        footerMsg={footerMsg}
        reduceMotion={reduceMotion}
        etaBufferMin={etaBufferMin}
        isCardFresh={isCardFresh}
        pageIntervalSec={pageIntervalSec}
        cardsPerPage={cardsPerPage}
      />
    );
  }

  // Inline style overrides — applied next to existing static styles so unconfigured
  // stores look identical to before (empty string short-circuits each override).
  // Layered tint ratios match tv-view.html color-mix() rules: header / cols / cards
  // all derive from a single primaryColor for visual coherence.
  const headerTint        = primaryColor ? { borderBottomColor: primaryColor } : null;
  const brandTint         = primaryColor ? { color: primaryColor } : null;
  const colPrepTint       = primaryColor ? { backgroundColor: tintMix(primaryColor, '#1e293b', 0.18) } : null;
  const colHeaderPrepTint = primaryColor ? { borderBottomColor: tintMix(primaryColor, '#334155', 0.6) } : null;
  const colReadyTint      = primaryColor ? { backgroundColor: tintMix(primaryColor, '#052e16', 0.3) } : null;
  const colHeaderReadyTint = primaryColor ? { borderBottomColor: primaryColor } : null;

  // Spec sec.12.5 — when there are 0 active orders, show the idle screen.
  if (totalActive === 0) {
    return (
      <View style={s.root}>
        <View style={[s.header, headerTint]}>
          <View style={s.headerLeft}>
            <Text style={[s.restaurantName, brandTint]}>{screenName.toUpperCase()}</Text>
            <Text style={s.headerTitle}>ORDER PICKUP</Text>
          </View>
          <Text style={s.clock}>{clock}</Text>
        </View>
        <IdleScreen
          storeName={screenName}
          mode={idleMode}
          footerMessage={footerMsg}
        />
        <View style={s.footer}>
          <Text style={s.footerMsg} numberOfLines={1}>{footerMsg}</Text>
          <View style={s.footerRight}>
            <Text style={s.footerMeta}>v0.1.0 · {tvRow?.instance.id?.slice(0, 8) ?? '—'}</Text>
            <View style={[s.connectionDot, { backgroundColor: wsStatus === 'connected' ? '#10B981' : '#EF4444' }]} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, isHC && s.rootHC]}>
      {/* Header */}
      <View style={[s.header, headerTint]}>
        <View style={s.headerLeft}>
          <Text style={[s.restaurantName, brandTint]}>{screenName.toUpperCase()}</Text>
          <Text style={s.headerTitle}>ORDER PICKUP</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.activeCount}>
            Active: <Text style={s.activeNum}>{totalActive}</Text>
          </Text>
          <Text style={s.clock}>{clock}</Text>
        </View>
      </View>

      {/* Offline banner — spec sec.13 */}
      {wsStatus !== 'connected' && (
        <View style={[s.offlineBanner, wsStatus === 'disconnected' && s.offlineBannerDisc]}>
          <Text style={s.offlineBannerText}>
            {wsStatus === 'connecting'
              ? '⏳  Reconnecting…'
              : `⚠  Disconnected — last update ${clock}`}
          </Text>
        </View>
      )}

      {/* News ticker — spec sec.24.2 */}
      {tickerEnabled && tickerText ? <NewsTicker text={tickerText} speed={tickerSpeed} /> : null}

      {/* Columns */}
      <View style={s.columns}>
        {/* PREPARING — hidden in ready_only flow (manual entries skip prep entirely) */}
        {!readyOnly && (
          <View style={[s.col, s.colPrep, colPrepTint]}>
            <View style={[s.colHeader, s.colHeaderPrep, colHeaderPrepTint]}>
              <Text style={s.colTitle}>🕐  PREPARING</Text>
              <View style={s.countBadge}><Text style={s.countText}>{preparing.length}</Text></View>
            </View>
            {displayPrep.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🍽</Text>
                <Text style={s.emptyText}>No orders preparing</Text>
              </View>
            ) : (
              <FlatList
                data={displayPrep}
                keyExtractor={(o) => o.id}
                renderItem={({ item }) => <OrderCard order={item} isReady={false} isFresh={isCardFresh(item.id)} reduceMotion={reduceMotion} etaBufferMin={etaBufferMin} primaryColor={primaryColor} accentColor={accentColor} cardStyle={cardStyle} />}
                contentContainerStyle={s.cardList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {/* EXPEDITING — only when workflow.expedite_enabled */}
        {expediteEnabled && (
          <View style={[s.col, s.colExpedite]}>
            <View style={[s.colHeader, s.colHeaderExpedite]}>
              <Text style={s.colTitle}>⚡  EXPEDITING</Text>
              <View style={[s.countBadge, s.countBadgeExpedite]}>
                <Text style={s.countText}>{expediting.length}</Text>
              </View>
            </View>
            {displayExpedite.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>⏳</Text>
                <Text style={s.emptyText}>Awaiting expedite</Text>
              </View>
            ) : (
              <FlatList
                data={displayExpedite}
                keyExtractor={(o) => o.id}
                renderItem={({ item }) => <OrderCard order={item} isReady={false} isFresh={isCardFresh(item.id)} reduceMotion={reduceMotion} etaBufferMin={etaBufferMin} primaryColor={primaryColor} accentColor={accentColor} cardStyle={cardStyle} />}
                contentContainerStyle={s.cardList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {/* READY */}
        <View style={[s.col, s.colReady, colReadyTint]}>
          <View style={[s.colHeader, s.colHeaderReady, colHeaderReadyTint]}>
            <Text style={s.colTitle}>✅  READY FOR PICKUP</Text>
            <View style={[s.countBadge, s.countBadgeReady]}><Text style={s.countText}>{ready.length}</Text></View>
          </View>
          {displayReady.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>🍽</Text>
              <Text style={s.emptyText}>No orders ready yet</Text>
            </View>
          ) : (
            <FlatList
              data={displayReady}
              keyExtractor={(o) => o.id}
              renderItem={({ item }) => <OrderCard order={item} isReady isFresh={isCardFresh(item.id)} reduceMotion={reduceMotion} primaryColor={primaryColor} accentColor={accentColor} cardStyle={cardStyle} />}
              contentContainerStyle={s.cardList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>

      {/* Footer — spec sec.4.6 */}
      <View style={s.footer}>
        <Text style={s.footerMsg} numberOfLines={1}>
          {footerMsg}
        </Text>
        <View style={s.footerRight}>
          <Text style={s.footerMeta}>v0.1.0 · {tvRow?.instance.id?.slice(0, 8) ?? '—'}</Text>
          <View style={[s.connectionDot, { backgroundColor: wsStatus === 'connected' ? '#10B981' : '#EF4444' }]} />
        </View>
      </View>
    </View>
  );
}

const HEADER_H = 86;

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#0f172a' },
  // Spec sec.6.2 — high-contrast variant for accessibility / sunlight readability.
  rootHC:     { backgroundColor: '#000000' },

  // Header
  header:     { height: HEADER_H, flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', paddingHorizontal: 48,
                backgroundColor: '#0a0f1e', borderBottomWidth: 3, borderBottomColor: T.color.brand },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  restaurantName: { fontSize: 28, fontWeight: T.fw.bold, color: T.color.brand, letterSpacing: 1 },
  headerTitle:{ fontSize: 20, fontWeight: T.fw.semibold, color: T.color.t1,
                textTransform: 'uppercase', letterSpacing: 3 },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: 40 },
  activeCount:{ fontSize: 20, color: T.color.t1 },
  activeNum:  { color: '#34d399', fontWeight: T.fw.bold, fontSize: 26 },
  clock:      { fontSize: 30, fontWeight: T.fw.semibold, color: T.color.t0,
                fontVariant: ['tabular-nums'] },

  // Columns
  columns:    { flex: 1, flexDirection: 'row' },
  col:        { flex: 1, padding: 24 },
  colPrep:    { backgroundColor: '#1e293b', borderRightWidth: 2, borderRightColor: '#0f172a' },
  colExpedite:{ backgroundColor: '#422006', borderRightWidth: 2, borderRightColor: '#0f172a' },
  colReady:   { backgroundColor: '#14532d' },
  colHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingBottom: 18, borderBottomWidth: 2, marginBottom: 18 },
  colHeaderPrep:    { borderBottomColor: '#334155' },
  colHeaderExpedite:{ borderBottomColor: '#92400e' },
  colHeaderReady:   { borderBottomColor: '#15803d' },
  colTitle:   { fontSize: 24, fontWeight: T.fw.bold, textTransform: 'uppercase',
                letterSpacing: 2, color: T.color.t0 },
  countBadge: { backgroundColor: '#0f172a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  countBadgeExpedite: { backgroundColor: '#451a03' },
  countBadgeReady:    { backgroundColor: '#052e16' },
  countText:  { fontSize: 17, fontWeight: T.fw.semibold, color: T.color.t1 },
  cardList:   { gap: 8 },

  // Order card — compact: 8 cards + header/footer must fit a 1080p column.
  card: {
    backgroundColor: '#0f172a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    borderLeftWidth: 6, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', minHeight: 72,
  },
  cardPrep:   { borderLeftColor: '#334155' },
  cardReady:  { backgroundColor: '#052e16', borderLeftColor: '#15803d' },
  cardRush:      { borderWidth: 3, borderColor: '#EF4444', borderLeftWidth: 6, borderLeftColor: '#EF4444' },
  cardScheduled: { opacity: 0.55, borderLeftColor: '#94a3b8' },
  cardCatering:  { borderLeftWidth: 8, borderLeftColor: '#F59E0B' },
  cardLeft:   { gap: 4, flexShrink: 1 },
  cardNum:    { fontSize: 52, fontWeight: '900', color: T.color.t0, lineHeight: 56 },
  cardNumReady: { color: '#4ade80' },
  badges:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:      { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 },
  badgeName:  { backgroundColor: '#475569' },
  badgePriorityRush:      { backgroundColor: '#EF4444' },
  badgePriorityScheduled: { backgroundColor: '#475569' },
  badgePriorityCatering:  { backgroundColor: '#F59E0B' },
  badgeText:  { fontSize: 12, fontWeight: T.fw.bold, color: T.color.t0,
                textTransform: 'uppercase', letterSpacing: 1 },
  cardMetaRow:{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  cardTime:   { fontSize: 13, color: T.color.t1 },
  cardEta:    { fontSize: 13, color: '#FCD34D', fontWeight: T.fw.semibold,
                fontVariant: ['tabular-nums'] },
  cardEmoji:  { fontSize: 36 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.4 },
  emptyIcon:  { fontSize: 64 },
  emptyText:  { fontSize: 22, color: T.color.t1 },

  // Offline banner (spec sec.13)
  offlineBanner:     {
    paddingVertical: 6, paddingHorizontal: 24, backgroundColor: '#451a03',
    borderBottomWidth: 1, borderBottomColor: '#92400e',
  },
  offlineBannerDisc: { backgroundColor: '#7f1d1d', borderBottomColor: '#dc2626' },
  offlineBannerText: { color: '#fef3c7', fontSize: 14, fontWeight: T.fw.semibold },

  // Footer (spec sec.4.6)
  footer: {
    height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, backgroundColor: '#0a0f1e', borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  footerMsg:  { fontSize: 14, color: T.color.t1, flex: 1, marginRight: 16 },
  footerRight:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerMeta: { fontSize: 12, color: T.color.t1, fontVariant: ['tabular-nums'] },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
});
