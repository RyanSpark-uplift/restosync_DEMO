// M03 Sprint C — AG-015 WS contract test for event delivery.
//
// Pure DB-less test: focuses on broadcast()'s room+filter mechanics and
// confirms the M03 event names live in the WS_EVENTS allowlist.
//
// Why this exists:
//   [M03-001] scheduler emits 'display:event_push'/'event_clear' but those
//             were not in the allowlist — a typo would have shipped silently.
//             This test pins down both the contract and the role-filter so
//             the EventBoardScreen wiring stays correct under refactors.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { broadcast, joinRoom, leaveRoom, WS_EVENTS, type WsClient } from './broadcast';

// Minimal in-memory mock socket — captures the JSON payloads broadcast() sends.
function mockSocket() {
  const sent: string[] = [];
  return {
    sock: {
      readyState: 1,                                      // OPEN
      send: (data: string) => { sent.push(data); },
    },
    sent,
  };
}

function client(opts: { store: string; device: 'tablet' | 'tv'; role?: string }): { client: WsClient; sent: string[] } {
  const m = mockSocket();
  const c: WsClient = {
    socket:      m.sock,
    device_type: opts.device,
    role:        opts.role,
    store_id:    opts.store,
  };
  return { client: c, sent: m.sent };
}

const STORE_A = '00000000-0000-0000-0000-00000000000a';
const STORE_B = '00000000-0000-0000-0000-00000000000b';

describe('broadcast — AG-003 WS_EVENTS allowlist', () => {
  it('contains M03 event delivery names', () => {
    expect(WS_EVENTS).toContain('display:event_push');
    expect(WS_EVENTS).toContain('display:event_clear');
  });
});

describe('broadcast — M03 event delivery filter (AG-015)', () => {
  // Three clients in store A: one TV with role='event', one TV with role='pickup',
  // one tablet. Plus a TV in a different store to confirm store_id isolation.
  let evTV:     ReturnType<typeof client>;
  let pickupTV: ReturnType<typeof client>;
  let tablet:   ReturnType<typeof client>;
  let otherTV:  ReturnType<typeof client>;

  beforeEach(() => {
    evTV     = client({ store: STORE_A, device: 'tv',     role: 'event'  });
    pickupTV = client({ store: STORE_A, device: 'tv',     role: 'pickup' });
    tablet   = client({ store: STORE_A, device: 'tablet'                 });
    otherTV  = client({ store: STORE_B, device: 'tv',     role: 'event'  });
    joinRoom(evTV.client);
    joinRoom(pickupTV.client);
    joinRoom(tablet.client);
    joinRoom(otherTV.client);
  });

  // Drop room state so subsequent tests start fresh — broadcast keeps a
  // module-level Map.
  afterEach(() => {
    leaveRoom(evTV.client);
    leaveRoom(pickupTV.client);
    leaveRoom(tablet.client);
    leaveRoom(otherTV.client);
  });

  it('display:event_push delivered to TV role=event only (scheduler filter)', () => {
    broadcast(
      STORE_A,
      'display:event_push',
      { id: 'ev1', type: 'happy_hour', title: 'Friday HH', cta_url: 'https://example.com' },
      (c) => c.device_type === 'tv' && c.role === 'event',
    );

    expect(evTV.sent).toHaveLength(1);
    expect(pickupTV.sent).toHaveLength(0);
    expect(tablet.sent).toHaveLength(0);
    expect(otherTV.sent).toHaveLength(0);                  // different store

    const msg = JSON.parse(evTV.sent[0]);
    expect(msg.event).toBe('display:event_push');
    expect(msg.store_id).toBe(STORE_A);
    expect(msg.payload.id).toBe('ev1');
    expect(msg.payload.cta_url).toBe('https://example.com');
    expect(typeof msg.ts).toBe('string');                  // ISO 8601
  });

  it('display:event_clear delivered to TV role=event only', () => {
    broadcast(
      STORE_A,
      'display:event_clear',
      { event_id: 'ev1' },
      (c) => c.device_type === 'tv' && c.role === 'event',
    );

    expect(evTV.sent).toHaveLength(1);
    expect(pickupTV.sent).toHaveLength(0);
    expect(tablet.sent).toHaveLength(0);
    expect(otherTV.sent).toHaveLength(0);

    const msg = JSON.parse(evTV.sent[0]);
    expect(msg.event).toBe('display:event_clear');
    expect(msg.payload.event_id).toBe('ev1');
  });

  it('manual PATCH active=true path reaches event TV (route filter parity)', () => {
    // routes/events.ts uses the same filter as scheduler — keep them aligned.
    broadcast(
      STORE_A,
      'display:event_push',
      { id: 'ev2', type: 'alert', title: 'Power out — closing 9pm' },
      (c) => c.device_type === 'tv' && c.role === 'event',
    );
    expect(evTV.sent).toHaveLength(1);
    expect(JSON.parse(evTV.sent[0]).payload.type).toBe('alert');
  });

  it('store_id isolation: broadcast to STORE_A never crosses to STORE_B', () => {
    broadcast(STORE_A, 'display:event_push', { id: 'a' }, (c) => c.device_type === 'tv' && c.role === 'event');
    broadcast(STORE_B, 'display:event_push', { id: 'b' }, (c) => c.device_type === 'tv' && c.role === 'event');

    expect(evTV.sent).toHaveLength(1);                     // only STORE_A
    expect(otherTV.sent).toHaveLength(1);                  // only STORE_B
    expect(JSON.parse(evTV.sent[0]).payload.id).toBe('a');
    expect(JSON.parse(otherTV.sent[0]).payload.id).toBe('b');
  });

  it('CLOSED socket is skipped (readyState !== 1)', () => {
    // Simulate a half-closed event TV — broadcast must not try to send.
    (evTV.client.socket as unknown as { readyState: number }).readyState = 3;  // CLOSED

    broadcast(STORE_A, 'display:event_push', { id: 'ev3' }, (c) => c.device_type === 'tv' && c.role === 'event');
    expect(evTV.sent).toHaveLength(0);
  });
});

