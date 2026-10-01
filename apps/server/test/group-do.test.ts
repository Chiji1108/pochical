import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GroupDO profile", () => {
  it("has none before the group is set up", async () => {
    await expect(
      env.GROUPS.getByName("not-set-up").getProfile()
    ).resolves.toBeNull();
  });

  it("keeps the latest name and mark", async () => {
    const group = env.GROUPS.getByName("renamed");
    await group.setProfile({ emoji: "🌿", name: "同期" });
    await group.setProfile({ emoji: null, name: "同期会" });
    await expect(group.getProfile()).resolves.toStrictEqual({
      emoji: null,
      name: "同期会",
    });
  });
});
