// M03 Sprint A — Event Create/Edit modal (RN Modal, web/native safe).
//
// Fields: type · title · ticker_text · image_url(upload) · start_at · end_at · (active in edit mode).
// Image upload: web `<input type=file>` → POST /api/events/upload → store returned URL.
//                Native picker는 P1.5 (menus/import wizard와 동일 패턴).
// Date/time:    TextInput + shortcuts (+1h / +24h / +7d / Now). ISO 8601 UTC.
//
// AG-014 4-state (web Alert no-op 회피 — inline errorBox).
// AG-024 reminder: 입력값은 UTC ISO. 표시는 디바이스 로컬 — TV는 stores.timezone 변환 별도.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { T } from '@restosync/ui';
import {
  createEvent, patchEvent, deleteEvent, uploadEventImage,
  EVENT_TYPES, type EventType, type EventCreateInput, type EventPatchInput,
} from '../../api/events';
import type { Event } from '../../api/client';
import { useAuthStore } from '../../store/auth';

interface Props {
  visible: boolean;
  initial: Event | null;       // null → Create mode, Event → Edit mode
  onClose: () => void;
}

const TYPE_META: Record<EventType, { icon: string; label: string; color: string }> = {
  happy_hour: { icon: 'beer',          label: 'Happy Hour',  color: T.color.warn },
  live_event: { icon: 'musical-notes', label: 'Live Event',  color: T.color.info },
  lto:        { icon: 'time',          label: 'LTO',         color: T.color.brand },
  alert:      { icon: 'warning',       label: 'Alert',       color: T.color.error },
  promo:      { icon: 'pricetag',      label: 'Promo',       color: T.color.success },
};

function plusISO(base: string | null, ms: number): string {
  const start = base && !Number.isNaN(Date.parse(base)) ? new Date(base) : new Date();
  return new Date(start.getTime() + ms).toISOString();
}

function nowISO(): string {
  return new Date().toISOString();
}

// Trim ISO to seconds precision for input ergonomics (drop ms+Z 부분 적용 시 그대로 사용).
function trimToSeconds(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

export function EventEditorModal({ visible, initial, onClose }: Props) {
  const qc = useQueryClient();
  const { apiUrl } = useAuthStore();
  const isEdit = !!initial;

  // ── form state ──────────────────────────────────────────────────────────────
  const [type,        setType]        = useState<EventType>('promo');
  const [title,       setTitle]       = useState('');
  const [tickerText,  setTickerText]  = useState('');
  const [imageUrl,    setImageUrl]    = useState<string | null>(null);
  const [ctaUrl,      setCtaUrl]      = useState('');
  const [startAt,     setStartAt]     = useState('');   // ISO string or ''
  const [endAt,       setEndAt]       = useState('');
  const [active,      setActive]      = useState(false);   // edit-mode only
  const [aiNotice,    setAiNotice]    = useState(false);   // Mode B stub
  const [error,       setError]       = useState<string | null>(null);

  // Reset whenever modal opens with new initial.
  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setType((EVENT_TYPES as readonly string[]).includes(initial.type) ? initial.type as EventType : 'promo');
      setTitle(initial.title ?? '');
      setTickerText(initial.ticker_text ?? '');
      setImageUrl(initial.image_url);
      setCtaUrl(initial.cta_url ?? '');
      setStartAt(initial.start_at ?? '');
      setEndAt(initial.end_at ?? '');
      setActive(initial.active);
    } else {
      setType('promo');
      setTitle(''); setTickerText(''); setImageUrl(null); setCtaUrl('');
      setStartAt(''); setEndAt('');
      setActive(false);
    }
    setError(null);
    setAiNotice(false);
  }, [visible, initial]);

  // ── image upload ────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const upload = useMutation({
    mutationFn: (file: Blob) => uploadEventImage(file, (file as File).name ?? 'event.bin'),
    onSuccess: (resp) => setImageUrl(resp.url),
    onError:   (e: unknown) => setError(e instanceof Error ? e.message : 'Image upload failed'),
  });

  const onPickImage = () => {
    setError(null);
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      setError('Native image picker coming in P1.5 — use the web tablet build for now.');
    }
  };

  // ── mutations ───────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () => {
      const payload: EventCreateInput = {
        type,
        ...(title.trim()       ? { title:       title.trim() }       : {}),
        ...(tickerText.trim()  ? { ticker_text: tickerText.trim() }  : {}),
        ...(imageUrl           ? { image_url:   imageUrl }           : {}),
        ...(ctaUrl.trim()      ? { cta_url:     ctaUrl.trim() }      : {}),
        ...(startAt.trim()     ? { start_at:    startAt.trim() }     : {}),
        ...(endAt.trim()       ? { end_at:      endAt.trim() }       : {}),
      };
      if (isEdit && initial) {
        const patch: EventPatchInput = { ...payload, active };
        return patchEvent(initial.id, patch);
      }
      return createEvent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'),
  });

  const del = useMutation({
    mutationFn: () => {
      if (!initial) throw new Error('No event to delete');
      return deleteEvent(initial.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Delete failed'),
  });

  // ── validation ──────────────────────────────────────────────────────────────
  const datesValid = useMemo(() => {
    if (!startAt && !endAt) return true;
    if (startAt && Number.isNaN(Date.parse(startAt))) return false;
    if (endAt   && Number.isNaN(Date.parse(endAt)))   return false;
    if (startAt && endAt) return Date.parse(startAt) < Date.parse(endAt);
    return true;
  }, [startAt, endAt]);

  const ctaValid = useMemo(() => {
    const v = ctaUrl.trim();
    if (!v) return true;
    try { new URL(v); return true; } catch { return false; }
  }, [ctaUrl]);

  const canSubmit = !!type && datesValid && ctaValid && !save.isPending && !upload.isPending;

  const submit = () => {
    setError(null);
    if (!datesValid) {
      setError('Invalid date: start must be ISO 8601 and earlier than end.');
      return;
    }
    if (!ctaValid) {
      setError('CTA URL is not a valid URL (must include http(s)://).');
      return;
    }
    save.mutate();
  };

  const confirmDelete = () => {
    if (!initial) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(`Delete "${initial.title ?? initial.type}"? This cannot be undone.`);
      if (!ok) return;
    }
    del.mutate();
  };

  // Resolve preview URL (server returns relative path /uploads/events/<id>.ext).
  const previewSrc = imageUrl && imageUrl.startsWith('/') ? `${apiUrl}${imageUrl}` : imageUrl;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>{isEdit ? 'Edit Event' : 'New Event'}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={T.color.t1} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 580 }} contentContainerStyle={s.body}>
            {/* Mode B stub — AG-010 Phase 2 placeholder */}
            <View style={s.modeRow}>
              <TouchableOpacity
                style={[s.modeBtn, s.modeBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Manual design mode"
              >
                <Ionicons name="create-outline" size={14} color="#fff" />
                <Text style={[s.modeText, { color: '#fff' }]}>Mode A · Manual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modeBtn}
                onPress={() => setAiNotice(true)}
                accessibilityRole="button"
                accessibilityLabel="AI design mode (coming soon)"
              >
                <Ionicons name="sparkles-outline" size={14} color={T.color.t1} />
                <Text style={s.modeText}>Mode B · AI Design</Text>
              </TouchableOpacity>
            </View>
            {aiNotice && (
              <View style={s.noticeBox}>
                <Ionicons name="information-circle" size={14} color={T.color.info} />
                <Text style={s.noticeText}>
                  AI auto-design (Mode B) coming in Phase 2. For now, use Mode A.
                </Text>
              </View>
            )}

            {/* Type */}
            <Field label="Type">
              <View style={s.chipWrap}>
                {EVENT_TYPES.map((t) => {
                  const meta = TYPE_META[t];
                  const isActive = type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.typeChip, isActive && { backgroundColor: meta.color, borderColor: meta.color }]}
                      onPress={() => setType(t)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                    >
                      <Ionicons
                        name={meta.icon as React.ComponentProps<typeof Ionicons>['name']}
                        size={14}
                        color={isActive ? '#fff' : meta.color}
                      />
                      <Text style={[s.typeText, isActive && { color: '#fff' }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            {/* Title */}
            <Field label="Title">
              <TextInput
                style={s.input}
                placeholder="e.g. Friday Happy Hour 50% off drafts"
                placeholderTextColor={T.color.t2}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
            </Field>

            {/* Ticker text */}
            <Field label="Ticker text (bottom scroll on TV)">
              <TextInput
                style={[s.input, { minHeight: 56 }]}
                placeholder="Reserve via QR · Live DJ from 8pm · 50% off all drafts"
                placeholderTextColor={T.color.t2}
                value={tickerText}
                onChangeText={setTickerText}
                multiline
              />
            </Field>

            {/* Image */}
            <Field label="Image">
              {previewSrc ? (
                <View style={s.previewWrap}>
                  <Image source={{ uri: previewSrc }} style={s.preview} resizeMode="cover" />
                  <TouchableOpacity style={s.previewRemove} onPress={() => setImageUrl(null)}>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={s.hint}>(no image)</Text>
              )}
              <View style={{ flexDirection: 'row', gap: T.sp[2] }}>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onPickImage} disabled={upload.isPending}>
                  {upload.isPending
                    ? <ActivityIndicator size="small" color={T.color.t0} />
                    : <Text style={s.btnText}>{previewSrc ? 'Replace image' : 'Pick image'}</Text>
                  }
                </TouchableOpacity>
              </View>
              {Platform.OS === 'web' && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) upload.mutate(f);
                    (e.target as HTMLInputElement).value = '';
                  }}
                />
              )}
            </Field>

            {/* CTA URL — TV QR target */}
            <Field label="CTA URL (TV QR target — reservation/SNS link)">
              <TextInput
                style={s.input}
                placeholder="https://reserve.example.com/store-123"
                placeholderTextColor={T.color.t2}
                value={ctaUrl}
                onChangeText={setCtaUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              {!ctaValid && (
                <Text style={[s.hint, { color: T.color.error }]}>
                  Must be a valid URL (include http:// or https://).
                </Text>
              )}
              <Text style={s.hint}>
                Renders as a QR code on TV③ bottom-right when set.
              </Text>
            </Field>

            {/* Dates */}
            <Field label="Start at (UTC ISO 8601)">
              <TextInput
                style={s.input}
                placeholder="2026-05-21T18:00:00Z"
                placeholderTextColor={T.color.t2}
                value={startAt}
                onChangeText={setStartAt}
                autoCapitalize="none"
              />
              <View style={s.chipWrap}>
                <ShortcutChip label="Now"    onPress={() => setStartAt(trimToSeconds(nowISO()))} />
                <ShortcutChip label="+1h"    onPress={() => setStartAt(trimToSeconds(plusISO(startAt, 3_600_000)))} />
                <ShortcutChip label="+24h"   onPress={() => setStartAt(trimToSeconds(plusISO(startAt, 86_400_000)))} />
                <ShortcutChip label="+7d"    onPress={() => setStartAt(trimToSeconds(plusISO(startAt, 7 * 86_400_000)))} />
                <ShortcutChip label="Clear"  onPress={() => setStartAt('')} />
              </View>
            </Field>

            <Field label="End at (UTC ISO 8601)">
              <TextInput
                style={s.input}
                placeholder="2026-05-21T22:00:00Z"
                placeholderTextColor={T.color.t2}
                value={endAt}
                onChangeText={setEndAt}
                autoCapitalize="none"
              />
              <View style={s.chipWrap}>
                <ShortcutChip label="+1h from start"  onPress={() => setEndAt(trimToSeconds(plusISO(startAt || null, 3_600_000)))} />
                <ShortcutChip label="+4h from start" onPress={() => setEndAt(trimToSeconds(plusISO(startAt || null, 4 * 3_600_000)))} />
                <ShortcutChip label="+24h from start" onPress={() => setEndAt(trimToSeconds(plusISO(startAt || null, 86_400_000)))} />
                <ShortcutChip label="Clear" onPress={() => setEndAt('')} />
              </View>
              {!datesValid && (
                <Text style={[s.hint, { color: T.color.error }]}>
                  Start must be valid ISO 8601 and earlier than end.
                </Text>
              )}
            </Field>

            {/* Active toggle — edit only */}
            {isEdit && (
              <Field label="Active">
                <View style={s.activeRow}>
                  <Switch
                    value={active}
                    onValueChange={setActive}
                    trackColor={{ false: T.color.border, true: T.color.success + '55' }}
                    thumbColor={active ? T.color.success : T.color.t2}
                  />
                  <Text style={s.hint}>
                    {active
                      ? 'Pushes display:event_push to TV③ on save.'
                      : 'Saving with Active OFF pushes display:event_clear.'}
                  </Text>
                </View>
              </Field>
            )}

            <Text style={s.hint}>
              Recurrence is P1.5 — for now, use Start/End to schedule a single occurrence.
              The cron scheduler will auto-flip `active` when Start arrives.
            </Text>

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color={T.color.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.footer}>
            {isEdit && (
              <TouchableOpacity
                style={[s.btn, s.btnDanger, del.isPending && { opacity: 0.5 }]}
                onPress={confirmDelete}
                disabled={del.isPending || save.isPending}
              >
                {del.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[s.btnText, { color: '#fff' }]}>Delete</Text>
                }
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onClose} disabled={save.isPending}>
              <Text style={s.btnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, (!canSubmit) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={!canSubmit}
            >
              {save.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[s.btnText, { color: '#fff' }]}>{isEdit ? 'Save' : 'Create'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ShortcutChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.shortcutChip} onPress={onPress} accessibilityRole="button">
      <Text style={s.shortcutText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet:    { backgroundColor: T.color.bg1, borderRadius: 16, width: '92%', maxWidth: 640, padding: T.sp[5], gap: T.sp[3] },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:    { color: T.color.t0, fontSize: 18, fontWeight: '700' },
  body:     { gap: T.sp[4] },
  field:    { gap: T.sp[2] },
  fieldLabel: { color: T.color.t1, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[3],
    fontSize: 14,
  },
  hint:      { color: T.color.t2, fontSize: 11 },
  chipWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2] },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: T.sp[3], paddingVertical: 6,
    backgroundColor: T.color.bg3, borderRadius: 12, borderWidth: 1, borderColor: T.color.border,
  },
  typeText:  { color: T.color.t1, fontSize: 12, fontWeight: '600' },
  shortcutChip: {
    paddingHorizontal: T.sp[3], paddingVertical: 4,
    backgroundColor: T.color.bg2, borderRadius: 10, borderWidth: 1, borderColor: T.color.border,
  },
  shortcutText: { color: T.color.t1, fontSize: 11 },
  previewWrap:  { width: '100%', height: 160, borderRadius: 8, overflow: 'hidden', backgroundColor: T.color.bg3 },
  preview:      { width: '100%', height: '100%' },
  previewRemove:{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12 },
  activeRow:    { flexDirection: 'row', alignItems: 'center', gap: T.sp[3] },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: '#3a1a1a', borderRadius: 8, padding: T.sp[3],
  },
  errorText: { color: T.color.error, fontSize: 12, flex: 1 },
  modeRow:   { flexDirection: 'row', gap: T.sp[2] },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  modeBtnActive: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  modeText:  { color: T.color.t1, fontSize: 12, fontWeight: '600' },
  noticeBox: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: T.color.bg2, borderRadius: 8, padding: T.sp[3],
    borderWidth: 1, borderColor: T.color.border,
  },
  noticeText: { color: T.color.t1, fontSize: 12, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], marginTop: T.sp[2] },
  btn: {
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[3],
    borderRadius: 8, minWidth: 90, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row',
  },
  btnGhost:   { backgroundColor: T.color.bg3 },
  btnPrimary: { backgroundColor: T.color.brand },
  btnDanger:  { backgroundColor: T.color.error },
  btnText:    { color: T.color.t0, fontSize: 13, fontWeight: '600' },
});
