// M01 Sprint 3 — MenuCard: 3-col grid의 atom.
//
// 사진 thumb + name + price + 86 toggle pill + daypart chip + sold_out overlay.
// 86 토글 클릭 시 onToggleSoldOut(item) 호출. 부모(menus/index.tsx)가 optimistic
// mutation 처리.

import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import type { MenuItem } from '../../api/menu';
import { renderI18n } from '../../lib/i18nFallback';

interface Props {
  item:               MenuItem;
  lang?:              'en' | 'ko' | 'es' | 'zh' | 'ja';
  onPress?:           (item: MenuItem) => void;
  onToggleSoldOut?:   (item: MenuItem) => void;
  toggleInFlight?:    boolean;
}

function priceLabel(cents: number | null | undefined, legacyPrice?: string | null): string {
  if (typeof cents === 'number') return `$${(cents / 100).toFixed(2)}`;
  if (legacyPrice) {
    const n = parseFloat(legacyPrice);
    if (!Number.isNaN(n)) return `$${n.toFixed(2)}`;
  }
  return '—';
}

export function MenuCard({ item, lang = 'en', onPress, onToggleSoldOut, toggleInFlight }: Props) {
  const name = renderI18n(item.name_i18n, lang) === '(no name)'
    ? (item.name ?? '(no name)')
    : renderI18n(item.name_i18n, lang);
  const price = priceLabel(item.price_cents, item.price);
  const dayparts = item.dayparts_arr ?? [];
  const photoStatus = item.photo_status;
  const imageReady = photoStatus === 'ready' || (!photoStatus && item.image_url);

  return (
    <TouchableOpacity
      style={[s.card, item.sold_out && s.cardSoldOut]}
      onPress={() => onPress?.(item)}
      accessibilityLabel={`Menu item ${name}, ${price}${item.sold_out ? ', sold out' : ''}`}
    >
      {/* Photo zone */}
      <View style={s.thumb}>
        {imageReady && item.image_url ? (
          <Image source={{ uri: item.image_url }} style={s.thumbImg} resizeMode="cover" />
        ) : (
          <View style={s.thumbPlaceholder}>
            {photoStatus === 'pending' || photoStatus === 'processing' ? (
              <>
                <ActivityIndicator size="small" color={T.color.brand} />
                <Text style={s.thumbStatus}>{photoStatus === 'pending' ? 'Queued…' : 'Processing…'}</Text>
              </>
            ) : photoStatus === 'failed' ? (
              <>
                <Ionicons name="image-outline" size={28} color={T.color.error} />
                <Text style={[s.thumbStatus, { color: T.color.error }]}>Upload failed</Text>
              </>
            ) : (
              <Ionicons name="image-outline" size={28} color={T.color.t2} />
            )}
          </View>
        )}
        {item.is_featured && (
          <View style={s.featuredBadge}>
            <Ionicons name="star" size={10} color="#000" />
            <Text style={s.featuredText}>FEATURED</Text>
          </View>
        )}
        {item.is_hot && (
          <View style={s.hotBadge}>
            <Ionicons name="flame" size={10} color="#fff" />
          </View>
        )}
        {item.sold_out && (
          <View style={s.soldOutOverlay}>
            <Text style={s.soldOutText}>86</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        <View style={s.metaRow}>
          <Text style={[s.price, item.sold_out && s.priceStrike]}>{price}</Text>
          <Text style={s.dayparts}>{dayparts.length ? dayparts.join(' · ') : 'all'}</Text>
        </View>

        {/* 86 toggle pill — AM01-008 kitchen 권한 path와 같은 endpoint */}
        <TouchableOpacity
          style={[
            s.toggle,
            item.sold_out ? s.toggleOff : s.toggleOn,
            toggleInFlight && { opacity: 0.5 },
          ]}
          onPress={(e) => { e.stopPropagation?.(); onToggleSoldOut?.(item); }}
          disabled={toggleInFlight}
          accessibilityRole="button"
          accessibilityLabel={item.sold_out ? 'Mark available' : 'Mark as 86 (sold out)'}
        >
          {toggleInFlight
            ? <ActivityIndicator size="small" color={T.color.t0} />
            : <Text style={s.toggleText}>{item.sold_out ? 'SOLD OUT' : 'AVAILABLE'}</Text>
          }
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: T.color.bg2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.color.border,
    overflow: 'hidden',
    margin: T.sp[2],
    minWidth: 220,
  },
  cardSoldOut: { opacity: 0.85 },
  thumb: { width: '100%', aspectRatio: 4 / 3, backgroundColor: T.color.bg3, position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[1] },
  thumbStatus: { color: T.color.t1, fontSize: 11 },
  featuredBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: '#FFD93B',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  featuredText: { color: '#000', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  hotBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: T.color.brand,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  soldOutOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldOutText: { color: T.color.error, fontSize: 48, fontWeight: '900', letterSpacing: 4 },
  body: { padding: T.sp[3], gap: T.sp[2] },
  name: { color: T.color.t0, fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { color: T.color.brand, fontSize: 16, fontWeight: '700' },
  priceStrike: { textDecorationLine: 'line-through', color: T.color.t2 },
  dayparts: { color: T.color.t1, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  toggle: {
    paddingVertical: T.sp[2],
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  toggleOn:  { backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.success },
  toggleOff: { backgroundColor: T.color.error },
  toggleText: { color: T.color.t0, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
});
