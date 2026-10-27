import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { T, ftColor } from '@restosync/ui';
import { api } from '../../../src/api/client';
import { TVCard } from '../../../src/components/TVCard';
import type { TvInstance, TvInstanceRow, TvProfile } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import PairTvSheet from '../../../src/components/PairTvSheet';

// Alert.alert is a silent no-op on RN Web. Use window.alert/confirm there so
// validation feedback and destructive confirmations actually surface.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
function confirmAction(title: string, message: string, confirmLabel = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

type FunctionType = TvInstance['function_type'];

// Full catalog. ready_only mode collapses this down to pickup-only — see
// FT_SECTIONS_BY_MODE below.
const FT_SECTIONS_ALL: { type: FunctionType; label: string }[] = [
  { type: 'menu',    label: 'Menu Board' },
  { type: 'pickup',  label: 'Pickup Display' },
  { type: 'event',   label: 'Event Board' },
  { type: 'ad',      label: 'Ad Display' },
];
const FT_SECTIONS_READY_ONLY: { type: FunctionType; label: string }[] = [
  { type: 'pickup', label: 'Pickup Display' },
];

const SNAP_POINTS = ['60%', '90%'];

interface FormState {
  display_name: string;
  ip_address:   string;
  function_type: FunctionType;
  profile_id:   string;
}

const DEFAULT_FORM: FormState = {
  display_name:  '',
  ip_address:    '',
  function_type: 'menu',
  profile_id:    '',
};

export default function TVsScreen() {
  const qc         = useQueryClient();
  const sheetRef   = useRef<BottomSheet>(null);
  const loginMode  = useAuthStore((st) => st.loginMode);
  const [editId,   setEditId]   = useState<string | null>(null);
  // ready_only mode = single-screen pickup product. Hide menu/event/ad sections
  // and the corresponding function_type chips. engineering/two_display keep all.
  const FT_SECTIONS = loginMode === 'ready_only' ? FT_SECTIONS_READY_ONLY : FT_SECTIONS_ALL;
  const defaultFunctionType: FunctionType = loginMode === 'ready_only' ? 'pickup' : 'menu';
  const [form,     setForm]     = useState<FormState>({ ...DEFAULT_FORM, function_type: defaultFunctionType });
  const [pairSheetOpen, setPairSheetOpen] = useState(false);

  const { data: rows, isLoading, error, refetch } = useQuery<TvInstanceRow[]>({
    queryKey: ['tv-instances'],
    queryFn:  () => api.get('/api/tv-instances'),
  });

  const { data: profiles } = useQuery<TvProfile[]>({
    queryKey: ['tv-profiles'],
    queryFn:  () => api.get('/api/tv-profiles'),
  });

  const grouped = FT_SECTIONS.reduce<Record<FunctionType, TvInstanceRow[]>>(
    (acc, { type }) => {
      acc[type] = (rows ?? []).filter((r) => r.instance.function_type === type);
      return acc;
    },
    { menu: [], pickup: [], event: [], ad: [] },
  );

  const createMutation = useMutation({
    mutationFn: (body: Omit<FormState, 'profile_id'> & { profile_id?: string }) =>
      api.post<TvInstance>('/api/tv-instances', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tv-instances'] });
      closeSheet();
    },
    onError: (e: Error) => notify('Error', e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, profile_id }: { id: string; profile_id: string }) =>
      api.patch(`/api/tv-instances/${id}/profile`, { profile_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tv-instances'] });
      closeSheet();
    },
    onError: (e: Error) => notify('Error', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tv-instances/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tv-instances'] }),
    onError:   (e: Error) => notify('Error', e.message),
  });

  const openAdd = useCallback((ft?: FunctionType) => {
    setEditId(null);
    setForm({ ...DEFAULT_FORM, function_type: ft ?? defaultFunctionType });
    sheetRef.current?.expand();
  }, [defaultFunctionType]);

  const openEdit = useCallback((row: TvInstanceRow) => {
    setEditId(row.instance.id);
    setForm({
      display_name:  row.instance.display_name ?? '',
      ip_address:    row.instance.ip_address   ?? '',
      function_type: row.instance.function_type,
      profile_id:    row.instance.profile_id   ?? '',
    });
    sheetRef.current?.expand();
  }, []);

  const closeSheet = useCallback(() => {
    sheetRef.current?.close();
    setEditId(null);
    setForm(DEFAULT_FORM);
  }, []);

  const handleConfirmDelete = useCallback(async (id: string) => {
    if (await confirmAction('Delete TV', 'Remove this TV from the system?', 'Delete', true)) {
      deleteMutation.mutate(id);
    }
  }, [deleteMutation]);

  const handleSave = () => {
    if (!form.display_name.trim()) {
      notify('Validation', 'Display name is required');
      return;
    }
    if (editId) {
      updateMutation.mutate({ id: editId, profile_id: form.profile_id });
    } else {
      createMutation.mutate({
        display_name:  form.display_name.trim(),
        ip_address:    form.ip_address.trim() || undefined as unknown as string,
        function_type: form.function_type,
        ...(form.profile_id ? { profile_id: form.profile_id } : {}),
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const profilesForType = (profiles ?? []).filter(
    (p) => p.profile_type === form.function_type || form.function_type === 'ad',
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>TV Displays</Text>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={() => refetch()} style={s.iconBtn}>
            <Ionicons name="refresh" size={18} color={T.color.t1} />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => setPairSheetOpen(true)}>
            <Ionicons name="qr-code-outline" size={18} color={T.color.t0} />
            <Text style={s.addBtnText}>Pair TV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => openAdd()}>
            <Ionicons name="add" size={18} color={T.color.t0} />
            <Text style={s.addBtnText}>Add TV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* States */}
      {isLoading && (
        <View style={s.center}>
          <ActivityIndicator color={T.color.brand} size="large" />
        </View>
      )}
      {error && (
        <View style={s.center}>
          <Ionicons name="alert-circle" size={36} color={T.color.error} />
          <Text style={s.errorText}>Failed to load TVs</Text>
          <Text style={[s.errorText, { fontSize: T.fs.sm, opacity: 0.7 }]}>
            {error instanceof Error ? error.message : String(error)}
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !error && (
        <ScrollView contentContainerStyle={s.scrollContent}>
          {FT_SECTIONS.map(({ type, label }) => {
            const sectionRows = grouped[type];
            const color = ftColor(type);
            return (
              <View key={type} style={s.section}>
                {/* Section header */}
                <View style={s.sectionHeader}>
                  <View style={[s.sectionDot, { backgroundColor: color }]} />
                  <Text style={[s.sectionTitle, { color }]}>{label}</Text>
                  <Text style={s.sectionCount}>{sectionRows.length}</Text>
                  <TouchableOpacity
                    style={[s.sectionAddBtn, { borderColor: color }]}
                    onPress={() => openAdd(type)}
                  >
                    <Ionicons name="add" size={14} color={color} />
                    <Text style={[s.sectionAddText, { color }]}>Add</Text>
                  </TouchableOpacity>
                </View>

                {/* TV cards */}
                {sectionRows.length === 0 ? (
                  <View style={s.emptySection}>
                    <Text style={s.emptySectionText}>No {label.toLowerCase()} TVs configured</Text>
                  </View>
                ) : (
                  sectionRows.map((row) => (
                    <TVCard
                      key={row.instance.id}
                      row={row}
                      onEdit={openEdit}
                      onDelete={handleConfirmDelete}
                    />
                  ))
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        onClose={closeSheet}
        backgroundStyle={s.sheetBg}
        handleIndicatorStyle={s.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Text style={s.sheetTitle}>{editId ? 'Edit TV' : 'Add TV'}</Text>

            {/* Display Name */}
            <View style={s.field}>
              <Text style={s.label}>Display Name *</Text>
              <TextInput
                style={[s.input, editId ? s.inputDisabled : null]}
                value={form.display_name}
                onChangeText={(v) => setForm((f) => ({ ...f, display_name: v }))}
                placeholder="e.g. Menu Board Left"
                placeholderTextColor={T.color.t2}
                editable={!editId}
              />
            </View>

            {/* IP Address */}
            <View style={s.field}>
              <Text style={s.label}>IP Address</Text>
              <TextInput
                style={[s.input, editId ? s.inputDisabled : null]}
                value={form.ip_address}
                onChangeText={(v) => setForm((f) => ({ ...f, ip_address: v }))}
                placeholder="e.g. 192.168.1.50"
                placeholderTextColor={T.color.t2}
                keyboardType="decimal-pad"
                editable={!editId}
              />
            </View>

            {/* Function Type */}
            <View style={s.field}>
              <Text style={s.label}>Function Type</Text>
              <View style={s.segmentRow}>
                {FT_SECTIONS.map(({ type, label }) => {
                  const active = form.function_type === type;
                  const color  = ftColor(type);
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        s.segment,
                        active && { backgroundColor: color + '22', borderColor: color },
                        editId ? s.segmentDisabled : null,
                      ]}
                      onPress={() => !editId && setForm((f) => ({ ...f, function_type: type, profile_id: '' }))}
                      disabled={!!editId}
                    >
                      <Text style={[s.segmentText, active && { color }]}>
                        {label.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Profile */}
            <View style={s.field}>
              <Text style={s.label}>Content Profile</Text>
              {profilesForType.length === 0 ? (
                <View style={s.noProfiles}>
                  <Text style={s.noProfilesText}>No profiles for this type</Text>
                </View>
              ) : (
                profilesForType.map((p) => {
                  const active = form.profile_id === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[s.profileRow, active && s.profileRowActive]}
                      onPress={() => setForm((f) => ({ ...f, profile_id: p.id }))}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={active ? T.color.brand : T.color.t2}
                      />
                      <View style={s.profileInfo}>
                        <Text style={s.profileName}>{p.profile_name}</Text>
                        <Text style={s.profileMeta}>
                          {p.profile_type}
                          {p.pickup_mode ? ` · ${p.pickup_mode}` : ''}
                          {p.tts_enabled ? ' · TTS' : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* Actions */}
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelSheetBtn} onPress={closeSheet}>
                <Text style={s.cancelSheetText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveSheetBtn, isPending && s.btnDisabled]}
                onPress={handleSave}
                disabled={isPending}
              >
                {isPending
                  ? <ActivityIndicator color={T.color.t0} size="small" />
                  : <Text style={s.saveSheetText}>{editId ? 'Save Profile' : 'Add TV'}</Text>
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Pair-by-code sheet — staff types the 6-char code shown on the TV's
          PairingScreen. Server creates the tv_instances row under our store. */}
      {pairSheetOpen && (
        <PairTvSheet
          onClose={() => setPairSheetOpen(false)}
          onPaired={() => { setPairSheetOpen(false); refetch(); }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: T.color.bg1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    padding: T.sp[4], paddingBottom: T.sp[3] },
  title:          { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },
  headerActions:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  iconBtn:        { padding: T.sp[2] },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: T.sp[1],
                    backgroundColor: T.color.brand, borderRadius: T.r.sm,
                    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2] },
  addBtnText:     { color: T.color.t0, fontWeight: T.fw.semibold, fontSize: T.fs.sm },
  scrollContent:  { padding: T.sp[4], paddingTop: 0, gap: T.sp[4], paddingBottom: T.sp[12] },

  section:        { gap: T.sp[2] },
  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], marginBottom: T.sp[1] },
  sectionDot:     { width: 8, height: 8, borderRadius: 4 },
  sectionTitle:   { fontSize: T.fs.sm, fontWeight: T.fw.bold, textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  sectionCount:   { color: T.color.t2, fontSize: T.fs.xs,
                    backgroundColor: T.color.bg3, borderRadius: T.r.full,
                    paddingHorizontal: T.sp[2], paddingVertical: 1 },
  sectionAddBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4,
                    borderWidth: 1, borderRadius: T.r.sm,
                    paddingHorizontal: T.sp[2], paddingVertical: 3 },
  sectionAddText: { fontSize: T.fs.xs, fontWeight: T.fw.semibold },
  emptySection:   { backgroundColor: T.color.bg2, borderRadius: T.r.md,
                    borderWidth: 1, borderColor: T.color.border,
                    padding: T.sp[4], alignItems: 'center' },
  emptySectionText: { color: T.color.t2, fontSize: T.fs.sm },

  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.sp[3] },
  errorText:      { color: T.color.error, fontSize: T.fs.md },
  retryBtn:       { backgroundColor: T.color.brand, borderRadius: T.r.sm,
                    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2] },
  retryText:      { color: T.color.t0, fontWeight: T.fw.semibold },

  // Sheet
  sheetBg:        { backgroundColor: T.color.bg2, borderTopLeftRadius: T.r.xl, borderTopRightRadius: T.r.xl },
  sheetHandle:    { backgroundColor: T.color.border },
  sheetContent:   { padding: T.sp[4], gap: T.sp[3], paddingBottom: T.sp[12] },
  sheetTitle:     { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold, marginBottom: T.sp[2] },

  field:          { gap: T.sp[1] },
  label:          { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.medium },
  input: {
    backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1,
    borderColor: T.color.border, color: T.color.t0,
    padding: T.sp[3], fontSize: T.fs.md,
  },
  inputDisabled:  { opacity: 0.5 },

  segmentRow:     { flexDirection: 'row', gap: T.sp[2], flexWrap: 'wrap' },
  segment: {
    borderRadius: T.r.sm, borderWidth: 1, borderColor: T.color.border,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    backgroundColor: T.color.bg3,
  },
  segmentDisabled: { opacity: 0.5 },
  segmentText:    { color: T.color.t2, fontSize: T.fs.sm, fontWeight: T.fw.medium },

  noProfiles:     { backgroundColor: T.color.bg3, borderRadius: T.r.sm,
                    padding: T.sp[3], alignItems: 'center' },
  noProfilesText: { color: T.color.t2, fontSize: T.fs.sm },
  profileRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.sp[3],
    backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1,
    borderColor: T.color.border, padding: T.sp[3],
  },
  profileRowActive: { borderColor: T.color.brand, backgroundColor: T.color.brand + '0F' },
  profileInfo:    { flex: 1 },
  profileName:    { color: T.color.t0, fontSize: T.fs.md, fontWeight: T.fw.medium },
  profileMeta:    { color: T.color.t1, fontSize: T.fs.xs, marginTop: 2 },

  sheetActions:   { flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[4] },
  cancelSheetBtn: {
    flex: 1, borderRadius: T.r.sm, borderWidth: 1, borderColor: T.color.border,
    padding: T.sp[3], alignItems: 'center',
  },
  cancelSheetText: { color: T.color.t1, fontWeight: T.fw.medium },
  saveSheetBtn:   { flex: 2, backgroundColor: T.color.brand, borderRadius: T.r.sm, padding: T.sp[3], alignItems: 'center' },
  saveSheetText:  { color: T.color.t0, fontWeight: T.fw.bold },
  btnDisabled:    { opacity: 0.5 },
});
