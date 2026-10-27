import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../src/store/auth';
import { T } from '@restosync/ui';

export default function Index() {
  const token    = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.color.bg0 }}>
        <ActivityIndicator color={T.color.brand} />
      </View>
    );
  }

  return <Redirect href={token ? '/(tabs)/dashboard' : '/(onboarding)'} />;
}
