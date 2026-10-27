import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';

export default function BootScreen() {
  const wsStatus = useTVStore((s) => s.wsStatus);

  const msg = wsStatus === 'connecting' ? 'Connecting to server…'
    : wsStatus === 'connected'  ? 'Loading…'
    : 'Starting up…';

  return (
    <View style={s.root}>
      <Text style={s.logo}>RestoSync</Text>
      <ActivityIndicator size="large" color={T.color.brand} style={s.spinner} />
      <Text style={s.msg}>{msg}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.color.bg0, alignItems: 'center', justifyContent: 'center', gap: 24 },
  logo:    { color: T.color.brand, fontSize: 32, fontWeight: T.fw.bold, letterSpacing: 4, textTransform: 'uppercase' },
  spinner: { marginVertical: 8 },
  msg:     { color: T.color.t1, fontSize: 20 },
});
