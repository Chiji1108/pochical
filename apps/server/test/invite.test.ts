import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { invites } from "../src/db/schema";
import { call } from "./helpers";

const db = drizzle(env.DB);

const getInvitePreview = async (inviteCode: string): Promise<Response> =>
  await call("InviteService/GetInvitePreview", { inviteCode });

const addGroup = async (
  groupId: string,
  inviteCode: string,
  emoji: string | null
): Promise<void> => {
  await env.GROUPS.getByName(groupId).setProfile({ emoji, name: "同期" });
  await db.insert(invites).values({ code: inviteCode, groupId });
};

describe("InviteService.GetInvitePreview", () => {
  it("names the group a live code opens", async () => {
    await addGroup("dokis", "Abcd2345", "🌿");

    const response = await getInvitePreview("Abcd2345");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      groupEmoji: "🌿",
      groupName: "同期",
    });
  });

  it("leaves the emoji out for other marks", async () => {
    await addGroup("photo-mark", "Photo234", null);

    const response = await getInvitePreview("Photo234");
    await expect(response.json()).resolves.toStrictEqual({ groupName: "同期" });
  });

  it("answers NOT_FOUND once the code is replaced", async () => {
    await addGroup("remade", "Before23", "🌿");
    await db
      .update(invites)
      .set({ code: "After234" })
      .where(eq(invites.groupId, "remade"));

    const response = await getInvitePreview("Before23");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "not_found" });
  });

  it("answers NOT_FOUND for a code whose group has no profile", async () => {
    await db
      .insert(invites)
      .values({ code: "Empty234", groupId: "never-set-up" });

    const response = await getInvitePreview("Empty234");
    expect(response.status).toBe(404);
  });

  it("rejects malformed codes", async () => {
    const responses = await Promise.all(
      ["", "short", "Abcd234O", "../../etc"].map(getInvitePreview)
    );
    for (const response of responses) {
      expect(response.status).toBe(400);
    }
    const [first] = responses;
    await expect(first?.json()).resolves.toMatchObject({
      code: "invalid_argument",
    });
  });
});
