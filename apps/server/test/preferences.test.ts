import { syncLimits } from "@pochical/design/limits";
import { describe, expect, it } from "vitest";

import { signInAnonymously } from "./helpers";
import {
  changesIn,
  clock,
  device,
  pair,
  PAIR_ROSTER,
  push,
  sendFrame,
  settled,
  syncSocket,
} from "./sync-helpers";

// A user's preferences (spec/sync-protocol.md, Preferences), synced as
// their own values: a key each, the last one written winning.

const preferenceEdit = (
  opId: string,
  key: string,
  value: string | undefined,
  ms: number
) => ({
  case: "preferenceEdits" as const,
  value: { edits: [{ opId, value: { hlc: clock(ms), key, value } }] },
});

describe("syncing a user's preferences", () => {
  it("brings each of the user's devices the last one set, an older edit giving way", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    const tablet = await device(token);
    sendFrame(phone.socket, preferenceEdit("a", "theme", '"zen"', 2000));
    await phone.frames.next();
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["a"] } },
    });
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            {
              kind: {
                case: "preference",
                value: { key: "theme", value: '"zen"' },
              },
            },
          ],
        },
      },
    });
    // Older, from the tablet offline: acknowledged and nothing changes.
    sendFrame(tablet.socket, preferenceEdit("b", "theme", '"sumi"', 1000));
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["b"] } },
    });

    const laptop = await device(token);
    expect(
      changesIn(await laptop.frames.next()).map(({ kind }) => kind.value)
    ).toMatchObject([{ key: "theme", value: '"zen"' }]);
  });

  it("keeps what was there for a value too long, and takes one set back", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, preferenceEdit("a", "week", '{"start":1}', 1000));
    await phone.frames.next();
    await phone.frames.next();
    const long = `"${"x".repeat(syncLimits.preferenceLength)}"`;
    sendFrame(phone.socket, preferenceEdit("b", "week", long, 2000));
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            {
              kind: {
                case: "preference",
                value: {
                  hlc: { deviceId: "server" },
                  key: "week",
                  value: '{"start":1}',
                },
              },
            },
          ],
        },
      },
    });
    await phone.frames.next();
    sendFrame(phone.socket, preferenceEdit("c", "week", undefined, 3000));
    const cleared = changesIn(await phone.frames.next());
    expect(cleared[0]?.kind.value).toMatchObject({ key: "week" });
    expect(cleared[0]?.kind.value).not.toHaveProperty(
      "value",
      expect.anything()
    );
  });

  it("never reaches the user's groups", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const phone = await device(maker);
    sendFrame(
      phone.socket,
      preferenceEdit("a", "look", '{"style":"emoji"}', 1000)
    );
    await phone.frames.next();
    await phone.frames.next();
    await push(makerId);

    const group = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      guest,
      PAIR_ROSTER
    );
    expect(group.welcome.kind).toMatchObject({
      value: { cursor: PAIR_ROSTER },
    });
    await expect(settled(group.socket, group.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });
});
