import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useAuthStore, hasDevSuffix, type LoginMode } from '../../src/store/auth';
import { api } from '../../src/api/client';
import type { LoginResponse } from '../../src/api/client';

const DIGITS = ['1','2','3','4','5','6','7','8','9','⌫','0','↵'];

export default function LoginScreen() {
  const setAuth       = useAuthStore((s) => s.setAuth);
  const apiUrl        = useAuthStore((s) => s.apiUrl);
  const setApiUrl     = useAuthStore((s) => s.setApiUrl);
  const licenseKey    = useAuthStore((s) => s.licenseKey);
  const setLicenseKey = useAuthStore((s) => s.setLicenseKey);
  const loginMode     = useAuthStore((s) => s.loginMode);
  const setLoginMode  = useAuthStore((s) => s.setLoginMode);

  const [pin,     setPin]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [urlDraft, setUrlDraft] = useState(apiUrl);
  const [licenseDraft, setLicenseDraft] = useState(licenseKey);

  // engineering is only available when license has :dev suffix.
  const engAvailable = hasDevSuffix(licenseKey);

  // Phantom-digit guard: on RN-Web a single user tap can fire onPress twice
  // (pointerdown + click), or a slow drag-tap can route through two adjacent
  // keys. Lock for 80ms after every accepted press so "11" never becomes "811".
  const keyLockRef = useRef(0);
  const handleDigit = (d: string) => {
    const now = Date.now();
    if (now - keyLockRef.current < 80) return;
    keyLockRef.current = now;
    setError(null);
    if (d === '⌫') { setPin((p) => p.slice(0, -1)); return; }
    if (d === '↵') { handleLogin(); return; }
    if (pin.length >= 6) return;
    setPin((p) => p + d);
  };

  const handleLogin = async () => {
    if (pin.length < 4) { setError('Enter your 4–6 digit PIN'); return; }
    setLoading(true);
    setError(null);
    try {
      // Strip `:dev` engineer-mode suffix before sending — server only knows the
      // bare license_key (see auth.ts `isEngineerMode`).
      const res = await api.post<LoginResponse>('/api/auth/login', {
        license_key: licenseKey.replace(/:dev$/, ''),
        pin,
      });
      setAuth({
        token:        res.access_token,
        refreshToken: res.refresh_token,
        storeId:      res.user.store_id,
        role:         res.user.role,
        userName:     res.user.name,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      if (Platform.OS !== 'web') console.warn('[login]', msg);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      {/* Left panel — branding */}
      <View style={s.left}>
        <Ionicons name="restaurant" size={56} color={T.color.brand} />
        <Text style={s.logo}>RestoSync</Text>
        <Text style={s.sub}>Tablet Control</Text>
      </View>

      {/* Right panel — PIN pad */}
      <View style={s.right}>
        {/* Mode selector — pick before entering PIN. engineering hidden unless
            license has :dev suffix. Reflects current persisted choice. */}
        <View style={s.modeRow}>
          {([
            { key: 'ready_only',  label: 'Ready Only',  icon: 'checkmark-circle-outline' as const },
            { key: 'two_display', label: 'Two Display', icon: 'grid-outline'              as const },
            ...(engAvailable ? [{ key: 'engineering' as const, label: 'Engineering', icon: 'construct-outline' as const }] : []),
          ] as { key: LoginMode; label: string; icon: 'checkmark-circle-outline' | 'grid-outline' | 'construct-outline' }[]).map((m) => {
            const active = loginMode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[s.modeBtn, active && s.modeBtnActive]}
                onPress={() => setLoginMode(m.key)}
                disabled={loading}
              >
                <Ionicons name={m.icon} size={16} color={active ? T.color.t0 : T.color.t1} />
                <Text style={[s.modeText, active && s.modeTextActive]}>{m.label}</Text>
                {m.key === 'engineering' && (
                  <View style={s.engBadge}><Text style={s.engBadgeText}>ENG</Text></View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.pinDisplay}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[s.pinDot, i < pin.length && s.pinDotFilled]} />
          ))}
        </View>

        {error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={14} color={T.color.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={s.pad}>
          {DIGITS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[s.key, d === '↵' && s.keyEnter]}
              onPress={() => handleDigit(d)}
              disabled={loading}
            >
              {d === '↵' && loading
                ? <ActivityIndicator color={T.color.t0} />
                : <Text style={[s.keyText, d === '↵' && s.keyTextEnter]}>{d}</Text>
              }
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.cfg} onPress={() => setShowCfg(!showCfg)}>
          <Ionicons name="settings-outline" size={14} color={T.color.t2} />
          <Text style={s.cfgText}>Configure API</Text>
        </TouchableOpacity>

        {showCfg && (
          <View style={s.cfgPanel}>
            <Text style={s.cfgLabel}>API URL</Text>
            <TextInput
              style={s.cfgInput}
              value={urlDraft}
              onChangeText={setUrlDraft}
              placeholder="http://localhost:3000"
              placeholderTextColor={T.color.t2}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={s.cfgLabel}>License Key</Text>
            <TextInput
              style={s.cfgInput}
              value={licenseDraft}
              onChangeText={setLicenseDraft}
              placeholder="RS-TEST-0001-AAAA"
              placeholderTextColor={T.color.t2}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={s.cfgSave}
              onPress={() => {
                setApiUrl(urlDraft);
                setLicenseKey(licenseDraft);
                setShowCfg(false);
              }}
            >
              <Text style={s.cfgSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, flexDirection: 'row', backgroundColor: T.color.bg0 },
  left:  {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.color.bg1, gap: T.sp[3],
    borderRightWidth: 1, borderRightColor: T.color.border,
  },
  logo:  { color: T.color.t0, fontSize: T.fs['3xl'], fontWeight: T.fw.bold },
  sub:   { color: T.color.t1, fontSize: T.fs.lg },
  right: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp[8] },
  modeRow: { flexDirection: 'row', gap: T.sp[2], marginBottom: T.sp[6], flexWrap: 'wrap', justifyContent: 'center' },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: T.r.full, borderWidth: 1, borderColor: T.color.border,
    backgroundColor: T.color.bg3,
  },
  modeBtnActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  modeText: { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.medium },
  modeTextActive: { color: T.color.t0, fontWeight: T.fw.bold },
  engBadge: { backgroundColor: T.color.warn + '33', borderColor: T.color.warn, borderWidth: 1,
              paddingHorizontal: 6, paddingVertical: 1, borderRadius: T.r.xs },
  engBadgeText: { color: T.color.warn, fontSize: 10, fontWeight: T.fw.bold, letterSpacing: 0.8 },

  pinDisplay: { flexDirection: 'row', gap: T.sp[3], marginBottom: T.sp[8] },
  pinDot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: T.color.border, backgroundColor: 'transparent',
  },
  pinDotFilled: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  pad:   { flexDirection: 'row', flexWrap: 'wrap', width: 270, gap: T.sp[2] },
  key: {
    width: 82, height: 64, borderRadius: T.r.md,
    backgroundColor: T.color.bg3, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.color.border,
  },
  keyEnter: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  keyText:  { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.medium },
  keyTextEnter: { fontWeight: T.fw.bold },
  cfg:   { flexDirection: 'row', alignItems: 'center', gap: T.sp[1], marginTop: T.sp[6] },
  cfgText: { color: T.color.t2, fontSize: T.fs.xs },
  cfgPanel: { width: 270, marginTop: T.sp[4], gap: T.sp[2] },
  cfgLabel: { color: T.color.t1, fontSize: T.fs.sm },
  cfgInput: {
    backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1,
    borderColor: T.color.border, color: T.color.t0, padding: T.sp[3],
    fontSize: T.fs.sm,
  },
  cfgSave: {
    backgroundColor: T.color.brand, borderRadius: T.r.sm,
    padding: T.sp[3], alignItems: 'center',
  },
  cfgSaveText: { color: T.color.t0, fontWeight: T.fw.semibold, fontSize: T.fs.sm },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    marginTop: -T.sp[4], marginBottom: T.sp[4],
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: T.r.sm,
    borderWidth: 1, borderColor: T.color.error,
  },
  errorText: { color: T.color.error, fontSize: T.fs.sm, fontWeight: T.fw.medium },
});
