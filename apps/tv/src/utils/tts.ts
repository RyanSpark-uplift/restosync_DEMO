// AG-007: expo-speech onError callback pattern (never try/await on speak).
// Bilingual support — spec sec.8.2 + sec.17.3.

let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { /* not available */ }

export type TtsLang = 'en' | 'es' | 'bilingual';
export type TtsGender = 'female' | 'male' | 'auto';

const LOCALE: Record<'en' | 'es', string> = {
  en: 'en-US',
  es: 'es-US',
};

// ── Voice prosody — young & bright ───────────────────────────────────────────
// We prefer Enhanced/network voices (see pickVoice) for a non-robotic timbre,
// then lift the pitch and keep a lively rate so the announcer reads as a young,
// upbeat host rather than a flat default voice. Higher pitch = brighter/younger.
const RATE = 1.0;
const PITCH = 1.18;

// ── Voice selection ──────────────────────────────────────────────────────────
// expo-speech (native) and the Web Speech API expose NO gender field, so we
// match known voice name/identifier tokens. Covers Android Google TTS, iOS, and
// desktop browsers used for testing.
type Voice = { identifier: string; name?: string; quality?: string; language?: string };
let voiceCache: Voice[] | null = null;

// Known voice names by gender. The bare words "male"/"female" are handled
// separately with word boundaries (see voiceGender) — `'female'.includes('male')`
// is true, so substring matching would mis-gender every "…Female" voice.
const FEMALE_NAMES = [
  'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'serena', 'allison',
  'ava', 'susan', 'vicki', 'kathy', 'zoe', 'nora', 'zira', 'hazel', 'aria', 'jenny',
  'michelle', 'sara', 'paulina', 'monica', 'marisol', 'flo', 'sandy', 'shelley',
  'grandma', 'google us english', 'google español',
];
const MALE_NAMES = [
  'aaron', 'daniel', 'alex', 'tom', 'evan', 'nathan', 'arthur', 'oliver', 'reed',
  'rocko', 'eddy', 'david', 'mark', 'guy', 'ryan', 'eric', 'diego', 'jorge',
  'carlos', 'juan', 'grandpa',
];
// Old macOS "novelty" voices — robotic / joke voices that ruin a pickup call.
// Avoid unless nothing else matches the language.
const NOVELTY = [
  'albert', 'bad news', 'good news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'wobble', 'fred', 'jester', 'junior', 'organ', 'superstar', 'ralph', 'trinoids',
  'whisper', 'zarvox',
];

// Word-boundary gender detection. \bmale\b does NOT match inside "female" (the
// 'm' there is preceded by a word char), so this is safe both ways.
function voiceGender(hay: string): 'female' | 'male' | null {
  if (/\bfemale\b/.test(hay) || FEMALE_NAMES.some((n) => hay.includes(n))) return 'female';
  if (/\bmale\b/.test(hay)   || MALE_NAMES.some((n) => hay.includes(n)))   return 'male';
  return null;
}

// On web, pull voices directly from speechSynthesis too (more reliable than the
// expo-speech wrapper) and refresh on `voiceschanged` so the list is never stale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const synth: any = (globalThis as any)?.speechSynthesis;
if (synth?.addEventListener) {
  const refresh = () => {
    try {
      const v = synth.getVoices() as Voice[];
      if (v?.length) voiceCache = v;
    } catch { /* ignore */ }
  };
  synth.addEventListener('voiceschanged', refresh);
  refresh();
}

// Prime the cache (fire-and-forget) so announcements have voices to choose from.
// On web the Web Speech voice list populates asynchronously (often empty on the
// first call until `voiceschanged` fires), so we DON'T cache an empty result —
// each call retries until a non-empty list is available. Never throws.
async function loadVoices(): Promise<Voice[]> {
  if (voiceCache?.length) return voiceCache;
  if (synth?.getVoices) {
    try { const v = synth.getVoices() as Voice[]; if (v?.length) { voiceCache = v; return v; } }
    catch { /* fall through to expo-speech */ }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getter = (Speech as any)?.getAvailableVoicesAsync;
  if (!getter) return [];
  try {
    const v = ((await getter()) ?? []) as Voice[];
    if (v.length) voiceCache = v;
    return v;
  } catch { return []; }
}
loadVoices();

// Public: lets the tablet/admin build a male/female voice picker later.
export function listVoices(): Voice[] { return voiceCache ?? []; }
export function primeVoices(): Promise<Voice[]> { return loadVoices(); }

function scoreVoice(v: Voice, langPrefix: string, gender: TtsGender): number {
  const lang = (v.language ?? '').toLowerCase();
  if (!lang.startsWith(langPrefix)) return -1;            // wrong language → exclude
  const id   = (v.identifier ?? '').toLowerCase();
  const name = (v.name ?? '').toLowerCase();
  const hay  = `${id} ${name}`;
  const q    = String(v.quality ?? '').toLowerCase();

  let score = 0;
  // Naturalness: Google network / Siri / neural / enhanced / premium voices are
  // the genuinely natural-sounding ones; reward them heavily.
  if (q.includes('enhanced') || /google|siri|network|neural|natural|premium|wavenet/.test(hay)) score += 120;
  // Penalise old robotic novelty voices so a single ready call never uses them.
  if (NOVELTY.some((n) => hay.includes(n))) score -= 200;

  // Gender match. Reward the requested gender; penalise the opposite so it's only
  // a last-resort fallback when no same-gender voice exists for the language.
  if (gender !== 'auto') {
    const g = voiceGender(hay);
    if (g === gender)      score += 60;
    else if (g !== null)   score -= 80;
  }
  return score;
}

// Returns a voice identifier for Speech.speak, or undefined to let the platform
// pick (voices not loaded yet, or none match the language).
function pickVoice(langPrefix: string, gender: TtsGender): string | undefined {
  const voices = voiceCache;
  if (!voices?.length) return undefined;
  let best: Voice | undefined;
  let bestScore = -1;
  for (const v of voices) {
    const sc = scoreVoice(v, langPrefix, gender);
    if (sc > bestScore) { bestScore = sc; best = v; }
  }
  return bestScore >= 0 ? best?.identifier : undefined;
}

// Lower-level: speak a single string in one locale. Never throws. onDone (if
// given) fires exactly once when the utterance finishes, is stopped, or errors —
// callers rely on this to chain/queue without deadlocking.
function speakOne(text: string, lang: 'en' | 'es', gender: TtsGender = 'auto', onDone?: () => void): void {
  const fire = onceFn(onDone);
  if (!Speech) { fire(); return; }
  if (!voiceCache?.length) loadVoices();   // keep retrying until voices populate (web)
  const voice = pickVoice(lang, gender);
  Speech.speak(text, {
    rate: RATE,
    pitch: PITCH,
    language: LOCALE[lang],
    ...(voice ? { voice } : {}),
    onDone:    fire,
    onStopped: fire,
    onError:   fire,   // AG-007: onError callback — no try/catch
  });
}

// Wrap a callback so it runs at most once (onDone + onError can both fire).
function onceFn(fn?: () => void): () => void {
  let ran = false;
  return () => { if (ran) return; ran = true; fn?.(); };
}

// Back-compat: legacy callers (apps/tv/src/App.tsx) call speak(text).
// New callers should use speakI18n() so the user's chosen TTS language wins.
export function speak(text: string, lang: 'en' | 'es' = 'en'): void {
  speakOne(text, lang);
}

// Spec sec.17.3 — sequential bilingual announcement with a short pause.
// Browser/native expo-speech doesn't natively queue, but it serializes when
// onDone is set; we rely on a setTimeout pause between utterances to avoid
// stepping on platform-specific queue semantics on Android TV.
export function speakBilingual(
  textEn: string,
  textEs: string,
  pauseMs = 1000,
  gender: TtsGender = 'auto',
  onDone?: () => void,
): void {
  const fire = onceFn(onDone);
  if (!Speech) { fire(); return; }
  const voiceEn = pickVoice('en', gender);
  Speech.speak(textEn, {
    rate: RATE,
    pitch: PITCH,
    language: LOCALE.en,
    ...(voiceEn ? { voice: voiceEn } : {}),
    onError:   () => { setTimeout(() => speakOne(textEs, 'es', gender, fire), pauseMs); },
    onStopped: fire,
    onDone:    () => { setTimeout(() => speakOne(textEs, 'es', gender, fire), pauseMs); },
  });
}

// Speak an ordered list of pieces with a silence gap BETWEEN them (not before
// the first / after the last). Used so a multi-number call has a real pause
// between numbers ("Orders 1 … 2 … 3 …"). onDone fires after the last piece.
function speakPieces(
  pieces: string[],
  lang: 'en' | 'es',
  gender: TtsGender,
  gapMs: number,
  onDone?: () => void,
): void {
  const fire = onceFn(onDone);
  if (!Speech || pieces.length === 0) { fire(); return; }
  let i = 0;
  const next = () => {
    const piece = pieces[i++];
    speakOne(piece, lang, gender, () => {
      if (i >= pieces.length) { fire(); return; }
      setTimeout(next, gapMs);   // silence gap between pieces
    });
  };
  next();
}

// Pieces variant of speakI18n — routes language + bilingual sequencing.
function speakPiecesI18n(
  payload: { en: string[]; es: string[] },
  pref: TtsLang,
  gender: TtsGender,
  gapMs: number,
  onDone?: () => void,
): void {
  if (pref === 'bilingual') {
    return speakPieces(payload.en, 'en', gender, gapMs, () => {
      setTimeout(() => speakPieces(payload.es, 'es', gender, gapMs, onDone), 1000);
    });
  }
  if (pref === 'es') return speakPieces(payload.es, 'es', gender, gapMs, onDone);
  return speakPieces(payload.en, 'en', gender, gapMs, onDone);
}

// Spec sec.8 — top-level announce helper. Picks engine based on TTS language pref
// and the configured voice gender (audio.tts_gender). onDone fires when the full
// announcement (both languages, when bilingual) has finished.
export function speakI18n(
  payload: { en: string; es: string },
  pref: TtsLang,
  gender: TtsGender = 'auto',
  onDone?: () => void,
): void {
  if (pref === 'bilingual') return speakBilingual(payload.en, payload.es, 1000, gender, onDone);
  if (pref === 'es')        return speakOne(payload.es, 'es', gender, onDone);
  return speakOne(payload.en, 'en', gender, onDone);
}

export function stopSpeech(): void {
  Speech?.stop().catch(() => {});
}

// ── Speaking-aware ready queue ────────────────────────────────────────────────
// While an announcement is playing, any numbers that go ready are collected and
// then called together in ONE combined utterance as soon as the current one
// finishes — e.g. "Orders 1, 2, 3, 4, 5 are ready for pickup". A tiny collect
// window also coalesces a simultaneous burst before the very first call.
// Returns the pieces to speak per language. One piece = one utterance; the queue
// inserts READY_GAP_MS of silence between pieces (e.g. between numbers).
export type ReadyFormat = (numbers: string[]) => { en: string[]; es: string[] };

const READY_COLLECT_MS = 350;
// Silence between consecutive numbers in a multi-number call. Tune to taste.
const READY_GAP_MS = 700;
let rqNumbers: string[] = [];
let rqLang: TtsLang = 'en';
let rqGender: TtsGender = 'auto';
let rqFormat: ReadyFormat | null = null;
let rqSpeaking = false;
let rqStartTimer: ReturnType<typeof setTimeout> | null = null;

export function enqueueReady(
  displayNumber: string,
  lang: TtsLang,
  gender: TtsGender,
  format: ReadyFormat,
): void {
  if (!rqNumbers.includes(displayNumber)) rqNumbers.push(displayNumber);
  rqLang = lang; rqGender = gender; rqFormat = format;   // latest settings win
  // If we're mid-announcement or already waiting to start, the number is now
  // queued and will be picked up when the current utterance ends.
  if (rqSpeaking || rqStartTimer) return;
  rqStartTimer = setTimeout(() => { rqStartTimer = null; drainReady(); }, READY_COLLECT_MS);
}

function drainReady(): void {
  if (rqSpeaking || !rqFormat || rqNumbers.length === 0) return;
  const nums = rqNumbers;
  rqNumbers = [];
  rqSpeaking = true;
  const payload = rqFormat(nums);
  speakPiecesI18n(payload, rqLang, rqGender, READY_GAP_MS, () => {
    rqSpeaking = false;
    // Numbers that arrived while this was speaking → announce them together now.
    if (rqNumbers.length) drainReady();
  });
}
