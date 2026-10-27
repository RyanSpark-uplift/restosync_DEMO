import React from 'react';
import { Stack } from 'expo-router';

// Stack layout — normalizes route name to "dashboard" so (tabs)/_layout.tsx's
// <Tabs.Screen name="dashboard"> matches. Without this file, Expo Router
// registers the folder as "dashboard/index" and the parent tab mapping fails.
export default function DashboardStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
