import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarPlus,
  Camera,
  Check,
  Download,
  Pencil,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { DayCell, MonthSummary, TabBar } from "../components/design-calendar";
import { PhotoAvatar } from "../components/design-group";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { NameTabs, OffLookTabs } from "../components/design-settings";
import { DecideHeading, SheetHeading } from "../components/design-sheet";
import { themeStyle, useThemeStyle } from "../components/design-theme";
import {
  BackButton,
  Button,
  HeaderAction,
  IconButton,
  List,
  ListRow,
  PageHeader,
  SwitchRow,
} from "../components/design-ui";
import {
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import type { ShiftMarkStyle } from "../components/shift-mark";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/design_/components")({
  component: ComponentsPage,
  head: () => ({
    ...pageMeta(
      "部品の棚卸し",
      "ポチカルの画面にある部品を、役割ごとに並べたもの",
      "/design/components",
      true
    ),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
});

// Every piece the screens are built from, as they stand today, sorted by
// what it is for. Pieces sharing a role under different names show side
// by side, so they can be folded into one before the move to SwiftUI and
// Compose. Everything here is the real markup or component.
function ComponentsPage() {
  const theme = useDesignTheme();
  return (
    <main className="design-page" id="main" style={themeStyle(theme, "light")}>
      <div className="design-toolbar">
        <Link to="/design">
          <ArrowLeft aria-hidden="true" size={16} /> デザイン資料
        </Link>
      </div>
      <header className="design-intro">
        <p>POCHICAL / COMPONENTS</p>
        <h1>部品の棚卸し</h1>
        <p className="design-description">
          今ある部品を役割ごとに並べています。同じ役割で名前が違うものは、まとめる候補です。
        </p>
      </header>
      <DesignProviders>
        <Surface />
      </DesignProviders>
    </main>
  );
}

// The phone's colors, without a phone around them.
function Surface() {
  return (
    <div className="cmp-surface" style={useThemeStyle()}>
      <Buttons />
      <Rows />
      <Switches />
      <Chips />
      <Sheets />
      <Pochical />
    </div>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="cmp-group">
      <h2>{title}</h2>
      {note && <p className="cmp-note">{note}</p>}
      <div className="cmp-items">{children}</div>
    </section>
  );
}

// One piece: what it looks like, what it is called in the code, and where
// it is used.
function Item({
  name,
  where,
  wide = false,
  children,
}: {
  name: string;
  where: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <figure className={`cmp-item ${wide ? "cmp-item-wide" : ""}`}>
      <div className="cmp-sample">{children}</div>
      <figcaption>
        <code>{name}</code>
        <small>{where}</small>
      </figcaption>
    </figure>
  );
}

function Buttons() {
  return (
    <>
      <Group
        note="主・控えめ・文字・目立たないの4段。以前の dc-start、dc-import-primary、ob-primary、st-primary(主)、dc-start-photo、dc-save-secondary、gr-secondary(控えめ)、ob-link、st-link(文字)、dc-import-later(目立たない)をまとめたものです。"
        title="ボタン"
      >
        <Item name="Button variant=primary" where="その画面で次にすること">
          <Button>
            <Pencil aria-hidden="true" size={18} />
            ポチポチ入力
          </Button>
        </Item>
        <Item name="Button variant=quiet" where="主の横、または一段下の操作">
          <Button variant="quiet">
            <Camera aria-hidden="true" size={18} />
            写真から取り込む
          </Button>
        </Item>
        <Item name="Button variant=text" where="リンクのような選択肢">
          <Button variant="text">アカウントをお持ちの方はログイン</Button>
        </Item>
        <Item name="Button variant=subtle" where="あとにする、断る">
          <Button variant="subtle">あとで入れる</Button>
        </Item>
        <Item name="Button(押せない)" where="まだ選んでいないとき">
          <Button disabled>
            <CalendarPlus aria-hidden="true" size={18} />
            追加する
          </Button>
        </Item>
      </Group>
      <Group
        note="戻る(またはキャンセル)・右の操作・大きなタイトル。iPhone と Android のナビゲーションバーと同じ形です。設定、グループ、パターンの編集などの pe-topbar と PageHeader をまとめたものです。"
        title="画面の上"
      >
        <Item name="PageHeader" where="戻る+タイトル" wide>
          <PageHeader back="設定" onBack={() => undefined} title="スタイル" />
        </Item>
        <Item
          name="PageHeader trailing=HeaderAction"
          where="編集して保存するページ"
          wide
        >
          <PageHeader
            back="シフトパターン"
            onBack={() => undefined}
            title="パターンを編集"
            trailing={<HeaderAction>保存</HeaderAction>}
          />
        </Item>
        <Item name="BackButton chevron=false" where="入力を捨てて戻るとき">
          <BackButton chevron={false}>キャンセル</BackButton>
        </Item>
        <Item name="BackButton(記号だけ)" where="はじめての設定">
          <BackButton />
        </Item>
        <Item name="IconButton" where="グループの見出しの招待・設定、月の保存">
          <span className="cmp-marks">
            <IconButton label="招待">
              <UserPlus aria-hidden="true" size={18} />
            </IconButton>
            <IconButton label="保存">
              <Download aria-hidden="true" size={21} />
            </IconButton>
          </span>
        </Item>
        <Item name="dc-done" where="カレンダーの入力中・週表示の完了だけ">
          <button className="dc-done" type="button">
            <Check aria-hidden="true" size={18} />
            完了
          </button>
        </Item>
      </Group>
    </>
  );
}

function Rows() {
  const [on, setOn] = useState(true);
  return (
    <Group
      note="List に ListRow を並べます。ラベル、右の値、前の印、後ろの操作(スイッチや入力)を持てて、押せる行には矢印が付きます。設定の Row と SwitchRow、各画面の st-row をまとめたものです。"
      title="行"
    >
      <Item name="List + ListRow" where="設定の一覧など" wide>
        <List>
          <ListRow
            label="スタイル"
            onClick={() => undefined}
            value="アイコン"
          />
          <SwitchRow checked={on} label="休みの日も入れる" onChange={setOn} />
          <ListRow
            label={
              <>
                同じシフトの人も入れる
                <small>勤務表で同じ日に同じシフトの人を入れます</small>
              </>
            }
          />
          <ListRow
            danger
            label="このパターンを削除"
            onClick={() => undefined}
          />
        </List>
      </Item>
    </Group>
  );
}

function Switches() {
  const [off, setOff] = useState({ blankOff: false, highlight: true });
  const [names, setNames] = useState(false);
  const [segment, setSegment] = useState("two");
  return (
    <Group
      note="見本つきのタブ(st-mark-segment)と、文字だけの切り替え(design-segment)の2系統です。"
      title="切り替え"
    >
      <Item
        name="OffLookTabs(st-mark-segment)"
        where="スタイルの休みの見せ方"
        wide
      >
        <OffLookTabs onChange={setOff} value={off} />
      </Item>
      <Item name="NameTabs(st-mark-segment)" where="スタイルのシフト名" wide>
        <NameTabs onChange={setNames} value={names} />
      </Item>
      <Item name="design-segment" where="比べる案(アプリの外)" wide>
        <div className="design-segment">
          {[
            ["two", "いつも2段"],
            ["current", "今のまま"],
          ].map(([value, label]) => (
            <button
              aria-pressed={segment === value}
              key={value}
              onClick={() => {
                setSegment(value);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </Item>
    </Group>
  );
}

function Chips() {
  const [picked, setPicked] = useState(["田中"]);
  return (
    <Group
      note="4種類。押せるもの(dc-member-chips、dc-gap-choices)と、見せるだけのもの(ob-chip、dc-gap-days)があります。"
      title="チップ"
    >
      <Item name="dc-member-chips" where="日の詳しい表示の一緒に働く人">
        <div className="dc-member-chips">
          {["田中", "鈴木"].map((name) => (
            <button
              aria-pressed={picked.includes(name)}
              key={name}
              onClick={() => {
                setPicked((previous) =>
                  previous.includes(name)
                    ? previous.filter((item) => item !== name)
                    : [...previous, name]
                );
              }}
              type="button"
            >
              {picked.includes(name) && <Check aria-hidden="true" size={12} />}
              {name}
            </button>
          ))}
        </div>
      </Item>
      <Item name="dc-gap-choices" where="空いた日のシートの休み・有休">
        <fieldset className="dc-gap-choices">
          <button aria-pressed type="button">
            休み
          </button>
          <button aria-pressed={false} type="button">
            有休
          </button>
        </fieldset>
      </Item>
      <Item name="ob-chip" where="はじめての設定の順番の見本">
        <span className="ob-chips">
          {(["day", "night", "off"] as const).map((key) => (
            <span className="ob-chip" key={key}>
              <ShiftMark shift={key} size={11} />
              {{ day: "日勤", night: "夜勤", off: "休み" }[key]}
            </span>
          ))}
        </span>
      </Item>
      <Item name="dc-gap-days" where="空いた日のシートの日付">
        <ul className="dc-gap-days">
          <li>3日(土)</li>
          <li>4日(日)</li>
        </ul>
      </Item>
      <Item name="im-code-chip" where="取り込みの記号">
        <span className="im-code-chip">日</span>
      </Item>
    </Group>
  );
}

function Sheets() {
  return (
    <Group
      note="見るだけのシートは「タイトル+×」、決めるシートは「キャンセル/タイトル/決定」。iPhone と Android の標準のシートと同じ使い分けです。メニューと確認は見出しなしで、下にキャンセルがあります。"
      title="シートの見出し"
    >
      <Item
        name="SheetHeading"
        where="見るだけのシート(内訳、空いた日、保存、日のシートなど)"
        wide
      >
        <section className="dc-sheet cmp-sheet">
          <div aria-hidden="true" className="dc-sheet-handle" />
          <SheetHeading
            eyebrow="2026年9月"
            onClose={() => undefined}
            title="今月の内訳"
          />
        </section>
      </Item>
      <Item name="DecideHeading" where="決めるシート(日にちを共有)" wide>
        <section className="dc-sheet cmp-sheet">
          <DecideHeading
            action="送る"
            onAction={() => undefined}
            onCancel={() => undefined}
            title="日にちを共有"
          />
        </section>
      </Item>
      <Item name="gr-toast" where="取り込んだあとの一言">
        <p className="gr-toast cmp-toast">
          <Check aria-hidden="true" size={16} />
          10月のシフトを入れました
        </p>
      </Item>
    </Group>
  );
}

const cellDate = new Date(2026, 8, 8);
const markStyles: ShiftMarkStyle[] = ["icon", "emoji", "badge"];

// The pieces SwiftUI and Compose will build themselves: nothing in either
// platform draws them.
function Pochical() {
  return (
    <>
      <Group
        note="スタイル3種 × 印なし・早出・残業。グループでも同じものが出ます。"
        title="シフトの印(ポチカル独自)"
      >
        {markStyles.map((style) => (
          <Item
            key={style}
            name={`ShiftMark(${style})`}
            where="シフトが出るところすべて"
          >
            <ShiftMarkStyleContext value={style}>
              <span className="cmp-marks">
                <ShiftMark shift="day" size={24} />
                <ShiftMark early shift="day" size={24} />
                <ShiftMark late shift="day" size={24} />
              </span>
            </ShiftMarkStyleContext>
          </Item>
        ))}
      </Group>
      <Group note="月のマスの状態。" title="日のマス(ポチカル独自)">
        <Item name="DayCell" where="入力済み">
          <Cell entry={{ shift: "day" }} />
        </Item>
        <Item name="DayCell" where="休み(色をつける)">
          <Cell entry={{ shift: "off" }} />
        </Item>
        <Item name="DayCell" where="休み(空白)">
          <OffDisplayContext value="blank">
            <Cell entry={{ shift: "off" }} />
          </OffDisplayContext>
        </Item>
        <Item name="DayCell" where="メモ">
          <Cell entry={{ note: "棚卸し", shift: "day" }} />
        </Item>
        <Item name="DayCell" where="残業">
          <Cell entry={{ end: "20:00", shift: "day" }} />
        </Item>
        <Item name="DayCell" where="選択中">
          <Cell active entry={{ shift: "day" }} />
        </Item>
        <Item name="DayCell" where="未入力">
          <Cell />
        </Item>
      </Group>
      <Group title="画面の下と見出し(ポチカル独自)">
        <Item name="MonthSummary" where="カレンダー下の今月のお休み" wide>
          <MonthSummary
            daysOff={9}
            month={new Date(2026, 8, 1)}
            onOpen={() => undefined}
          />
        </Item>
        <Item name="TabBar" where="画面の一番下" wide>
          <TabBar active="calendar" onSelect={() => undefined} />
        </Item>
        <Item name="PhotoAvatar" where="グループのメンバー">
          <span className="cmp-marks">
            <PhotoAvatar name="ゆうき" />
            <PhotoAvatar me name="自分" />
          </span>
        </Item>
      </Group>
    </>
  );
}

function Cell({
  entry,
  active = false,
}: {
  entry?: Parameters<typeof DayCell>[0]["entry"];
  active?: boolean;
}) {
  return (
    <div className="cmp-cell">
      <DayCell
        active={active}
        date={cellDate}
        editing={false}
        entry={entry}
        onPress={() => undefined}
        outside={false}
      />
    </div>
  );
}
