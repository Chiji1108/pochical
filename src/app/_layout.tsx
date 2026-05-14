import "@/global.css";
import "jazz-tools/expo/polyfills";

import { Stack } from "expo-router";
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
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="patterns"
                options={{ presentation: "fullScreenModal" }}
              />
              <Stack.Screen
                name="members"
                options={{ presentation: "fullScreenModal" }}
              />
            </Stack>
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </JazzProvider>
  );
}
