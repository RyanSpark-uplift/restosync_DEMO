import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, type PressableStateCallbackType } from 'react-native';
import { T } from '@restosync/ui';

interface Props {
  message: string;
  onRetry: () => void;
  onReset: () => void;
}

export default function ErrorScreen({ message, onRetry, onReset }: Props) {
  const [retryFocused, setRetryFocused] = useState(false);
  const [resetFocused, setResetFocused] = useState(false);

  return (
    <View style={s.root}>
      <Text style={s.icon}>⚠</Text>
      <Text style={s.title}>Connection Lost</Text>
      <Text style={s.msg}>{message}</Text>

      <View style={s.btns}>
        <Pressable
          style={(_: PressableStateCallbackType) => [s.btn, s.btnPrimary, retryFocused && s.btnFocused]}
          onPress={onRetry}
          onFocus={() => setRetryFocused(true)}
          onBlur={() => setRetryFocused(false)}
          focusable
          hasTVPreferredFocus
        >
          <Text style={s.btnText}>Retry</Text>
        </Pressable>

        <Pressable
          style={(_: PressableStateCallbackType) => [s.btn, s.btnSecondary, resetFocused && s.btnFocusedSecondary]}
          onPress={onReset}
          onFocus={() => setResetFocused(true)}
          onBlur={() => setResetFocused(false)}
          focusable
        >
          <Text style={s.btnTextSecondary}>Reset Setup</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: T.color.bg0, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 60 },
  icon:              { fontSize: 64, color: T.color.error },
  title:             { color: T.color.error, fontSize: 36, fontWeight: T.fw.bold },
  msg:               { color: T.color.t1, fontSize: 20, textAlign: 'center', maxWidth: 640 },
  btns:              { flexDirection: 'row', gap: 20, marginTop: 16 },
  btn:               { paddingHorizontal: 40, paddingVertical: 18, borderRadius: T.r.md, borderWidth: 2, minWidth: 160, alignItems: 'center' },
  btnPrimary:        { backgroundColor: T.color.brand, borderColor: 'transparent' },
  btnSecondary:      { backgroundColor: 'transparent', borderColor: T.color.border },
  btnFocused:        { borderColor: T.color.t0, elevation: 8 },
  btnFocusedSecondary: { borderColor: T.color.t1 },
  btnText:           { color: T.color.t0, fontSize: 18, fontWeight: T.fw.bold },
  btnTextSecondary:  { color: T.color.t1, fontSize: 18, fontWeight: T.fw.medium },
});
