import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ActivityIndicator, StyleSheet, Pressable,
  type PressableStateCallbackType,
} from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';

// QR is RN-native — guard the require so the bundle still loads if the native
// module is somehow absent (matches EventBoardScreen.tsx pattern, TR-014).
type QRComponent = React.ComponentType<{ value: string; size: number; backgroundColor?: string; color?: string }>;
let QRCode: QRComponent | null = null;
try { QRCode = require('react-native-qrcode-svg').default as QRComponent; } catch { /* native module missing */ }

// Stable per-install device id. Generated once and persisted via the same
// AsyncStorage that holds the credentials. Not security-sensitive — used only
// for server-side de-dup if a TV repeatedly hits /pair-request after restart.
let cachedDeviceId: string | null = null;
function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  // 16 random alphanum chars — enough entropy for collision-free across a
  // chain of stores. No PII; no MAC; no Android ID (deprecated permission).
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 16; i++) s += a[Math.floor(Math.random() * a.length)];
  cachedDeviceId = `onn-${s}`;
  return cachedDeviceId;
}

const POLL_INTERVAL_MS = 2_000;
const TAP_TO_SETUP_REQUIRED = 5; // staff long-press fallback to legacy SetupScreen

interface PairingState {
  code:       string | null;
  expiresAt:  number | null;     // epoch ms
  error:      string | null;
  status:     'loading' | 'pending' | 'expired' | 'claimed' | 'error';
}

export default function PairingScreen() {
  const apiUrl          = useTVStore((s) => s.apiUrl);
  const saveCredentials = useTVStore((s) => s.saveCredentials);
  const setAppState     = useTVStore((s) => s.setAppState);

  const [p, setP] = useState<PairingState>({
    code: null, expiresAt: null, error: null, status: 'loading',
  });
  const [tapCount, setTapCount] = useState(0);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);

  // ── 1. Request a fresh code on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/tv-instances/pair-request`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ device_id: getDeviceId() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json() as { pairing_code: string; expires_at: string };
        if (cancelled) return;
        setP({
          code:      body.pairing_code,
          expiresAt: new Date(body.expires_at).getTime(),
          error:     null,
          status:    'pending',
        });
      } catch (e) {
        if (cancelled) return;
        setP({
          code: null, expiresAt: null, status: 'error',
          error: e instanceof Error ? e.message : 'pair-request failed',
        });
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  // ── 2. Poll for claim every 2s while pending ──────────────────────────────
  useEffect(() => {
    if (p.status !== 'pending' || !p.code) return;
    const code = p.code;

    const tick = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/tv-instances/pair-status?code=${code}`);
        if (!res.ok) return; // 404 etc — keep trying until expiry
        const body = await res.json() as { status: 'pending' | 'expired' | 'claimed'; tv_instance_id?: string };
        if (body.status === 'claimed' && body.tv_instance_id) {
          setP((prev) => ({ ...prev, status: 'claimed' }));
          // Persist + transition to boot. App.tsx will fetchProfile + connectWs.
          saveCredentials(body.tv_instance_id, apiUrl);
        } else if (body.status === 'expired') {
          setP((prev) => ({ ...prev, status: 'expired' }));
        }
      } catch {
        // network blip — retry next tick
      }
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [p.status, p.code, apiUrl, saveCredentials]);

  // ── 3. Hard timer for local expiry (covers server outage during pending) ──
  useEffect(() => {
    if (p.status !== 'pending' || !p.expiresAt) return;
    const ms = p.expiresAt - Date.now();
    if (ms <= 0) { setP((prev) => ({ ...prev, status: 'expired' })); return; }
    expiryRef.current = setTimeout(
      () => setP((prev) => ({ ...prev, status: 'expired' })),
      ms,
    );
    return () => { if (expiryRef.current) clearTimeout(expiryRef.current); };
  }, [p.status, p.expiresAt]);

  // ── Engineering escape hatch: 5 taps on the logo opens the legacy
  // SetupScreen for manual URL + UUID entry (USB keyboard required) ─────────
  function onLogoTap() {
    const n = tapCount + 1;
    setTapCount(n);
    if (n >= TAP_TO_SETUP_REQUIRED) {
      setTapCount(0);
      setAppState('setup');
    }
  }

  function retry() {
    setP({ code: null, expiresAt: null, error: null, status: 'loading' });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (p.status === 'loading') {
    return (
      <View style={s.root}>
        <Text style={s.logo}>RestoSync</Text>
        <ActivityIndicator size="large" color={T.color.brand} />
        <Text style={s.msg}>Requesting pairing code…</Text>
      </View>
    );
  }

  if (p.status === 'error') {
    return (
      <View style={s.root}>
        <Pressable onPress={onLogoTap}><Text style={s.logo}>RestoSync</Text></Pressable>
        <Text style={[s.title, { color: T.color.error }]}>Server unreachable</Text>
        <Text style={s.subtitle}>
          {`Could not reach\n${apiUrl}`}
        </Text>
        {p.error ? <Text style={s.errorMsg}>{p.error}</Text> : null}
        <Pressable
          onPress={retry}
          focusable
          hasTVPreferredFocus
          style={({ pressed }: PressableStateCallbackType) => [s.btn, pressed && s.btnFocused]}
        >
          <Text style={s.btnText}>Retry</Text>
        </Pressable>
        <Text style={s.hint}>Tap logo 5× for engineering setup</Text>
      </View>
    );
  }

  if (p.status === 'expired') {
    return (
      <View style={s.root}>
        <Pressable onPress={onLogoTap}><Text style={s.logo}>RestoSync</Text></Pressable>
        <Text style={s.title}>Code expired</Text>
        <Text style={s.subtitle}>Pairing must complete within 10 minutes.</Text>
        <Pressable
          onPress={retry}
          focusable
          hasTVPreferredFocus
          style={({ pressed }: PressableStateCallbackType) => [s.btn, pressed && s.btnFocused]}
        >
          <Text style={s.btnText}>New code</Text>
        </Pressable>
      </View>
    );
  }

  if (p.status === 'claimed') {
    return (
      <View style={s.root}>
        <Text style={s.logo}>RestoSync</Text>
        <ActivityIndicator size="large" color={T.color.success} />
        <Text style={[s.msg, { color: T.color.success }]}>Paired! Loading display…</Text>
      </View>
    );
  }

  // status === 'pending' — main pairing UI
  // QR payload contains both the human-readable code and the API base so the
  // tablet (later: phone) can deep-link to a pre-filled claim form.
  const qrPayload = JSON.stringify({ kind: 'restosync-pair', code: p.code, api: apiUrl });

  return (
    <View style={s.root}>
      <Pressable onPress={onLogoTap}><Text style={s.logo}>RestoSync</Text></Pressable>
      <Text style={s.title}>Pair this display</Text>
      <Text style={s.subtitle}>
        Open the RestoSync tablet → Settings → Pair TV.{'\n'}Enter the code below or scan the QR.
      </Text>

      <View style={s.pairRow}>
        <View style={s.codeBox}>
          {(p.code ?? '------').split('').map((ch, i) => (
            <Text key={i} style={s.codeChar}>{ch}</Text>
          ))}
        </View>
        {QRCode ? (
          <View style={s.qrBox}>
            <QRCode value={qrPayload} size={220} backgroundColor="#FFFFFF" color="#000000" />
          </View>
        ) : null}
      </View>

      <Text style={s.hint}>Waiting for staff to confirm on tablet…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.color.bg0,
    alignItems:    'center',
    justifyContent:'center',
    padding: T.sp[10],
    gap:     T.sp[6],
  },
  logo: {
    color: T.color.brand,
    fontSize: 40,
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  title:    { color: T.color.t0, fontSize: 36 },
  subtitle: { color: T.color.t1, fontSize: 20, textAlign: 'center', lineHeight: 28 },
  msg:      { color: T.color.t1, fontSize: 22 },
  errorMsg: { color: T.color.error, fontSize: 16, fontFamily: 'Courier' },
  hint:     { color: T.color.t2, fontSize: 16, marginTop: T.sp[6] },

  pairRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap: T.sp[10],
    marginTop: T.sp[6],
  },
  codeBox: {
    flexDirection: 'row',
    backgroundColor: T.color.bg2,
    borderWidth: 2,
    borderColor: T.color.brand,
    borderRadius: T.r.lg,
    paddingVertical:   T.sp[5],
    paddingHorizontal: T.sp[6],
    gap: T.sp[3],
  },
  codeChar: {
    color: T.color.t0,
    fontSize: 72,
    fontWeight: '700',
    letterSpacing: 2,
    width: 56,
    textAlign: 'center',
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: T.sp[3],
    borderRadius: T.r.md,
  },

  btn: {
    backgroundColor: T.color.brand,
    paddingVertical:   T.sp[4],
    paddingHorizontal: T.sp[10],
    borderRadius: T.r.full,
    marginTop: T.sp[4],
  },
  btnFocused: {
    backgroundColor: T.color.brandL,
    transform: [{ scale: 1.05 }],
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
});
