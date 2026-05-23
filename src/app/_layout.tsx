import "@/global.css";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useMemo, useState } from "react";
import { type ColorSchemeName, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import useMount from "react-use/lib/useMount";
import { AppSettingsProvider } from "@/lib/app-settings";
import { db } from "@/lib/instant";

let guestSignInPromise: ReturnType<typeof db.auth.signInAsGuest> | undefined;

const signInAsGuestOnce = () => {
  guestSignInPromise ??= db.auth.signInAsGuest().catch((error: unknown) => {
    guestSignInPromise = undefined;
    throw error;
  });

  return guestSignInPromise;
};

export default function RootLayout() {
  return <RootLayoutContent />;
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  const convexClient = useMemo(() => {
    if (!convexUrl) {
      return null;
    }

    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convexClient) {
    throw new Error("EXPO_PUBLIC_CONVEX_URL を設定してください");
  }

  return (
    <ConvexProvider client={convexClient}>
      <db.SignedIn>
        <AppShell colorScheme={colorScheme} />
      </db.SignedIn>
      <db.SignedOut>
        <GuestBootstrap />
      </db.SignedOut>
    </ConvexProvider>
  );
}

function AppShell({ colorScheme }: { colorScheme: ColorSchemeName }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <HeroUINativeProvider
            config={{ devInfo: { stylingPrinciples: false } }}
          >
            <AppSettingsProvider>
              <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
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
                <Stack.Screen
                  name="export"
                  options={{ presentation: "fullScreenModal" }}
                />
                <Stack.Screen name="share-groups/new" />
                <Stack.Screen name="share-groups/[groupId]/chats/group/index" />
                <Stack.Screen name="share-groups/[groupId]/chats/[memberInstantUserId]/index" />
                <Stack.Screen name="share-groups/[groupId]/settings" />
                <Stack.Screen name="share-groups/[groupId]/shifts" />
                <Stack.Screen name="invite/scan" />
                <Stack.Screen name="invite/[inviteCode]" />
                <Stack.Screen name="instant-sandbox" />
              </Stack>
            </AppSettingsProvider>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function GuestBootstrap() {
  const [signInError, setSignInError] = useState<Error | null>(null);

  useMount(() => {
    signInAsGuestOnce().catch((error: unknown) => {
      setSignInError(
        error instanceof Error
          ? error
          : new Error("InstantDB guest sign-in に失敗しました")
      );
    });
  });

  if (signInError) {
    throw signInError;
  }

  return null;
}
