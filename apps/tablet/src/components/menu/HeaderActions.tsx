// M01 Sprint 3 — 우상 + Add Item / Import Wizard 버튼 묶음.
// Import Wizard는 Sprint 5 영역 — Coming Soon notify.

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

interface Props {
  onAddItem:        () => void;
  onImportWizard?:  () => void;       // 정의 안 하면 "Coming Soon" 토스트
  onCategories?:    () => void;
  onDayparts?:      () => void;
  onFeatured?:      () => void;
  onCombos?:        () => void;
}

export function HeaderActions({ onAddItem, onImportWizard, onCategories, onDayparts, onFeatured, onCombos }: Props) {
  return (
    <View style={s.row}>
      {onCategories && (
        <TouchableOpacity
          style={[s.btn, s.btnSecondary]}
          onPress={onCategories}
          accessibilityRole="button"
          accessibilityLabel="Edit categories"
        >
          <Ionicons name="folder-outline" size={16} color={T.color.t0} />
          <Text style={s.btnText}>Categories</Text>
        </TouchableOpacity>
      )}

      {onDayparts && (
        <TouchableOpacity
          style={[s.btn, s.btnSecondary]}
          onPress={onDayparts}
          accessibilityRole="button"
          accessibilityLabel="Edit dayparts"
        >
          <Ionicons name="time-outline" size={16} color={T.color.t0} />
          <Text style={s.btnText}>Dayparts</Text>
        </TouchableOpacity>
      )}

      {onFeatured && (
        <TouchableOpacity
          style={[s.btn, s.btnSecondary]}
          onPress={onFeatured}
          accessibilityRole="button"
          accessibilityLabel="Edit featured rotation"
        >
          <Ionicons name="star-outline" size={16} color={T.color.t0} />
          <Text style={s.btnText}>Featured</Text>
        </TouchableOpacity>
      )}

      {onCombos && (
        <TouchableOpacity
          style={[s.btn, s.btnSecondary]}
          onPress={onCombos}
          accessibilityRole="button"
          accessibilityLabel="Edit combos"
        >
          <Ionicons name="layers-outline" size={16} color={T.color.t0} />
          <Text style={s.btnText}>Combos</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[s.btn, s.btnSecondary]}
        onPress={() => onImportWizard
          ? onImportWizard()
          : notify('Import Wizard', 'Excel / CSV / AI OCR import — coming in Sprint 5.')}
        accessibilityRole="button"
      >
        <Ionicons name="cloud-upload-outline" size={16} color={T.color.t0} />
        <Text style={s.btnText}>Import</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, s.btnPrimary]}
        onPress={onAddItem}
        accessibilityRole="button"
        accessibilityLabel="Add new menu item"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={[s.btnText, { color: '#fff' }]}>Add Item</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: T.sp[2], alignItems: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8,
    minHeight: 36,
  },
  btnPrimary:   { backgroundColor: T.color.brand },
  btnSecondary: { backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border },
  btnText:      { color: T.color.t0, fontSize: 13, fontWeight: '600' },
});
