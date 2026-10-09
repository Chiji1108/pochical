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
  mark: { emoji?: string; icon?: string; color?: number }
): Promise<void> => {
  await env.GROUPS.getByName(groupId).setProfile({
    mark: { color: 0, emoji: "", icon: "", letter: "", ...mark },
    name: "同期",
  });
  await db.insert(invites).values({ code: inviteCode, groupId });
};

describe("InviteService.GetInvitePreview", () => {
  it("names the group a live code opens", async () => {
    await addGroup("dokis", "Abcd2345", { emoji: "🌿" });

    const response = await getInvitePreview("Abcd2345");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      groupMark: { emoji: "🌿" },
      groupName: "同期",
    });
  });

  it("gives an icon mark with its color", async () => {
    await addGroup("icon-mark", "Mark2345", { color: 3, icon: "house" });

    const response = await getInvitePreview("Mark2345");
    await expect(response.json()).resolves.toStrictEqual({
      groupMark: { color: 3, icon: "house" },
      groupName: "同期",
    });
  });

  it("answers NOT_FOUND once the code is replaced", async () => {
    await addGroup("remade", "Before23", { emoji: "🌿" });
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
