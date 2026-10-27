import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, ftColor } from '@restosync/ui';
import type { TvInstanceRow } from '../api/client';
import { useAuthStore } from '../store/auth';

interface Props {
  row:      TvInstanceRow;
  onEdit:   (row: TvInstanceRow) => void;
  onDelete: (id: string) => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  try { await Share.share({ message: text }); return true; } catch { return false; }
}

function isOnline(row: TvInstanceRow): boolean {
  if (!row.instance.is_active) return false;
  if (!row.instance.last_ping_at) return false;
  return Date.now() - new Date(row.instance.last_ping_at).getTime() < 2 * 60 * 1000;
}

const FT_LABEL: Record<string, string> = {
  menu: 'MENU', pickup: 'PICKUP', event: 'EVENT', ad: 'AD',
};

export function TVCard({ row, onEdit, onDelete }: Props) {
  const online = isOnline(row);
  const ft     = row.instance.function_type;
  const color  = ftColor(ft);
  const id     = row.instance.id;
  const shortId = id.slice(0, 8);
  const apiUrl  = useAuthStore((st) => st.apiUrl);
  const viewerUrl = `${(apiUrl ?? '').replace(/\/$/, '')}/tv-view?tv_id=${id}`;
  const [copied, setCopied] = useState<'id' | 'url' | null>(null);

  const handleCopy = async (kind: 'id' | 'url', text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    }
  };

  return (
    <View style={[s.card, { borderLeftColor: color }]}>
      {/* Status dot + Name */}
      <View style={s.row}>
        <View style={[s.dot, { backgroundColor: online ? T.color.online : T.color.offline }]} />
        <Text style={s.name} numberOfLines={1}>
          {row.instance.display_name ?? 'Unnamed TV'}
        </Text>
        <View style={[s.badge, { backgroundColor: color + '22', borderColor: color }]}>
          <Text style={[s.badgeText, { color }]}>{FT_LABEL[ft] ?? ft.toUpperCase()}</Text>
        </View>
      </View>

      {/* IP + Profile */}
      <View style={s.meta}>
        <Ionicons name="wifi" size={12} color={T.color.t1} />
        <Text style={s.metaText}>{row.instance.ip_address ?? '—'}</Text>
        <Ionicons name="layers" size={12} color={T.color.t1} style={{ marginLeft: T.sp[3] }} />
        <Text style={s.metaText} numberOfLines={1}>
          {row.profile?.profile_name ?? 'No profile'}
        </Text>
      </View>

      {/* Dev: UUID + Copy URL */}
      <View style={s.idRow}>
        <TouchableOpacity style={s.idChip} onPress={() => handleCopy('id', id)}>
          <Ionicons name="finger-print" size={11} color={T.color.t2} />
          <Text style={s.idText}>{shortId}…</Text>
          <Ionicons
            name={copied === 'id' ? 'checkmark' : 'copy-outline'}
            size={11}
            color={copied === 'id' ? T.color.online : T.color.t2}
          />
        </TouchableOpacity>
        <TouchableOpacity style={s.urlChip} onPress={() => handleCopy('url', viewerUrl)}>
          <Ionicons
            name={copied === 'url' ? 'checkmark' : 'link-outline'}
            size={11}
            color={copied === 'url' ? T.color.online : T.color.t1}
          />
          <Text style={s.urlText}>{copied === 'url' ? 'Copied!' : 'Copy /tv-view URL'}</Text>
        </TouchableOpacity>
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <TouchableOpacity style={s.btn} onPress={() => onEdit(row)}>
          <Ionicons name="pencil" size={15} color={T.color.t0} />
          <Text style={s.btnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={() => onDelete(id)}>
          <Ionicons name="trash" size={15} color={T.color.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: T.color.bg2,
    borderRadius: T.r.md,
    borderLeftWidth: 3,
    padding: T.sp[4],
    marginBottom: T.sp[2],
    gap: T.sp[2],
    ...T.shadow.sm,
  },
  row:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  dot:    { width: 8, height: 8, borderRadius: 4 },
  name:   { flex: 1, color: T.color.t0, fontSize: T.fs.md, fontWeight: T.fw.semibold },
  badge:  { borderRadius: T.r.full, borderWidth: 1, paddingHorizontal: T.sp[2], paddingVertical: 2 },
  badgeText: { fontSize: T.fs.xs, fontWeight: T.fw.bold },
  meta:   { flexDirection: 'row', alignItems: 'center', gap: T.sp[1] },
  metaText: { color: T.color.t1, fontSize: T.fs.sm, flexShrink: 1 },
  idRow:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], flexWrap: 'wrap' },
  idChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.color.bg3, borderRadius: T.r.sm,
    paddingHorizontal: T.sp[2], paddingVertical: 3,
  },
  idText: { color: T.color.t2, fontSize: T.fs.xs, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  urlChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.color.bg3, borderRadius: T.r.sm,
    paddingHorizontal: T.sp[2], paddingVertical: 3,
  },
  urlText: { color: T.color.t1, fontSize: T.fs.xs, fontWeight: T.fw.medium },
  actions: { flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[1] },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[1],
    backgroundColor: T.color.bg3, borderRadius: T.r.sm,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[1] + 2,
  },
  btnDanger: { backgroundColor: T.color.error + '18' },
  btnText: { color: T.color.t0, fontSize: T.fs.sm, fontWeight: T.fw.medium },
});
