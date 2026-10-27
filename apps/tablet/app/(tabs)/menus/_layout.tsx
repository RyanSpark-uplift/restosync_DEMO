import React from 'react';
import { Stack } from 'expo-router';

// Stack layout — groups /menus, /menus/item/[id], /menus/categories,
// /menus/daypart, /menus/import into a single "Menu" tab. Without this file,
// Expo Router promotes every sub-route to its own tab in the parent tab bar.
export default function MenusStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
