import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, StyleSheet, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useStoreSettings } from '../../../src/hooks/useStoreSettings';

const PAGE_PRESETS        = [3, 5, 8, 10, 15];
const REMOVE_PRESETS      = [15, 30, 60, 120, 300];
const CARDS_PER_PAGE_OPTS = [6, 8, 10, 12];
const PULSE_SEC_OPTS      = [
  { label: 'Off', value: 0 },
  { label: '3s',  value: 3 },
  { label: '5s',  value: 5 },
  { label: '8s',  value: 8 },
  { label: '10s', value: 10 },
];
const RECALL_FLASH_OPTS   = [
  { label: 'Off', value: 0 },
  { label: '10s', value: 10 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
];

export default function DisplaySettingsScreen() {
  const router = useRouter();
  const { settings, isLoading, patch, isPatching } = useStoreSettings();
  const display = (settings?.display ?? {}) as Record<string, unknown>;

  const [intervalSec, setIntervalSec] = useState('5');
  const [animsEnabled, setAnimsEnabled] = useState(true);
  const [autoRemoveEnabled, setAutoRemoveEnabled] = useState(false);
  const [autoRemoveSec, setAutoRemoveSec] = useState('60');
  const [cardsPerPage, setCardsPerPage] = useState(8);
  const [pulseSec, setPulseSec] = useState(5);
  const [recallFlashSec, setRecallFlashSec] = useState(15);

  const workflow = (settings?.workflow ?? {}) as Record<string, unknown>;
  const pickupFlow: 'two_stage' | 'ready_only' =
    workflow.pickup_flow === 'two_stage' ? 'two_stage' : 'ready_only';

  useEffect(() => {
    const v = Number(display.pickup_page_interval_seconds);
    setIntervalSec(Number.isFinite(v) && v > 0 ? String(v) : '5');
    setAnimsEnabled(display.animations_enabled !== false);
    setAutoRemoveEnabled(display.ready_auto_remove_enabled === true);
    const rs = Number(display.ready_auto_remove_seconds);
    setAutoRemoveSec(Number.isFinite(rs) && rs > 0 ? String(rs) : '60');
    const cpp = Number(display.cards_per_page);
    setCardsPerPage(Number.isFinite(cpp) && cpp > 0 ? cpp : 8);
    const ps = Number(display.new_order_pulse_seconds);
    setPulseSec(Number.isFinite(ps) ? ps : 5);
    const rf = Number(display.recall_flash_seconds);
    setRecallFlashSec(Number.isFinite(rf) ? rf : 15);
  }, [
    display.pickup_page_interval_seconds,
    display.animations_enabled,
    display.ready_auto_remove_enabled,
    display.ready_auto_remove_seconds,
    display.cards_per_page,
    display.new_order_pulse_seconds,
    display.recall_flash_seconds,
  ]);

  const saveInterval = (sec: number) => {
    const clamped = Math.max(2, Math.min(30, Math.round(sec)));
    setIntervalSec(String(clamped));
    patch({ display: { pickup_page_interval_seconds: clamped } });
  };

  const onCommitText = () => {
    const n = Number(intervalSec);
    if (!Number.isFinite(n)) return;
    saveInterval(n);
  };

  const onToggleAnims = (v: boolean) => {
    setAnimsEnabled(v);
    patch({ display: { animations_enabled: v } });
  };

  const onToggleAutoRemove = (v: boolean) => {
    setAutoRemoveEnabled(v);
    patch({ display: { ready_auto_remove_enabled: v } });
  };

  const saveAutoRemoveSec = (sec: number) => {
    const clamped = Math.max(5, Math.min(600, Math.round(sec)));
    setAutoRemoveSec(String(clamped));
    patch({ display: { ready_auto_remove_seconds: clamped } });
  };

  const onCommitAutoRemoveText = () => {
    const n = Number(autoRemoveSec);
    if (!Number.isFinite(n)) return;
    saveAutoRemoveSec(n);
  };

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={T.color.brand} size="large" /></View>;
  }

  const current = Number(intervalSec) || 5;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Ionicons name="chevron-back" size={20} color={T.color.t0} />
        <Text style={s.title}>Display</Text>
      </TouchableOpacity>

      <Section title="Pickup Flow">
        <Text style={s.help}>
          <Text style={{ fontWeight: T.fw.bold, color: T.color.t0 }}>Ready-only (default):</Text>{' '}
          Manual entries from the Dashboard go straight to Ready — the TV shows
          a single Ready column.{'\n'}
          <Text style={{ fontWeight: T.fw.bold, color: T.color.t0 }}>Two-stage (classic):</Text>{' '}
          Orders pass through Preparing → Ready, and the TV shows both columns.
        </Text>
        <View style={s.chipRow}>
          {([
            { key: 'ready_only', label: 'Ready-only' },
            { key: 'two_stage',  label: 'Two-stage' },
          ] as const).map(({ key, label }) => {
            const active = pickupFlow === key;
            return (
              <TouchableOpacity
                key={key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => patch({ workflow: { pickup_flow: key } })}
                disabled={isPatching}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="Pickup TV — Page Cycle">
        <Text style={s.help}>
          When the number of orders exceeds one screen, the pickup display cycles
          through pages. This interval controls how long each page is shown.
        </Text>

        <View style={s.chipRow}>
          {PAGE_PRESETS.map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[s.chip, current === sec && s.chipActive]}
              onPress={() => saveInterval(sec)}
              disabled={isPatching}
            >
              <Text style={[s.chipText, current === sec && s.chipTextActive]}>{sec}s</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.field}>
          <Text style={s.fieldLabel}>Custom (2 – 30 seconds)</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={intervalSec}
              onChangeText={setIntervalSec}
              onBlur={onCommitText}
              keyboardType="number-pad"
              maxLength={2}
              placeholderTextColor={T.color.t2}
            />
            <TouchableOpacity style={s.saveBtn} onPress={onCommitText} disabled={isPatching}>
              {isPatching ? <ActivityIndicator color={T.color.t0} /> : <Text style={s.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Section>

      <Section title="Ready Card Auto-Remove">
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Auto-remove ready cards</Text>
            <Text style={s.help}>
              When ON, ready cards disappear after the timer below.
              When OFF, ready cards stay on the TV until staff press "Picked Up" on the Dashboard.
            </Text>
          </View>
          <Switch value={autoRemoveEnabled} onValueChange={onToggleAutoRemove} disabled={isPatching} />
        </View>

        {autoRemoveEnabled && (
          <>
            <View style={s.chipRow}>
              {REMOVE_PRESETS.map((sec) => {
                const active = Number(autoRemoveSec) === sec;
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => saveAutoRemoveSec(sec)}
                    disabled={isPatching}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Custom (5 – 600 seconds)</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={autoRemoveSec}
                  onChangeText={setAutoRemoveSec}
                  onBlur={onCommitAutoRemoveText}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholderTextColor={T.color.t2}
                />
                <TouchableOpacity style={s.saveBtn} onPress={onCommitAutoRemoveText} disabled={isPatching}>
                  {isPatching ? <ActivityIndicator color={T.color.t0} /> : <Text style={s.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </Section>

      <Section title="Cards per page">
        <Text style={s.help}>
          Maximum number of orders shown per column at a time. When there are more
          orders than this limit the display cycles through pages automatically.
        </Text>
        <View style={s.chipRow}>
          {CARDS_PER_PAGE_OPTS.map((n) => {
            const active = cardsPerPage === n;
            return (
              <TouchableOpacity
                key={n}
                style={[s.chip, active && s.chipActive]}
                onPress={() => {
                  setCardsPerPage(n);
                  patch({ display: { cards_per_page: n } });
                }}
                disabled={isPatching}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="Number flash duration">
        <Text style={s.help}>
          How long a newly arrived order number flashes to draw staff attention.
          "Off" disables all flashing. After this window the card goes steady.
        </Text>
        <View style={s.chipRow}>
          {PULSE_SEC_OPTS.map(({ label, value }) => {
            const active = pulseSec === value;
            return (
              <TouchableOpacity
                key={value}
                style={[s.chip, active && s.chipActive]}
                onPress={() => {
                  setPulseSec(value);
                  patch({ display: { new_order_pulse_seconds: value } });
                }}
                disabled={isPatching}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="Recall flash duration">
        <Text style={s.help}>
          When staff (or auto-recall) re-announces a ready order, its number
          flashes for this long to catch the customer's eye. "Off" disables it.
        </Text>
        <View style={s.chipRow}>
          {RECALL_FLASH_OPTS.map(({ label, value }) => {
            const active = recallFlashSec === value;
            return (
              <TouchableOpacity
                key={value}
                style={[s.chip, active && s.chipActive]}
                onPress={() => {
                  setRecallFlashSec(value);
                  patch({ display: { recall_flash_seconds: value } });
                }}
                disabled={isPatching}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="Animations">
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Fade transitions on page change</Text>
            <Text style={s.help}>Disable for reduced-motion preference.</Text>
          </View>
          <Switch value={animsEnabled} onValueChange={onToggleAnims} disabled={isPatching} />
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: T.color.bg1 },
  body:  { padding: T.sp[4], gap: T.sp[4] },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  back:  { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  title: { color: T.color.t0, fontSize: T.fs.xl, fontWeight: T.fw.bold },

  section:      { gap: T.sp[2] },
  sectionTitle: { color: T.color.t1, fontSize: T.fs.sm, fontWeight: T.fw.semibold, textTransform: 'uppercase', letterSpacing: 1 },
  sectionBody:  { backgroundColor: T.color.bg2, borderRadius: T.r.md, borderWidth: 1, borderColor: T.color.border, padding: T.sp[3], gap: T.sp[3] },

  help: { color: T.color.t2, fontSize: T.fs.sm, lineHeight: 18 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  chip:    { borderWidth: 1, borderColor: T.color.border, borderRadius: T.r.full,
             paddingHorizontal: T.sp[3], paddingVertical: T.sp[2], backgroundColor: T.color.bg3 },
  chipActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  chipText:   { color: T.color.t1, fontSize: T.fs.sm },
  chipTextActive: { color: T.color.t0, fontWeight: T.fw.bold },
  chipHint:       { color: T.color.t2, fontSize: 11, marginTop: 2 },
  chipHintActive: { color: T.color.t0, opacity: 0.85 },

  field:       { gap: 4 },
  fieldLabel:  { color: T.color.t1, fontSize: T.fs.sm },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[2] },
  input: {
    flex: 1, backgroundColor: T.color.bg3, borderRadius: T.r.sm, borderWidth: 1,
    borderColor: T.color.border, color: T.color.t0, padding: T.sp[3], fontSize: T.fs.sm,
  },
  saveBtn:  { backgroundColor: T.color.brand, borderRadius: T.r.sm, paddingHorizontal: T.sp[4], paddingVertical: T.sp[2] },
  saveText: { color: T.color.t0, fontWeight: T.fw.semibold, fontSize: T.fs.sm },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[3] },
  rowLabel:  { color: T.color.t0, fontSize: T.fs.md, fontWeight: T.fw.medium },
});
