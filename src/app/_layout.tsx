import "@/global.css";
import "jazz-tools/expo/polyfills";

import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { useLocalFirstAuth } from "jazz-tools/expo";
import { JazzProvider, loadJazzRn } from "jazz-tools/react-native";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

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
  if (isLoading || !secret) {
    return null;
  }

  return (
    <JazzProvider
      config={{
        appId: process.env.EXPO_PUBLIC_JAZZ_APP_ID!,
        secret,
        serverUrl: process.env.EXPO_PUBLIC_JAZZ_SERVER_URL,
      }}
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
              <Stack.Screen name="share-groups/[groupId]" />
              <Stack.Screen name="invite/[token]" />
            </Stack>
          </HeroUINativeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </JazzProvider>
  );
}
