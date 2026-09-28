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

// A step that taps one button.
const tapOn = (name: string | RegExp) => async (page: Page) => {
  await tap(page, name);
};

const toGroupMonth = async (page: Page) => {
  await tap(page, "グループ");
  await tap(page, "月で見る");
};

export const states: State[] = [
  {
    name: "calendar/filled",
    path: demo("bottomRows=two&scheduleSample=filled"),
  },
  {
    name: "calendar/filled-current",
    path: demo("bottomRows=current&scheduleSample=filled"),
  },
  { name: "calendar/empty", path: demo("bottomRows=two&scheduleSample=empty") },
  {
    name: "calendar/empty-current",
    path: demo("bottomRows=current&scheduleSample=empty"),
  },
  {
    name: "calendar/next-month",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn("次の月"),
  },
  {
    name: "calendar/next-month-current",
    path: demo("bottomRows=current&scheduleSample=filled"),
    steps: tapOn("次の月"),
  },
  {
    name: "calendar/entering",
    path: demo("bottomRows=two&scheduleSample=empty"),
    steps: tapOn("ポチポチ入力"),
  },
  {
    name: "calendar/entering-current",
    path: demo("bottomRows=current&scheduleSample=empty"),
    steps: tapOn("ポチポチ入力"),
  },
  {
    name: "calendar/week",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn(/^9月24日/u),
  },
  {
    name: "calendar/week-current",
    path: demo("bottomRows=current&scheduleSample=filled"),
    steps: tapOn(/^9月24日/u),
  },
  {
    // A day with its time moved and a memo: the time, its hint and the
    // people with it.
    name: "calendar/day-changed",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn(/^9月8日/u),
  },
  {
    name: "calendar/day-adding-member",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, /^9月8日/u);
      await tap(page, "追加");
    },
  },
  {
    name: "calendar/day-empty",
    path: demo("bottomRows=two&scheduleSample=empty"),
    steps: tapOn(/^9月1日/u),
  },
  {
    name: "calendar/breakdown",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn(/^今月のお休み/u),
  },
  {
    // 完了 with a day left blank between two entered.
    name: "calendar/gap-sheet",
    path: demo("bottomRows=two&scheduleSample=empty"),
    steps: async (page) => {
      await tap(page, "ポチポチ入力");
      await tap(page, "日勤");
      await tap(page, /^翌日へ/u);
      await tap(page, "日勤");
      await tap(page, /^完了/u);
    },
  },
  {
    name: "calendar/save",
    path: demo("bottomRows=current&scheduleSample=filled"),
    steps: tapOn("この月のシフトを保存"),
  },
  {
    // Straight to the device's calendars, one picked.
    name: "calendar/save-calendar",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "カレンダーに追加");
      await page.getByText("ホーム", { exact: true }).click();
    },
  },
  {
    name: "calendar/save-done",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "カレンダーに追加");
      await page.getByText("ホーム", { exact: true }).click();
      await tap(page, /件を追加$/u);
    },
  },
  {
    name: "calendar/image",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn("画像で保存"),
  },
  {
    name: "group/hub",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn("グループ"),
  },
  {
    name: "group/month-days",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: toGroupMonth,
  },
  {
    name: "group/month-person",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await toGroupMonth(page);
      await tap(page, "日ごと");
      await page.getByRole("menuitemradio", { name: "人ごと" }).click();
    },
  },
  {
    name: "group/chat",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "グループ");
      await tap(page, /^全体チャット/u);
    },
  },
  {
    name: "calendar/date-picker",
    path: demo("bottomRows=two&scheduleSample=empty"),
    steps: async (page) => {
      await tap(page, "ポチポチ入力");
      await tap(page, /^入力する日付/u);
    },
  },
  {
    name: "settings/repeat-new",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^働き方/u);
      await tap(page, /決まった順番で回っている/u);
    },
  },
  {
    name: "settings/job",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^仕事が変わったとき/u);
    },
  },
  {
    // An order of three, with the first two weeks it makes.
    name: "settings/repeat-sequence",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: async (page) => {
      await tap(page, "設定");
      await tap(page, /^働き方/u);
      await tap(page, /決まった順番で回っている/u);
      await tap(page, "日勤");
      await tap(page, "日勤");
      await tap(page, "休み");
    },
  },
  {
    name: "settings/look-colors",
    path: demo("bottomRows=two&scheduleSample=filled"),
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
    root: ".cmp-sample",
  },
  {
    name: "settings",
    path: demo("bottomRows=two&scheduleSample=filled"),
    steps: tapOn("設定"),
  },
];
