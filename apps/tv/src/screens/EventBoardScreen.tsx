import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Animated, Dimensions, StyleSheet, Easing,
} from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';
import type { EventData } from '../store/tvStore';
import { useClock } from '../hooks/useClock';

let KeepAwake: typeof import('expo-keep-awake') | null = null;
try { KeepAwake = require('expo-keep-awake'); } catch { /* not available */ }

// QR code — react-native-qrcode-svg is RN-native; bail to null if not installed (TR-014).
type QRComponent = React.ComponentType<{ value: string; size: number; backgroundColor?: string; color?: string }>;
let QRCode: QRComponent | null = null;
try { QRCode = require('react-native-qrcode-svg').default as QRComponent; } catch { /* native module missing */ }

const { width: W } = Dimensions.get('window');

const EVENT_TYPE_ICON: Record<string, string> = {
  happy_hour: '🍺',
  live_event: '🎵',
  lto:        '⏱',
  alert:      '⚠️',
  promo:      '🏷',
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  happy_hour: T.color.warn,
  live_event: T.color.info,
  lto:        T.color.brand,
  alert:      T.color.error,
  promo:      T.color.success,
};

// ── Countdown ─────────────────────────────────────────────────────────────────
function Countdown({ endAt }: { endAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, new Date(endAt).getTime() - now);
  if (!diff) return <Text style={s.cdEnded}>Ended</Text>;

  const h   = Math.floor(diff / 3_600_000);
  const m   = Math.floor((diff % 3_600_000) / 60_000);
  const sec = Math.floor((diff % 60_000) / 1000);
  return (
    <Text style={s.countdown}>
      {`${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`}
    </Text>
  );
}

// ── Ticker ─────────────────────────────────────────────────────────────────────
function Ticker({ text }: { text: string }) {
  const x = useRef(new Animated.Value(W)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: W,     duration: 0,     useNativeDriver: true }),
        Animated.timing(x, { toValue: -W * 2, duration: 18_000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [text, x]);

  return (
    <View style={s.tickerWrap}>
      <Animated.Text style={[s.tickerText, { transform: [{ translateX: x }] }]}>
        {text}  ·  {text}  ·  {text}
      </Animated.Text>
    </View>
  );
}

// ── Urgent overlay (type='alert') ─────────────────────────────────────────────
// Distinguished by full-bleed red bg + pulsing border + large warning glyph.
// CLAUDE-M03 — type=alert는 일반 ActiveEvent와 분리해서 시선 강제.
function UrgentOverlay({ event }: { event: EventData }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const borderOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <View style={s.urgentRoot}>
      <Animated.View style={[s.urgentBorder, { opacity: borderOpacity }]} />
      <View style={s.urgentContent}>
        <Text style={s.urgentIcon}>⚠️</Text>
        <Text style={s.urgentLabel}>URGENT NOTICE</Text>
        <View style={s.urgentDivider} />
        {event.title ? <Text style={s.urgentTitle}>{event.title}</Text> : null}
        {event.ticker_text ? (
          <Text style={s.urgentBody} numberOfLines={4}>{event.ticker_text}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── QR overlay (bottom-right) ─────────────────────────────────────────────────
function QrOverlay({ url }: { url: string }) {
  if (!QRCode) return null;
  return (
    <View style={s.qrWrap}>
      <View style={s.qrInner}>
        <QRCode value={url} size={140} backgroundColor="#fff" color="#000" />
      </View>
      <Text style={s.qrCaption}>Scan to reserve</Text>
    </View>
  );
}

// ── Active event view ─────────────────────────────────────────────────────────
function ActiveEvent({ event }: { event: EventData }) {
  const color = EVENT_TYPE_COLOR[event.type] ?? T.color.brand;
  const icon  = EVENT_TYPE_ICON[event.type]  ?? '📣';

  return (
    <View style={s.eventRoot}>
      {/* Background image (dimmed) */}
      {event.image_url ? (
        <Image source={{ uri: event.image_url }} style={s.bgImg} blurRadius={4} />
      ) : null}
      <View style={[s.bgOverlay, { backgroundColor: '#0a0f1eDD' }]} />

      {/* Content */}
      <View style={s.eventContent}>
        <Text style={s.eventIcon}>{icon}</Text>
        <Text style={[s.eventType, { color }]}>
          {event.type.replace('_', ' ').toUpperCase()}
        </Text>
        <View style={[s.divider, { backgroundColor: color }]} />
        {event.title ? (
          <Text style={s.eventTitle}>{event.title}</Text>
        ) : null}
        {event.end_at ? (
          <View style={s.cdRow}>
            <Text style={s.cdLabel}>Ends in</Text>
            <Countdown endAt={event.end_at} />
          </View>
        ) : null}
      </View>

      {/* QR (bottom-right) — renders only if cta_url present */}
      {event.cta_url ? <QrOverlay url={event.cta_url} /> : null}

      {/* Ticker */}
      {event.ticker_text ? <Ticker text={event.ticker_text} /> : null}
    </View>
  );
}

// ── Idle/standby view ─────────────────────────────────────────────────────────
function IdleScreen({ name, clock }: { name: string; clock: string }) {
  return (
    <View style={s.idle}>
      <Text style={s.idleStore}>{name.toUpperCase()}</Text>
      <View style={s.idleDivider} />
      <Text style={s.idleLabel}>EVENT BOARD</Text>
      <Text style={s.idleHint}>No active events</Text>
      <Text style={s.idleClock}>{clock}</Text>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function EventBoardScreen() {
  const { currentEvent, tvRow } = useTVStore();
  const clock = useClock();
  const screenName = tvRow?.instance.display_name ?? 'EVENT BOARD';

  useEffect(() => {
    KeepAwake?.activateKeepAwakeAsync().catch(() => {});
    return () => { KeepAwake?.deactivateKeepAwake(); };
  }, []);

  return (
    <View style={s.root}>
      {/* Clock overlay top-right */}
      <View style={s.clockOverlay}>
        <Text style={s.clockText}>{clock}</Text>
      </View>

      {currentEvent
        ? (currentEvent.type === 'alert'
            ? <UrgentOverlay event={currentEvent} />
            : <ActiveEvent event={currentEvent} />)
        : <IdleScreen name={screenName} clock={clock} />
      }
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: T.color.bg0 },

  clockOverlay: { position: 'absolute', top: 24, right: 48, zIndex: 10 },
  clockText:    { fontSize: 30, fontWeight: T.fw.semibold, color: T.color.t0,
                  fontVariant: ['tabular-nums'], opacity: 0.7 },

  // Active event
  eventRoot:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bgImg:        { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  bgOverlay:    { ...StyleSheet.absoluteFillObject },
  eventContent: { alignItems: 'center', gap: 24, padding: 60, zIndex: 1 },
  eventIcon:    { fontSize: 80 },
  eventType:    { fontSize: 22, fontWeight: T.fw.bold, letterSpacing: 4 },
  divider:      { width: 120, height: 4, borderRadius: 2 },
  eventTitle:   { fontSize: 64, fontWeight: '900', color: T.color.t0, textAlign: 'center',
                  lineHeight: 72, maxWidth: W * 0.8 },
  cdRow:        { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8 },
  cdLabel:      { fontSize: 24, color: T.color.t1, fontWeight: T.fw.medium },
  countdown:    { fontSize: 52, fontWeight: T.fw.bold, color: T.color.warn,
                  fontVariant: ['tabular-nums'] },
  cdEnded:      { fontSize: 36, color: T.color.t2 },

  // Ticker
  tickerWrap:   { position: 'absolute', bottom: 32, left: 0, right: 0,
                  height: 48, overflow: 'hidden', justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.4)' },
  tickerText:   { fontSize: 22, color: T.color.t1, fontStyle: 'italic',
                  paddingHorizontal: 24, lineHeight: 48 },

  // Idle
  idle:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  idleStore:    { fontSize: 28, fontWeight: T.fw.bold, color: T.color.brand, letterSpacing: 4 },
  idleDivider:  { width: 60, height: 2, backgroundColor: T.color.border },
  idleLabel:    { fontSize: 20, color: T.color.t1, letterSpacing: 4, fontWeight: T.fw.semibold },
  idleHint:     { fontSize: 18, color: T.color.t2, marginTop: 16 },
  idleClock:    { fontSize: 48, fontWeight: T.fw.bold, color: T.color.t0,
                  fontVariant: ['tabular-nums'], marginTop: 24, opacity: 0.4 },

  // Urgent overlay (type=alert)
  urgentRoot:    { flex: 1, backgroundColor: '#3a0a0a', alignItems: 'center', justifyContent: 'center' },
  urgentBorder:  { ...StyleSheet.absoluteFillObject, borderWidth: 12, borderColor: T.color.error },
  urgentContent: { alignItems: 'center', gap: 28, padding: 80, zIndex: 1, maxWidth: '85%' },
  urgentIcon:    { fontSize: 140 },
  urgentLabel:   { fontSize: 32, fontWeight: '900', color: T.color.error, letterSpacing: 8 },
  urgentDivider: { width: 220, height: 6, backgroundColor: T.color.error, borderRadius: 3 },
  urgentTitle:   { fontSize: 76, fontWeight: '900', color: '#fff', textAlign: 'center', lineHeight: 84 },
  urgentBody:    { fontSize: 32, color: '#ffe5e5', textAlign: 'center', lineHeight: 44 },

  // QR overlay (bottom-right)
  qrWrap:        { position: 'absolute', bottom: 96, right: 48, alignItems: 'center', zIndex: 2 },
  qrInner:       { padding: 12, backgroundColor: '#fff', borderRadius: 10 },
  qrCaption:     { marginTop: 8, fontSize: 14, color: T.color.t0, fontWeight: T.fw.semibold,
                   backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4,
                   borderRadius: 6, overflow: 'hidden' },
});
