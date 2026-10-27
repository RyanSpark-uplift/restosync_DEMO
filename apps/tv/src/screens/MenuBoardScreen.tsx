// M01 F.C — TV 5-Zone Menu Board (PRD §4 / BR-21).
//
// 1920×1080 비율:
//   Zone A · Header   (8%)  Logo · Store · Daypart · Clock · WS status
//   Zone B · Featured (22%) Rotation banner (FeaturedBanner)
//   Zone C · Menu grid (60%) Category-tabbed 4-col grid
//   Zone D · Ticker   (10%) currentEvent.ticker_text (M03 cross-zone)
//
// FeaturedBanner / ZoneTicker handle their own AG-014 Empty states.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, FlatList, StyleSheet, Dimensions,
} from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';
import type { MenuItemData } from '../store/tvStore';
import { useClock } from '../hooks/useClock';
import { FeaturedBanner } from '../components/menuboard/FeaturedBanner';
import { ZoneTicker } from '../components/menuboard/ZoneTicker';

let KeepAwake: typeof import('expo-keep-awake') | null = null;
try { KeepAwake = require('expo-keep-awake'); } catch { /* not available */ }

const { width: W, height: H } = Dimensions.get('window');

// Zone heights — PRD §4 ratios. clamp Header to a usable minimum on smaller windows.
const ZONE_A_H = Math.max(72, Math.round(H * 0.08));      // 8%
const ZONE_B_H = Math.round(H * 0.22);                    // 22%
const ZONE_D_H = Math.round(H * 0.10);                    // 10%
// Zone C takes the remainder (~60%).

const COLS               = 4;
const GRID_PADDING       = 40;
const GRID_GAP           = 16;
const ITEM_W             = (W - GRID_PADDING * 2 - (COLS - 1) * GRID_GAP) / COLS;
const IMG_H              = ITEM_W * 0.55;
const DEFAULT_INTERVAL   = 8;

// ── Zone A — Header ──────────────────────────────────────────────────────────
function ZoneHeader({ screenName, clock }: { screenName: string; clock: string }) {
  const daypart  = useTVStore((s) => s.currentDaypart);
  const wsStatus = useTVStore((s) => s.wsStatus);
  const wsColor  = wsStatus === 'connected' ? T.color.success
                  : wsStatus === 'connecting' ? T.color.warn
                  : T.color.error;
  return (
    <View style={[s.header, { height: ZONE_A_H }]}>
      <View style={s.headerLeft}>
        <Text style={s.screenName}>{screenName.toUpperCase()}</Text>
        <Text style={s.headerTitle}>MENU</Text>
      </View>
      <View style={s.headerMid}>
        <View style={s.daypartChip}>
          <Text style={s.daypartText}>{daypart.toUpperCase()}</Text>
        </View>
      </View>
      <View style={s.headerRight}>
        <View style={[s.wsDot, { backgroundColor: wsColor }]} />
        <Text style={s.clock}>{clock}</Text>
      </View>
    </View>
  );
}

// ── Menu item card ───────────────────────────────────────────────────────────
function MenuCard({ item }: { item: MenuItemData }) {
  const imgUri = item.photo_url_nobg ?? item.image_url;
  const soldOut = item.sold_out || !item.available;
  return (
    <View style={[s.card, soldOut && s.cardSoldOut]}>
      <View style={{ width: ITEM_W, height: IMG_H, backgroundColor: T.color.bg3,
                     borderRadius: T.r.sm, overflow: 'hidden' }}>
        {imgUri
          ? <Image source={{ uri: imgUri }} style={s.img} resizeMode="cover" />
          : <View style={s.imgPlaceholder}><Text style={s.imgPlaceholderText}>🍽</Text></View>
        }
        {soldOut && (
          <View style={s.soldOverlay}>
            <Text style={s.soldText}>SOLD OUT</Text>
          </View>
        )}
        {item.is_hot      && <View style={[s.flag, s.flagHot]}><Text style={s.flagText}>🔥</Text></View>}
        {item.is_featured && <View style={[s.flag, s.flagStar]}><Text style={s.flagText}>⭐</Text></View>}
      </View>
      <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
      {item.price ? <Text style={s.price}>${item.price}</Text> : null}
    </View>
  );
}

// ── Zone C — Menu Grid (category-tabbed) ─────────────────────────────────────
function ZoneGrid() {
  const menuItems = useTVStore((s) => s.menuItems);
  const tvRow     = useTVStore((s) => s.tvRow);
  const listRef   = useRef<FlatList<MenuItemData> | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const slideInterval = (tvRow?.profile?.slide_interval_sec ?? DEFAULT_INTERVAL) * 1000;

  const { categories, byCategory } = useMemo(() => {
    const cats: string[] = [];
    const map: Record<string, MenuItemData[]> = {};
    for (const item of menuItems) {
      const cat = item.category ?? 'Other';
      if (!map[cat]) { map[cat] = []; cats.push(cat); }
      map[cat].push(item);
    }
    return { categories: cats, byCategory: map };
  }, [menuItems]);

  const [catIdx, setCatIdx] = useState(0);

  useEffect(() => {
    if (categories.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCatIdx((i) => (i + 1) % categories.length);
    }, slideInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [categories.length, slideInterval]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [catIdx]);

  const currentCat   = categories[catIdx];
  const currentItems = currentCat ? (byCategory[currentCat] ?? []) : menuItems;

  const renderItem = useCallback(({ item }: { item: MenuItemData }) => (
    <MenuCard item={item} />
  ), []);

  if (menuItems.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>No menu items available</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {currentCat ? (
        <View style={s.catHeader}>
          <Text style={s.catTitle}>{currentCat.toUpperCase()}</Text>
          <View style={s.catLine} />
          <View style={s.catDots}>
            {categories.map((c, i) => (
              <View key={c} style={[s.dot, i === catIdx && s.dotActive]} />
            ))}
          </View>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={currentItems}
        keyExtractor={(i) => i.id}
        numColumns={COLS}
        renderItem={renderItem}
        contentContainerStyle={s.grid}
        columnWrapperStyle={s.row}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function MenuBoardScreen() {
  const tvRow      = useTVStore((s) => s.tvRow);
  const clock      = useClock();
  const screenName = tvRow?.instance.display_name ?? 'MENU';

  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync().catch(() => {});
    return () => { KeepAwake?.deactivateKeepAwake(); };
  }, []);

  return (
    <View style={s.root}>
      {/* Zone A · Header */}
      <ZoneHeader screenName={screenName} clock={clock} />

      {/* Zone B · Featured banner (rotation) */}
      <View style={{ height: ZONE_B_H }}>
        <FeaturedBanner />
      </View>

      {/* Zone C · Menu grid (remainder) */}
      <View style={{ flex: 1 }}>
        <ZoneGrid />
      </View>

      {/* Zone D · Ticker (event cross-zone) */}
      <View style={{ height: ZONE_D_H }}>
        <ZoneTicker />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: T.color.bg0 },

  // Zone A
  header:       { flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 40, backgroundColor: T.color.bg1,
                  borderBottomWidth: 2, borderBottomColor: T.color.border },
  headerLeft:   { flexDirection: 'row', alignItems: 'baseline', gap: 16, flex: 1 },
  headerMid:    { flex: 1, alignItems: 'center' },
  headerRight:  { flex: 1, flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'flex-end', gap: 16 },
  screenName:   { fontSize: 24, fontWeight: T.fw.bold, color: T.color.brand, letterSpacing: 2 },
  headerTitle:  { fontSize: 18, color: T.color.t1, fontWeight: T.fw.semibold,
                  textTransform: 'uppercase', letterSpacing: 3 },
  daypartChip:  { paddingHorizontal: 18, paddingVertical: 6,
                  borderRadius: 16, backgroundColor: T.color.bg3,
                  borderWidth: 1, borderColor: T.color.border },
  daypartText:  { color: T.color.t0, fontSize: 14, fontWeight: T.fw.bold, letterSpacing: 3 },
  wsDot:        { width: 10, height: 10, borderRadius: 5 },
  clock:        { fontSize: 28, fontWeight: T.fw.semibold, color: T.color.t0,
                  fontVariant: ['tabular-nums'] },

  // Zone C — category header
  catHeader:    { flexDirection: 'row', alignItems: 'center', gap: 20,
                  paddingHorizontal: 40, paddingTop: 16, paddingBottom: 12 },
  catTitle:     { fontSize: 22, fontWeight: T.fw.bold, color: T.color.t1,
                  letterSpacing: 2, textTransform: 'uppercase', flexShrink: 0 },
  catLine:      { flex: 1, height: 1, backgroundColor: T.color.border },
  catDots:      { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: T.color.t2 },
  dotActive:    { backgroundColor: T.color.brand, width: 24, borderRadius: 4 },

  // Cards
  grid:         { paddingHorizontal: 40, paddingBottom: 24, gap: 16 },
  row:          { gap: 16 },
  card:         { width: ITEM_W, backgroundColor: T.color.bg2, borderRadius: T.r.lg,
                  overflow: 'hidden', borderWidth: 1, borderColor: T.color.border },
  cardSoldOut:  { opacity: 0.55 },
  img:          { width: ITEM_W, height: IMG_H },
  imgPlaceholder: { width: ITEM_W, height: IMG_H, alignItems: 'center', justifyContent: 'center' },
  imgPlaceholderText: { fontSize: 40 },
  soldOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center', justifyContent: 'center' },
  soldText:     { color: T.color.t0, fontWeight: T.fw.bold, fontSize: 16, letterSpacing: 2 },
  flag:         { position: 'absolute', top: 8, borderRadius: T.r.sm, padding: 4 },
  flagHot:      { right: 8, backgroundColor: T.color.error + '99' },
  flagStar:     { left: 8, backgroundColor: T.color.warn + '99' },
  flagText:     { fontSize: 14 },
  itemName:     { color: T.color.t0, fontSize: 15, fontWeight: T.fw.semibold,
                  padding: 12, paddingBottom: 4 },
  price:        { color: T.color.brand, fontSize: 18, fontWeight: T.fw.bold,
                  paddingHorizontal: 12, paddingBottom: 12 },

  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: T.color.t1, fontSize: 24 },
});
