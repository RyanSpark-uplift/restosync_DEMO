// M01 Sprint 3 — Menu module API wrappers (Tablet)
//
// 정본 컬럼만 사용. legacy `name`/`price`/`dayparts` 컬럼은 응답에 섞여 들어와도
// MenuItem 타입에서 optional로 두고 무시. AG-021: list 호출 시 항상 status+limit 명시.

import { api } from './client';
import type { Daypart, SupportedLang, I18nString, Allergen, SpiceLevel, TaxPolicy } from '@restosync/shared';

// ── Types (정본) ──────────────────────────────────────────────────────────────
export interface MenuItem {
  id:                string;
  store_id:          string;
  // 정본
  name_i18n:         I18nString | null;
  description_i18n:  I18nString | null;
  price_cents:       number | null;
  dayparts_arr:      Daypart[] | null;
  category_id:       string | null;
  image_url:         string | null;
  allergens:         Allergen[] | null;
  spice_level:       SpiceLevel | null;
  calories:          number | null;
  sold_out:          boolean;
  is_featured:       boolean;
  is_hot:            boolean;
  show_on_tv:        boolean;
  sort_order:        number;
  kitchen_name:      string | null;
  tax_policy:        TaxPolicy | null;
  external_id:       string | null;
  sync_source:       string | null;
  // Photo lifecycle (Sprint 2 S2.1)
  photo_status:      'pending' | 'processing' | 'ready' | 'failed' | null;
  photo_transcoded_at: string | null;
  available_from:    string | null;
  available_until:   string | null;
  // Legacy mirror — fallback 용 (BR-11)
  name?:             string | null;
  description?:      string | null;
  price?:            string | null;
  available?:        boolean;
  created_at?:       string;
  updated_at?:       string;
  deleted_at?:       string | null;
}

export interface MenuCategory {
  id:          string;
  store_id:    string;
  name:        I18nString;
  icon:        string | null;
  sort_order:  number;
  is_active:   boolean;
  external_id: string | null;
  created_at:  string;
  updated_at:  string;
  deleted_at:  string | null;
}

export interface UploadAcceptedResponse {
  job_id:  string | null;
  item_id: string;
  raw_url: string;
  status:  'queued' | 'no_queue';
}

export interface UploadLegacyResponse {
  url: string;
  fallback?: string;
}

export interface TranscodeJobStatus {
  id:            string;
  status:        'queued' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress:      number;
  attempts:      number;
  failed_reason: string | null;
  store_id:      string | null;
  item_id:       string | null;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export interface MenuItemListFilters {
  daypart?:     Daypart;
  category_id?: string;
  status?:      'active' | 'sold_out' | 'archived' | 'any';
  lang?:        SupportedLang;
  limit?:       number;
  offset?:      number;
}

// AG-021: server-side filter + max limit 강제 (default status=active, limit=100).
// 클라이언트 .filter는 보조 — 서버 필터 대체 금지.
export async function fetchMenuItems(filters: MenuItemListFilters = {}): Promise<MenuItem[]> {
  const params = new URLSearchParams();
  params.set('status', filters.status ?? 'active');
  params.set('limit', String(filters.limit ?? 100));
  if (filters.daypart)     params.set('daypart', filters.daypart);
  if (filters.category_id) params.set('category_id', filters.category_id);
  if (filters.lang)        params.set('lang', filters.lang);
  if (filters.offset)      params.set('offset', String(filters.offset));
  return api.get<MenuItem[]>(`/api/menu/items?${params.toString()}`);
}

export function fetchMenuItem(id: string): Promise<MenuItem> {
  return api.get<MenuItem>(`/api/menu/items/${id}`);
}

export interface MenuItemCreateInput {
  name_i18n:        I18nString;
  description_i18n?: I18nString;
  price_cents:      number;
  dayparts_arr?:    Daypart[];
  category_id?:     string;
  allergens?:       Allergen[];
  calories?:        number;
  spice_level?:     SpiceLevel;
  is_featured?:     boolean;
  is_hot?:          boolean;
  show_on_tv?:      boolean;
  sort_order?:      number;
  kitchen_name?:    string;
  tax_policy?:      TaxPolicy;
  external_id?:     string;
  image_url?:       string;
  available_from?:  string | null;  // ISO 8601; null clears
  available_until?: string | null;
}

export function createMenuItem(input: MenuItemCreateInput): Promise<MenuItem> {
  return api.post<MenuItem>('/api/menu/items', input);
}

export type MenuItemPatchInput = Partial<MenuItemCreateInput>;

export function patchMenuItem(id: string, input: MenuItemPatchInput): Promise<MenuItem> {
  return api.patch<MenuItem>(`/api/menu/items/${id}`, input);
}

export function toggleSoldOut(id: string, sold_out: boolean, reason?: string): Promise<MenuItem> {
  return api.patch<MenuItem>(`/api/menu/items/${id}/toggle-sold-out`, { sold_out, ...(reason ? { reason } : {}) });
}

export function deleteMenuItem(id: string): Promise<void> {
  return api.delete<void>(`/api/menu/items/${id}`);
}

// ── Variants (M01 S4.5b — BR-16) ─────────────────────────────────────────────

export interface MenuVariant {
  id:                string;
  store_id:          string;
  item_id:           string;
  name:              I18nString;
  price_delta_cents: number;
  is_default:        boolean;
  sort_order:        number;
  created_at?:       string;
  updated_at?:       string;
  deleted_at?:       string | null;
}

export interface VariantCreateInput {
  name:              I18nString;
  price_delta_cents?: number;
  is_default?:       boolean;
  sort_order?:       number;
}
export type VariantPatchInput = Partial<VariantCreateInput>;

export function fetchVariants(itemId: string): Promise<MenuVariant[]> {
  return api.get<MenuVariant[]>(`/api/menu/items/${itemId}/variants`);
}
export function createVariant(itemId: string, input: VariantCreateInput): Promise<MenuVariant> {
  return api.post<MenuVariant>(`/api/menu/items/${itemId}/variants`, input);
}
export function patchVariant(itemId: string, variantId: string, input: VariantPatchInput): Promise<MenuVariant> {
  return api.patch<MenuVariant>(`/api/menu/items/${itemId}/variants/${variantId}`, input);
}
export function deleteVariant(itemId: string, variantId: string): Promise<void> {
  return api.delete<void>(`/api/menu/items/${itemId}/variants/${variantId}`);
}

// ── Modifier groups (M01 S4.5b — BR-17) ──────────────────────────────────────

export interface ModifierOption {
  id:                string;
  group_id:          string;
  name:              I18nString;
  price_delta_cents: number;
  is_default:        boolean;
  sort_order:        number;
}

export interface ModifierGroup {
  id:           string;
  store_id:     string;
  name:         I18nString;
  min_select:   number;
  max_select:   number | null;
  is_required:  boolean;
  options:      ModifierOption[];
  // attach metadata (when fetched via /api/menu/items/:id/modifier-groups)
  sort_order?:  number;
  attached_at?: string;
}

export function fetchModifierGroups(withOptions = true): Promise<ModifierGroup[]> {
  const q = withOptions ? '?with_options=true' : '';
  return api.get<ModifierGroup[]>(`/api/menu/modifier-groups${q}`);
}

export function fetchAttachedModifierGroups(itemId: string): Promise<ModifierGroup[]> {
  return api.get<ModifierGroup[]>(`/api/menu/items/${itemId}/modifier-groups`);
}

export function attachModifierGroup(itemId: string, groupId: string, sort_order = 0): Promise<unknown> {
  return api.post<unknown>(`/api/menu/items/${itemId}/attach-modifier-group/${groupId}`, { sort_order });
}

export function detachModifierGroup(itemId: string, groupId: string): Promise<void> {
  return api.delete<void>(`/api/menu/items/${itemId}/attach-modifier-group/${groupId}`);
}

// ── Dayparts (store-level — used by Schedule tab for timezone hint) ───────────

export interface DaypartWindow {
  start: string;     // HH:MM (24h)
  end:   string;
}

export interface DaypartsResponse {
  timezone:       string;
  windows:        Partial<Record<Daypart, DaypartWindow>>;
  business_hours: Record<string, unknown>;
}

export function fetchDayparts(): Promise<DaypartsResponse> {
  return api.get<DaypartsResponse>('/api/menu/dayparts');
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface CategoryListFilters {
  is_active?: boolean;
  limit?:     number;
  offset?:    number;
}

export function fetchCategories(filters: CategoryListFilters = {}): Promise<MenuCategory[]> {
  const params = new URLSearchParams();
  params.set('limit', String(filters.limit ?? 100));
  if (filters.is_active !== undefined) params.set('is_active', String(filters.is_active));
  if (filters.offset)                  params.set('offset', String(filters.offset));
  return api.get<MenuCategory[]>(`/api/menu/categories?${params.toString()}`);
}

export interface CategoryCreateInput {
  name:        I18nString;
  icon?:       string;
  sort_order?: number;
  is_active?:  boolean;
  external_id?: string;
}
export type CategoryPatchInput = Partial<CategoryCreateInput>;

export function createCategory(input: CategoryCreateInput): Promise<MenuCategory> {
  return api.post<MenuCategory>('/api/menu/categories', input);
}
export function patchCategory(id: string, input: CategoryPatchInput): Promise<MenuCategory> {
  return api.patch<MenuCategory>(`/api/menu/categories/${id}`, input);
}
export function deleteCategory(id: string): Promise<void> {
  return api.delete<void>(`/api/menu/categories/${id}`);
}
export function reorderCategories(orders: { id: string; sort_order: number }[]): Promise<MenuCategory[]> {
  return api.patch<MenuCategory[]>('/api/menu/categories/reorder', { orders });
}

// ── Dayparts (Page D) ────────────────────────────────────────────────────────
export function updateDayparts(windows: Partial<Record<Daypart, DaypartWindow>>): Promise<DaypartsResponse> {
  return api.put<DaypartsResponse>('/api/menu/dayparts', { windows });
}

// ── Photo upload (Sprint 2 — async BullMQ) ────────────────────────────────────
// 호출자가 직접 fetch — `api.post`는 JSON 가정이라 multipart 불가. auth 헤더만 재사용.

import { useAuthStore } from '../store/auth';

export async function uploadPhoto(itemId: string, file: Blob, filename = 'upload.bin'): Promise<UploadAcceptedResponse | UploadLegacyResponse> {
  const { token, apiUrl } = useAuthStore.getState();
  const form = new FormData();
  form.append('file', file, filename);
  form.append('item_id', itemId);

  const res = await fetch(`${apiUrl}/api/menu/upload?item_id=${encodeURIComponent(itemId)}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.error ?? body.message ?? res.statusText);
  }
  return res.json() as Promise<UploadAcceptedResponse | UploadLegacyResponse>;
}

export function pollTranscodeJob(jobId: string): Promise<TranscodeJobStatus> {
  return api.get<TranscodeJobStatus>(`/api/menu/upload/jobs/${jobId}`);
}

// ── Ingredients (M01 S4.6 — P1.5 BR-19 prep) ─────────────────────────────────

export type IngredientUnit = 'g' | 'kg' | 'ml' | 'L' | 'oz' | 'lb' | 'each' | 'piece' | 'dozen';

export interface Ingredient {
  id:             string;
  store_id:       string;
  name:           I18nString;
  unit:           IngredientUnit;
  stock_quantity: string;            // numeric → string (Postgres)
  min_threshold:  string | null;
  external_id:    string | null;
  created_at:     string;
  updated_at:     string;
  deleted_at:     string | null;
}

export interface IngredientCreateInput {
  name:            I18nString;
  unit:            IngredientUnit;
  stock_quantity?: string | number;
  min_threshold?:  string | number | null;
  external_id?:    string;
}
export type IngredientPatchInput = Partial<IngredientCreateInput>;

export interface IngredientListFilters {
  unit?:      IngredientUnit;
  low_stock?: boolean;
  search?:    string;
  limit?:     number;
  offset?:    number;
}

export function fetchIngredients(filters: IngredientListFilters = {}): Promise<Ingredient[]> {
  const q = new URLSearchParams();
  if (filters.unit) q.set('unit', filters.unit);
  if (filters.low_stock !== undefined) q.set('low_stock', String(filters.low_stock));
  if (filters.search) q.set('search', filters.search);
  if (filters.limit !== undefined) q.set('limit', String(filters.limit));
  if (filters.offset !== undefined) q.set('offset', String(filters.offset));
  const qs = q.toString();
  return api.get<Ingredient[]>(`/api/menu/ingredients${qs ? `?${qs}` : ''}`);
}

export function fetchIngredient(id: string): Promise<Ingredient> {
  return api.get<Ingredient>(`/api/menu/ingredients/${id}`);
}

export function createIngredient(input: IngredientCreateInput): Promise<Ingredient> {
  return api.post<Ingredient>('/api/menu/ingredients', input);
}

export function patchIngredient(id: string, input: IngredientPatchInput): Promise<Ingredient> {
  return api.patch<Ingredient>(`/api/menu/ingredients/${id}`, input);
}

export type StockAdjustInput =
  | { mode: 'set'; value: string | number }
  | { mode: 'delta'; delta: string | number; reason?: string };

export function adjustStock(id: string, input: StockAdjustInput): Promise<Ingredient> {
  return api.patch<Ingredient>(`/api/menu/ingredients/${id}/stock-adjust`, input);
}

export function deleteIngredient(id: string): Promise<void> {
  return api.delete<void>(`/api/menu/ingredients/${id}`);
}

// ── Recipe (item ↔ ingredient N:M, PUT entire replacement) ───────────────────

export interface RecipeLine {
  ingredient_id:   string;
  quantity:        string;          // numeric → string
  unit:            IngredientUnit;
  sort_order:      number;
  created_at:      string;
  ingredient_name: I18nString;      // joined
  ingredient_unit: IngredientUnit;
  stock_quantity:  string;
  min_threshold:   string | null;
}

export interface RecipeLineInput {
  ingredient_id: string;
  quantity:      string | number;
  unit:          IngredientUnit;
  sort_order?:   number;
}

export function fetchItemRecipe(itemId: string): Promise<RecipeLine[]> {
  return api.get<RecipeLine[]>(`/api/menu/items/${itemId}/ingredients`);
}

export function putItemRecipe(itemId: string, lines: RecipeLineInput[]): Promise<{ item_id: string; lines: unknown[] }> {
  return api.put<{ item_id: string; lines: unknown[] }>(
    `/api/menu/items/${itemId}/recipe`,
    { lines },
  );
}

// ── Excel Import (M01 Sprint 5 — PRD §3.5 / §5.3) ────────────────────────────

export type ImportStatus = 'pending' | 'validating' | 'preview_ready' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface ImportJob {
  id:           string;
  store_id:     string;
  user_id:      string;
  source:       string;                     // 'excel' for 5A
  status:       ImportStatus;
  filename:     string | null;
  total_rows:   number;
  valid_rows:   number;
  invalid_rows: number;
  mode:         'lenient' | 'strict' | null;
  created_at:   string;
  started_at:   string | null;
  finished_at:  string | null;
  has_errors:   boolean;
  has_preview:  boolean;
}

export interface ImportUploadResponse { job_id: string; status: ImportStatus }
export interface ImportExecuteResponse {
  job_id:   string; status: 'completed';
  mode:     'lenient' | 'strict';
  inserted: number; updated: number; skipped: number;
}

// Template download — returns raw xlsx Blob for client to save / forward.
export async function downloadImportTemplate(): Promise<Blob> {
  const { token, apiUrl } = useAuthStore.getState();
  const res = await fetch(`${apiUrl}/api/menu/import/template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Template download failed: ${res.status}`);
  return res.blob();
}

// Upload xlsx file → returns { job_id, status } (BullMQ enqueued).
export async function uploadImportFile(file: Blob, filename = 'menu.xlsx'): Promise<ImportUploadResponse> {
  const { token, apiUrl } = useAuthStore.getState();
  const form = new FormData();
  form.append('file', file, filename);
  const res = await fetch(`${apiUrl}/api/menu/import/excel/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.error ?? body.message ?? res.statusText);
  }
  return res.json() as Promise<ImportUploadResponse>;
}

export function fetchImportJob(id: string): Promise<ImportJob> {
  return api.get<ImportJob>(`/api/menu/import/jobs/${id}`);
}

export function fetchImportPreview(id: string): Promise<{ status: ImportStatus; rows: Record<string, unknown>[] }> {
  return api.get<{ status: ImportStatus; rows: Record<string, unknown>[] }>(`/api/menu/import/jobs/${id}/preview`);
}

// CSV download (caller saves / triggers browser download).
export async function downloadImportErrors(id: string): Promise<Blob> {
  const { token, apiUrl } = useAuthStore.getState();
  const res = await fetch(`${apiUrl}/api/menu/import/jobs/${id}/errors`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Errors download failed: ${res.status}`);
  return res.blob();
}

export function executeImport(id: string, mode: 'lenient' | 'strict' = 'lenient'): Promise<ImportExecuteResponse> {
  return api.post<ImportExecuteResponse>(
    `/api/menu/import/jobs/${id}/execute`,
    { mode, confirm: true },
  );
}

// ── Featured Banner rules (Sprint F.A — PRD §3.6 / BR-21) ───────────────────
export type FeaturedRuleType =
  | 'chef_pick' | 'lto' | 'low_inventory' | 'daypart' | 'analytics_star' | 'analytics_puzzle';
export type FeaturedRotationSeconds = 5 | 8 | 10 | 12;

export interface FeaturedRule {
  id?:         string;
  rule_type:   FeaturedRuleType;
  is_active:   boolean;
  priority:    number;
  params:      { threshold_days?: number; threshold_multiplier?: number };
  updated_at?: string;
}

export interface FeaturedRulesResponse {
  rules:            FeaturedRule[];
  rotation_seconds: FeaturedRotationSeconds;
}

export interface FeaturedPoolItem {
  id:               string;
  name:             string | null;
  name_i18n:        I18nString | null;
  description:      string | null;
  description_i18n: I18nString | null;
  price_cents:      number | null;
  image_url:        string | null;
  photo_url_nobg:   string | null;
  is_featured:      boolean | null;
  is_hot:           boolean | null;
  sort_order:       number | null;
  category_id:      string | null;
  dayparts_arr:     Daypart[] | null;
  matched_rules:    FeaturedRuleType[];
}

export interface FeaturedCurrentResponse {
  items:             FeaturedPoolItem[];
  rotation_seconds:  FeaturedRotationSeconds;
  current_daypart:   Daypart | null;
  timezone:          string;
  active_rule_types: FeaturedRuleType[];
}

export function fetchFeaturedRules(): Promise<FeaturedRulesResponse> {
  return api.get<FeaturedRulesResponse>('/api/menu/featured/rules');
}

export function fetchFeaturedCurrent(limit = 8): Promise<FeaturedCurrentResponse> {
  return api.get<FeaturedCurrentResponse>(`/api/menu/featured/current?limit=${limit}`);
}

export interface FeaturedRulesPutInput {
  rules:             Omit<FeaturedRule, 'id' | 'updated_at'>[];
  rotation_seconds?: FeaturedRotationSeconds;
}

export function putFeaturedRules(input: FeaturedRulesPutInput): Promise<FeaturedRulesResponse> {
  return api.put<FeaturedRulesResponse>('/api/menu/featured/rules', input);
}

// ── Combos (Sprint G.B — PRD §4.2 Page G / BR-18/23) ────────────────────────
export interface ComboItemLine {
  item_id:          string;
  quantity:         number;
  is_substitutable: boolean;
  group_name:       string | null;
  sort_order:       number;
}

export interface Combo {
  id:                string;
  store_id:          string;
  name:              I18nString;
  description:       I18nString | null;
  photo_url:         string | null;
  price_cents:       number;
  items_total_cents: number;
  savings_cents:     number;
  dayparts_arr:      Daypart[];
  is_sold_out:       boolean;
  is_featured:       boolean;
  show_on_tv:        boolean;
  sort_order:        number;
  created_at:        string;
  updated_at:        string;
  deleted_at:        string | null;
  items:             ComboItemLine[];
}

export interface ComboListResponse { combos: Combo[]; }

export interface ComboCreateInput {
  name:         I18nString;
  description?: I18nString | null;
  photo_url?:   string | null;
  price_cents:  number;
  dayparts_arr?: Daypart[];
  is_featured?: boolean;
  show_on_tv?:  boolean;
  sort_order?:  number;
  items:        Array<{
    item_id: string;
    quantity: number;
    is_substitutable?: boolean;
    group_name?: string | null;
    sort_order?: number;
  }>;
}

export type ComboPatchInput = Partial<Omit<ComboCreateInput, 'items'>> & {
  is_sold_out?: boolean;
  items?: ComboCreateInput['items'];
};

export function fetchCombos(params: { status?: 'active' | 'sold_out' | 'all'; daypart?: Daypart } = {}): Promise<ComboListResponse> {
  const qs = new URLSearchParams();
  if (params.status)  qs.set('status',  params.status);
  if (params.daypart) qs.set('daypart', params.daypart);
  const suffix = qs.toString();
  return api.get<ComboListResponse>(`/api/menu/combos${suffix ? `?${suffix}` : ''}`);
}

export function fetchCombo(id: string): Promise<Combo> {
  return api.get<Combo>(`/api/menu/combos/${id}`);
}

export function createCombo(input: ComboCreateInput): Promise<Combo> {
  return api.post<Combo>('/api/menu/combos', input);
}

export function patchCombo(id: string, patch: ComboPatchInput): Promise<Combo> {
  return api.patch<Combo>(`/api/menu/combos/${id}`, patch);
}

export function deleteCombo(id: string): Promise<void> {
  return api.delete<void>(`/api/menu/combos/${id}`);
}
