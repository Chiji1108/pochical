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
      admin.answerSupport(userId, "設定から変えられます", crypto.randomUUID())
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
    await expect(
      admin.answerSupport(userId, "  ", crypto.randomUUID())
    ).resolves.toBeFalsy();
    await expect(
      admin.answerSupport("someone", "やあ", crypto.randomUUID())
    ).resolves.toBeFalsy();
  });

  it("keeps one line of an answer sent twice, as pressed twice or after its answer was lost", async () => {
    const token = await signInAnonymously();
    const { userId } = await supportChat(token);
    const admin = exports.AdminEntrypoint;
    const opId = crypto.randomUUID();
    const sent = await Promise.all([
      admin.answerSupport(userId, "確認します", opId),
      admin.answerSupport(userId, "確認します", opId),
    ]);
    await expect(
      admin.answerSupport(userId, "確認します", opId)
    ).resolves.toBeTruthy();
    expect(sent).toStrictEqual([true, true]);
    const { lines } = await admin.supportChat(userId);
    expect(lines.map((line) => line.text)).toStrictEqual(["確認します"]);
    // New words are a new answer.
    await admin.answerSupport(userId, "確認しました", crypto.randomUUID());
    const after = await admin.supportChat(userId);
    expect(after.lines.map((line) => line.text)).toStrictEqual([
      "確認します",
      "確認しました",
    ]);
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
