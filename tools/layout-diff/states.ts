import type { Page } from "playwright-core";

// The screens layout-diff measures: the /design demo in its variants, and
// the taps that reach each screen from the page as it loads. Add a state
// here when a change reaches a screen none of these show.
export type State = {
  name: string;
  // Under the dev server, with the demo's variants in the query.
  path: string;
  steps?: (page: Page) => Promise<void>;
  // What to measure, when not the phones.
  root?: string;
};

const demo = (variants: string) =>
  `/demo?groupSample=some&inviteLink=none&memberSample=some&scanResult=invite&${variants}`;

const tap = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { exact: true, name }).first().click();
};

// Opens a message's reactions and menu, as its long press does; a right
// click stands in for holding a finger on it.
const holdOn = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { name }).first().click({ button: "right" });
};

// A step that taps one button.
const tapOn = (name: string | RegExp) => async (page: Page) => {
  await tap(page, name);
};

// One of the save menu's ways, from the calendar's top right.
const fromSaveMenu = async (page: Page, item: string) => {
  await tap(page, "この月のシフトを保存");
  await page.getByRole("menuitem", { name: item }).click();
};

const toGroupEdit = async (page: Page) => {
  await tap(page, "グループ");
  await tap(page, "グループの設定");
  await tap(page, /編集$/u);
};

// A plain picture of a given size, as a photo chosen from the phone.
const pictureFile = (name: string, width: number, height: number) => ({
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#9cc"/></svg>`
  ),
  mimeType: "image/svg+xml",
  name,
});

// Photos chosen in the group chat, held above the composer.
const choosePhotos = async (page: Page) => {
  await tap(page, "グループ");
  await tap(page, /^全体チャット/u);
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles([
      pictureFile("tall.svg", 600, 800),
      pictureFile("wide.svg", 1200, 600),
    ]);
  await page.getByRole("list", { name: "送る写真" }).waitFor();
};

const toGroupMonth = async (page: Page) => {
  await tap(page, "グループ");
  await tap(page, "月で見る");
};

export const states: State[] = [
  {
    name: "calendar/filled",
    path: demo("scheduleSample=filled"),
  },
  { name: "calendar/empty", path: demo("scheduleSample=empty") },
  {
    // The arrows show only while the keyboard is on them, so the step goes
    // there by the keyboard, as a person without a finger to swipe would.
    name: "calendar/next-month",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await page.getByRole("button", { exact: true, name: "次の月" }).focus();
      await page.keyboard.press("Enter");
    },
  },
  {
    name: "calendar/save-menu",
    path: demo("scheduleSample=filled"),
    steps: tapOn("この月のシフトを保存"),
  },
  {
    name: "calendar/entering",
    path: demo("scheduleSample=empty"),
    steps: tapOn("ポチポチ入力"),
  },
  {
    name: "calendar/week",
    path: demo("scheduleSample=filled"),
    steps: tapOn(/^9月24日/u),
  },
  {
    // A day with its time moved and a memo: the time, its hint and the
    // people with it.
    name: "calendar/day-changed",
    path: demo("scheduleSample=filled"),
    steps: tapOn(/^9月8日/u),
  },
  {
    name: "calendar/day-adding-member",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, /^9月8日/u);
      await tap(page, "追加");
    },
  },
  {
    name: "calendar/day-empty",
    path: demo("scheduleSample=empty"),
    steps: tapOn(/^9月1日/u),
  },
  {
    name: "calendar/breakdown",
    path: demo("scheduleSample=filled"),
    steps: tapOn(/^今月のお休み/u),
  },
  {
    // 完了 with a day left blank between two entered.
    name: "calendar/gap-sheet",
    path: demo("scheduleSample=empty"),
    steps: async (page) => {
      await tap(page, "ポチポチ入力");
      await tap(page, "日勤");
      await tap(page, /^翌日へ/u);
      await tap(page, "日勤");
      await tap(page, /^完了/u);
    },
  },
  {
    // An empty month entered to its end: the save sheet, congratulating.
    // Each pick moves on to the next day.
    name: "calendar/save",
    path: demo("scheduleSample=empty"),
    steps: async (page) => {
      await tap(page, "ポチポチ入力");
      for (let day = 1; day <= 30; day += 1) {
        // oxlint-disable-next-line no-await-in-loop
        await page.getByRole("button", { exact: true, name: "日勤" }).click();
      }
      await tap(page, /^完了/u);
    },
  },
  {
    // Straight to adding, the device's default calendar picked.
    name: "calendar/save-calendar",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await fromSaveMenu(page, "端末カレンダーに追加");
    },
  },
  {
    // The device's calendars under their accounts.
    name: "calendar/save-calendar-pick",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await fromSaveMenu(page, "端末カレンダーに追加");
      await tap(page, /^追加先/u);
    },
  },
  {
    name: "calendar/save-done",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await fromSaveMenu(page, "端末カレンダーに追加");
      await tap(page, /件を追加$/u);
    },
  },
  {
    name: "calendar/image",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await fromSaveMenu(page, "画像で保存");
    },
  },
  {
    name: "group/hub",
    path: demo("scheduleSample=filled"),
    steps: tapOn("グループ"),
  },
  {
    name: "group/month-days",
    path: demo("scheduleSample=filled"),
    steps: toGroupMonth,
  },
  {
    name: "group/month-person",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, "一覧");
      await page.getByRole("menuitemradio", { name: "1人ずつ" }).click();
    },
  },
  {
    name: "group/chat",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
    },
  },
  {
    name: "calendar/date-picker",
    path: demo("scheduleSample=empty"),
    steps: async (page) => {
      await tap(page, "ポチポチ入力");
      await tap(page, /^入力する日付/u);
    },
  },
  {
    name: "settings/repeat-new",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^働き方/u);
      await tap(page, /決まった順番で回すようにする/u);
    },
  },
  {
    name: "settings/job",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^働き方/u);
      await tap(page, /新しい仕事にする/u);
    },
  },
  {
    // An order of three, with the first two weeks it makes.
    name: "settings/repeat-sequence",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^働き方/u);
      await tap(page, /決まった順番で回すようにする/u);
      await tap(page, "日勤");
      await tap(page, "日勤");
      await tap(page, "休み");
    },
  },
  {
    name: "settings/look-colors",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^シフトパターン/u);
      await tap(page, /^日勤/u);
      await tap(page, /^印と色/u);
    },
  },
  // Every phone of the design pages: the calendar in its states, light
  // and dark, and the first-run screens.
  { name: "design/states", path: "/design/states" },
  { name: "design/flows", path: "/design/flows" },
  {
    // The first-run day picked, with the two weeks it starts. The flow
    // page covers its frames against taps, so the click goes to the day.
    name: "design/flows-anchor",
    path: "/design/flows",
    steps: async (page) => {
      await page
        .locator(".dc-phone", { hasText: "の日を1日選んでください" })
        .getByRole("button", { name: /2026年9月10日/u })
        .dispatchEvent("click");
    },
  },
  // Every shared piece on its own, each in its sample box.
  {
    name: "design/components",
    path: "/design/components",
    root: "[data-sample]",
  },
  // The pages themselves around the phones: toolbars, headings, captions,
  // the design choices beside the demo, and the design documents.
  ...[
    ["demo", demo("scheduleSample=filled")],
    ["design", "/design"],
    ["design/states", "/design/states"],
    ["design/flows", "/design/flows"],
    ["design/components", "/design/components"],
    ["design/colors", "/design/colors"],
    ["design/assets", "/design/assets"],
    ["design/widgets", "/design/widgets"],
  ].map(([name, path]) => ({ name: `page/${name}`, path, root: "main" })),
  {
    name: "group/legend-all",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, "一覧");
      await page.getByRole("menuitem", { name: "シフトパターン" }).click();
    },
  },
  {
    name: "group/legend-one",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, "ゆうきのシフトパターン");
    },
  },
  {
    name: "group/new-chat",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, "個人チャットを始める");
    },
  },
  {
    name: "group/member",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, "グループの設定");
      await tap(page, /^ゆうき/u);
    },
  },
  {
    name: "group/settings",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, "グループの設定");
    },
  },
  {
    name: "settings/patterns",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^シフトパターン/u);
    },
  },
  {
    name: "settings/pattern-editor",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^シフトパターン/u);
      await tap(page, /^日勤/u);
    },
  },
  {
    name: "settings/pattern-look",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^シフトパターン/u);
      await tap(page, /^日勤/u);
      await tap(page, /^印と色/u);
    },
  },
  {
    name: "settings/pattern-add",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^シフトパターン/u);
      await tap(page, "パターンを追加");
    },
  },
  {
    name: "settings/coworkers",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^一緒に働く人/u);
    },
  },
  {
    name: "settings/coworker",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^一緒に働く人/u);
      await tap(page, /^田中/u);
    },
  },
  {
    name: "settings/coworker-edit",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^一緒に働く人/u);
      await tap(page, /^田中/u);
      await tap(page, "編集");
    },
  },
  {
    name: "settings/work",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^働き方/u);
    },
  },
  {
    name: "settings/appearance",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^外観/u);
    },
  },
  {
    name: "settings/app-icon",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^アプリアイコン/u);
    },
  },
  {
    name: "settings/app-icon-alert",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^アプリアイコン/u);
      await page.getByText("紙", { exact: true }).click();
    },
  },
  {
    name: "settings/reminders",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^リマインド/u);
    },
  },
  {
    name: "settings/reminder-add",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^リマインド/u);
      await tap(page, "リマインドを追加");
      await page.getByText("開始前", { exact: true }).click();
    },
  },
  {
    name: "settings/chat-notifications",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^チャット/u);
    },
  },
  {
    name: "settings/style",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^スタイル/u);
    },
  },
  {
    name: "settings/profile",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^プロフィール/u);
    },
  },
  {
    name: "settings/account",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^アカウント/u);
    },
  },
  {
    name: "settings/account-in",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^アカウント/u);
      await tap(page, "Appleで続ける");
      // Signing in takes a moment, as it would with Apple.
      await page.getByRole("button", { name: "ログアウト" }).waitFor();
    },
  },
  {
    // A message tapped: its reactions and menu over the chat.
    name: "group/chat-actions",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await holdOn(page, /^お母さんのメッセージ：来週の日曜/u);
    },
  },
  {
    name: "group/chat-replying",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await holdOn(page, /^お母さんのメッセージ：来週の日曜/u);
      await tap(page, "返信");
    },
  },
  {
    // A photo in the chat, long pressed: its reactions and menu.
    name: "group/chat-photo-actions",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await page
        .getByRole("button", { name: /が送った写真/u })
        .first()
        .click({ button: "right" });
      await page
        .getByRole("dialog", { name: "リアクションとメニュー" })
        .waitFor();
    },
  },
  {
    name: "group/chat-photos",
    path: demo("scheduleSample=filled"),
    steps: choosePhotos,
  },
  {
    // Sent: each photo a line of its own.
    name: "group/chat-photos-sent",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await choosePhotos(page);
      await tap(page, "送る");
    },
  },
  {
    // A photo whose upload failed: the red ! and its note.
    name: "group/chat-photo-failed",
    path: demo("photoSend=fails&scheduleSample=filled"),
    steps: async (page) => {
      await choosePhotos(page);
      await tap(page, "送る");
      await page
        .getByRole("button", { name: /^送れませんでした/u })
        .first()
        .waitFor();
    },
  },
  {
    // The friends' chat ends on a link with its page under the words.
    name: "group/chat-link",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^看護学校の友達/u);
      await tap(page, /^全体チャット/u);
      await page.getByRole("link", { name: /cafe こもれび/u }).waitFor();
    },
  },
  {
    // A link being written: its page, once read, above the composer.
    name: "group/chat-link-compose",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await page
        .getByRole("textbox", { name: "メッセージ" })
        .fill("ここ予約できるみたい！ https://cafe-komorebi.example/menu");
      await page
        .getByRole("button", { name: "リンクのプレビューを付けない" })
        .waitFor();
      await page
        .getByText(/^cafe こもれび/u)
        .first()
        .waitFor();
    },
  },
  {
    // A muted group chat whose unread lines mention you: @ by the count.
    name: "group/chat-mentioned",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^高校の同級生/u);
    },
  },
  {
    // An @ being written: the others to mention over the composer.
    name: "group/chat-mention-picker",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await page.getByRole("textbox", { name: "メッセージ" }).fill("21日、@");
      await page.getByRole("list", { name: "メンションする人" }).waitFor();
    },
  },
  {
    // The family chat ends on an invitation: its group under the words.
    name: "group/chat-invite",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await page.getByRole("button", { name: /^いとこ会/u }).waitFor();
    },
  },
  {
    // An invitation tapped in the chat opens its join screen in the app.
    name: "group/chat-invite-join",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await tap(page, /^いとこ会/u);
      await page.getByRole("button", { name: "参加する" }).waitFor();
    },
  },
  {
    // Your message being changed: its words back in the composer.
    name: "group/chat-editing",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await holdOn(page, /^自分のメッセージ：/u);
      await tap(page, "編集");
    },
  },
  {
    // 送信取消 asked first.
    name: "group/chat-unsend",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await holdOn(page, /^自分のメッセージ：/u);
      await tap(page, "送信取消");
      await page.getByRole("alertdialog").waitFor();
    },
  },
  {
    // Someone else's message reported: the reasons.
    name: "group/chat-report",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await holdOn(page, /^お母さんのメッセージ：来週の日曜/u);
      await tap(page, "通報");
      await page.getByRole("dialog", { name: "通報" }).waitFor();
    },
  },
  {
    // A member blocked from their profile: their messages folded.
    name: "group/chat-blocked",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await tap(page, "お母さんのプロフィール");
      await tap(page, "お母さんのメニュー");
      await page.getByRole("menuitem", { name: "ブロック" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { exact: true, name: "ブロック" })
        .click();
      await page
        .getByText("ブロック中のメンバーのメッセージ")
        .first()
        .waitFor();
    },
  },
  {
    // A chat with unread lines opens on the first, under ここから新着.
    name: "group/chat-unread",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^看護学校の友達/u);
      await tap(page, /^全体チャット/u);
      await page.getByText("ここから新着").waitFor();
    },
  },
  {
    // A line pinned over the chat, from its menu.
    name: "group/chat-pinned",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await holdOn(page, /^お母さんのメッセージ：来週の日曜/u);
      await tap(page, "ピン留め");
      await page
        .getByRole("button", { name: /^ピン留め/u })
        .first()
        .waitFor();
    },
  },
  {
    // A poll on days, in the ward cohort's chat.
    name: "group/chat-poll",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^3階東病棟/u);
      await tap(page, /^全体チャット/u);
      await page.getByText("日にちの投票").first().waitFor();
    },
  },
  {
    name: "group/chat-one",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^ゆうき/u);
    },
  },
  {
    name: "group/none",
    path: "/demo?groupSample=none&inviteLink=none&memberSample=some&scanResult=invite&scheduleSample=filled",
    steps: tapOn("グループ"),
  },
  {
    // Opened from an invitation link: the join sheet over the calendar.
    name: "group/join",
    path: "/demo?groupSample=some&inviteLink=opened&memberSample=some&scanResult=invite&scheduleSample=filled",
  },
  {
    name: "group/invite",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, "メンバーを招待");
    },
  },
  {
    name: "group/profile",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, "グループの設定");
      await tap(page, /^さくら/u);
    },
  },
  {
    name: "group/edit",
    path: demo("scheduleSample=filled"),
    steps: toGroupEdit,
  },
  {
    name: "group/mark-photo",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupEdit(page);
      await tap(page, "アイコン");
    },
  },
  ...(["絵文字", "アイコン", "文字"] as const).map((kind) => ({
    name: `group/mark-${kind}`,
    path: demo("scheduleSample=filled"),
    steps: async (page: Page) => {
      await toGroupEdit(page);
      await tap(page, "アイコン");
      await page
        .locator("[data-part=item]", { hasText: new RegExp(`^${kind}$`, "u") })
        .click();
    },
  })),
  {
    name: "settings/profile-photo",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^プロフィール/u);
      await page.getByRole("button", { name: "写真を編集" }).last().click();
    },
  },
  {
    name: "group/month-week",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, "一覧");
      await page.getByRole("menuitemradio", { name: "週ごと" }).click();
    },
  },
  {
    // A day picked in the week table: its frame and the day's sheet.
    name: "group/month-week-picked",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, "一覧");
      await page.getByRole("menuitemradio", { name: "週ごと" }).click();
      await tap(page, /^9月23日.*押すと/u);
    },
  },
  {
    name: "group/month-days-picked",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, /^9月23日.*押すと/u);
    },
  },
  {
    // Six people: marks alone in 一覧.
    name: "group/month-days-marks",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^3階東病棟/u);
      await tap(page, "月で見る");
    },
  },
  {
    name: "group/share-days",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await tap(page, "日にちを共有");
    },
  },
  {
    name: "group/share-days-picked",
    path: demo("scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
      await tap(page, "日にちを共有");
      await tap(page, /^9\/27/u);
      await tap(page, "9月29日(火)");
    },
  },
  {
    name: "settings",
    path: demo("scheduleSample=filled"),
    steps: tapOn("設定"),
  },
];
