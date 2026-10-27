// Store-wide operator settings. One row per store in DB table `store_settings` (config jsonb).
// Spec: ORDER_PICKUP_DISPLAY_SPEC.md v2.1 sec.10.
//
// AG-013: this file is the canonical shape. Zod schema lives in apps/api/src/routes/storeSettings.ts
// and must mirror these field names exactly.
//
// All defaults target North American (en-US) market. Bilingual (en + es-US) optional.

import type { OrderSource } from './enums';
import type { Lang } from './i18n';
import type { ThemeKey } from './themes';

// LEGACY — kept as deprecated optionals so old configs read without errors.
// The 12-theme system (theme.theme_key) supersedes mode/card_style/primary_color
// entirely. New writes should not set these fields.
export type ThemeMode      = 'dark' | 'light' | 'high_contrast';
export type CardStyle      = 'rounded' | 'square' | 'minimal' | 'glass';
export type ColumnRatio    = '35:65' | '50:50' | '25:75' | '0:100';
export type Orientation    = 'landscape' | 'portrait';
export type DisplayMode    = 'pickup_only' | 'pickup_and_ads' | 'ads_only' | 'event';
export type CustomerNameFormat = 'full' | 'masked' | 'initial' | 'none';
export type IdleScreenMode = 'menu' | 'promo' | 'welcome' | 'sns' | 'custom';
export type AcceptMode     = 'auto' | 'manual' | 'hybrid';
export type AudioMode      = 'tts' | 'bell' | 'both';
export type TtsLang        = 'en' | 'es' | 'bilingual';
export type SmsProvider    = 'twilio' | null;
export type PickupVerification = 'none' | 'manual' | 'qr';
export type ScheduledCardStyle = 'dimmed' | 'highlighted';
export type LayoutMode     = 'two_column' | 'three_zone' | 'custom';
// Pickup workflow shape — 'two_stage' keeps the classic prep→ready columns;
// 'ready_only' creates manual orders already-ready and hides the prep column.
export type PickupFlow     = 'two_stage' | 'ready_only';
export type TickerSpeed    = 'slow' | 'medium' | 'fast';
export type PrepTimeMode   = 'static' | 'statistical' | 'ml';
export type PrepDisplayFormat = 'range' | 'single' | 'hidden';
export type BilingualMode  = 'primary_only' | 'bilingual' | 'auto_detect';
export type CustomerNameLangMode = 'primary' | 'bilingual' | 'romanized';

export interface TimeRange {
  start: string; // 'HH:mm'
  end: string;   // 'HH:mm'
}

export interface DaypartScheduleEntry {
  start: string;
  end: string;
  mode: DisplayMode;
  ratio?: ColumnRatio;
}

export interface StoreSettings {
  theme: {
    // New 12-theme system (DevGuide/Theme handoff).
    theme_key: ThemeKey;            // 'bistro' | 'cafe' | ... | 'diner'
    columns: number;                 // cards per side
    storeLabel: string;             // headline word — store-configured ("KITCHEN", "주문", …)
    pickupLabel: string;            // sublabel ("ORDER PICKUP", "guest pickup", …)
    logo_url?: string;
    logo_idle_url?: string;
    footer_message?: string;

    // LEGACY — pre-12-theme system. Kept optional so old configs deserialize.
    // Not read by new code; safe to delete from DB at some point.
    mode?: ThemeMode;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    card_style?: CardStyle;
  };
  timeout: {
    ready_minutes: number;
    expedite_seconds: number;
    peak_minutes: number;
    off_peak_minutes: number;
    peak_start: string;       // 'HH:mm'
    peak_end: string;
    closeout_time: string;    // 'HH:mm' store-local; cron at this time daily
  };
  audio: {
    enabled: boolean;
    mode: AudioMode;
    tts_lang: TtsLang;
    volume: number;           // 0..100
    recall_enabled: boolean;
    recall_delay_minutes: number;
    volume_schedule: Record<string, number>; // 'HH:mm' -> volume 0..100
    quiet_hours?: TimeRange | null;
  };
  daypart: {
    breakfast: [string, string];
    lunch: [string, string];
    dinner: [string, string];
  };
  display: {
    column_ratio: ColumnRatio;
    orientation: Orientation;
    mode: DisplayMode;
    show_customer_name: boolean;
    customer_name_format: CustomerNameFormat;
    show_estimated_time: boolean;
    show_channel_badge: boolean;
    show_pickup_location: boolean;
    idle_screen_mode: IdleScreenMode;
    pickup_locations: string[];
    /** Seconds a newly added card pulses (fade 1.0↔0.35 every second) to draw the eye. 0 disables. */
    new_order_pulse_seconds?: number;
    /** Seconds the recalled number flashes when staff (or auto-recall) re-announces a ready order. 0 disables. */
    recall_flash_seconds?: number;
    /** How many seconds each page is shown before advancing to the next when orders overflow the screen. 0 disables rotation. */
    pickup_page_interval_seconds?: number;
    /** Maximum cards shown per column page. Overflow advances to next page when rotation is active. */
    cards_per_page?: number;
    /** When true, ready cards are removed from the TV after ready_auto_remove_seconds.
     *  When false (default), cards stay until staff taps "Picked Up" in the dashboard. */
    ready_auto_remove_enabled?: boolean;
    /** How many seconds after a card goes READY it is removed from the TV display.
     *  Only meaningful when ready_auto_remove_enabled is true. */
    ready_auto_remove_seconds?: number;
  };
  accept: {
    mode: AcceptMode;
    auto_accept_channels: OrderSource[];
    manual_accept_channels: OrderSource[];
    auto_accept_timeout_minutes: number;
    new_order_alert_sound: boolean;
    new_order_alert_repeat: boolean;
  };
  notify: {
    sms_enabled: boolean;
    provider: SmsProvider;
    from_number?: string;
    notify_on_accept: boolean;
    notify_on_ready: boolean;
    notify_on_reminder: boolean;
    reminder_delay_minutes: number;
  };
  channels: {
    enabled: OrderSource[] | ['all'];
    color_coding: boolean;
    separate_rider_view: boolean;
  };
  workflow: {
    expedite_enabled: boolean;
    undo_timeout_seconds: number;
    auto_recall_enabled: boolean;
    auto_recall_delay_minutes: number;
    pickup_verification: PickupVerification;
    /** Pickup screen + dashboard input behavior. Defaults to 'ready_only'. */
    pickup_flow: PickupFlow;
  };
  priority: {
    rush_badge_enabled: boolean;
    rush_pin_to_top: boolean;
    rush_tts_prefix: string;
    rush_border_color: string;
  };
  scheduled: {
    show_scheduled_orders: boolean;
    auto_trigger_minutes_before: number;
    scheduled_card_style: ScheduledCardStyle;
  };
  qr: {
    enabled: boolean;
    on_receipt: boolean;
    tracking_page_branding: boolean;
    show_items: boolean;
  };
  daypart_auto: {
    enabled: boolean;
    schedule: DaypartScheduleEntry[];
    override_on_active_orders: boolean;
  };
  multi_zone: {
    layout_mode: LayoutMode;
    ticker_enabled: boolean;
    ticker_text: string;
    ticker_speed: TickerSpeed;
    media_zone_content: string[];
    media_zone_interval: number; // seconds
  };
  loyalty: {
    enabled: boolean;
    api_endpoint?: string;
    feedback_enabled: boolean;
    feedback_delay_minutes: number;
    feedback_template: string;
  };
  ai: {
    prep_time_mode: PrepTimeMode;
    display_format: PrepDisplayFormat;
    peak_multiplier: number;
    range_buffer_minutes: number;
    prep_time_lookup: Record<string, number>; // sku -> minutes
  };
  bilingual: {
    primary_lang: Lang;
    secondary_lang: Lang | null;
    mode: BilingualMode;
    tts_langs: Lang[];
    customer_name_lang: CustomerNameLangMode;
  };
  // per-TV overrides keyed by tv_instances.id (uuid). Deep-partial — null/missing fields fall back to store-wide.
  per_tv: Record<string, DeepPartial<StoreSettings>>;
}

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export function defaultStoreSettings(): StoreSettings {
  return {
    theme: {
      theme_key: 'bistro',
      columns: 2,
      storeLabel: 'KITCHEN',
      pickupLabel: 'ORDER PICKUP',
    },
    timeout: {
      ready_minutes: 20,
      expedite_seconds: 30,
      peak_minutes: 15,
      off_peak_minutes: 30,
      peak_start: '11:00',
      peak_end: '14:00',
      closeout_time: '04:00',
    },
    audio: {
      enabled: true,
      mode: 'tts',
      tts_lang: 'en',
      volume: 80,
      recall_enabled: true,
      recall_delay_minutes: 3,
      volume_schedule: {
        '06:00': 60,
        '11:00': 100,
        '14:00': 40,
        '17:00': 80,
        '21:00': 20,
      },
      quiet_hours: null,
    },
    daypart: {
      breakfast: ['06:00', '11:00'],
      lunch:     ['11:00', '14:00'],
      dinner:    ['17:00', '21:00'],
    },
    display: {
      column_ratio: '35:65',
      orientation: 'landscape',
      mode: 'pickup_only',
      show_customer_name: true,
      customer_name_format: 'masked',
      show_estimated_time: true,
      show_channel_badge: true,
      show_pickup_location: false,
      idle_screen_mode: 'welcome',
      pickup_locations: ['Counter A'],
      new_order_pulse_seconds: 5,
      recall_flash_seconds: 15,
      pickup_page_interval_seconds: 6,
      cards_per_page: 8,
      ready_auto_remove_enabled: false,
      ready_auto_remove_seconds: 60,
    },
    accept: {
      mode: 'auto',
      auto_accept_channels: ['pos', 'kiosk', 'manual'],
      manual_accept_channels: ['doordash', 'ubereats', 'grubhub', 'fantuan', 'hungrypanda'],
      auto_accept_timeout_minutes: 5,
      new_order_alert_sound: true,
      new_order_alert_repeat: true,
    },
    notify: {
      sms_enabled: false,
      provider: null,
      notify_on_accept: true,
      notify_on_ready: true,
      notify_on_reminder: false,
      reminder_delay_minutes: 5,
    },
    channels: {
      enabled: ['all'],
      color_coding: true,
      separate_rider_view: false,
    },
    workflow: {
      expedite_enabled: false,
      undo_timeout_seconds: 5,
      auto_recall_enabled: true,
      auto_recall_delay_minutes: 3,
      pickup_verification: 'none',
      pickup_flow: 'ready_only',
    },
    priority: {
      rush_badge_enabled: true,
      rush_pin_to_top: true,
      rush_tts_prefix: 'Rush',
      rush_border_color: '#EF4444',
    },
    scheduled: {
      show_scheduled_orders: false,
      auto_trigger_minutes_before: 15,
      scheduled_card_style: 'dimmed',
    },
    qr: {
      enabled: false,
      on_receipt: true,
      tracking_page_branding: true,
      show_items: true,
    },
    daypart_auto: {
      enabled: false,
      schedule: [],
      override_on_active_orders: true,
    },
    multi_zone: {
      layout_mode: 'two_column',
      ticker_enabled: false,
      ticker_text: '',
      ticker_speed: 'medium',
      media_zone_content: [],
      media_zone_interval: 10,
    },
    loyalty: {
      enabled: false,
      feedback_enabled: false,
      feedback_delay_minutes: 2,
      feedback_template: 'How was your order?',
    },
    ai: {
      prep_time_mode: 'static',
      display_format: 'range',
      peak_multiplier: 1.3,
      range_buffer_minutes: 3,
      prep_time_lookup: {},
    },
    bilingual: {
      primary_lang: 'en',
      secondary_lang: null,
      mode: 'primary_only',
      tts_langs: ['en'],
      customer_name_lang: 'primary',
    },
    per_tv: {},
  };
}

// Resolve effective settings for a specific TV: store-wide defaults merged with per-tv overrides.
export function resolveTvSettings(
  store: StoreSettings,
  tvInstanceId: string,
): StoreSettings {
  const override = store.per_tv[tvInstanceId];
  if (!override) return store;
  return deepMerge(store, override) as StoreSettings;
}

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === null || patch === undefined) return base;
  if (typeof base !== 'object' || base === null) return patch as T;
  if (Array.isArray(base)) return (patch as unknown as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(patch as object)) {
    const pv = (patch as Record<string, unknown>)[k];
    const bv = (base as Record<string, unknown>)[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, pv as DeepPartial<typeof bv>);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out as T;
}
