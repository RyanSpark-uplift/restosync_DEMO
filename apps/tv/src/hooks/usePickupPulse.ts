import { useEffect, useRef, useState } from 'react';

// Tracks which cards have a live "fresh" pulse — opacity sine wave applied by
// OrderCard while the entry is within pulseSec of arriving in its current
// bucket. Mirrors the tv-view.html __pulseUntil tagging so RN TV and the web
// viewer share the same behaviour: cards arriving in PREPARING, expediting, or
// READY all pulse, and a prep→ready transition pulses again in the new column
// even when created_at is old.
//
// Returns the live Map<orderId, expireAt>. Components do not need to mutate it
// — they call `(map.get(id) ?? 0) > Date.now()` per card.

export interface PulseInputCard {
  id: string;
  bucket: 'prep' | 'ready';
}

export function usePickupPulse(buckets: PulseInputCard[], pulseSec: number): Map<string, number> {
  const pulseMap = useRef(new Map<string, number>());
  const prevBucketOf = useRef(new Map<string, 'prep' | 'ready'>());
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (pulseSec <= 0) {
      pulseMap.current.clear();
      prevBucketOf.current.clear();
      return;
    }
    const now = Date.now();
    const currentMap = new Map<string, 'prep' | 'ready'>();
    let scheduleExpiry = false;
    for (const { id, bucket } of buckets) {
      currentMap.set(id, bucket);
      const prev = prevBucketOf.current.get(id);
      if (prev !== bucket) {
        // entered or moved buckets — start (or restart) the pulse window
        pulseMap.current.set(id, now + pulseSec * 1000);
        scheduleExpiry = true;
      }
    }
    // GC entries for orders no longer in any bucket
    for (const id of Array.from(pulseMap.current.keys())) {
      if (!currentMap.has(id)) pulseMap.current.delete(id);
    }
    prevBucketOf.current = currentMap;
    if (scheduleExpiry) {
      const timer = setTimeout(() => forceRender((t) => t + 1), pulseSec * 1000 + 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [buckets, pulseSec]);

  return pulseMap.current;
}
