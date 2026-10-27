import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, Alert,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { T } from '@restosync/ui';
import { tvPairing, type TvInstance } from '../api/client';

type FunctionType = TvInstance['function_type'];

// Matches the alphabet PairingScreen.tsx renders on the TV — I/L/O/0/1 are
// excluded server-side too, so anything containing them is invalid before we
// even hit the API.
const CODE_REGEX     = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const SECTIONS: { type: FunctionType; label: string }[] = [
  { type: 'pickup', label: 'Pickup' },
  { type: 'menu',   label: 'Menu' },
  { type: 'event',  label: 'Event' },
  { type: 'ad',     label: 'Ad' },
];

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

interface Props {
  onClose: () => void;
  onPaired: () => void;
}

export default function PairTvSheet({ onClose, onPaired }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%'], []);

  const [code, setCode] = useState('');
  const [functionType, setFunctionType] = useState<FunctionType>('pickup');
  const [displayName, setDisplayName] = useState('');

  const claimMutation = useMutation({
    mutationFn: () => tvPairing.claim({
      pairing_code:  code.toUpperCase(),
      function_type: functionType,
      display_name:  displayName.trim() || undefined,
    }),
    onSuccess: (data) => {
      onPaired();
      sheetRef.current?.close();
      // Explicit success so staff don't have to guess whether the claim went
      // through — the TV transition is the strongest signal, but it may be
      // out of sight (ceiling mount). Names the new instance + its section.
      const label = data?.instance?.display_name?.trim() || `Untitled ${functionType} TV`;
      const sectionLabel = SECTIONS.find((sec) => sec.type === functionType)?.label ?? functionType;
      notify('Paired', `"${label}" added under ${sectionLabel}.\nThe TV should switch to its display now.`);
    },
    onError: (e: Error) => notify('Pairing failed', e.message),
  });

  const codeValid = CODE_REGEX.test(code.toUpperCase());

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onClose={onClose}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: T.color.bg2 }}
      handleIndicatorStyle={{ backgroundColor: T.color.border }}
    >
      <BottomSheetView style={s.sheet}>
        <View style={s.header}>
          <Ionicons name="qr-code-outline" size={22} color={T.color.brand} />
          <Text style={s.title}>Pair a new TV</Text>
        </View>
        <Text style={s.help}>
          The TV displays a 6-character code on its first boot. Enter it here to claim it under this store.
        </Text>

        {/* Code field */}
        <Text style={s.label}>Pairing code</Text>
        <TextInput
          style={[s.codeInput, codeValid && s.codeInputValid]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
          placeholder="ABCD12"
          placeholderTextColor={T.color.t2}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />

        {/* Function type */}
        <Text style={s.label}>Display type</Text>
        <View style={s.ftRow}>
          {SECTIONS.map((sec) => (
            <TouchableOpacity
              key={sec.type}
              style={[s.ftBtn, functionType === sec.type && s.ftBtnActive]}
              onPress={() => setFunctionType(sec.type)}
            >
              <Text style={[s.ftBtnText, functionType === sec.type && s.ftBtnTextActive]}>{sec.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Display name (optional) */}
        <Text style={s.label}>Display name (optional)</Text>
        <TextInput
          style={s.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Front pickup TV"
          placeholderTextColor={T.color.t2}
          maxLength={80}
        />

        {/* Submit */}
        <View style={s.footer}>
          <TouchableOpacity style={s.cancelBtn} onPress={() => sheetRef.current?.close()}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.submitBtn, (!codeValid || claimMutation.isPending) && s.submitBtnDisabled]}
            onPress={() => claimMutation.mutate()}
            disabled={!codeValid || claimMutation.isPending}
          >
            {claimMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitText}>Pair</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheet: { padding: T.sp[5], gap: T.sp[3] },
  header: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  title:  { color: T.color.t0, fontSize: T.fs.xl, fontWeight: '700' },
  help:   { color: T.color.t1, fontSize: T.fs.sm, lineHeight: 18, marginBottom: T.sp[2] },
  label:  { color: T.color.t1, fontSize: T.fs.sm, marginTop: T.sp[3] },

  codeInput: {
    backgroundColor: T.color.bg3,
    borderWidth: 2,
    borderColor: T.color.border,
    borderRadius: T.r.md,
    paddingVertical: T.sp[3],
    paddingHorizontal: T.sp[4],
    fontSize: 32,
    letterSpacing: 8,
    textAlign: 'center',
    color: T.color.t0,
    fontWeight: '700',
  },
  codeInputValid: { borderColor: T.color.brand },

  ftRow: { flexDirection: 'row', gap: T.sp[2], flexWrap: 'wrap' },
  ftBtn: {
    paddingVertical: T.sp[2], paddingHorizontal: T.sp[4],
    borderRadius: T.r.full,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
  },
  ftBtnActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  ftBtnText:       { color: T.color.t1, fontSize: T.fs.sm },
  ftBtnTextActive: { color: '#fff', fontWeight: '600' },

  input: {
    backgroundColor: T.color.bg3,
    borderWidth: 1,
    borderColor: T.color.border,
    borderRadius: T.r.md,
    paddingVertical:   T.sp[3],
    paddingHorizontal: T.sp[4],
    fontSize: T.fs.md,
    color: T.color.t0,
  },

  footer: { flexDirection: 'row', gap: T.sp[3], marginTop: T.sp[5] },
  cancelBtn: {
    flex: 1, paddingVertical: T.sp[3], alignItems: 'center',
    borderRadius: T.r.md, borderWidth: 1, borderColor: T.color.border,
  },
  cancelText: { color: T.color.t1, fontSize: T.fs.md, fontWeight: '600' },
  submitBtn: {
    flex: 2, paddingVertical: T.sp[3], alignItems: 'center',
    borderRadius: T.r.md, backgroundColor: T.color.brand,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: T.fs.md, fontWeight: '700' },
});
