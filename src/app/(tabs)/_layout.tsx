import { useQuery } from "convex/react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCurrentUserId } from "@/lib/instant";
import { api as convexApi } from "../../../convex/_generated/api";

const MAX_TAB_UNREAD_COUNT = 99;

const formatTabUnreadCount = (unreadCount: number): string =>
  unreadCount > MAX_TAB_UNREAD_COUNT
    ? `${MAX_TAB_UNREAD_COUNT}+`
    : String(unreadCount);

export default function TabLayout() {
  const currentUserId = useCurrentUserId();
  const groups = useQuery(
    convexApi.groups.listForCurrentUser,
    currentUserId ? { instantUserId: currentUserId } : "skip"
  );
  let groupUnreadCount = 0;

  for (const group of groups ?? []) {
    groupUnreadCount += group.unreadCount;
  }

  return (
    <NativeTabs>
      <NativeTabs.Trigger disableAutomaticContentInsets name="index">
        <NativeTabs.Trigger.Icon md="calendar_month" sf="calendar" />
        <NativeTabs.Trigger.Label>カレンダー</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="group">
        <NativeTabs.Trigger.Icon md="groups" sf="person.2.fill" />
        <NativeTabs.Trigger.Label>グループ</NativeTabs.Trigger.Label>
        {groupUnreadCount > 0 ? (
          <NativeTabs.Trigger.Badge>
            {formatTabUnreadCount(groupUnreadCount)}
          </NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>設定</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
