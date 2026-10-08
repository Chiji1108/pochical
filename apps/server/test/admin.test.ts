import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { call, signInAnonymously, userIdOf } from "./helpers";

describe("what the admin site asks of the server", () => {
  it("lists the chats and answers one, the user hearing of it", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    await call(
      "SupportService/SendSupportMessage",
      { id: crypto.randomUUID(), text: "色を変えたい" },
      token
    );
    const admin = exports.AdminEntrypoint;
    const chats = await admin.supportChats();
    const mine = chats.find((chat) => chat.userId === userId);
    expect([mine?.text, mine?.fromSupport]).toStrictEqual([
      "色を変えたい",
      false,
    ]);
    await expect(
      admin.answerSupport(userId, "設定から変えられます")
    ).resolves.toBeTruthy();
    const lines = await admin.supportChat(userId);
    expect(lines.map((line) => [line.fromSupport, line.text])).toStrictEqual([
      [false, "色を変えたい"],
      [true, "設定から変えられます"],
    ]);
    const response = await call("SupportService/GetSupportChat", {}, token);
    const said = JSON.stringify(await response.json());
    expect(said.includes('"unread":1')).toBeTruthy();
  });

  it("takes no empty answer", async () => {
    const kept = await exports.AdminEntrypoint.answerSupport("someone", "  ");
    expect(kept).toBeFalsy();
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
