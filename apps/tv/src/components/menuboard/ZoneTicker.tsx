// M01 F.C — TV Zone D Ticker (10% bottom strip).
// D1 cross-zone integration — currentEvent.ticker_text가 있으면 표시,
// 없으면 hidden(상위 layout이 height만 점유). 좌→우 무한 스크롤 24s loop.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet } from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../../store/tvStore';

const { width: W } = Dimensions.get('window');
const DURATION_MS  = 24_000;

export function ZoneTicker() {
  const currentEvent = useTVStore((s) => s.currentEvent);
  const text = currentEvent?.ticker_text ?? '';

  const x = useRef(new Animated.Value(W)).current;

  useEffect(() => {
    if (!text) return;
    x.setValue(W);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: W,      duration: 0,           useNativeDriver: true }),
        Animated.timing(x, { toValue: -W * 2, duration: DURATION_MS, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [text, x]);

  if (!text) {
    return <View style={s.root} />;                  // keep height reserved for grid 60% calc
  }

  return (
    <View style={s.root}>
      <Animated.Text style={[s.text, { transform: [{ translateX: x }] }]}>
        {text}  ·  {text}  ·  {text}
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, justifyContent: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderTopWidth: 1, borderTopColor: T.color.border,
  },
  text: {
    fontSize: 28, color: T.color.t0, fontWeight: T.fw.semibold,
    paddingHorizontal: 24, letterSpacing: 1,
  },
});
