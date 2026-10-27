// M01 F.C — TV Zone B Featured Banner (BR-21).
// 매 rotation_seconds(5|8|10|12)초 마다 다음 featured item으로 cross-fade.
// AG-014 Empty 상태 — featuredItems 빈 배열이면 brand placeholder.
//
// 화면 1920×1080 기준 Zone B = 22% ≈ 237px. 좌측 image(40%) + 우측 text(60%).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Animated, StyleSheet, Easing } from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../../store/tvStore';
import type { MenuItemData } from '../../store/tvStore';

const FADE_MS = 700;

function ItemFace({ item }: { item: MenuItemData }) {
  const img = item.photo_url_nobg ?? item.image_url;
  return (
    <View style={s.faceRoot}>
      <View style={s.imgWrap}>
        {img
          ? <Image source={{ uri: img }} style={s.img} resizeMode="cover" />
          : <View style={s.imgPlaceholder}><Text style={s.imgPlaceholderEmoji}>🍽</Text></View>
        }
      </View>
      <View style={s.body}>
        <Text style={s.badge}>⭐ FEATURED</Text>
        <Text style={s.name} numberOfLines={2}>{item.name}</Text>
        {item.price ? <Text style={s.price}>${item.price}</Text> : null}
      </View>
    </View>
  );
}

function EmptyFace() {
  return (
    <View style={s.faceRoot}>
      <View style={s.emptyBody}>
        <Text style={s.emptyTitle}>TODAY'S MENU</Text>
        <Text style={s.emptySub}>Tap an item below to learn more</Text>
      </View>
    </View>
  );
}

export function FeaturedBanner() {
  const featuredItems           = useTVStore((s) => s.featuredItems);
  const featuredRotationSeconds = useTVStore((s) => s.featuredRotationSeconds);

  const items = useMemo(
    () => featuredItems.filter((i) => !i.sold_out && i.available !== false),
    [featuredItems],
  );

  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset index when pool shrinks below the current cursor.
  useEffect(() => {
    if (idx >= items.length && items.length > 0) setIdx(0);
  }, [items.length, idx]);

  // Rotation timer — fade-out / advance / fade-in.
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (items.length <= 1) {
      fade.setValue(1);
      return;
    }
    const intervalMs = featuredRotationSeconds * 1000;
    timerRef.current = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(() => {
        setIdx((i) => (i + 1) % items.length);
        Animated.timing(fade, {
          toValue: 1, duration: FADE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }).start();
      });
    }, intervalMs);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [items.length, featuredRotationSeconds, fade]);

  return (
    <View style={s.root}>
      <Animated.View style={[s.face, { opacity: fade }]}>
        {items.length === 0
          ? <EmptyFace />
          : <ItemFace item={items[idx % items.length]} />
        }
      </Animated.View>
      {/* Pagination dots */}
      {items.length > 1 && (
        <View style={s.dots}>
          {items.map((_, i) => (
            <View key={i} style={[s.dot, i === idx % items.length && s.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: T.color.bg1, overflow: 'hidden' },
  face:       { flex: 1, flexDirection: 'row' },
  faceRoot:   { flex: 1, flexDirection: 'row' },

  imgWrap:    { width: '40%', height: '100%', backgroundColor: T.color.bg2 },
  img:        { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imgPlaceholderEmoji: { fontSize: 64, opacity: 0.4 },

  body:       { flex: 1, justifyContent: 'center', paddingHorizontal: 48, gap: 12 },
  badge:      { color: T.color.warn, fontSize: 18, fontWeight: T.fw.bold, letterSpacing: 4 },
  name:       { color: T.color.t0, fontSize: 48, fontWeight: '900', lineHeight: 56 },
  price:      { color: T.color.brand, fontSize: 40, fontWeight: T.fw.bold,
                fontVariant: ['tabular-nums'] },

  emptyBody:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { color: T.color.t1, fontSize: 36, fontWeight: T.fw.bold, letterSpacing: 6 },
  emptySub:   { color: T.color.t2, fontSize: 18 },

  dots:       { position: 'absolute', bottom: 12, right: 16, flexDirection: 'row', gap: 6 },
  dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: T.color.t2, opacity: 0.6 },
  dotActive:  { backgroundColor: T.color.warn, width: 24, opacity: 1 },
});
