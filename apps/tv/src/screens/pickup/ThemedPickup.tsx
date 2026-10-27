// Themed pickup board — renders one of the 12 themes from packages/shared/themes.ts.
// Mounted only when storeSettings.theme.theme_key resolves to a known theme.
// Otherwise SingleVenuePickupScreen keeps its legacy emerald layout.
//
// This is not a pixel-perfect port of the DevGuide/Theme prototype — it covers
// the design tokens that actually affect what an operator sees on the TV:
// surfaces, text, accents, source palette, ready overrides, card scale, and
// fontDisplay. Subtle web-only details (letter-spacing tuning, underline
// flourishes, exact section icon glyphs) will be tightened in follow-up rounds.
//
// Inputs are pre-computed by the parent so this component stays pure render.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import {
  type Theme,
  type SourceKey,
  normalizeSource,
  isLightHex,
} from '@restosync/shared';
import type { ResolvedPickupTheme } from '../../utils/pickupTheme';
import type { Order } from '../../store/tvStore';
import { resolveThemeFonts } from '../../utils/themeFonts';

export interface ThemedPickupProps {
  resolved: ResolvedPickupTheme & { mode: 'themed' };
  preparing: Order[];
  ready: Order[];
  expediting: Order[];
  expediteEnabled: boolean;
  /** Hide the PREPARING column entirely. Mirrors workflow.pickup_flow === 'ready_only'. */
  readyOnly?: boolean;
  totalActive: number;
  clock: string;
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  storeIdShort: string;
  footerMsg: string;
  reduceMotion: boolean;
  etaBufferMin: number;
  /** True while the card is within display.new_order_pulse_seconds of arriving in its current bucket. */
  isCardFresh?: (id: string) => boolean;
  /** Seconds each page is shown before auto-advancing. 0 or ≤0 disables rotation. Default 6. */
  pageIntervalSec?: number;
  /** Max cards shown per column page. Default 8. */
  cardsPerPage?: number;
}

export default function ThemedPickup(props: ThemedPickupProps) {
  const { resolved } = props;
  // After the type guard above we know theme + readyTheme are populated.
  const theme = resolved.theme as Theme;
  const readyTheme = resolved.readyTheme as Theme;
  const scale = resolved.scale!;
  const columns = resolved.columns!;

  const fonts = useMemo(() => resolveThemeFonts(theme), [theme]);
  const readyFonts = useMemo(() => resolveThemeFonts(readyTheme), [readyTheme]);

  // Source tag + employee chip use bodyBold (700) by handoff spec.
  const isCardFresh = props.isCardFresh ?? (() => false);
  const pageIntervalSec = props.pageIntervalSec ?? 6;
  const cardsPerPage    = props.cardsPerPage    ?? 8;

  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      {/* TopBar */}
      <View style={[s.header, { backgroundColor: theme.bg, borderBottomColor: theme.cardBorder }]}>
        <View style={s.headerLeft}>
          <View style={[
            s.pickupPill,
            { backgroundColor: theme.storeChipBg, borderRadius: theme.minimal ? 0 : 999 },
          ]}>
            <Text style={[
              s.pickupPillText,
              { color: theme.storeChipFg, fontFamily: fonts.body },
            ]} numberOfLines={1}>PICKUP</Text>
          </View>
          <Text style={[s.storeIdText, { color: theme.textDim }]} numberOfLines={1}>store:{props.storeIdShort}</Text>
        </View>

        <View style={s.headerRight}>
          <View style={s.headerLabels}>
            <Text
              style={[
                s.storeLabel,
                {
                  color: theme.headTeal,
                  fontFamily: fonts.displayHead,
                  fontWeight: String(theme.weightHead) as TextStyle['fontWeight'],
                },
                theme.underline ? s.underline : null,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >{props.resolved.storeLabel}</Text>
            <Text
              style={[
                s.pickupLabel,
                { color: theme.textDim, fontFamily: fonts.body },
              ]}
              numberOfLines={1}
            >{props.resolved.pickupLabel?.toUpperCase()}</Text>
          </View>

          <View style={s.activeCluster}>
            <Text style={[s.activeLabel, { color: theme.textDim }]}>Active:</Text>
            <Text style={[
              s.activeNum,
              { color: theme.activeColor, fontFamily: fonts.bodyBold },
            ]}>{props.totalActive}</Text>
          </View>

          <Text style={[
            s.clock,
            { color: theme.text, fontFamily: fonts.body },
          ]}>{props.clock}</Text>

          <View style={s.liveCluster}>
            <Text style={[s.liveText, { color: theme.textDim }]}>live</Text>
            <View style={[
              s.liveDot,
              props.wsStatus !== 'connected' && { backgroundColor: '#9ca3af', shadowOpacity: 0 },
            ]} />
          </View>
        </View>
      </View>

      {/* Sides */}
      <View style={s.sides}>
        {!props.readyOnly && (
          <Side
            kind="prep"
            theme={theme}
            fonts={fonts}
            scale={scale}
            columns={columns}
            orders={props.preparing}
            count={props.preparing.length}
            reduceMotion={props.reduceMotion}
            etaBufferMin={props.etaBufferMin}
            isCardFresh={isCardFresh}
            pageIntervalSec={pageIntervalSec}
            cardsPerPage={cardsPerPage}
          />
        )}
        {props.expediteEnabled && (
          <Side
            kind="prep"
            label="EXPEDITING"
            theme={theme}
            fonts={fonts}
            scale={scale}
            columns={columns}
            orders={props.expediting}
            count={props.expediting.length}
            reduceMotion={props.reduceMotion}
            etaBufferMin={props.etaBufferMin}
            isCardFresh={isCardFresh}
            pageIntervalSec={pageIntervalSec}
            cardsPerPage={cardsPerPage}
          />
        )}
        <Side
          kind="ready"
          theme={readyTheme}
          fonts={readyFonts}
          scale={scale}
          columns={columns}
          orders={props.ready}
          count={props.ready.length}
          reduceMotion={props.reduceMotion}
          etaBufferMin={props.etaBufferMin}
          isCardFresh={isCardFresh}
          pageIntervalSec={pageIntervalSec}
          cardsPerPage={cardsPerPage}
        />
      </View>

      {/* Footer — kept minimal so the themed surface stays in control of the bottom edge. */}
      {props.footerMsg ? (
        <View style={[s.footer, { backgroundColor: theme.bg, borderTopColor: theme.cardBorder }]}>
          <Text style={[s.footerText, { color: theme.textDim, fontFamily: fonts.body }]} numberOfLines={1}>
            {props.footerMsg}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Side ──────────────────────────────────────────────────────────────────────

interface SideProps {
  kind: 'prep' | 'ready';
  label?: string;
  theme: Theme;
  fonts: ReturnType<typeof resolveThemeFonts>;
  scale: NonNullable<ResolvedPickupTheme['scale']>;
  columns: number;
  orders: Order[];
  count: number;
  reduceMotion: boolean;
  etaBufferMin: number;
  isCardFresh: (id: string) => boolean;
  pageIntervalSec: number;
  cardsPerPage: number;
}

function Side(props: SideProps) {
  const { kind, theme, fonts, scale, columns, orders, count, reduceMotion, etaBufferMin, isCardFresh, pageIntervalSec, cardsPerPage } = props;
  const isReady = kind === 'ready';
  const sideBg = isReady ? theme.bgReady : theme.bg;
  const title = props.label ?? (isReady ? 'READY FOR PICKUP' : 'PREPARING');

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageSize  = cardsPerPage > 0 ? cardsPerPage : (orders.length || 1);
  const pageCount = Math.max(1, Math.ceil(orders.length / pageSize));
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    if (pageCount <= 1 || pageIntervalSec <= 0) {
      setPageIdx(0);
      return;
    }
    const id = setInterval(() => setPageIdx((i) => (i + 1) % pageCount), pageIntervalSec * 1000);
    return () => clearInterval(id);
  }, [pageCount, pageIntervalSec]);

  // Guard against page index going out of bounds when list shrinks.
  const effectivePage = pageIdx % pageCount;
  const pageData = orders.slice(effectivePage * pageSize, effectivePage * pageSize + pageSize);

  // ── Resolution-adaptive area measurement ─────────────────────────────────
  const [area, setArea] = useState({ w: 0, h: 0 });

  // Count pill: ready uses transparent + accent border + accent fg.
  // Prep uses subtle dark fill matching the design's rgba(255,255,255,0.05) hint.
  const countPillStyle: ViewStyle = isReady
    ? { backgroundColor: 'transparent', borderColor: theme.accentReady, borderWidth: 1.5 }
    : { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1 };
  const countPillText: TextStyle = {
    color: isReady ? theme.accentReady : theme.textDim,
    fontFamily: fonts.bodyBold,
  };

  // ── Grid computation (only when area is known) ────────────────────────────
  let gridContent: React.ReactNode = null;

  if (orders.length === 0) {
    gridContent = (
      <View style={s.empty}>
        <Text style={[s.emptyText, { color: theme.textDim, fontFamily: fonts.body }]}>
          {isReady ? 'No orders ready yet' : 'No orders preparing'}
        </Text>
      </View>
    );
  } else if (area.w > 0 && area.h > 0) {
    // Card size is fixed by the configured capacity (cards_per_page) and the
    // theme's column count — NOT by how many cards are currently on the page.
    // A single ready card stays the same size it would be in a full grid and
    // sits top-left, instead of stretching to fill the whole screen.
    const capacity = Math.max(1, pageSize);
    const gridCols = Math.max(1, Math.min(columns, capacity));
    const gridRows = Math.max(1, Math.ceil(capacity / gridCols));
    const gap = Math.max(6, Math.round(Math.min(area.w, area.h) * 0.02));
    const cellW = (area.w - gap * (gridCols - 1)) / gridCols;
    const cellH = (area.h - gap * (gridRows - 1)) / gridRows;

    // Lay the actual cards left-to-right, top-to-bottom into the fixed grid.
    // Only occupied rows render; trailing empty slots stay blank (top-aligned).
    const renderedRows = Math.max(1, Math.ceil(pageData.length / gridCols));
    const rowChunks: Order[][] = [];
    for (let r = 0; r < renderedRows; r++) {
      rowChunks.push(pageData.slice(r * gridCols, r * gridCols + gridCols));
    }

    gridContent = (
      <View style={{ flexDirection: 'column' }}>
        {rowChunks.map((rowCards, rowIdx) => (
          <View
            key={rowIdx}
            style={{
              flexDirection: 'row',
              marginBottom: rowIdx < renderedRows - 1 ? gap : 0,
            }}
          >
            {rowCards.map((item, colIdx) => (
              <View
                key={item.id}
                style={{
                  width: cellW,
                  height: cellH,
                  marginRight: colIdx < rowCards.length - 1 ? gap : 0,
                }}
              >
                <OrderCard
                  order={item}
                  isReady={isReady}
                  theme={theme}
                  fonts={fonts}
                  w={cellW}
                  h={cellH}
                  reduceMotion={reduceMotion}
                  etaBufferMin={etaBufferMin}
                  isFresh={isCardFresh(item.id)}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  // else: area not yet measured — render empty container, will re-render after layout

  return (
    <View style={[
      s.side,
      { backgroundColor: sideBg, paddingVertical: scale.sidePadY, paddingHorizontal: scale.sidePadX },
    ]}>
      <View style={[s.sectionHeader, { marginBottom: scale.sectionGap }]}>
        <Text
          style={[
            s.sectionTitle,
            {
              color: theme.text,
              fontFamily: fonts.displayHead,
              fontSize: scale.sectionTitleSize,
              fontWeight: String(theme.weightHead) as TextStyle['fontWeight'],
            },
            theme.underline ? s.underline : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {isReady ? '☑  ' : '🕐  '}{title}
        </Text>
        <View style={s.sectionHeaderRight}>
          {pageCount > 1 && (
            <Text style={[s.pageIndicator, { color: theme.textDim, fontFamily: fonts.body }]}>
              {effectivePage + 1} / {pageCount}
            </Text>
          )}
          <View style={[s.countPill, countPillStyle, { paddingHorizontal: scale.big ? 14 : 10 }]}>
            <Text style={[
              s.countPillText,
              countPillText,
              { fontSize: scale.big ? 16 : 13 },
            ]}>{count}</Text>
          </View>
        </View>
      </View>

      {/* Grid area — measures itself then fills with auto-fit cards */}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setArea((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
        }}
      >
        {gridContent}
      </View>
    </View>
  );
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  isReady: boolean;
  theme: Theme;
  fonts: ReturnType<typeof resolveThemeFonts>;
  w: number;
  h: number;
  reduceMotion: boolean;
  etaBufferMin: number;
  isFresh: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function OrderCard(props: OrderCardProps) {
  const { order, isReady, theme, fonts, w, h, reduceMotion, etaBufferMin, isFresh } = props;
  const flashAnim = useRef(new Animated.Value(1)).current;

  // Ready cards on a saturated readyBg (cardOnCard) flip the card to a light surface;
  // detect via cardReady luminance so themes don't have to hard-code text colors.
  const cardBg     = isReady ? theme.cardReady : theme.cardPrep;
  const cardBorder = isReady ? theme.cardBorderReady : theme.cardBorder;
  const cardIsLight = isLightHex(cardBg);
  const textColor    = cardIsLight ? (theme.textCard ?? theme.text) : theme.text;
  const textDimColor = cardIsLight ? (theme.textCardDim ?? theme.textDim) : theme.textDim;
  const numColor     = isReady ? (theme.textNumReady ?? theme.textNum) : theme.textNum;
  const empBg = cardIsLight ? 'rgba(0,0,0,0.06)' : theme.empChipBg;
  const empFg = cardIsLight ? textDimColor : theme.empChipFg;

  // Suppress "unused variable" warnings — textColor is available for future use
  void textColor;

  useEffect(() => {
    // Fresh pulse — 1s sine wave 1.0↔0.35 — fires for display.new_order_pulse_seconds
    // when a card arrives in its bucket (prep or ready). Once isFresh expires the card
    // goes steady at full opacity. The infinite ready-flash branch was removed: ready
    // cards should NOT blink forever — only while fresh.
    if (!reduceMotion && isFresh) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.35, duration: 500, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    flashAnim.setValue(1);
    return undefined;
  }, [isFresh, reduceMotion, flashAnim]);

  const srcKey: SourceKey = normalizeSource(order.source);
  const srcBg = theme.src[srcKey];
  const srcFg = theme.srcFg[srcKey];

  const eta = !isReady && order.estimated_prep_minutes && order.created_at
    ? formatEta(order, etaBufferMin)
    : null;

  const padding = clamp(Math.round(h * 0.07), 6, 28);
  const numFontSize = clamp(h * 0.46, 14, 220);
  const chipFontSize = clamp(h * 0.11, 8, 22);
  const timeFontSize = clamp(h * 0.10, 8, 20);
  const chipPadH = clamp(Math.round(h * 0.05), 4, 14);
  const chipPadV = clamp(Math.round(h * 0.025), 2, 6);

  const showChips = h >= 64;
  const showBottom = h >= 96;

  return (
    <Animated.View style={[
      {
        width: w,
        height: h,
        padding,
        overflow: 'hidden',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: cardBg,
        borderColor: cardBorder,
        borderWidth: isReady ? 1.5 : 1,
        borderRadius: theme.radius,
      },
      !reduceMotion && isFresh ? { opacity: flashAnim } : null,
    ]}>
      {/* top row — order number (hero) */}
      <View style={s.cardTop}>
        <Text
          style={[
            s.cardNum,
            {
              color: numColor,
              fontFamily: fonts.displayNumber,
              fontSize: numFontSize,
              lineHeight: Math.round(numFontSize * 0.92),
              fontWeight: String(theme.weightNumber) as TextStyle['fontWeight'],
              flexShrink: 1,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.2}
        >{order.display_number}</Text>
        <Text style={[s.cardIcon, { color: isReady ? theme.accentReady : textDimColor, fontSize: clamp(h * 0.14, 10, 28) }]}>
          {isReady ? readyGlyph(theme.readyIcon) : '🔍'}
        </Text>
      </View>

      {/* middle row — chips (hidden when cell too short) */}
      {showChips && (
        <View style={[s.cardChips, { flexShrink: 1 }]}>
          <View style={[
            s.srcChip,
            {
              backgroundColor: srcBg,
              borderRadius: theme.minimal ? 0 : 3,
              paddingHorizontal: chipPadH,
              paddingVertical: chipPadV,
            },
          ]}>
            <Text
              style={[s.srcChipText, { color: srcFg, fontFamily: fonts.bodyBold, fontSize: chipFontSize }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >{srcKey}</Text>
          </View>
          {order.customer_name ? (
            <View style={[
              s.empChip,
              {
                backgroundColor: empBg,
                borderRadius: theme.minimal ? 0 : 3,
                paddingHorizontal: chipPadH,
                paddingVertical: chipPadV,
                flexShrink: 1,
              },
            ]}>
              <Text
                style={[s.empChipText, { color: empFg, fontFamily: fonts.body, fontSize: chipFontSize }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {order.customer_name.toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* bottom row — time + status (hidden when cell too short) */}
      {showBottom && (
        <View style={s.cardBottom}>
          <Text
            style={[s.cardTime, { color: textDimColor, fontFamily: fonts.body, fontSize: timeFontSize }]}
            numberOfLines={1}
          >{timeAgo(order.created_at)}</Text>
          {!isReady && eta ? (
            <Text
              style={[s.cardStatus, { color: theme.statusFg, fontFamily: fonts.bodyBold, fontSize: timeFontSize }]}
              numberOfLines={1}
            >{eta}</Text>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

// Map readyIcon token → glyph. Stand-in until SVG icon set is ported.
function readyGlyph(kind: Theme['readyIcon']): string {
  switch (kind) {
    case 'check':  return '☑';
    case 'bell':   return '🔔';
    case 'leaf':   return '🌿';
    case 'arrow':  return '→';
    case 'square': return '■';
    case 'dot':    return '●';
    default:       return '☑';
  }
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

function formatEta(order: Order, buffer: number): string | null {
  if (!order.estimated_prep_minutes || !order.created_at) return null;
  const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000);
  const remaining = order.estimated_prep_minutes - elapsed;
  if (remaining <= 0) return 'Almost ready';
  const lo = Math.max(1, remaining - buffer);
  const hi = remaining + buffer;
  return lo === hi ? `~${lo} min` : `${lo}-${hi} min`;
}

const HEADER_H = 84;

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'column' },

  // Header
  header: { height: HEADER_H, flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between', paddingHorizontal: 36, borderBottomWidth: 1 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 20 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 36 },
  pickupPill:  { paddingHorizontal: 14, paddingVertical: 6 },
  pickupPillText: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  storeIdText: { fontSize: 12, fontFamily: 'Menlo', fontVariant: ['tabular-nums'] },
  headerLabels: { flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  storeLabel:  { fontSize: 28, letterSpacing: 1.7 },
  pickupLabel: { fontSize: 15, letterSpacing: 2.7, textTransform: 'uppercase' },
  underline:   { textDecorationLine: 'underline', textDecorationStyle: 'solid' },
  activeCluster: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  activeLabel: { fontSize: 14 },
  activeNum:   { fontSize: 22, fontWeight: '800' },
  clock:       { fontSize: 28, fontVariant: ['tabular-nums'], letterSpacing: 0.6 },
  liveCluster: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText:    { fontSize: 11, letterSpacing: 1 },
  liveDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399', shadowColor: '#34d399', shadowRadius: 8, shadowOpacity: 1 },

  // Sides
  sides: { flex: 1, flexDirection: 'row' },
  side:  { flex: 1 },

  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:       { letterSpacing: 2.4 },
  pageIndicator:      { fontSize: 11, opacity: 0.6, fontVariant: ['tabular-nums'] },
  countPill:          { paddingVertical: 4, borderRadius: 999 },
  countPillText:      { fontWeight: '700' },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.5 },
  emptyText: { fontSize: 18 },

  // Card
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardNum:     { letterSpacing: -1 },
  cardIcon:    { opacity: 0.7 },
  cardChips:   { flexDirection: 'row', gap: 6 },
  srcChip:     {},
  srcChipText: { letterSpacing: 0.6 },
  empChip:     {},
  empChipText: { letterSpacing: 0.7 },
  cardBottom:  { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  cardTime:    {},
  cardStatus:  { fontWeight: '600' },

  // Footer
  footer:     { paddingHorizontal: 24, paddingVertical: 6, borderTopWidth: 1 },
  footerText: { fontSize: 13 },
});
