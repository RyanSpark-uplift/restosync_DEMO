import { useAuthStore } from '../store/auth';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token, apiUrl } = useAuthStore.getState();

  // Fastify's JSON body parser rejects empty bodies with `Unexpected end of JSON input`.
  // For methods that allow bodies, send `{}` instead of nothing so handlers without
  // required schema still parse cleanly.
  const method = (init.method ?? 'GET').toUpperCase();
  const bodyAllowed = method !== 'GET' && method !== 'HEAD';
  const body = init.body ?? (bodyAllowed ? '{}' : undefined);

  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    // Stale/invalid token (e.g. server JWT_SECRET rotated) — auto-clear so
    // user can re-login instead of being stuck behind a Retry loop.
    if (res.status === 401 && token && path !== '/api/auth/login') {
      useAuthStore.getState().clearAuth();
    }
    throw new ApiError(res.status, body.message ?? body.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string)                   => request<T>(path),
  post:   <T>(path: string, body?: unknown)   => request<T>(path, { method: 'POST',   body: body !== undefined ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body?: unknown)   => request<T>(path, { method: 'PUT',    body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch:  <T>(path: string, body?: unknown)   => request<T>(path, { method: 'PATCH',  body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                   => request<T>(path, { method: 'DELETE' }),
};

// ── API types (minimal — expand as needed) ────────────────────────────────────
export interface LoginResponse {
  access_token:  string;
  refresh_token: string;
  user: { id: string; name: string; role: string; store_id: string };
}

export interface MenuItem {
  id: string; store_id: string; name: string; category: string | null;
  description: string | null; price: string | null; image_url: string | null;
  photo_url_nobg: string | null; available: boolean; is_featured: boolean;
  is_hot: boolean; sold_out: boolean; sort_order: number; dayparts: unknown;
  tags: unknown; created_at: string;
}

export interface Event {
  id: string; store_id: string; title: string | null; type: string;
  image_url: string | null; ticker_text: string | null; cta_url: string | null;
  start_at: string | null; end_at: string | null;
  active: boolean; created_at: string; recurrence: unknown;
}

export interface TvInstance {
  id: string; store_id: string; display_name: string | null;
  function_type: 'menu' | 'pickup' | 'event' | 'ad';
  profile_id: string | null; ip_address: string | null;
  is_active: boolean; last_ping_at: string | null; sort_order: number;
}

export interface TvProfile {
  id: string; store_id: string; profile_name: string; profile_type: string;
  pickup_mode: string | null; tts_enabled: boolean; slide_interval_sec: number;
}

export interface TvInstanceRow {
  instance: TvInstance;
  profile:  TvProfile | null;
}

export interface Order {
  id: string; store_id: string; display_number: string;
  customer_name: string | null; customer_phone?: string | null;
  status: string; source: string; items: unknown; created_at: string;
  // Spec sec.3.4 + sec.18 timestamps/fields.
  accepted_at?: string | null;
  preparing_at?: string | null;
  expedite_at?: string | null;
  ready_at: string | null;
  collected_at: string | null;
  picked_up_at?: string | null;
  expired_at?: string | null;
  priority?: 'normal' | 'rush' | 'scheduled' | 'catering' | null;
  pickup_location?: string | null;
  pickup_time?: string | null;
  items_summary?: string | null;
  estimated_prep_minutes?: number | null;
}

// ── Pickup action helpers (new endpoints from orders.ts) ─────────────────────
// ── TV pairing helpers (M02 — staff types a 6-char code shown on the TV) ─────
export interface PairClaimBody {
  pairing_code:  string;
  function_type: TvInstance['function_type'];
  display_name?: string;
}
export const tvPairing = {
  claim: (body: PairClaimBody) =>
    api.post<{ instance: TvInstance }>('/api/tv-instances/pair-claim', body),
};

export const orderActions = {
  accept:        (id: string)                  => api.post<Order>(`/api/orders/${id}/accept`),
  reject:        (id: string, reason?: string) => api.post<Order>(`/api/orders/${id}/reject`, reason ? { reason } : {}),
  markPickedUp:  (id: string)                  => api.post<Order>(`/api/orders/${id}/mark_picked_up`),
  undo:          (id: string)                  => api.post<Order>(`/api/orders/${id}/undo`),
  completeAllReady: ()                         => api.post<{ completed: number }>('/api/orders/_complete_all_ready'),
  purgeActive:      ()                         => api.post<{ cancelled: number }>('/api/orders/_purge_active'),
  emergencyMessage: (message: string)          => api.post<{ ok: true }>('/api/orders/_emergency_message', { message }),
  remake:           (id: string, reason?: string) => api.post<Order>(`/api/orders/${id}/remake`, reason ? { reason } : {}),
  recallTts:        (id: string)                  => api.post<{ ok: true }>(`/api/orders/${id}/recall_tts`),
  createManual:     (display_number: string, customer_name?: string) =>
    // Use the canonical POST /api/orders with explicit display_number — works
    // whether or not the server has hot-reloaded the dedicated /manual route.
    api.post<Order>('/api/orders', {
      items: [],
      source: 'manual',
      display_number,
      ...(customer_name ? { customer_name } : {}),
    }),
};
