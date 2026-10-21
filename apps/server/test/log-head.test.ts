import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { DayField } from "../src/gen/pochical/v1/sync_pb";
import seedLogHead from "../src/user-do-migrations/0023_seed_log_head.sql";
import { signInAnonymously, userIdOf } from "./helpers";
import { changesIn, device, edit, sendFrame, untilAcked } from "./sync-helpers";

describe("a User DO from before log_head", () => {
  it("gives out cursors past the values it held once migrated", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("a", "2026-10-05", DayField.PATTERN, "night", 1000),
          edit("b", "2026-10-06", DayField.PATTERN, "day", 1000),
        ],
      },
    });
    await untilAcked(phone.frames);
    // As a User DO that held these values before log_head came.
    await runInDurableObject(
      env.USERS.getByName(await userIdOf(token)),
      (_, state) => {
        state.storage.sql.exec("delete from log_head");
        state.storage.sql.exec(seedLogHead);
      }
    );
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("c", "2026-10-07", DayField.PATTERN, "day", 2000)],
      },
    });
    await untilAcked(phone.frames);
    const tablet = await device(token);
    expect(
      changesIn(await tablet.frames.next()).map(({ cursor }) => cursor)
    ).toStrictEqual([1n, 2n, 3n]);
  });
});
