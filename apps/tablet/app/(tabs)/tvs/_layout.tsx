import React from 'react';
import { Stack } from 'expo-router';

// Stack layout — normalizes route name to "tvs". See dashboard/_layout.tsx
// for the same fix rationale.
export default function TvsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
