import { useEffect, useState } from 'react';
import { FONT_ASSETS } from '../utils/fontAssets';

// expo-font is loaded via optional require so the app still runs in environments
// where the dependency has not been installed yet (e.g. during the staged Phase 2
// rollout before `pnpm install`). Same pattern as expo-keep-awake in SingleVenuePickupScreen.
let Font: typeof import('expo-font') | null = null;
try { Font = require('expo-font'); } catch { /* not installed yet */ }

/**
 * Loads every ttf registered in fontAssets.ts via expo-font once at app start.
 * Returns false until loadAsync resolves (or fails). When no ttfs are bundled
 * (initial Phase 2 state), returns true immediately so the UI renders with the
 * system font.
 */
export function useThemeFonts(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const assets = Object.keys(FONT_ASSETS);
    if (assets.length === 0 || !Font) {
      setReady(true);
      return;
    }
    Font.loadAsync(FONT_ASSETS)
      .then(() => setReady(true))
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[restosync/tv] font load failed', e);
        setReady(true);
      });
  }, []);

  return ready;
}
