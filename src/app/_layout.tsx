import "@/global.css";

import { NativeTabs } from "expo-router/unstable-native-tabs";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
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
    </GestureHandlerRootView>
  );
}
