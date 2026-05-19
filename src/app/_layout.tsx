import "@/global.css";
import "jazz-tools/expo/polyfills";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { useLocalFirstAuth } from "jazz-tools/expo";
import { JazzProvider, loadJazzRn } from "jazz-tools/react-native";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppSettingsProvider } from "@/lib/app-settings";

export default function RootLayout() {
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [isJazzRnLoaded, setIsJazzRnLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    loadJazzRn()
      .then(() => {
        if (isMounted) {
          setIsJazzRnLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error
              : new Error("jazz-rn の読み込みに失敗しました")
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loadError) {
    throw loadError;
  }

  if (!isJazzRnLoaded) {
    return null;
  }

  return <RootLayoutContent />;
}

function RootLayoutContent() {
  const { secret, isLoading } = useLocalFirstAuth();
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  const convexClient = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (isLoading || !secret) {
    return null;
  }

  if (!convexClient) {
    throw new Error("EXPO_PUBLIC_CONVEX_URL を設定してください");
  }

  return (
    <JazzProvider
      config={{
        appId: process.env.EXPO_PUBLIC_JAZZ_APP_ID!,
        secret,
        serverUrl: process.env.EXPO_PUBLIC_JAZZ_SERVER_URL,
      }}
    >
      <ConvexProvider client={convexClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <HeroUINativeProvider
              config={{ devInfo: { stylingPrinciples: false } }}
            >
              <AppSettingsProvider>
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
                  <Stack.Screen name="share-groups/[groupId]" />
                  <Stack.Screen name="invite/scan" />
                  <Stack.Screen name="invite/[inviteCode]" />
                </Stack>
              </AppSettingsProvider>
            </HeroUINativeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ConvexProvider>
    </JazzProvider>
  );
}
