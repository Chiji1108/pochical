import type { Id } from "../../convex/_generated/dataModel";

export type ChatPresenceMember = {
  displayName: string;
  instantUserId: string;
};

export type ChatPresenceUser = ChatPresenceMember & {
  isTyping: boolean;
  online: boolean;
};

type GroupPresenceRoom = {
  groupId: Id<"groups">;
  kind: "group";
};

type DirectPresenceRoom = {
  groupId: Id<"groups">;
  kind: "direct";
  participantInstantUserIds: string[];
};

export const createGroupPresenceRoomId = (groupId: Id<"groups">) =>
  JSON.stringify({
    groupId,
    kind: "group",
  } satisfies GroupPresenceRoom);

export const createDirectPresenceRoomId = (
  groupId: Id<"groups">,
  currentUserId: string,
  targetUserId: string
) =>
  JSON.stringify({
    groupId,
    kind: "direct",
    participantInstantUserIds: [currentUserId, targetUserId].sort(),
  } satisfies DirectPresenceRoom);
