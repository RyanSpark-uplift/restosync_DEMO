// M03 Sprint A — Tablet event CRUD + image upload client.
// Server: apps/api/src/routes/events.ts (POST / / PATCH /:id / DELETE /:id / POST /upload).

import { api } from './client';
import type { Event } from './client';
import { useAuthStore } from '../store/auth';

export const EVENT_TYPES = ['happy_hour', 'live_event', 'lto', 'alert', 'promo'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventCreateInput {
  type:         EventType;
  title?:       string;
  ticker_text?: string;
  image_url?:   string;
  cta_url?:     string;     // M03 Sprint B — TV QR target (reservation/SNS)
  start_at?:    string;     // ISO 8601 UTC — AG-024
  end_at?:      string;     // ISO 8601 UTC — AG-024
  recurrence?:  Record<string, unknown>;
}

export interface EventPatchInput extends Partial<EventCreateInput> {
  active?: boolean;
}

export interface EventUploadResponse {
  url: string;     // server-relative (`/uploads/events/<uuid>.<ext>`)
}

export function fetchEvents(): Promise<Event[]> {
  return api.get<Event[]>('/api/events?limit=100');   // AG-021
}

export function fetchActiveEvents(): Promise<Event[]> {
  return api.get<Event[]>('/api/events/active');
}

export function createEvent(input: EventCreateInput): Promise<Event> {
  return api.post<Event>('/api/events', input);
}

export function patchEvent(id: string, patch: EventPatchInput): Promise<Event> {
  return api.patch<Event>(`/api/events/${id}`, patch);
}

export function deleteEvent(id: string): Promise<void> {
  return api.delete<void>(`/api/events/${id}`);
}

// Multipart upload — direct fetch (api.* assumes JSON).
export async function uploadEventImage(file: Blob, filename = 'event.bin'): Promise<EventUploadResponse> {
  const { token, apiUrl } = useAuthStore.getState();
  const form = new FormData();
  form.append('file', file, filename);

  const res = await fetch(`${apiUrl}/api/events/upload`, {
    method:  'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body:    form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.error ?? body.message ?? res.statusText);
  }
  return res.json() as Promise<EventUploadResponse>;
}
