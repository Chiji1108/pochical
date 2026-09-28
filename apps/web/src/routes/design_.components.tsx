import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarPlus,
  Check,
  Download,
  Image as ImageIcon,
  Info,
  Pencil,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";

import { DayCell, MonthSummary, TabBar } from "../components/design-calendar";
import { PhotoAvatar } from "../components/design-group";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { NameTabs, OffLookTabs } from "../components/design-settings";
import {
  DecideHeading,
  SheetHeading,
  SheetPicture,
} from "../components/design-sheet";
import { themeStyle, useThemeStyle } from "../components/design-theme";
import { toastLook } from "../components/design-toast";
import {
  BackButton,
  Button,
  Chip,
  ChipGroup,
  Choice,
  ChoiceGrid,
  ChoiceList,
  ChoiceRow,
  colorGrid,
  dayGrid,
  DoneButton,
  HeaderAction,
  IconButton,
  List,
  ListRow,
  MenuItem,
  MenuPicker,
  MenuSeparator,
  Note,
  PageHeader,
  PullDownMenu,
  Section,
  Segment,
  SegmentedControl,
  SwitchRow,
  Tag,
  WeekdayRow,
} from "../components/design-ui";
import { useWeek } from "../components/design-week";
import {
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import type { ShiftMarkStyle } from "../components/shift-mark";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design_/components")({
  component: ComponentsPage,
  head: () => ({
    ...pageMeta(
      "部品の棚卸し",
      "ポチカルの画面にある部品を、役割ごとに並べたもの",
      "/design/components",
      true
    ),
  }),
});

// Every piece the screens are built from, as they stand today, sorted by
// what it is for. Pieces sharing a role under different names show side
// by side, so they can be folded into one before the move to SwiftUI and
// Compose. Everything here is the real markup or component.
function ComponentsPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={themeStyle(theme, "light")}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / COMPONENTS" title="部品の棚卸し">
        今ある部品を役割ごとに並べています。同じ役割で名前が違うものは、まとめる候補です。
      </DesignIntro>
      <DesignProviders>
        <Surface />
      </DesignProviders>
    </DesignPage>
  );
}

const catalog = {
  // A day as big as on a month of five weeks.
  cell: css({ width: "46px" }),
  group: css({
    "& > h2": { fontSize: "17px", fontWeight: 700, margin: "0 0 4px" },
  }),
  // Two across on a wide page; one on a phone.
  item: cva({
    base: {
      "& > figcaption": {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "0 2px",
      },
      "& > figcaption > code": { color: "text", fontSize: "12px" },
      "& > figcaption > small": { color: "text3", fontSize: "11px" },
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      margin: 0,
    },
    variants: {
      wide: {
        true: {
          "@media (max-width: 480px)": { gridColumn: "auto" },
          gridColumn: "span 2",
        },
      },
    },
  }),
  items: css({
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  }),
  marks: css({ alignItems: "center", display: "flex", gap: "18px" }),
  note: css({
    color: "text3",
    fontSize: "12px",
    lineHeight: "1.6",
    margin: "0 0 14px",
  }),
  // A piece keeps within its box, or fills a wide one.
  sample: cva({
    base: {
      "& > *": { maxWidth: "100%" },
      alignItems: "center",
      bg: "raised",
      border: "1px solid token(colors.separator)",
      borderRadius: "14px",
      display: "flex",
      flex: 1,
      justifyContent: "center",
      minHeight: "88px",
      padding: "16px",
    },
    variants: { wide: { true: { "& > *": { width: "100%" } } } },
  }),
  // The tab bar floats over a phone's foot; here it floats in a strip.
  tabBarStage: css({
    "--tab-bar-bottom": "4px",
    height: "72px",
    position: "relative",
    width: "100%",
  }),
  // The app's own ground, light or dark as the screen is, so the pieces
  // sit on what they are drawn for.
  surface: css({
    bg: "background",
    borderRadius: "24px",
    color: "text",
    display: "flex",
    flexDirection: "column",
    gap: "40px",
    margin: "0 auto 64px",
    maxWidth: "1100px",
    padding: "28px 20px 40px",
  }),
};

// The phone's colors, without a phone around them.
function Surface() {
  return (
    <div className={catalog.surface} style={useThemeStyle()}>
      <Buttons />
      <Rows />
      <Switches />
      <Choices />
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
    <section aria-label={title} className={catalog.group}>
      <h2>{title}</h2>
      {note && <p className={catalog.note}>{note}</p>}
      <div className={catalog.items}>{children}</div>
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
    // data-catalog-item and data-sample are what tools/layout-diff measures
    // the pieces by.
    <figure className={catalog.item({ wide })} data-catalog-item>
      <div className={catalog.sample({ wide })} data-sample>
        {children}
      </div>
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
            <ImageIcon aria-hidden="true" size={18} />
            画像で保存
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
            trailing={<HeaderAction prominent>保存</HeaderAction>}
          />
        </Item>
        <Item name="IconButton(✕)" where="入力を捨てて戻るとき">
          <IconButton label="キャンセル">
            <X aria-hidden="true" size={22} />
          </IconButton>
        </Item>
        <Item name="BackButton" where="前の画面へ戻るとき">
          <BackButton />
        </Item>
        <Item name="IconButton" where="グループの見出しの招待・設定、月の保存">
          <span className={catalog.marks}>
            <IconButton label="招待">
              <UserPlus aria-hidden="true" size={18} />
            </IconButton>
            <IconButton label="保存">
              <Download aria-hidden="true" size={21} />
            </IconButton>
          </span>
        </Item>
        <Item name="DoneButton" where="カレンダーの入力中・週表示の完了だけ">
          <DoneButton />
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
      <Item
        name="Section + Note"
        where="設定・グループ・保存の各画面の区切りと補足"
        wide
      >
        <Section note="グループの人にも見えます" title="シフト">
          <List>
            <ListRow label="働き方" onClick={() => undefined} value="勤務表" />
          </List>
        </Section>
        <Note>ポチポチ入力のボタンを長押ししても、その場で直せます。</Note>
      </Item>
    </Group>
  );
}

function Switches() {
  const [off, setOff] = useState({ blankOff: false, highlight: true });
  const [names, setNames] = useState(false);
  const [day, setDay] = useState(0);
  return (
    <Group
      note="SegmentedControl に Segment を並べます。中身は見本でも言葉だけでもよく、高さは regular(62px)、tall(大きな見本)、compact(言葉だけ)の3つ。SwiftUI の segmented Picker、Compose の SegmentedButton にあたります。比べる案の切り替え(design-segment)はアプリの外なので別です。"
      title="切り替え"
    >
      <Item
        name="SegmentedControl size=tall"
        where="スタイルの休みの見せ方"
        wide
      >
        <OffLookTabs onChange={setOff} value={off} />
      </Item>
      <Item name="SegmentedControl size=tall" where="スタイルのシフト名" wide>
        <NameTabs onChange={setNames} value={names} />
      </Item>
      <Item
        name="SegmentedControl size=compact"
        where="曜日と祝日の週の始まり"
        wide
      >
        <SegmentedControl
          label="週の始まり"
          onValueChange={(picked) => {
            setDay(Number(picked));
          }}
          size="compact"
          value={String(day)}
        >
          {["日", "月", "土"].map((name, index) => (
            <Segment key={name} value={String(index)}>
              {name}
            </Segment>
          ))}
        </SegmentedControl>
      </Item>
    </Group>
  );
}

const sampleColors = ["#5b7a55", "#c29a4a", "#c9796a", "#7a86c4", "#9a9a94"];

function Choices() {
  const [color, setColor] = useState("0");
  const [appearance, setAppearance] = useState("system");
  return (
    <Group
      note="いくつかから1つを選ぶところ。ChoiceGrid に Choice を並べ、見た目(色の丸、アイコン、アプリアイコン)はその場所が決めます。行で選ぶときは ChoiceList と ChoiceRow で、選んだ行にチェックが付きます。Ark UI の RadioGroup なので矢印キーで選べます。SwiftUI の Picker、Compose の selectable にあたります。"
      title="1つを選ぶ"
    >
      <Item
        name="ChoiceGrid"
        where="色、アイコン、絵文字、アプリアイコン、表示する人"
      >
        <ChoiceGrid
          className={colorGrid}
          label="色"
          onValueChange={setColor}
          value={color}
        >
          {sampleColors.map((sample, index) => (
            <Choice
              key={sample}
              label={`色${index + 1}`}
              style={{ background: sample, color: sample }}
              value={String(index)}
            />
          ))}
        </ChoiceGrid>
      </Item>
      <Item name="ChoiceList" where="外観、翌日のパターン" wide>
        <ChoiceList
          label="外観"
          onValueChange={setAppearance}
          value={appearance}
        >
          <ChoiceRow label="端末に合わせる" value="system" />
          <ChoiceRow label="ライト" value="light" />
          <ChoiceRow label="ダーク" value="dark" />
        </ChoiceList>
      </Item>
    </Group>
  );
}

function Chips() {
  const [picked, setPicked] = useState(["田中"]);
  const [off, setOff] = useState("off");
  return (
    <Group
      note="押せる Chip と、見せるだけの Tag。どちらも ChipGroup で折り返して並べます。Tag は accent(グループの知らせ)、neutral(ページの上)、raised(塗られたカードの上)の3色と、sm・md の2つの大きさです。"
      title="チップとタグ"
    >
      <Item
        name="Chip(いくつでも)+ Chip variant=add"
        where="日の詳しい表示の一緒に働く人"
      >
        <ChipGroup>
          {["田中", "鈴木"].map((name) => (
            <Chip
              key={name}
              onClick={() => {
                setPicked((previous) =>
                  previous.includes(name)
                    ? previous.filter((item) => item !== name)
                    : [...previous, name]
                );
              }}
              selected={picked.includes(name)}
            >
              {picked.includes(name) && <Check aria-hidden="true" size={12} />}
              {name}
            </Chip>
          ))}
          <Chip variant="add">＋ 追加</Chip>
        </ChipGroup>
      </Item>
      <Item name="Chip(ひとつ)" where="空いた日の休み・有休">
        <ChipGroup label="入れるパターン">
          {[
            ["off", "休み"],
            ["paid", "有休"],
          ].map(([value, label]) => (
            <Chip
              key={value}
              onClick={() => {
                setOff(value);
              }}
              selected={off === value}
            >
              {label}
            </Chip>
          ))}
        </ChipGroup>
      </Item>
      <Item name="Tag tone=raised" where="繰り返しの順番、はじめての設定の見本">
        <ChipGroup as="ol">
          {(["day", "night", "off"] as const).map((key) => (
            <Tag as="li" key={key} tone="raised">
              <ShiftMark shift={key} size={13} />
              {{ day: "日勤", night: "夜勤", off: "休み" }[key]}
            </Tag>
          ))}
        </ChipGroup>
      </Item>
      <Item name="Tag tone=neutral / accent" where="空いた日の日付、みんな休み">
        <ChipGroup>
          <Tag>3日(土)</Tag>
          <Tag>4日(日)</Tag>
          <Tag size="sm" tone="accent">
            みんな休み
          </Tag>
        </ChipGroup>
      </Item>
    </Group>
  );
}

function MenuSample() {
  const [layout, setLayout] = useState<"weeks" | "days">("days");
  return (
    <PullDownMenu label={layout === "days" ? "日ごと" : "週ごと"}>
      <MenuPicker
        onValueChange={setLayout}
        options={[
          { label: "週ごと", value: "weeks" },
          { label: "日ごと", value: "days" },
        ]}
        value={layout}
      />
      <MenuSeparator />
      <MenuItem
        icon={<Info aria-hidden="true" size={16} />}
        onSelect={() => undefined}
        value="legend"
      >
        シフトパターン
      </MenuItem>
    </PullDownMenu>
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
        <SheetPicture>
          <SheetHeading
            eyebrow="2026年9月"
            onClose={() => undefined}
            title="今月の内訳"
          />
        </SheetPicture>
      </Item>
      <Item name="DecideHeading" where="決めるシート(日にちを共有)" wide>
        <SheetPicture handle={false}>
          <DecideHeading
            action="送る"
            onAction={() => undefined}
            onCancel={() => undefined}
            title="日にちを共有"
          />
        </SheetPicture>
      </Item>
      <Item name="Toast" where="入力・保存のあとの一言(Ark UI の Toast)">
        <p className={toastLook}>
          <Check aria-hidden="true" size={16} />
          10月のシフトを入れました
        </p>
      </Item>
      <Item
        name="PullDownMenu"
        where="グループのシフト表(週ごと・日ごと・人ごと)"
      >
        <MenuSample />
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
              <span className={catalog.marks}>
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
        <Item
          name="WeekdayRow + dayGrid"
          where="カレンダー・メンバーの月・保存する画像・見た目の見本"
          wide
        >
          <WeekSample />
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
          <div className={catalog.tabBarStage}>
            <TabBar active="calendar" onSelect={() => undefined} />
          </div>
        </Item>
        <Item name="PhotoAvatar" where="グループのメンバー">
          <span className={catalog.marks}>
            <PhotoAvatar name="ゆうき" />
            <PhotoAvatar me name="自分" />
          </span>
        </Item>
      </Group>
    </>
  );
}

// The week of the sample day, under the weekday names, as every month
// grid lays out its days.
function WeekSample() {
  const { weekDates } = useWeek();
  return (
    <div>
      <WeekdayRow />
      <div className={dayGrid}>
        {weekDates(cellDate).map((date) => (
          <DayCell
            active={false}
            date={date}
            editing={false}
            entry={{ shift: date.getDay() === 0 ? "off" : "day" }}
            key={date.getDate()}
            onPress={() => undefined}
            outside={false}
          />
        ))}
      </div>
    </div>
  );
}

// A day as big as on a month of five weeks.
const sampleDay = css({ height: "56px", width: "100%" });

function Cell({
  entry,
  active = false,
}: {
  entry?: Parameters<typeof DayCell>[0]["entry"];
  active?: boolean;
}) {
  return (
    <div className={catalog.cell}>
      <DayCell
        active={active}
        className={sampleDay}
        date={cellDate}
        editing={false}
        entry={entry}
        onPress={() => undefined}
        outside={false}
      />
    </div>
  );
}
