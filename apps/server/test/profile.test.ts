import { textLimits } from "@pochical/design/limits";
import { describe, expect, it } from "vitest";

import { call, signInAnonymously } from "./helpers";
import { changesIn, device } from "./sync-helpers";

const profilesIn = (changes: ReturnType<typeof changesIn>) =>
  changes.filter(({ kind }) => kind.case === "profile");

describe("the usual name", () => {
  it("is kept with the account and told to the user's devices", async () => {
    const token = await signInAnonymously();
    const open = await device(token);
    const saved = await call(
      "UserService/SetProfile",
      { name: " さくら " },
      token
    );
    expect(saved.status).toBe(200);
    // A device already open hears of it, trimmed.
    expect(profilesIn(changesIn(await open.frames.next()))).toMatchObject([
      { kind: { value: { name: "さくら" } } },
    ]);
    // One that connects later catches up on it.
    const later = await device(token);
    expect(profilesIn(changesIn(await later.frames.next()))).toMatchObject([
      { kind: { value: { name: "さくら" } } },
    ]);
  });

  it("can be cleared, but not be longer than a person's name", async () => {
    const token = await signInAnonymously();
    const tooLong = "あ".repeat(textLimits.personName + 1);
    const refused = await call(
      "UserService/SetProfile",
      { name: tooLong },
      token
    );
    expect(refused.status).toBe(400);
    const cleared = await call("UserService/SetProfile", { name: "" }, token);
    expect(cleared.status).toBe(200);
    const phone = await device(token);
    expect(profilesIn(changesIn(await phone.frames.next()))).toMatchObject([
      { kind: { value: { name: "" } } },
    ]);
  });
});
