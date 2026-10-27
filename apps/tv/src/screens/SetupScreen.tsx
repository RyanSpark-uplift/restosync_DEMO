import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  type PressableStateCallbackType,
} from 'react-native';
import { T } from '@restosync/ui';
import { useTVStore } from '../store/tvStore';

export default function SetupScreen() {
  const saveCredentials = useTVStore((s) => s.saveCredentials);
  const [apiUrl,    setApiUrl]    = useState('http://192.168.1.100:3000');
  const [instanceId, setInstanceId] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const instanceRef   = useRef<TextInput>(null);
  const [btnFocused, setBtnFocused] = useState(false);

  const handleConnect = async () => {
    const url = apiUrl.trim().replace(/\/$/, '');
    const id  = instanceId.trim();
    setError('');

    if (!url.startsWith('http')) { setError('URL must start with http:// or https://'); return; }
    if (!id) { setError('TV Instance ID is required'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${url}/api/tv-instances/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} — check instance ID`);
      await res.json();
      saveCredentials(id, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.logo}>RestoSync</Text>
        <Text style={s.title}>TV Setup</Text>
        <Text style={s.subtitle}>Enter API URL and TV Instance ID to connect this display.</Text>

        <View style={s.form}>
          {/* API URL */}
          <View style={s.field}>
            <Text style={s.label}>API Server URL</Text>
            <TextInput
              style={s.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://192.168.1.100:3000"
              placeholderTextColor={T.color.t2}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="next"
              onSubmitEditing={() => instanceRef.current?.focus()}
              focusable
              hasTVPreferredFocus
            />
          </View>

          {/* Instance ID */}
          <View style={s.field}>
            <Text style={s.label}>TV Instance ID</Text>
            <TextInput
              ref={instanceRef}
              style={s.input}
              value={instanceId}
              onChangeText={setInstanceId}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              placeholderTextColor={T.color.t2}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleConnect}
              focusable
            />
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          {/* Connect button — Pressable, D-pad safe (no TouchableOpacity) */}
          <Pressable
            style={({ pressed }: PressableStateCallbackType) => [
              s.btn,
              btnFocused && s.btnFocused,
              (pressed || loading) && s.btnPressed,
            ]}
            onPress={handleConnect}
            onFocus={() => setBtnFocused(true)}
            onBlur={() => setBtnFocused(false)}
            disabled={loading}
            focusable
          >
            {loading
              ? <ActivityIndicator color={T.color.t0} />
              : <Text style={s.btnText}>Connect TV</Text>
            }
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: T.color.bg0, alignItems: 'center', justifyContent: 'center' },
  card:       { width: 560, backgroundColor: T.color.bg2, borderRadius: T.r.xl,
                padding: 48, borderWidth: 1, borderColor: T.color.border, ...T.shadow.md },
  logo:       { color: T.color.brand, fontSize: 22, fontWeight: T.fw.bold, letterSpacing: 3,
                textTransform: 'uppercase', marginBottom: 8 },
  title:      { color: T.color.t0, fontSize: 36, fontWeight: T.fw.bold, marginBottom: 8 },
  subtitle:   { color: T.color.t1, fontSize: 16, lineHeight: 24, marginBottom: 36 },
  form:       { gap: 20 },
  field:      { gap: 8 },
  label:      { color: T.color.t1, fontSize: 15, fontWeight: T.fw.medium },
  input: {
    backgroundColor: T.color.bg3, borderRadius: T.r.md, borderWidth: 2,
    borderColor: T.color.border, color: T.color.t0, fontSize: 16,
    padding: 16, fontVariant: ['tabular-nums'],
  },
  error:      { color: T.color.error, fontSize: 15, textAlign: 'center' },
  btn: {
    backgroundColor: T.color.brand, borderRadius: T.r.md,
    padding: 18, alignItems: 'center', marginTop: 8,
    borderWidth: 2, borderColor: 'transparent',
  },
  btnFocused:  { borderColor: T.color.t0, shadowColor: T.color.brand, shadowRadius: 16, shadowOpacity: 0.6, elevation: 8 },
  btnPressed:  { opacity: 0.7 },
  btnText:     { color: T.color.t0, fontSize: 18, fontWeight: T.fw.bold },
});
