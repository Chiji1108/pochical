import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Typography, useThemeColor } from "heroui-native";
import { Pressable, View } from "react-native";
import { getInviteCodeFromInviteUrl } from "@/lib/invite-links";
import { api as convexApi } from "../../../convex/_generated/api";

const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const trailingPunctuationRegex = /[),.。、]+$/;
const normalizeUrl = (url: string) =>
  url.startsWith("www.") ? `https://${url}` : url;

export const getInviteCodeFromText = (text: string) => {
  for (const match of text.matchAll(urlRegex)) {
    const rawUrl = match[0].replace(trailingPunctuationRegex, "");
    const inviteCode = getInviteCodeFromInviteUrl(normalizeUrl(rawUrl));

    if (inviteCode) {
      return inviteCode;
    }
  }
};

export const InviteLinkCard = ({
  inviteCode,
  isOwnMessage,
}: {
  inviteCode?: string;
  isOwnMessage: boolean;
}) => {
  const router = useRouter();
  const [accentForegroundColor, foregroundColor] = useThemeColor([
    "accent-foreground",
    "foreground",
  ]);
  const invite = useQuery(
    convexApi.invites.preview,
    inviteCode ? { inviteCode } : "skip"
  );

  if (!inviteCode) {
    return null;
  }

  const iconColor = isOwnMessage ? accentForegroundColor : foregroundColor;
  const title = invite
    ? `${invite.groupEmoji} ${invite.groupName}`
    : "グループ招待";
  const description =
    invite === undefined ? "招待リンクを確認しています" : "タップして参加";

  return (
    <Pressable
      accessibilityLabel={`${title}の招待を開く`}
      className={
        isOwnMessage
          ? "mt-2 min-w-52 rounded-md bg-accent-foreground/15 p-3"
          : "mt-2 min-w-52 rounded-md bg-background p-3"
      }
      onPress={() => {
        router.push(`/invite/${encodeURIComponent(inviteCode)}`);
      }}
    >
      <View className="flex-row items-center gap-2">
        <SymbolView
          name={{
            android: "group_add",
            ios: "person.2.badge.plus",
            web: "group_add",
          }}
          size={18}
          tintColor={iconColor}
        />
        <View className="min-w-0 flex-1">
          <Typography
            className={
              isOwnMessage
                ? "font-semibold text-accent-foreground text-sm"
                : "font-semibold text-foreground text-sm"
            }
            numberOfLines={1}
          >
            {title}
          </Typography>
          <Typography
            className={
              isOwnMessage
                ? "text-accent-foreground/80 text-xs"
                : "text-muted text-xs"
            }
            numberOfLines={1}
          >
            {description}
          </Typography>
        </View>
      </View>
    </Pressable>
  );
};
