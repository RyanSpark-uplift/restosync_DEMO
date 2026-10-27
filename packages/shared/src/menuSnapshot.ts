// MenuSnapshot — TV가 1회 호출로 모든 zone(Featured/Grid/Category 탭)을 채울
// minimal payload. BR-03 (60s TTL + ETag) 캐시 정본 타입.
//
// Sprint 2 S2.13. 응답은 GET /api/menu/snapshot에서 생성, ETag로 304 fast-path 지원.

import type {
  Daypart,
  SupportedLang,
  Allergen,
  SpiceLevel,
  I18nString,
  TaxPolicy,
} from './enums';

export interface MenuSnapshotItem {
  id:               string;
  category_id:      string | null;
  name_i18n:        I18nString;
  description_i18n: I18nString | null;
  price_cents:      number;
  image_url:        string | null;
  dayparts:         readonly Daypart[];
  allergens:        readonly Allergen[];
  spice_level:      SpiceLevel | null;
  calories:         number | null;
  sort_order:       number;
  is_featured:      boolean;
  is_hot:           boolean;
  sold_out:         boolean;
  show_on_tv:       boolean;
  available_from:   string | null;   // ISO 8601
  available_until:  string | null;
  tax_policy:       TaxPolicy;
  // photo lifecycle (Sprint 2) — TV가 'ready' 아니면 placeholder 노출 가능
  photo_status:     'pending' | 'processing' | 'ready' | 'failed' | null;
}

export interface MenuSnapshotCategory {
  id:         string;
  name_i18n:  I18nString;
  icon:       string | null;
  sort_order: number;
  is_active:  boolean;
}

export interface MenuSnapshotDaypartWindow {
  name:  Daypart;
  start: string;   // 'HH:MM' (매장 timezone 기준)
  end:   string;
}

export interface MenuSnapshot {
  store_id:           string;
  generated_at:       string;     // ISO 8601 — cache fill 시각
  ttl_sec:            number;     // 60 (BR-03)
  lang:               SupportedLang;
  current_daypart:    Daypart | null;     // 매장 timezone 기준 현재 daypart, 없으면 null
  timezone:           string;             // stores.timezone
  default_language:   SupportedLang;
  supported_languages: readonly SupportedLang[];
  currency:           string;
  daypart_windows:    readonly MenuSnapshotDaypartWindow[];
  categories:         readonly MenuSnapshotCategory[];
  items:              readonly MenuSnapshotItem[];
}
