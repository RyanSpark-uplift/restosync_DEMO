import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useAuthStore, tvTarget } from '../../../src/store/auth';
import { api } from '../../../src/api/client';
import { Section, Row } from '../../../src/components/SettingsRow';

interface VenueGroupInfo {
  id: string; name: string; code: string; footer_message: string | null;
  members: { id: string; store_id: string; label: string | null; color_hex: string | null }[];
}

export default function SettingsScreen() {
  const router = useRouter();
  const { role, userName, storeId, apiUrl, licenseKey, loginMode, setApiUrl, clearAuth } = useAuthStore();
  const engineerVisible = loginMode === 'engineering';
  const twoDisplayVisible = loginMode === 'two_display' || engineerVisible;
  const target = tvTarget(licenseKey);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft,   setUrlDraft]   = useState(apiUrl);
  const [pinFlow,    setPinFlow]    = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Food Court 참가
  const [groupCode,     setGroupCode]     = useState('');
  const [groupLookup,   setGroupLookup]   = useState<VenueGroupInfo | null>(null);
  const [groupLoading,  setGroupLoading]  = useState(false);
  const [venueLabel,    setVenueLabel]    = useState('');
  const [venueColor,    setVenueColor]    = useState('#E8450A');
  const [currentGroup,  setCurrentGroup]  = useState<{ name: string; label: string | null } | null>(null);

  // Load current membership on mount — disabled: GET /api/venue-groups/membership endpoint 미구현.
  // Sprint 6 (FoodCourt mode) 진입 시 endpoint 추가 후 활성화. 현재는 404 console 노이즈만 발생.

  const handleLookupGroup = async () => {
    const code = groupCode.trim().toUpperCase();
    if (!code) return;
    setGroupLoading(true);
    setGroupLookup(null);
    try {
      const data = await api.get<VenueGroupInfo>(`/api/venue-groups/${code}`);
      setGroupLookup(data);
      // Pre-fill label if already a member
      const mine = data.members.find((m) => m.store_id === storeId);
      if (mine) {
        setVenueLabel(mine.label ?? '');
        setVenueColor(mine.color_hex ?? '#E8450A');
      }
    } catch {
      Alert.alert('Not Found', `No food court found with code "${code}"`);
    } finally {
      setGroupLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!groupLookup) return;
    if (!venueLabel.trim()) { Alert.alert('Required', 'Enter your venue label (e.g. "Burger Joint")'); return; }
    try {
      await api.post(`/api/venue-groups/${groupLookup.id}/members`, {
        label: venueLabel.trim(),
        color_hex: venueColor,
      });
      setCurrentGroup({ name: groupLookup.name, label: venueLabel.trim() });
      setGroupLookup(null);
      setGroupCode('');
      Alert.alert('Joined!', `You joined "${groupLookup.name}" as "${venueLabel.trim()}"`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join group');
    }
  };

  const handleSaveUrl = () => {
    if (!urlDraft.startsWith('http')) {
      Alert.alert('Invalid URL', 'Must start with http:// or https://');
      return;
    }
    setApiUrl(urlDraft.replace(/\/$/, ''));
    setEditingUrl(false);
  };

  const handleChangePin = async () => {
    if (newPin.length < 4) { Alert.alert('Error', 'PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { Alert.alert('Error', 'PINs do not match'); return; }
    try {
      await api.post('/api/auth/change-pin', { current_pin: currentPin, new_pin: newPin });
      Alert.alert('Success', 'PIN changed successfully');
      setPinFlow(false);
      setCurrentPin(''); setNewPin(''); setConfirmPin('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to change PIN');
    }
  };

  const handleLogout = () => {
    // AG-020 §6: Alert.alert는 RN-Web에서 no-op → web은 window.confirm 분기.
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm('Log out of this device?')) {
        clearAuth();
      }
      return;
    }
    Alert.alert('Logout', 'Log out of this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: clearAuth },
    ]);
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>Settings</Text>

      {/* Account */}
      <Section title="Account">
        <Row icon="person-outline" label="Logged in as" value={userName ?? '—'} />
        <Row icon="shield-outline" label="Role" value={role ?? '—'} />
        <Row icon="storefront-outline" label="Store ID" value={storeId ? storeId.slice(0, 8) + '…' : '—'} />
        <Row
          icon="apps-outline"
          label="Mode"
          value={loginMode === 'ready_only' ? 'Ready Only'
               : loginMode === 'two_display' ? 'Two Display'
               : 'Engineering'}
          eng={engineerVisible}
        />
        <Row
          icon="tv-outline"
          label="TV Target"
          value={target === 'emulator' ? 'Android Emulator (dev)' : 'Onn 4K (production)'}
        />
      </Section>

      {/* API Config */}
      <Section title="Connection">
        {editingUrl ? (
          <View style={s.editRow}>
            <TextInput
              style={s.input}
              value={urlDraft}
              onChangeText={setUrlDraft}
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor={T.color.t2}
            />
            <TouchableOpacity style={s.saveBtn} onPress={handleSaveUrl}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditingUrl(false); setUrlDraft(apiUrl); }}>
              <Ionicons name="close" size={18} color={T.color.t1} />
            </TouchableOpacity>
          </View>
        ) : (
          <Row icon="server-outline" label="API URL" value={apiUrl} onPress={() => setEditingUrl(true)} />
        )}
      </Section>

      {/* Operator Settings — content gated by loginMode (3-mode system):
            ready_only  → Brand Themes + Display/PageCycle now universal; Audio, Language
            two_display → same universal rows + AI Prep Time
            engineering → all rows + ENG badges on eng-specific items */}
      <Section title="Operator Settings">
        {/* Universal — every mode sees Brand Themes and Display/PageCycle */}
        <Row
          icon="color-palette-outline"
          label="Brand Themes"
          value="12 brand themes"
          eng={engineerVisible}
          onPress={() => router.push('/(tabs)/settings/theme' as never)}
        />
        <Row icon="apps-outline" label="Display & Page Cycle" eng={engineerVisible} onPress={() => router.push('/(tabs)/settings/display' as never)} />
        <Row icon="volume-high-outline" label="Audio & TTS" onPress={() => router.push('/(tabs)/settings/audio' as never)} />
        <Row icon="language-outline"    label="Language"    onPress={() => router.push('/(tabs)/settings/language' as never)} />
        {/* two_display / engineering only */}
        {twoDisplayVisible && (
          <Row icon="bulb-outline" label="AI Prep Time" eng={engineerVisible} onPress={() => router.push('/(tabs)/settings/ai' as never)} />
        )}
      </Section>

      {/* PIN Management */}
      <Section title="Security">
        {!pinFlow ? (
          <Row icon="lock-closed-outline" label="Change PIN" onPress={() => setPinFlow(true)} />
        ) : (
          <View style={s.pinForm}>
            {[
              { label: 'Current PIN', value: currentPin, setter: setCurrentPin },
              { label: 'New PIN',     value: newPin,     setter: setNewPin },
              { label: 'Confirm PIN', value: confirmPin, setter: setConfirmPin },
            ].map(({ label, value, setter }) => (
              <View key={label} style={s.pinField}>
                <Text style={s.pinLabel}>{label}</Text>
                <TextInput
                  style={s.input}
                  value={value}
                  onChangeText={setter}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholderTextColor={T.color.t2}
                  placeholder="••••"
                />
              </View>
            ))}
            <View style={s.pinActions}>
              <TouchableOpacity style={s.saveBtn} onPress={handleChangePin}>
                <Text style={s.saveBtnText}>Update PIN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setPinFlow(false); setCurrentPin(''); setNewPin(''); setConfirmPin(''); }}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Section>

      {/* Food Court — multi-venue feature, gated for ready_only mode (v1 single store).
          Visible in two_display + engineering. */}
      {twoDisplayVisible && (
      <Section title="Food Court">
        {currentGroup ? (
          <View style={s.row}>
            <Ionicons name="people-outline" size={18} color={T.color.t1} />
            <View style={s.rowBody}>
              <Text style={s.rowLabel}>{currentGroup.name}</Text>
              <Text style={s.rowValue}>Your label: {currentGroup.label}</Text>
            </View>
            <TouchableOpacity onPress={() => setCurrentGroup(null)}>
              <Ionicons name="pencil-outline" size={16} color={T.color.t2} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.foodCourtForm}>
            {/* Code lookup */}
            <View style={s.editRow}>
              <TextInput
                style={s.input}
                value={groupCode}
                onChangeText={setGroupCode}
                autoCapitalize="characters"
                placeholder="Group code (e.g. DFC001)"
                placeholderTextColor={T.color.t2}
              />
              <TouchableOpacity style={s.saveBtn} onPress={handleLookupGroup} disabled={groupLoading}>
                {groupLoading
                  ? <ActivityIndicator size="small" color={T.color.t0} />
                  : <Text style={s.saveBtnText}>Look Up</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Group info + join form */}
            {groupLookup && (
              <View style={s.groupInfo}>
                <Text style={s.groupName}>{groupLookup.name}</Text>
                <Text style={s.groupMeta}>{groupLookup.members.length} venue(s) in this food court</Text>

                <View style={s.field}>
                  <Text style={s.fieldLabel}>Your Venue Label</Text>
                  <TextInput
                    style={s.input}
                    value={venueLabel}
                    onChangeText={setVenueLabel}
                    placeholder="e.g. Burger Joint"
                    placeholderTextColor={T.color.t2}
                    maxLength={40}
                  />
                </View>

                <View style={s.field}>
                  <Text style={s.fieldLabel}>Brand Color (hex)</Text>
                  <View style={s.colorRow}>
                    <View style={[s.colorSwatch, { backgroundColor: venueColor }]} />
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={venueColor}
                      onChangeText={(v) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setVenueColor(v); }}
                      placeholder="#E8450A"
                      placeholderTextColor={T.color.t2}
                      autoCapitalize="none"
                      maxLength={7}
                    />
                  </View>
                </View>

                <View style={s.joinActions}>
                  <TouchableOpacity style={s.saveBtn} onPress={handleJoinGroup}>
                    <Text style={s.saveBtnText}>Join Group</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setGroupLookup(null)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </Section>

      )}

      {/* Developer (only shown when login mode = engineering) */}
      {engineerVisible && (
        <Section title="Developer">
          <Row
            icon="construct-outline"
            label="Engineer Mode"
            value="Test panel — orders / WS log"
            eng
            onPress={() => router.push('/(tabs)/settings/engineer')}
          />
        </Section>
      )}

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color={T.color.error} />
        <Text style={s.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={s.version}>RestoSync Tablet v1.0.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: T.color.bg1 },
  content:      { padding: T.sp[4], gap: T.sp[4], paddingBottom: T.sp[12] },
  pageTitle:    { color: T.color.t0, fontSize: T.fs['2xl'], fontWeight: T.fw.bold, marginBottom: T.sp[2] },
  // The Food Court branch reuses the Row visual when a group is already joined
  // — keep `row` style here as a duplicate of SettingsRow's row for that inline use.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    padding: T.sp[4], borderBottomWidth: 1, borderBottomColor: T.color.borderS,
  },
  rowBody:    { flex: 1 },
  rowLabel:   { color: T.color.t0, fontSize: T.fs.md },
  rowValue:   { color: T.color.t1, fontSize: T.fs.sm, marginTop: 2 },
  editRow:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], padding: T.sp[3] },
  input: {
    flex: 1, backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1,
    borderColor: T.color.border, color: T.color.t0, padding: T.sp[3], fontSize: T.fs.sm,
  },
  saveBtn:     { backgroundColor: T.color.brand, borderRadius: T.r.sm, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2] },
  saveBtnText: { color: T.color.t0, fontWeight: T.fw.semibold, fontSize: T.fs.sm },
  cancelBtn:   { padding: T.sp[2] },
  cancelBtnText: { color: T.color.t1, fontSize: T.fs.sm },
  pinForm:     { padding: T.sp[4], gap: T.sp[3] },
  pinField:    { gap: T.sp[1] },
  pinLabel:    { color: T.color.t1, fontSize: T.fs.sm },
  pinActions:  { flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[2] },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2], justifyContent: 'center',
    backgroundColor: T.color.error + '18', borderRadius: T.r.md, padding: T.sp[4],
    borderWidth: 1, borderColor: T.color.error + '44',
  },
  logoutText:  { color: T.color.error, fontWeight: T.fw.semibold, fontSize: T.fs.md },
  version:     { color: T.color.t2, fontSize: T.fs.xs, textAlign: 'center', marginTop: T.sp[4] },

  foodCourtForm: { padding: T.sp[3], gap: T.sp[3] },
  groupInfo:     { gap: T.sp[3], paddingTop: T.sp[2], borderTopWidth: 1, borderTopColor: T.color.borderS },
  groupName:     { color: T.color.t0, fontSize: T.fs.md, fontWeight: T.fw.semibold },
  groupMeta:     { color: T.color.t1, fontSize: T.fs.sm },
  field:         { gap: T.sp[1] },
  fieldLabel:    { color: T.color.t1, fontSize: T.fs.sm },
  colorRow:      { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  colorSwatch:   { width: 32, height: 32, borderRadius: T.r.sm, borderWidth: 1, borderColor: T.color.border },
  joinActions:   { flexDirection: 'row', gap: T.sp[2], marginTop: T.sp[1] },
});
