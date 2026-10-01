import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GroupRoom profile", () => {
  it("has none before the group is set up", async () => {
    await expect(
      env.GROUP_ROOM.getByName("not-set-up").getProfile()
    ).resolves.toBeNull();
  });

  it("keeps the latest name and mark", async () => {
    const room = env.GROUP_ROOM.getByName("renamed");
    await room.setProfile({ emoji: "🌿", name: "同期" });
    await room.setProfile({ emoji: null, name: "同期会" });
    await expect(room.getProfile()).resolves.toStrictEqual({
      emoji: null,
      name: "同期会",
    });
  });
});
