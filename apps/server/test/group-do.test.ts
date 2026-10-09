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
    const plain = { color: 0, emoji: "", icon: "", letter: "", photoId: "" };
    await group.setProfile({ mark: { ...plain, emoji: "🌿" }, name: "同期" });
    await group.setProfile({
      mark: { ...plain, color: 2, letter: "同" },
      name: "同期会",
    });
    await expect(group.getProfile()).resolves.toStrictEqual({
      mark: { ...plain, color: 2, letter: "同" },
      name: "同期会",
    });
  });
});
