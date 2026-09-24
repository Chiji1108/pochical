import { usePresence } from "@convex-dev/presence/react-native";
import { useMutation } from "convex/react";
import { useEffect, useMemo } from "react";
import type { ChatPresenceMember, ChatPresenceUser } from "@/lib/chat-presence";
import { api as convexApi } from "../../../convex/_generated/api";

type PresenceStateWithData = {
  data?: unknown;
  lastDisconnected: number;
  online: boolean;
  userId: string;
};

const isTypingPresenceData = (data: unknown) =>
  typeof data === "object" &&
  data !== null &&
  "isTyping" in data &&
  (data as { isTyping?: unknown }).isTyping === true;

const getTypingSummary = (typingUsers: ChatPresenceUser[]) => {
  if (typingUsers.length === 0) {
    return null;
  }

  if (typingUsers.length === 1) {
    return `${typingUsers[0].displayName}さんが入力中...`;
  }

  return `${typingUsers.length}人が入力中...`;
};

export const useChatTyping = (
  currentUserId: string,
  presenceRoomId: string,
  presenceMembers: ChatPresenceMember[],
  isTyping: boolean
) => {
  const presenceState = usePresence(
    convexApi.presence,
    presenceRoomId,
    currentUserId
  );
  const updateTypingMutation = useMutation(convexApi.presence.updateTyping);
  const presenceUsers = useMemo(() => {
    const membersByUserId = new Map(
      presenceMembers.map((member) => [member.userId, member])
    );
    const states = (presenceState ?? []) as PresenceStateWithData[];
    const users: ChatPresenceUser[] = [];

    for (const state of states) {
      if (state.userId === currentUserId || !state.online) {
        continue;
      }

      const member = membersByUserId.get(state.userId);

      if (!member) {
        continue;
      }

      users.push({
        ...member,
        isTyping: isTypingPresenceData(state.data),
        online: state.online,
      });
    }

    return users;
  }, [currentUserId, presenceMembers, presenceState]);
  const typingUsers = presenceUsers.filter((user) => user.isTyping);
  const typingSummary = getTypingSummary(typingUsers);

  useEffect(() => {
    updateTypingMutation({
      isTyping,
      roomId: presenceRoomId,
      userId: currentUserId,
    }).catch(() => undefined);

    return () => {
      if (isTyping) {
        updateTypingMutation({
          isTyping: false,
          roomId: presenceRoomId,
          userId: currentUserId,
        }).catch(() => undefined);
      }
    };
  }, [currentUserId, isTyping, presenceRoomId, updateTypingMutation]);

  return typingSummary;
};
