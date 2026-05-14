import { NativeTabs } from "expo-router/unstable-native-tabs";

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger disableAutomaticContentInsets name="index">
        <NativeTabs.Trigger.Icon md="calendar_month" sf="calendar" />
        <NativeTabs.Trigger.Label>カレンダー</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="group">
        <NativeTabs.Trigger.Icon md="groups" sf="person.2.fill" />
        <NativeTabs.Trigger.Label>グループ</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
