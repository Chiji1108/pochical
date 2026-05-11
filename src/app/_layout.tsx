import "@/global.css";
import "jazz-tools/expo/polyfills";

import { NativeTabs } from "expo-router/unstable-native-tabs";
import { HeroUINativeProvider } from "heroui-native";
import { useLocalFirstAuth } from "jazz-tools/expo";
import { JazzProvider } from "jazz-tools/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  const { secret, isLoading } = useLocalFirstAuth();
  if (isLoading || !secret) {
    return null;
  }

  return (
    <JazzProvider
      config={{ appId: process.env.EXPO_PUBLIC_JAZZ_APP_ID!, secret }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <HeroUINativeProvider
            config={{ devInfo: { stylingPrinciples: false } }}
          >
            <NativeTabs>
              <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Icon md="calendar_month" sf="calendar" />
                <NativeTabs.Trigger.Label>カレンダー</NativeTabs.Trigger.Label>
              </NativeTabs.Trigger>
              <NativeTabs.Trigger name="group">
                <NativeTabs.Trigger.Icon md="groups" sf="person.2.fill" />
                <NativeTabs.Trigger.Label>グループ</NativeTabs.Trigger.Label>
              </NativeTabs.Trigger>
            </NativeTabs>
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </JazzProvider>
  );
}
