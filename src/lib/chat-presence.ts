import type { Id } from "../../convex/_generated/dataModel";

export type ChatPresenceMember = {
  displayName: string;
  jazzUserId: string;
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
  participantJazzUserIds: string[];
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
    participantJazzUserIds: [currentUserId, targetUserId].sort(),
  } satisfies DirectPresenceRoom);
