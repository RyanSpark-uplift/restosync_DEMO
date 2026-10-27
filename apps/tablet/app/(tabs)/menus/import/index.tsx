// M01 Sprint 5C — Page E `/menus/import` 8-step wizard (PRD §3.5).
//
// Step 1: Template download                  → user clicks "Download template"
// Step 2: User fills xlsx offline             → instructional copy + Next
// Step 3: Upload xlsx                         → file picker (web: <input type=file>)
// Step 4: Photos (P1.5)                       → "coming soon" — Next-skippable
// Step 5: Validate                             → 2-sec polling on /jobs/:id until preview_ready / failed
// Step 6: Error report (CSV)                  → download link + counts
// Step 7: Preview + "NOT reversible" checkbox + mode picker (lenient/strict)
// Step 8: Execute → result summary (inserted/updated/skipped)
//
// Web 분기: input[type=file] (Native expo-document-picker은 P1.5).
// AG-014 4-state UI / AG-017 추가 패키지 0개.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  downloadImportTemplate, uploadImportFile, fetchImportJob, fetchImportPreview,
  downloadImportErrors, executeImport,
  type ImportJob, type ImportExecuteResponse,
} from '../../../../src/api/menu';

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: 'Template' },
  { id: 2, label: 'Fill' },
  { id: 3, label: 'Upload' },
  { id: 4, label: 'Photos' },
  { id: 5, label: 'Validate' },
  { id: 6, label: 'Errors' },
  { id: 7, label: 'Preview' },
  { id: 8, label: 'Execute' },
];

function saveBlob(blob: Blob, filename: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  } else {
    // Native: P1.5 — expose share sheet via expo-sharing
    console.warn('[import] native blob save not implemented in P1');
  }
}

export default function ImportWizardScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<StepId>(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [mode, setMode] = useState<'lenient' | 'strict'>('lenient');
  const [confirmReversible, setConfirmReversible] = useState(false);
  const [execResult, setExecResult] = useState<ImportExecuteResponse | null>(null);
  const [globalErr, setGlobalErr] = useState<string | null>(null);

  // ── Step 1 download ─────────────────────────────────────────────────────
  const dl = useMutation({
    mutationFn: () => downloadImportTemplate(),
    onSuccess: (blob) => {
      setGlobalErr(null);
      saveBlob(blob, 'restosync-menu-template.xlsx');
    },
    onError: (e: unknown) => setGlobalErr(e instanceof Error ? e.message : 'Download failed'),
  });

  // ── Step 3 upload ───────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const upload = useMutation({
    mutationFn: (file: Blob) => uploadImportFile(file, (file as File).name ?? 'menu.xlsx'),
    onSuccess: (resp) => {
      setGlobalErr(null);
      setJobId(resp.job_id);
      setStep(4);
    },
    onError: (e: unknown) => setGlobalErr(e instanceof Error ? e.message : 'Upload failed'),
  });

  const onPickFile = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      setGlobalErr('Native file picker coming in P1.5 — use the web tablet build for now.');
    }
  };

  // ── Step 5 polling ──────────────────────────────────────────────────────
  const { data: job, refetch: refetchJob } = useQuery<ImportJob | null>({
    queryKey: ['menu', 'import', 'job', jobId],
    queryFn:  () => jobId ? fetchImportJob(jobId) : Promise.resolve(null),
    enabled:  jobId !== null,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // poll until terminal-ish state on validate step
      return s === 'pending' || s === 'validating' ? 2000 : false;
    },
  });

  // Auto-advance from Step 5 once worker finished.
  useEffect(() => {
    if (step === 5 && job?.status === 'preview_ready') setStep(6);
    if (step === 5 && job?.status === 'failed')        setStep(6);
  }, [step, job?.status]);

  // ── Step 6 errors CSV ───────────────────────────────────────────────────
  const errorsDl = useMutation({
    mutationFn: () => jobId ? downloadImportErrors(jobId) : Promise.reject(new Error('no job')),
    onSuccess: (blob) => {
      setGlobalErr(null);
      saveBlob(blob, `import-${jobId}-errors.csv`);
    },
    onError: (e: unknown) => setGlobalErr(e instanceof Error ? e.message : 'CSV download failed'),
  });

  // ── Step 7 preview ──────────────────────────────────────────────────────
  const { data: previewResp } = useQuery<{ status: string; rows: Record<string, unknown>[] }>({
    queryKey: ['menu', 'import', 'preview', jobId],
    queryFn:  () => jobId ? fetchImportPreview(jobId) : Promise.reject(new Error('no job')),
    enabled:  step === 7 && jobId !== null,
  });

  // ── Step 8 execute ──────────────────────────────────────────────────────
  const execute = useMutation({
    mutationFn: () => jobId ? executeImport(jobId, mode) : Promise.reject(new Error('no job')),
    onSuccess: (resp) => {
      setGlobalErr(null);
      setExecResult(resp);
      qc.invalidateQueries({ queryKey: ['menu', 'items'] });
      qc.invalidateQueries({ queryKey: ['menu', 'categories'] });
    },
    onError: (e: unknown) => setGlobalErr(e instanceof Error ? e.message : 'Execute failed'),
  });

  const canExecute = useMemo(() =>
    !!jobId && job?.status === 'preview_ready' && confirmReversible
    && !(mode === 'strict' && (job?.invalid_rows ?? 0) > 0)
    && !execute.isPending,
  [jobId, job?.status, job?.invalid_rows, confirmReversible, mode, execute.isPending]);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={T.color.t0} />
        </TouchableOpacity>
        <Text style={s.title}>Import Wizard</Text>
      </View>

      {/* Stepper */}
      <View style={s.stepper}>
        {STEPS.map((s2, i) => (
          <React.Fragment key={s2.id}>
            <View style={[s.dot, step >= s2.id && s.dotOn, step === s2.id && s.dotActive]}>
              {step > s2.id
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={[s.dotText, step >= s2.id && { color: '#fff' }]}>{s2.id}</Text>}
            </View>
            <Text style={[s.dotLabel, step === s2.id && s.dotLabelOn]}>{s2.label}</Text>
            {i < STEPS.length - 1 && <View style={[s.dotLine, step > s2.id && s.dotLineOn]} />}
          </React.Fragment>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {globalErr && <Text style={s.errText}>{globalErr}</Text>}

        {step === 1 && (
          <Card title="Step 1 — Download template">
            <Text style={s.hint}>
              The template is a single xlsx with an `items` sheet and a `README` sheet.
              Required columns: name_en, price_usd. Optional: 5-lang names, dayparts (comma list),
              allergens, calories, spice_level, external_id (POS upsert key).
            </Text>
            <PrimaryBtn label="Download template" onPress={() => dl.mutate()} loading={dl.isPending} />
            <NavRow onNext={() => setStep(2)} canNext={true} />
          </Card>
        )}

        {step === 2 && (
          <Card title="Step 2 — Fill rows in Excel">
            <Text style={s.hint}>
              Open the downloaded file and fill in your menu rows. Save as `.xlsx`.
              Prices are in dollars (server converts to cents automatically — BR-25).
            </Text>
            <Text style={s.hint}>
              Use comma-separated values for dayparts (`breakfast,lunch,snack,dinner,late,all`)
              and allergens (`milk,egg,fish,shellfish,tree_nut,peanut,wheat,soy,sesame`).
            </Text>
            <NavRow onPrev={() => setStep(1)} onNext={() => setStep(3)} canNext={true} />
          </Card>
        )}

        {step === 3 && (
          <Card title="Step 3 — Upload filled xlsx">
            <Text style={s.hint}>
              10 MB max. Only `.xlsx` accepted (csv_zip support in P1.5).
              Server enqueues a BullMQ job for validation.
            </Text>
            {Platform.OS === 'web' && (
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) upload.mutate(f);
                }}
              />
            )}
            <PrimaryBtn
              label={upload.isPending ? 'Uploading…' : 'Choose file…'}
              onPress={onPickFile}
              loading={upload.isPending}
            />
            <NavRow onPrev={() => setStep(2)} canNext={false} />
          </Card>
        )}

        {step === 4 && (
          <Card title="Step 4 — Photos (skipped in P1)">
            <Text style={s.hint}>
              Bulk photo upload is coming in Phase 1.5. For now, attach photos per-item from
              the Menu dashboard after import completes.
            </Text>
            <NavRow onPrev={() => setStep(3)} onNext={() => setStep(5)} canNext={true} />
          </Card>
        )}

        {step === 5 && (
          <Card title="Step 5 — Validation">
            {!jobId && (
              <Text style={s.errText}>No job — go back to Step 3 and upload a file.</Text>
            )}
            {jobId && !job && <ActivityIndicator color={T.color.t1} />}
            {job && (
              <>
                <Text style={s.hint}>Job: <Text style={s.mono}>{jobId}</Text></Text>
                <Text style={s.hint}>Status: <Text style={s.statusValue}>{job.status}</Text></Text>
                {job.status === 'validating' || job.status === 'pending' ? (
                  <View style={s.row}>
                    <ActivityIndicator color={T.color.brand} />
                    <Text style={s.hint}>Parsing rows…</Text>
                  </View>
                ) : (
                  <Text style={s.hint}>
                    Parsed {job.total_rows} rows · valid {job.valid_rows} · invalid {job.invalid_rows}
                  </Text>
                )}
                <View style={s.row}>
                  <SecondaryBtn label="Refresh" onPress={() => refetchJob()} />
                </View>
              </>
            )}
            <NavRow onPrev={() => setStep(3)} onNext={() => setStep(6)} canNext={!!job && (job.status === 'preview_ready' || job.status === 'failed')} />
          </Card>
        )}

        {step === 6 && job && (
          <Card title="Step 6 — Errors">
            {job.has_errors ? (
              <>
                <Text style={s.hint}>
                  {job.invalid_rows} row(s) had validation errors. Download the CSV to review.
                </Text>
                <PrimaryBtn
                  label="Download errors.csv"
                  onPress={() => errorsDl.mutate()}
                  loading={errorsDl.isPending}
                />
              </>
            ) : (
              <Text style={s.hint}>No row-level errors. {job.valid_rows} valid rows ready.</Text>
            )}
            <NavRow onPrev={() => setStep(5)} onNext={() => setStep(7)} canNext={job.status === 'preview_ready'} />
          </Card>
        )}

        {step === 7 && job && (
          <Card title="Step 7 — Preview & confirm">
            <Text style={s.hint}>
              Reviewing the first {Math.min(job.valid_rows, 20)} valid rows. Choose mode and confirm
              that <Text style={s.warnInline}>imports are NOT reversible</Text> (BR-30).
            </Text>

            <View style={s.modeRow}>
              {(['lenient', 'strict'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMode(m)}
                  style={[s.modeChip, mode === m && s.modeChipOn]}
                  accessibilityRole="button"
                >
                  <Text style={[s.modeChipText, mode === m && s.modeChipTextOn]}>{m}</Text>
                </TouchableOpacity>
              ))}
              <Text style={s.modeHint}>
                {mode === 'lenient'
                  ? 'Imports valid rows; invalid rows are skipped (BR-31).'
                  : 'Aborts with 422 if any invalid row exists.'}
              </Text>
            </View>

            {mode === 'strict' && (job.invalid_rows ?? 0) > 0 && (
              <Text style={s.errText}>
                Strict mode blocked: {job.invalid_rows} invalid row(s). Use lenient or fix errors first.
              </Text>
            )}

            <TouchableOpacity
              onPress={() => setConfirmReversible((v) => !v)}
              style={s.checkRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmReversible }}
            >
              <View style={[s.checkbox, confirmReversible && s.checkboxOn]}>
                {confirmReversible && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={s.checkText}>
                I understand this import is NOT reversible.
              </Text>
            </TouchableOpacity>

            {previewResp && previewResp.rows.length > 0 && (
              <View style={s.previewBox}>
                <Text style={s.previewHeader}>
                  Preview ({previewResp.rows.length} row{previewResp.rows.length === 1 ? '' : 's'}):
                </Text>
                {previewResp.rows.slice(0, 10).map((r, i) => (
                  <Text key={i} style={s.previewLine} numberOfLines={1}>
                    · <Text style={s.mono}>{String(r.name_en ?? '')}</Text>
                    {' '}— ${(((r.price_usd as number) ?? 0) / 100).toFixed(2)}
                    {r.category_en ? ` · ${r.category_en}` : ''}
                  </Text>
                ))}
              </View>
            )}

            <View style={s.row}>
              <SecondaryBtn label="Back" onPress={() => setStep(6)} />
              <PrimaryBtn
                label="Run import"
                onPress={() => { setStep(8); execute.mutate(); }}
                loading={execute.isPending}
                disabled={!canExecute}
              />
            </View>
          </Card>
        )}

        {step === 8 && (
          <Card title="Step 8 — Result">
            {execute.isPending && (
              <View style={s.row}>
                <ActivityIndicator color={T.color.brand} />
                <Text style={s.hint}>Running transaction…</Text>
              </View>
            )}
            {execResult && (
              <>
                <Text style={s.success}>✓ Import completed</Text>
                <Text style={s.hint}>
                  Mode: <Text style={s.mono}>{execResult.mode}</Text>
                </Text>
                <Text style={s.hint}>
                  Inserted: <Text style={s.mono}>{execResult.inserted}</Text>
                  {' · '}Updated: <Text style={s.mono}>{execResult.updated}</Text>
                  {' · '}Skipped: <Text style={s.mono}>{execResult.skipped}</Text>
                </Text>
                <View style={s.row}>
                  <PrimaryBtn
                    label="Done"
                    onPress={() => router.replace('/menus' as never)}
                  />
                  <SecondaryBtn
                    label="Import another"
                    onPress={() => {
                      setStep(1); setJobId(null); setExecResult(null);
                      setConfirmReversible(false); setMode('lenient');
                    }}
                  />
                </View>
              </>
            )}
            {!execute.isPending && !execResult && globalErr && (
              <SecondaryBtn label="Back to preview" onPress={() => setStep(7)} />
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading, disabled }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  const dim = loading || disabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={dim}
      style={[s.btnPrimary, dim && { opacity: 0.4 }]}
      accessibilityRole="button"
    >
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={s.btnPrimaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.btnSecondary} accessibilityRole="button">
      <Text style={s.btnSecondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function NavRow({ onPrev, onNext, canNext }: {
  onPrev?: () => void; onNext?: () => void; canNext: boolean;
}) {
  return (
    <View style={s.row}>
      {onPrev && <SecondaryBtn label="Back" onPress={onPrev} />}
      <View style={{ flex: 1 }} />
      {onNext && (
        <TouchableOpacity
          onPress={onNext}
          disabled={!canNext}
          style={[s.btnPrimary, !canNext && { opacity: 0.4 }]}
          accessibilityRole="button"
        >
          <Text style={s.btnPrimaryText}>Next</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.bg1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[4],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
  },
  title: { color: T.color.t0, fontSize: 18, fontWeight: '700' },

  stepper: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[3], gap: T.sp[1],
  },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: T.color.bg3,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.color.border,
  },
  dotOn:     { backgroundColor: T.color.brand, borderColor: T.color.brand },
  dotActive: { borderColor: '#fff', borderWidth: 2 },
  dotText:   { color: T.color.t2, fontSize: 10, fontWeight: '700' },
  dotLabel:  { color: T.color.t2, fontSize: 10, marginRight: T.sp[1] },
  dotLabelOn:{ color: T.color.t0, fontWeight: '700' },
  dotLine:   { width: 12, height: 2, backgroundColor: T.color.border, marginHorizontal: 2 },
  dotLineOn: { backgroundColor: T.color.brand },

  body: { padding: T.sp[5], gap: T.sp[3] },

  card: {
    backgroundColor: T.color.bg2,
    borderRadius: 12, borderWidth: 1, borderColor: T.color.border,
    padding: T.sp[5], gap: T.sp[3],
  },
  cardTitle: { color: T.color.t0, fontSize: 16, fontWeight: '700' },

  hint:    { color: T.color.t1, fontSize: 13, lineHeight: 18 },
  mono:    { color: T.color.t0, fontWeight: '700' },
  errText: { color: T.color.error, fontSize: 12 },
  success: { color: T.color.brand, fontSize: 16, fontWeight: '700' },
  statusValue: { color: T.color.t0, fontWeight: '700' },
  warnInline:  { color: T.color.warn, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: T.sp[3], flexWrap: 'wrap' },

  btnPrimary: {
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[3],
    borderRadius: 8, backgroundColor: T.color.brand,
    minWidth: 120, alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnSecondary: {
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[3],
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  btnSecondaryText: { color: T.color.t0, fontSize: 13, fontWeight: '600' },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: T.sp[2], flexWrap: 'wrap' },
  modeChip: {
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: 16, borderWidth: 1, borderColor: T.color.border,
    backgroundColor: T.color.bg3,
  },
  modeChipOn:   { backgroundColor: T.color.brand, borderColor: T.color.brand },
  modeChipText: { color: T.color.t1, fontSize: 12, fontWeight: '700' },
  modeChipTextOn: { color: '#fff' },
  modeHint:     { color: T.color.t2, fontSize: 11, flexBasis: '100%' },

  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingVertical: T.sp[2],
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 2, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: T.color.brand, borderColor: T.color.brand },
  checkText:  { color: T.color.t0, fontSize: 13 },

  previewBox: {
    backgroundColor: T.color.bg3,
    borderRadius: 8, padding: T.sp[3], gap: T.sp[1],
  },
  previewHeader: { color: T.color.t0, fontSize: 12, fontWeight: '700', marginBottom: T.sp[1] },
  previewLine:   { color: T.color.t1, fontSize: 12 },
});
