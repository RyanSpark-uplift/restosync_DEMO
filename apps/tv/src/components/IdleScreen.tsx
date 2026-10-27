// Idle / welcome screen — spec sec.12.5.
// Rendered by pickup screens when there are 0 active orders for a sustained interval.
// Modes from store_settings.display.idle_screen_mode:
//   welcome (default) | menu | promo | sns | custom

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from '@restosync/ui';
import { t } from '@restosync/shared';

interface Props {
  storeName: string;
  mode?: 'welcome' | 'menu' | 'promo' | 'sns' | 'custom';
  footerMessage?: string;
  brandColor?: string;
}

export default function IdleScreen({
  storeName,
  mode = 'welcome',
  footerMessage,
  brandColor,
}: Props) {
  const accent = brandColor ?? T.color.brand;
  const headline = t('tv.idle.welcome', 'en');
  const subline  = t('tv.idle.thanks', 'en');

  // Mode-specific body — kept minimal in P2. P3/P4 add menu/promo/SNS variants.
  let body: React.ReactNode;
  switch (mode) {
    case 'menu':
      body = <Text style={s.bodyText}>Today's menu coming up…</Text>;
      break;
    case 'promo':
      body = <Text style={s.bodyText}>Today's specials inside!</Text>;
      break;
    case 'sns':
      body = <Text style={s.bodyText}>Follow us — scan at counter for our socials</Text>;
      break;
    case 'custom':
      body = footerMessage ? <Text style={s.bodyText}>{footerMessage}</Text> : null;
      break;
    default:
      body = <Text style={s.bodyText}>{subline}</Text>;
  }

  return (
    <View style={s.root}>
      <View style={[s.accent, { backgroundColor: accent }]} />
      <Text style={[s.brand, { color: accent }]}>{storeName.toUpperCase()}</Text>
      <Text style={s.headline}>{headline}</Text>
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 48 },
  accent:   { width: 80, height: 8, borderRadius: 4 },
  brand:    { fontSize: 36, fontWeight: T.fw.bold, letterSpacing: 4 },
  headline: { fontSize: 48, fontWeight: T.fw.bold, color: T.color.t0, textAlign: 'center', lineHeight: 56 },
  bodyText: { fontSize: 22, color: T.color.t1, textAlign: 'center', maxWidth: 720 },
});
