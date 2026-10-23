import { chatRules } from "@pochical/design/chat";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { memberOf, signInAnonymously, userIdOf } from "./helpers";
import { watchAlarms, relayed, supportChat, words } from "./sync-helpers";

watchAlarms();

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
      admin.answerSupport(
        userId,
        "設定から変えられます",
        crypto.randomUUID(),
        "staff@pochical.app"
      )
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
                value: {
                  authorId: "pochical",
                  ...words("設定から変えられます"),
                },
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
          value: {
            content: { kind: { case: "words", value: { text: `${at + 1}` } } },
            threadId: "group",
          },
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
      admin.answerSupport(
        userId,
        "  ",
        crypto.randomUUID(),
        "staff@pochical.app"
      )
    ).resolves.toBeFalsy();
    await expect(
      admin.answerSupport(
        "someone",
        "やあ",
        crypto.randomUUID(),
        "staff@pochical.app"
      )
    ).resolves.toBeFalsy();
  });

  it("keeps one line of an answer sent twice, as pressed twice or after its answer was lost", async () => {
    const token = await signInAnonymously();
    const { userId } = await supportChat(token);
    const admin = exports.AdminEntrypoint;
    const opId = crypto.randomUUID();
    const sent = await Promise.all([
      admin.answerSupport(userId, "確認します", opId, "staff@pochical.app"),
      admin.answerSupport(userId, "確認します", opId, "staff@pochical.app"),
    ]);
    await expect(
      admin.answerSupport(userId, "確認します", opId, "staff@pochical.app")
    ).resolves.toBeTruthy();
    expect(sent).toStrictEqual([true, true]);
    const { lines } = await admin.supportChat(userId);
    expect(lines.map((line) => line.text)).toStrictEqual(["確認します"]);
    // New words are a new answer.
    await admin.answerSupport(
      userId,
      "確認しました",
      crypto.randomUUID(),
      "staff@pochical.app"
    );
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

  it("finds a user by the start of their id and gives their page", async () => {
    const token = await memberOf(crypto.randomUUID());
    const userId = await userIdOf(token);
    await env.USERS.getByName(userId).setProfile("ハナ", "");
    const { say } = await supportChat(token);
    await say("使い方を教えて", "ポチカル 1.0・iPhone");
    await env.DB.prepare(
      "insert into reports (id, created_at, group_id, reporter_id, target_id, reason, context) values (?, ?, 'g', ?, 'someone', 'harassment', '言い過ぎ')"
    )
      .bind(crypto.randomUUID(), Date.now(), userId)
      .run();
    const admin = exports.AdminEntrypoint;

    const { users: found } = await admin.users(userId.slice(0, 6));
    expect(found.find((one) => one.userId === userId)).toMatchObject({
      anonymous: true,
      signIns: [],
      unanswered: 1,
    });
    // An id's start is taken as it is: % matches no id.
    await expect(admin.users("%")).resolves.toStrictEqual({
      next: null,
      users: [],
    });

    // The group tells the user's own DO of their place in it after it
    // answers.
    const groupsListed = async () => {
      const listed = await admin.user(userId);
      return listed?.groups.length;
    };
    await expect.poll(groupsListed).toBe(1);
    const page = await admin.user(userId);
    expect(page).toMatchObject({
      anonymous: true,
      groups: [{ leftAtMs: null, name: "テスト" }],
      name: "ハナ",
      reportsAbout: [],
      reportsBy: [{ context: "言い過ぎ", targetId: "someone" }],
      reportsByCount: 1,
      sessions: 1,
      unanswered: 1,
    });
    expect(page?.supportChat).not.toBeNull();
  });

  it("gives no page for an id with no account, asking no DO", async () => {
    await expect(
      exports.AdminEntrypoint.user(crypto.randomUUID())
    ).resolves.toBeNull();
  });

  it("sets a report's state and note, noting who, and counts what waits", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "insert into reports (id, created_at, group_id, reporter_id, target_id, reason, context) values (?, ?, 'g', 'r', 't', 'spam', '宣伝の連投')"
    )
      .bind(id, Date.now())
      .run();
    const admin = exports.AdminEntrypoint;
    const before = await admin.waiting();
    const listed = async () => {
      const all = await admin.reports();
      return all.find((report) => report.id === id);
    };
    await expect(listed()).resolves.toMatchObject({
      handled: null,
      note: "",
      state: "open",
    });

    await expect(
      admin.handleReport(id, "acted", " 本人に注意した ", "staff@pochical.app")
    ).resolves.toBeTruthy();
    await expect(listed()).resolves.toMatchObject({
      handled: { by: "staff@pochical.app" },
      note: "本人に注意した",
      state: "acted",
    });
    await expect(admin.waiting()).resolves.toMatchObject({
      reports: before.reports - 1,
    });
    const actions = await admin.actions();
    expect(actions[0]).toMatchObject({
      action: "report",
      by: "staff@pochical.app",
      detail: "対応済み：本人に注意した",
      target: id,
    });
  });

  it("takes a report back to waiting, with no one's mark", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "insert into reports (id, created_at, group_id, reporter_id, target_id, reason, context) values (?, ?, 'g', 'r', 't', 'other', '確認')"
    )
      .bind(id, Date.now())
      .run();
    const admin = exports.AdminEntrypoint;
    await admin.handleReport(id, "dismissed", "", "staff@pochical.app");
    await admin.handleReport(id, "open", "", "staff@pochical.app");
    const all = await admin.reports();
    expect(all.find((report) => report.id === id)).toMatchObject({
      handled: null,
      state: "open",
    });
  });

  it("takes no state it does not know, nor a report that is not there", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "insert into reports (id, created_at, group_id, reporter_id, target_id, reason, context) values (?, ?, 'g', 'r', 't', 'spam', '宣伝')"
    )
      .bind(id, Date.now())
      .run();
    const admin = exports.AdminEntrypoint;
    await expect(
      admin.handleReport(id, "closed", "", "staff@pochical.app")
    ).resolves.toBeFalsy();
    await expect(
      admin.handleReport(id, "acted", "あ".repeat(1001), "staff@pochical.app")
    ).resolves.toBeFalsy();
    await expect(
      admin.handleReport(crypto.randomUUID(), "acted", "", "staff@pochical.app")
    ).resolves.toBeFalsy();
  });

  it("notes an answer sent twice once", async () => {
    const token = await signInAnonymously();
    const { userId } = await supportChat(token);
    const admin = exports.AdminEntrypoint;
    const opId = crypto.randomUUID();
    await admin.answerSupport(userId, "見ます", opId, "staff@pochical.app");
    await admin.answerSupport(userId, "見ます", opId, "staff@pochical.app");
    const actions = await admin.actions();
    expect(
      actions.filter(
        (action) => action.action === "answer" && action.target === userId
      )
    ).toHaveLength(1);
  });

  it("lists more users than D1 binds at once, with how each signs in", async () => {
    const prefix = `bulk-${crypto.randomUUID().slice(0, 8)}-`;
    const ids = Array.from({ length: 120 }, (_, at) => `${prefix}${at}`);
    await env.DB.batch(
      ids.map((id) =>
        env.DB.prepare(
          "insert into user (id, name, email, updated_at, is_anonymous) values (?, '', ?, ?, 0)"
        ).bind(id, `${id}@example.test`, Date.now())
      )
    );
    const [first = ""] = ids;
    await env.DB.prepare(
      "insert into account (id, account_id, provider_id, user_id, updated_at) values (?, ?, 'apple', ?, ?)"
    )
      .bind(crypto.randomUUID(), "apple-sub", first, Date.now())
      .run();
    const { users: listed } = await exports.AdminEntrypoint.users(prefix);
    expect(listed).toHaveLength(120);
    expect(listed.find((one) => one.userId === first)?.signIns).toStrictEqual([
      "apple",
    ]);
  });

  it("pages the users past a full page, none twice and none left out", async () => {
    const prefix = `page-${crypto.randomUUID().slice(0, 8)}-`;
    // Signed up at the same moment, so the page ends among equals.
    const at = Date.now();
    const ids = Array.from({ length: 250 }, (_, index) => `${prefix}${index}`);
    await env.DB.batch(
      ids.map((id) =>
        env.DB.prepare(
          "insert into user (id, name, email, created_at, updated_at, is_anonymous) values (?, '', ?, ?, ?, 1)"
        ).bind(id, `${id}@example.test`, at, at)
      )
    );
    const admin = exports.AdminEntrypoint;
    const first = await admin.users(prefix);
    expect(first.next).not.toBeNull();
    const second = await admin.users(prefix, first.next);
    // The last 50 follow no one: no page after them.
    expect(second.next).toBeNull();
    const seen = [...first.users, ...second.users].map((one) => one.userId);
    expect(new Set(seen)).toStrictEqual(new Set(ids));
    expect(seen).toHaveLength(250);
  });

  it("gives no next page after exactly a full page", async () => {
    const prefix = `full-${crypto.randomUUID().slice(0, 8)}-`;
    const at = Date.now();
    await env.DB.batch(
      Array.from({ length: 200 }, (_, index) =>
        env.DB.prepare(
          "insert into user (id, name, email, created_at, updated_at, is_anonymous) values (?, '', ?, ?, ?, 1)"
        ).bind(`${prefix}${index}`, `${prefix}${index}@example.test`, at, at)
      )
    );
    const { next, users } = await exports.AdminEntrypoint.users(prefix);
    expect([users.length, next]).toStrictEqual([200, null]);
  });
});
