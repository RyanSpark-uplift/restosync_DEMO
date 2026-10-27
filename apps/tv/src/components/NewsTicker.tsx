// Horizontal scrolling news ticker — spec sec.24.2.
// Driven by store_settings.multi_zone.{ticker_enabled, ticker_text, ticker_speed}.
//
// Speed pixels/sec by setting:
//   slow -> 40, medium -> 80, fast -> 140

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { T } from '@restosync/ui';

interface Props {
  text: string;
  speed?: 'slow' | 'medium' | 'fast';
  height?: number;
}

const PX_PER_SEC: Record<NonNullable<Props['speed']>, number> = {
  slow: 40, medium: 80, fast: 140,
};

export default function NewsTicker({ text, speed = 'medium', height = 36 }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef    = useRef<Animated.CompositeAnimation | null>(null);
  const [trackW, setTrackW] = useState(0);
  const [textW,  setTextW]  = useState(0);

  useEffect(() => {
    animRef.current?.stop();
    if (trackW <= 0 || textW <= 0) return;
    const totalDist = trackW + textW;
    const durationMs = (totalDist / PX_PER_SEC[speed]) * 1000;
    translateX.setValue(trackW);
    animRef.current = Animated.loop(
      Animated.timing(translateX, {
        toValue: -textW,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animRef.current.start();
    return () => { animRef.current?.stop(); };
  }, [trackW, textW, speed, translateX, text]);

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);
  const onTextLayout  = (e: LayoutChangeEvent) => setTextW(e.nativeEvent.layout.width);

  if (!text) return null;

  return (
    <View style={[s.track, { height }]} onLayout={onTrackLayout}>
      <Animated.Text
        style={[s.text, { transform: [{ translateX }] }]}
        onLayout={onTextLayout}
        numberOfLines={1}
      >
        📢  {text}
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    borderTopWidth: 1, borderTopColor: '#334155',
    borderBottomWidth: 1, borderBottomColor: '#334155',
    justifyContent: 'center',
  },
  text: {
    color: T.color.t0,
    fontSize: 22, fontWeight: T.fw.semibold,
    paddingHorizontal: 16,
  },
});
