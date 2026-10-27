import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={rowStyles.section}>
      <Text style={rowStyles.sectionTitle}>{title}</Text>
      <View style={rowStyles.sectionBody}>{children}</View>
    </View>
  );
}

export function Row({
  icon, label, value, onPress, eng,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  onPress?: () => void;
  /** Mark as engineer-only — renders an "ENG" badge next to the label. */
  eng?: boolean;
}) {
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={18} color={T.color.t1} />
      <View style={rowStyles.rowBody}>
        <View style={rowStyles.labelRow}>
          <Text style={rowStyles.rowLabel}>{label}</Text>
          {eng && (
            <View style={rowStyles.engBadge}>
              <Text style={rowStyles.engBadgeText}>ENG</Text>
            </View>
          )}
        </View>
        {value && <Text style={rowStyles.rowValue}>{value}</Text>}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={T.color.t2} />}
    </TouchableOpacity>
  );
}

export const rowStyles = StyleSheet.create({
  section:      { gap: T.sp[2] },
  sectionTitle: { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  sectionBody:  { backgroundColor: T.color.bg2, borderRadius: T.r.md, borderWidth: 1, borderColor: T.color.border, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    padding: T.sp[4], borderBottomWidth: 1, borderBottomColor: T.color.borderS,
  },
  rowBody:  { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  rowLabel: { color: T.color.t0, fontSize: T.fs.md },
  rowValue: { color: T.color.t1, fontSize: T.fs.sm, marginTop: 2 },
  engBadge: {
    backgroundColor: T.color.warn + '33', borderColor: T.color.warn, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: T.r.xs,
  },
  engBadgeText: { color: T.color.warn, fontSize: 10, fontWeight: T.fw.bold, letterSpacing: 0.8 },
});
