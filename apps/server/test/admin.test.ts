import { chatRules } from "@pochical/design/chat";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { signInAnonymously } from "./helpers";
import { relayed, supportChat } from "./sync-helpers";

describe("what the admin site asks of the server", () => {
  it("lists the chats from their index and answers one, the user hearing of it", async () => {
    const token = await signInAnonymously();
    const { frames, say, userId } = await supportChat(token);
    await say("色を変えたい", "ポチカル 1.0・iPhone");
    const admin = exports.AdminEntrypoint;
    const listed = async () => {
      const chats = await admin.supportChats();
      return chats.find((chat) => chat.userId === userId);
    };
    await expect(listed()).resolves.toMatchObject({
      fromSupport: false,
      text: "色を変えたい",
      unanswered: 1,
    });

    await expect(
      admin.answerSupport(userId, "設定から変えられます")
    ).resolves.toBeTruthy();
    // The open chat hears of the answer as a group's chat hears a line.
    await expect(frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            {
              kind: {
                case: "chatLine",
                value: { authorId: "pochical", text: "設定から変えられます" },
              },
            },
          ],
        },
      },
    });
    await relayed(userId);
    await expect(listed()).resolves.toMatchObject({
      fromSupport: true,
      unanswered: 0,
    });
    const page = await admin.supportChat(userId);
    expect([
      page.atStart,
      page.lines.map((line) => [line.fromPochical, line.text, line.device]),
    ]).toStrictEqual([
      true,
      [
        [false, "色を変えたい", "ポチカル 1.0・iPhone"],
        [true, "設定から変えられます", null],
      ],
    ]);
  });

  it("pages a chat as a device does, its one full page reaching the first line", async () => {
    const token = await signInAnonymously();
    const { edit, userId } = await supportChat(token);
    await edit(
      Array.from({ length: chatRules.pageSize }, (_, at) => ({
        kind: {
          case: "send" as const,
          value: { text: `${at + 1}`, threadId: "group" },
        },
        opId: crypto.randomUUID(),
      }))
    );
    const page = await exports.AdminEntrypoint.supportChat(userId);
    expect([page.atStart, page.lines.length]).toStrictEqual([
      true,
      chatRules.pageSize,
    ]);
  });

  it("takes no empty answer, nor one to a chat never opened", async () => {
    const token = await signInAnonymously();
    const { userId } = await supportChat(token);
    const admin = exports.AdminEntrypoint;
    await expect(admin.answerSupport(userId, "  ")).resolves.toBeFalsy();
    await expect(admin.answerSupport("someone", "やあ")).resolves.toBeFalsy();
  });

  it("lists the reports", async () => {
    await env.DB.prepare(
      "insert into reports (id, created_at, group_id, reporter_id, target_id, reason, context) values (?, ?, 'g', 'r', 't', 'spam', '宣伝')"
    )
      .bind(crypto.randomUUID(), Date.now())
      .run();
    const reports = await exports.AdminEntrypoint.reports();
    expect(reports.some((report) => report.context === "宣伝")).toBeTruthy();
  });
});
