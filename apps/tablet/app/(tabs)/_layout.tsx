import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@restosync/ui';
import { useAuthStore, type LoginMode } from '../../src/store/auth';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabSpec {
  name: string; label: string; icon: IoniconName; iconFocused: IoniconName;
  /** Login modes that may see this tab. */
  modes: LoginMode[];
}

const ALL: LoginMode[] = ['ready_only', 'two_display', 'engineering'];
const TWO_PLUS_ENG: LoginMode[] = ['two_display', 'engineering'];

const TAB_CONFIG: TabSpec[] = [
  { name: 'dashboard', label: 'Dashboard', icon: 'speedometer-outline', iconFocused: 'speedometer', modes: ALL },
  { name: 'menus',     label: 'Menu',      icon: 'restaurant-outline',  iconFocused: 'restaurant',  modes: TWO_PLUS_ENG },
  { name: 'events',    label: 'Events',    icon: 'calendar-outline',    iconFocused: 'calendar',    modes: TWO_PLUS_ENG },
  { name: 'tvs',       label: 'TVs',       icon: 'tv-outline',          iconFocused: 'tv',          modes: ALL },
  { name: 'analytics', label: 'Analytics', icon: 'bar-chart-outline',   iconFocused: 'bar-chart',   modes: ALL },
  { name: 'settings',  label: 'Settings',  icon: 'settings-outline',    iconFocused: 'settings',    modes: ALL },
];

export default function TabsLayout() {
  const loginMode = useAuthStore((s) => s.loginMode);
  // Pad the tab bar above the system gesture/taskbar inset so the bottom row
  // (Settings, etc.) doesn't sit under Android 14 tablet's persistent taskbar
  // or a gesture-nav home indicator.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: T.color.bg1,
          borderTopColor: T.color.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarActiveTintColor:   T.color.brand,
        tabBarInactiveTintColor: T.color.t2,
        tabBarLabelStyle: { fontSize: T.fs.xs, fontWeight: T.fw.medium },
      }}
    >
      {TAB_CONFIG.map(({ name, label, icon, iconFocused, modes }) => {
        const allowed = modes.includes(loginMode);
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: label,
              // expo-router Tabs.Screen: `href: null` removes the tab from the
              // tab bar AND blocks deep-linking. Use for ready_only hiding Menu/
              // Events so they neither render the tab nor become reachable.
              href: allowed ? undefined : null,
              tabBarIcon: ({ focused, color }) => (
                <Ionicons name={focused ? iconFocused : icon} size={22} color={color} />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
