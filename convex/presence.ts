import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { type DatabaseCtx, getMembership } from "../convex-lib/groupMembers";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

const presence = new Presence(components.presence);

type PresenceRoomPayload =
  | {
      groupId: string;
      kind: "group";
    }
  | {
      groupId: string;
      kind: "direct";
      participantJazzUserIds: string[];
    };

const isPresenceRoomPayload = (
  value: unknown
): value is PresenceRoomPayload => {
  if (!(typeof value === "object" && value)) {
    return false;
  }

  const room = value as Record<string, unknown>;

  if (!(room.kind === "group" || room.kind === "direct")) {
    return false;
  }

  if (typeof room.groupId !== "string") {
    return false;
  }

  return (
    room.kind === "group" ||
    (Array.isArray(room.participantJazzUserIds) &&
      room.participantJazzUserIds.every(
        (participantJazzUserId: unknown) =>
          typeof participantJazzUserId === "string"
      ))
  );
};

const parsePresenceRoomId = (roomId: string): PresenceRoomPayload => {
  try {
    const parsedRoom: unknown = JSON.parse(roomId);

    if (isPresenceRoomPayload(parsedRoom)) {
      return parsedRoom;
    }
  } catch {
    // The shared room ID is intentionally opaque to clients.
  }

  throw new ConvexError("Invalid presence room");
};

const requirePresenceRoomAccess = async (
  ctx: DatabaseCtx,
  roomId: string,
  jazzUserId: string
) => {
  const room = parsePresenceRoomId(roomId);
  const groupId = room.groupId as Id<"groups">;
  const membership = await getMembership(ctx, groupId, jazzUserId);

  if (!membership) {
    throw new ConvexError("Group not found");
  }

  if (room.kind === "group") {
    return;
  }

  const participants = new Set(room.participantJazzUserIds);

  if (participants.size !== 2 || !participants.has(jazzUserId)) {
    throw new ConvexError("Chat not found");
  }

  for (const participantJazzUserId of participants) {
    const participantMembership = await getMembership(
      ctx,
      groupId,
      participantJazzUserId
    );

    if (!participantMembership) {
      throw new ConvexError("Chat not found");
    }
  }
};

export const heartbeat = mutation({
  args: {
    interval: v.number(),
    roomId: v.string(),
    sessionId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePresenceRoomAccess(ctx, args.roomId, args.userId);

    return presence.heartbeat(
      ctx,
      args.roomId,
      args.userId,
      args.sessionId,
      args.interval
    );
  },
});

export const list = query({
  args: {
    roomToken: v.string(),
  },
  handler: async (ctx, args) => presence.list(ctx, args.roomToken),
});

export const disconnect = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => presence.disconnect(ctx, args.sessionToken),
});

export const updateTyping = mutation({
  args: {
    isTyping: v.boolean(),
    roomId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePresenceRoomAccess(ctx, args.roomId, args.userId);

    return presence.updateRoomUser(ctx, args.roomId, args.userId, {
      isTyping: args.isTyping,
    });
  },
});
