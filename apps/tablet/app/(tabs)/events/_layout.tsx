import React from 'react';
import { Stack } from 'expo-router';

// Stack layout — normalizes route name to "events". See dashboard/_layout.tsx
// for the same fix rationale.
export default function EventsStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
