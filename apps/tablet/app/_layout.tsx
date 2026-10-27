import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/auth';
import { useLocalPickupStore } from '../src/store/localPickup';
import { T } from '@restosync/ui';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const token    = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate  = useAuthStore((s) => s.hydrate);
  const router   = useRouter();
  const segments = useSegments();

  const hydrateLocalPickup = useLocalPickupStore((s) => s.hydrate);
  const startCrossTabSync  = useLocalPickupStore((s) => s.startCrossTabSync);

  // Load persisted auth + standalone-mode pickup state on first mount.
  // Neither throws (see auth.ts / localPickup.ts).
  useEffect(() => {
    hydrate().catch((e) => console.warn('[layout] hydrate', e));
    hydrateLocalPickup().catch((e) => console.warn('[layout] localPickup hydrate', e));
    startCrossTabSync(); // web-only — no-op on native
  }, []);

  // Auth-based routing (root '/' is handled by app/index.tsx redirect)
  useEffect(() => {
    if (!hydrated) return;

    const inTabs       = segments[0] === '(tabs)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!token && inTabs) {
      router.replace('/(onboarding)');
    } else if (token && inOnboarding) {
      router.replace('/(tabs)/dashboard');
    }
  }, [token, hydrated, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: T.color.bg0 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={T.color.bg0} />
        <Slot />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
