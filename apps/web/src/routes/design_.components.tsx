import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarPlus,
  Check,
  CircleAlert,
  Download,
  Image as ImageIcon,
  Info,
  Pencil,
  Settings,
  UserPlus,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";

import { MonthSummary } from "../components/design-calendar-heading";
import {
  Chip,
  ChipGroup,
  Choice,
  ChoiceChip,
  ChoiceGrid,
  ChoiceTile,
  ChoiceList,
  ChoiceRow,
  colorGrid,
  PageDots,
  Segment,
  SegmentedControl,
  Tag,
} from "../components/design-choices";
import { DayCell } from "../components/design-day-cell";
import { dayGrid, WeekdayRow } from "../components/design-day-grid";
import {
  LimitedInput,
  LimitedTextArea,
  MarkLetterInput,
  SampleTag,
  TimeRange,
} from "../components/design-fields";
import { PhotoAvatar } from "../components/design-group-parts";
import {
  BackButton,
  TodayButton,
  DoneButton,
  HeaderAction,
  PageHeader,
} from "../components/design-header";
import {
  ListDivider,
  SummaryRow,
  List,
  ListRow,
  SwitchRow,
} from "../components/design-list";
import {
  IconMenu,
  MenuItem,
  MenuPicker,
  MenuSeparator,
  PullDownMenu,
} from "../components/design-menu";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import { Pager } from "../components/design-pager";
import { Phone } from "../components/design-phone";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { NameTabs, OffLookTabs } from "../components/design-settings-style";
import {
  ConfirmDialog,
  DecideHeading,
  PhoneContext,
  PhotoViewer,
  Sheet,
  SheetHeading,
  SheetPicture,
  SystemAlert,
} from "../components/design-sheet";
import { SortableList } from "../components/design-sortable-list";
import { TabBar } from "../components/design-tab-bar";
import { pageStyle, useThemeStyle } from "../components/design-theme";
import { toastLook } from "../components/design-toast";
import {
  AddButton,
  BarGroup,
  Button,
  DestructiveButton,
  OptionCard,
  IconButton,
  Note,
  Screen,
  ScreenScroll,
  Section,
} from "../components/design-ui";
import { useWeek } from "../components/design-week";
import {
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import type { ShiftMarkStyle } from "../components/shift-mark";
import { sampleRosterPhoto } from "../lib/design-sample-photos";
import { supportThreadOf } from "../lib/design-support";
import { createUserStore, UserStoreContext } from "../lib/design-user-store";
import { pageMeta } from "../lib/site";

// The sample person the tab bar counts unread for: their groups' chats
// and an answer from support, so both counts show.
const tabBarPerson = createUserStore({ support: supportThreadOf("answered") });

// The two kinds of toast, one above the other.
const toastKinds = css({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

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

// Every shared piece the screens are built from, sorted by what it is
// for, each with the SwiftUI and Compose piece it becomes: the page is
// the pieces' spec, kept true by being the real components, and complete
// by tests/design-catalog.test.ts. Everything here is the real markup or
// component.
function ComponentsPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / COMPONENTS" title="部品の棚卸し">
        画面で使う共通の部品を、役割ごとにすべて並べています。それぞれに、iOS と
        Android
        のアプリでどの部品にあたるかを添えています。部品を足したら、ここにも載せます（載っていないとテストで止まります）。
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
      "& > figcaption > code": { color: "text.primary", fontSize: "12px" },
      "& > figcaption > small": { color: "text.tertiary", fontSize: "11px" },
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
  chipRow: css({
    border: 0,
    display: "flex",
    gap: "8px",
    margin: 0,
    padding: 0,
  }),
  chipRows: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  // A page of the pager's sample, the size of a card.
  page: css({
    alignItems: "center",
    bg: "fill.quaternary",
    borderRadius: "2xl",
    display: "flex",
    height: "72px",
    justifyContent: "center",
    textStyle: "body",
  }),
  pager: css({ overflow: "hidden", width: "100%" }),
  textArea: css({
    "--lines": "5",
    "--pad-x": "16px",
    "--pad-y": "8px",
    bg: "fill.quaternary",
    borderRadius: "xl",
    lineHeight: "22px",
    textStyle: "body",
    width: "100%",
  }),
  // A picture's corner for the tag to sit on, as on a preview.
  tagStage: css({
    bg: "fill.quaternary",
    borderRadius: "2xl",
    height: "72px",
    position: "relative",
    width: "160px",
  }),
  tileEmoji: css({ fontSize: "40px", lineHeight: 1.2 }),
  tiles: cva({
    base: { border: 0, display: "grid", gap: "8px", margin: 0, padding: 0 },
    variants: {
      columns: {
        2: { gridTemplateColumns: "repeat(2, 1fr)" },
        3: { gridTemplateColumns: "repeat(3, 1fr)" },
      },
    },
  }),
  // The native pieces, a line each.
  native: css({
    "& > dd": { margin: 0 },
    "& > dt": { color: "text.quaternary", fontWeight: 600 },
    color: "text.tertiary",
    columnGap: "8px",
    display: "grid",
    fontSize: "11px",
    gridTemplateColumns: "auto 1fr",
    margin: "4px 0 0",
    rowGap: "2px",
  }),
  note: css({
    color: "text.tertiary",
    fontSize: "12px",
    lineHeight: "1.6",
    margin: "0 0 14px",
  }),
  // A piece keeps within its box, or fills a wide one.
  sample: cva({
    base: {
      "& > *": { maxWidth: "100%" },
      alignItems: "center",
      bg: "background.elevated",
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
    bg: "background.base",
    borderRadius: "24px",
    color: "text.primary",
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
      <Cards />
      <Fields />
      <Switches />
      <Times />
      <Choices />
      <Tiles />
      <Chips />
      <Sheets />
      <Overlays />
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
  ios,
  android,
  wide = false,
  children,
}: {
  name: string;
  where: string;
  // What the native apps build it from, so the web piece and the native
  // one are named side by side and change together.
  ios: string;
  android: string;
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
        <dl className={catalog.native}>
          <dt>iOS</dt>
          <dd>{ios}</dd>
          <dt>Android</dt>
          <dd>{android}</dd>
        </dl>
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
        <Item
          name="Button variant=primary"
          ios="Button ＋ .buttonStyle(.borderedProminent)"
          android="Button"
          where="その画面で次にすること"
        >
          <Button>
            <Pencil aria-hidden="true" size={18} />
            ポチポチ入力
          </Button>
        </Item>
        <Item
          name="Button variant=quiet"
          ios=".buttonStyle(.bordered)"
          android="FilledTonalButton"
          where="主の横、または一段下の操作"
        >
          <Button variant="quiet">
            <ImageIcon aria-hidden="true" size={18} />
            画像で保存
          </Button>
        </Item>
        <Item
          name="Button variant=text"
          ios=".buttonStyle(.borderless)"
          android="TextButton"
          where="リンクのような選択肢"
        >
          <Button variant="text">アカウントをお持ちの方はログイン</Button>
        </Item>
        <Item
          name="Button variant=subtle"
          ios=".buttonStyle(.borderless) ＋ .foregroundStyle(.secondary)"
          android="TextButton（文字を控えめな色で）"
          where="あとにする、断る"
        >
          <Button variant="subtle">あとで入れる</Button>
        </Item>
        <Item
          name="Button(押せない)"
          ios=".disabled(true)"
          android="enabled = false"
          where="まだ選んでいないとき"
        >
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
        <Item
          name="PageHeader"
          ios=".navigationTitle ＋ .navigationBarTitleDisplayMode(.large)"
          android="LargeTopAppBar"
          where="戻る+タイトル"
          wide
        >
          <PageHeader back="設定" onBack={() => undefined} title="スタイル" />
        </Item>
        <Item
          name="PageHeader trailing=HeaderAction"
          ios="ToolbarItem(placement: .confirmationAction)"
          android="LargeTopAppBar の actions"
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
        <Item
          name="IconButton(✕)"
          ios="ToolbarItem(placement: .cancellationAction) の xmark"
          android="TopAppBar の navigationIcon（Close）"
          where="入力を捨てて戻るとき"
        >
          <IconButton label="キャンセル">
            <X aria-hidden="true" size={22} />
          </IconButton>
        </Item>
        <Item
          name="BackButton"
          ios="NavigationStack の戻る（OS が描く）"
          android="TopAppBar の navigationIcon（ArrowBack）"
          where="前の画面へ戻るとき"
        >
          <BackButton />
        </Item>
        <Item
          name="IconButton"
          ios="ToolbarItem の Button（SF Symbols、ガラスは OS）"
          android="IconButton"
          where="グループの見出しの招待・設定、月の保存"
        >
          <span className={catalog.marks}>
            <IconButton label="招待">
              <UserPlus aria-hidden="true" size={18} />
            </IconButton>
            <IconButton label="保存">
              <Download aria-hidden="true" size={21} />
            </IconButton>
          </span>
        </Item>
        <Item
          name="DoneButton"
          ios="ToolbarItem(placement: .confirmationAction)"
          android="TopAppBar の actions の Button"
          where="カレンダーの入力中・週表示・繰り返しの並びの完了だけ"
        >
          <DoneButton />
        </Item>
      </Group>
      <Group
        note="画面の中で使う、そのほかの押すもの。"
        title="そのほかのボタン"
      >
        <Item
          android="OutlinedButton（点線は独自）"
          ios="独自の Button スタイル（点線の枠）"
          name="AddButton"
          where="リストの下に1つ足す（パターン、同僚）"
          wide
        >
          <AddButton onClick={() => undefined}>パターンを追加</AddButton>
        </Item>
        <Item
          android="TextButton（error の色）"
          ios="Button(role: .destructive)"
          name="DestructiveButton"
          where="この日のシフトを消す、グループを抜ける"
        >
          <DestructiveButton onClick={() => undefined}>
            この日のシフトを消す
          </DestructiveButton>
        </Item>
        <Item
          android="TopAppBar の actions の TextButton"
          ios="ToolbarItem の Button（ガラスは OS）"
          name="TodayButton"
          where="今の月・週・日から離れたとき"
        >
          <TodayButton unit="月" />
        </Item>
        <Item
          android="TopAppBar の actions に IconButton を並べる"
          ios="ToolbarItemGroup（隣り合うボタンを OS が1つのガラスにまとめる）"
          name="BarGroup"
          where="グループの招待と設定"
        >
          <BarGroup>
            <IconButton label="招待">
              <UserPlus aria-hidden="true" size={18} />
            </IconButton>
            <IconButton label="設定">
              <Settings aria-hidden="true" size={18} />
            </IconButton>
          </BarGroup>
        </Item>
        <Item
          android="IconButton ＋ DropdownMenu"
          ios="ToolbarItem の Menu"
          name="IconMenu"
          where="月の保存（画像・端末のカレンダー）"
        >
          <IconMenu
            icon={<Download aria-hidden="true" size={21} />}
            label="この月のシフトを保存"
          >
            <MenuItem onSelect={() => undefined} value="image">
              画像で保存
            </MenuItem>
            <MenuItem onSelect={() => undefined} value="calendar">
              端末カレンダーに追加
            </MenuItem>
          </IconMenu>
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
      <Item
        name="List + ListRow / SwitchRow(Toggle)"
        ios="List ＋ .listStyle(.insetGrouped)、行は LabeledContent・NavigationLink"
        android="Card の中に ListItem を並べる"
        where="設定の一覧など"
        wide
      >
        <List>
          <ListRow label="スタイル" onClick={() => undefined} value="塗り" />
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
        ios="Section(content:header:footer:)"
        android="見出しの Text ＋ ListItem ＋ 補足の Text"
        where="設定・グループ・保存の各画面の区切りと補足"
        wide
      >
        <Section note="グループの人にも見えます" title="シフト">
          <List>
            <ListRow label="繰り返し" onClick={() => undefined} value="なし" />
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
        name="SegmentedControl + Segment size=tall"
        ios="Picker を独自の見た目で（.segmented は文字だけのため）"
        android="SingleChoiceSegmentedButtonRow（中身は独自）"
        where="スタイルの休みの見せ方"
        wide
      >
        <OffLookTabs onChange={setOff} value={off} />
      </Item>
      <Item
        name="SegmentedControl + Segment size=tall"
        ios="Picker を独自の見た目で（.segmented は文字だけのため）"
        android="SingleChoiceSegmentedButtonRow（中身は独自）"
        where="スタイルのシフト名"
        wide
      >
        <NameTabs onChange={setNames} value={names} />
      </Item>
      <Item
        name="SegmentedControl + Segment size=compact"
        ios="Picker ＋ .pickerStyle(.segmented)"
        android="SingleChoiceSegmentedButtonRow"
        where="カレンダーの週の始まり"
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

function Times() {
  const [times, setTimes] = useState({ end: "18:00", start: "9:00" });
  return (
    <Group
      note="TimeField は時と分を別々に選んで、数字を打つか ↑↓ で変えます。24時間表記。React Aria の TimeField(HeroUI のもの)で、SwiftUI の DatePicker(.compact, .hourAndMinute)、Compose の TimeInput にあたります。シフトの開始と終了は TimeRange で並べます。"
      title="時間"
    >
      <Item
        name="TimeRange + TimeField"
        ios="DatePicker(.hourAndMinute) ＋ .datePickerStyle(.compact) を2つ"
        android="TimeInput（TimePicker のダイアログ）を2つ"
        where="日の詳細、パターンの編集"
      >
        <TimeRange
          end={times.end}
          onChange={(field, value) => {
            setTimes({ ...times, [field]: value });
          }}
          start={times.start}
        />
      </Item>
    </Group>
  );
}

const sampleColors = ["#5b7a55", "#c29a4a", "#c9796a", "#7a86c4", "#9a9a94"];

function Choices() {
  const [color, setColor] = useState("0");
  const [appearance, setAppearance] = useState("system");
  const [page, setPage] = useState(0);
  return (
    <Group
      note="いくつかから1つを選ぶところ。ChoiceGrid に Choice を並べ、見た目(色の丸、アイコン、アプリアイコン)はその場所が決めます。行で選ぶときは ChoiceList と ChoiceRow で、選んだ行にチェックが付きます。Ark UI の RadioGroup なので矢印キーで選べます。SwiftUI の Picker、Compose の selectable にあたります。"
      title="1つを選ぶ"
    >
      <Item
        name="ChoiceGrid + Choice"
        ios="LazyVGrid の選べるボタン（.isSelected を付ける）"
        android="Modifier.selectableGroup() ＋ selectable"
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
      <Item
        name="PageDots"
        ios="独自のページ表示（TabView(.page) の点は使わない）"
        android="HorizontalPager の下に独自の表示"
        where="横にめくる選択肢(スタイルのテーマ)"
      >
        <PageDots count={4} current={page} label="ページ" onPick={setPage} />
      </Item>
      <Item
        name="ChoiceList + ChoiceRow"
        ios="List の中の Picker ＋ .pickerStyle(.inline)"
        android="RadioButton の行を selectableGroup で"
        where="外観、翌日のパターン"
        wide
      >
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
        name="ChipGroup + Chip(いくつでも)+ Chip variant=add"
        ios="使わない：一緒に働く人は、名前を並べた行から ✓ の一覧（List ＋ checkmark、時計の繰り返しと同じ）を開いて選び、一番下に「人を追加…」"
        android="FilterChip、追加は AssistChip"
        where="日の詳しい表示の一緒に働く人（Android と Web）"
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
      <Item
        name="Chip(ひとつ)"
        ios="独自のボタン（標準のチップはない）"
        android="FilterChip（1つだけ選ぶ）"
        where="空いた日の休み・有休"
      >
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
      <Item
        android="FilterChip（顔は leadingIcon）"
        ios="独自のボタン（標準のチップはない）"
        name="ChoiceChip / ChoiceChip avatar"
        where="日のシフト、1人ずつの人"
        wide
      >
        <ChoiceChipSample />
      </Item>
      <Item
        name="Tag tone=raised"
        ios="Text ＋ .background(in: .capsule)"
        android="Surface（CircleShape の小さな札）"
        where="繰り返しの順番、はじめての設定の見本"
      >
        <ChipGroup as="ol">
          {(["day", "night", "off"] as const).map((key) => (
            <Tag as="li" key={key} tone="raised">
              <ShiftMark shift={key} size={13} />
              {{ day: "日勤", night: "夜勤", off: "休み" }[key]}
            </Tag>
          ))}
        </ChipGroup>
      </Item>
      <Item
        name="Tag tone=neutral / accent"
        ios="Text ＋ .background(in: .capsule)"
        android="Surface（CircleShape の小さな札）"
        where="空いた日の日付、みんな休み"
      >
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

function Cards() {
  const [items, setItems] = useState([
    { id: "佐藤" },
    { id: "田中" },
    { id: "鈴木" },
  ]);
  return (
    <Group
      note="画面に直接置く面は、リストと同じ角丸 24 です。"
      title="カードと並べ替え"
    >
      <Item
        android="Card の中に ListItem（押せる）"
        ios="独自の Button（ボタンの中に絵文字と2行）"
        name="OptionCard"
        where="はじめての設定"
        wide
      >
        <OptionCard
          icon="🔁"
          note="当番・非番、工場の交代勤務、曜日で固定など"
          onClick={() => undefined}
          title="繰り返しがある"
        />
      </Item>
      <Item
        android="Card の中の ListItem（trailingContent に数）"
        ios="1行だけの List の Section（NavigationLink）"
        name="SummaryRow"
        where="今月のお休み、空いた日の確認"
        wide
      >
        <SummaryRow days="9" label="今月のお休み" onOpen={() => undefined} />
      </Item>
      <Item
        android="LazyColumn ＋ ドラッグで並べ替え（reorderable）"
        ios="List の ForEach ＋ .onMove（編集中）"
        name="SortableList"
        where="同僚、パターンの並び替え"
        wide
      >
        <SortableList
          items={items}
          label={(item) => item.id}
          onChange={setItems}
        >
          {(item) => item.id}
        </SortableList>
      </Item>
      <Item
        android="ListItem の間の見出し（Text）"
        ios="Section の header"
        name="ListDivider"
        where="1つのリストの中の区切り（パターンの並び替え）"
        wide
      >
        <List>
          <ListRow label="日勤" />
          <ListDivider>ここから2ページ目</ListDivider>
          <ListRow label="夜勤" />
        </List>
      </Item>
      <Item
        android="Surface の小さな札（独自）"
        ios="Text ＋ .background(in: .capsule)"
        name="SampleTag"
        where="スタイルのプレビューの角（見ているページの名前）"
      >
        <div className={catalog.tagStage}>
          <SampleTag label="カレンダー" />
        </div>
      </Item>
    </Group>
  );
}

function Fields() {
  const [name, setName] = useState("日勤");
  const [note, setNote] = useState("棚卸し");
  const [member, setMember] = useState("");
  const [message, setMessage] = useState("");
  const [letter, setLetter] = useState("日");
  return (
    <Group
      note="LimitedInput の look で見た目を選びます。inline は行の中、box は地の上に1つ、chip はチップの間。文字数の上限を超えそうになると数を出します。"
      title="入力"
    >
      <Item
        android="ListItem の trailingContent に BasicTextField（右寄せ）"
        ios="LabeledContent の中の TextField（.multilineTextAlignment(.trailing)）"
        name="LimitedInput look=inline"
        where="パターンの名前、プロフィールの名前"
        wide
      >
        <List>
          <ListRow
            control={
              <LimitedInput
                align="end"
                aria-label="名前"
                kind="shiftName"
                look="inline"
                onValueChange={setName}
                value={name}
              />
            }
            label="名前"
          />
        </List>
      </Item>
      <Item
        android="ListItem の trailingContent に BasicTextField（右寄せ。変換が確定したら頭の文字だけ残す）"
        ios="LabeledContent の中の TextField（右寄せ。変換が確定したら頭の文字だけ残す）"
        name="MarkLetterInput"
        where="パターンの印の文字（1文字）、グループの文字のアイコン（2文字）"
        wide
      >
        <List>
          <ListRow
            control={
              <MarkLetterInput
                kind="shiftMark"
                onLetter={setLetter}
                value={letter}
              />
            }
            label="文字"
          />
        </List>
      </Item>
      <Item
        android="TextField（塗りの地）"
        ios="TextField を塗りの地に（独自の TextFieldStyle）"
        name="LimitedInput look=box"
        where="日のメモ、時間"
        wide
      >
        <LimitedInput
          aria-label="メモ"
          kind="dayNote"
          look="box"
          onValueChange={setNote}
          value={note}
        />
      </Item>
      <Item
        android="InputChip の形の BasicTextField（独自）"
        ios="チップの形の TextField（独自）"
        name="LimitedInput look=chip"
        where="一緒に働く人を足す"
      >
        <LimitedInput
          aria-label="名前"
          counter={false}
          kind="personName"
          look="chip"
          onValueChange={setMember}
          placeholder="名前"
          value={member}
        />
      </Item>
      <Item
        android="TextField(maxLines = 5)"
        ios="TextField(axis: .vertical) ＋ .lineLimit(1...5)"
        name="LimitedTextArea"
        where="チャットの入力欄"
        wide
      >
        <LimitedTextArea
          aria-label="メッセージ"
          className={catalog.textArea}
          kind="chatMessage"
          onValueChange={setMessage}
          placeholder="メッセージ"
          value={message}
        />
      </Item>
    </Group>
  );
}

const tileSamples = [
  { emoji: "🌿", id: "moss", name: "モス" },
  { emoji: "📄", id: "paper", name: "紙" },
  { emoji: "🌙", id: "night", name: "夜" },
];

function Tiles() {
  const [small, setSmall] = useState("moss");
  const [large, setLarge] = useState("moss");
  const [page, setPage] = useState(0);
  return (
    <Group
      note="絵の下に名前を置いて選ぶタイルと、横にめくる並び。選んだタイルは枠と地が付き、名前が太字になります。"
      title="タイルとめくり"
    >
      <Item
        android="LazyVerticalGrid の selectable な Card"
        ios="LazyVGrid の選べるボタン（独自）"
        name="ChoiceTile size=small"
        where="スタイルのテーマ（3つ並び）"
        wide
      >
        <ChoiceGrid
          className={catalog.tiles({ columns: 3 })}
          label="テーマ"
          onValueChange={setSmall}
          value={small}
        >
          {tileSamples.map((tile) => (
            <ChoiceTile key={tile.id} size="small" value={tile.id}>
              <span className={catalog.tileEmoji}>{tile.emoji}</span>
              {tile.name}
            </ChoiceTile>
          ))}
        </ChoiceGrid>
      </Item>
      <Item
        android="LazyVerticalGrid の selectable な Card"
        ios="LazyVGrid の選べるボタン（独自）"
        name="ChoiceTile size=large"
        where="アプリアイコン（2つ並び）"
        wide
      >
        <ChoiceGrid
          className={catalog.tiles({ columns: 2 })}
          label="アイコン"
          onValueChange={setLarge}
          value={large}
        >
          {tileSamples.slice(0, 2).map((tile) => (
            <ChoiceTile key={tile.id} size="large" value={tile.id}>
              <span className={catalog.tileEmoji}>{tile.emoji}</span>
              {tile.name}
            </ChoiceTile>
          ))}
        </ChoiceGrid>
      </Item>
      <Item
        android="HorizontalPager"
        ios="ScrollView(.horizontal) ＋ .scrollTargetBehavior(.paging)"
        name="Pager"
        where="月をめくる、スタイルのテーマ、ポチポチ入力のパターン"
        wide
      >
        <div className={catalog.pager}>
          <Pager
            ends={{ back: page > 0, forward: page < tileSamples.length - 1 }}
            onStep={(direction) => {
              setPage((shown) => shown + direction);
            }}
            page={String(page)}
            renderPage={(offset) => {
              const tile = tileSamples[page + offset];
              return (
                tile && (
                  <div className={catalog.page}>
                    {tile.emoji} {tile.name}
                  </div>
                )
              );
            }}
          />
        </div>
      </Item>
    </Group>
  );
}

const chipSamples = [
  { id: "day", name: "日勤" },
  { id: "night", name: "夜勤" },
  { id: "off", name: "休み" },
];

function ChoiceChipSample() {
  const [shift, setShift] = useState("day");
  const [person, setPerson] = useState("me");
  return (
    <span className={catalog.chipRows}>
      <ChoiceGrid
        className={catalog.chipRow}
        label="シフト"
        onValueChange={setShift}
        value={shift}
      >
        {chipSamples.map((chip) => (
          <ChoiceChip key={chip.id} value={chip.id}>
            <ShiftMark shift={chip.id} size={14} />
            {chip.name}
          </ChoiceChip>
        ))}
      </ChoiceGrid>
      <ChoiceGrid
        className={catalog.chipRow}
        label="表示する人"
        onValueChange={setPerson}
        value={person}
      >
        {[
          { id: "me", name: "自分" },
          { id: "yuki", name: "ゆうき" },
        ].map((member) => (
          <ChoiceChip avatar key={member.id} value={member.id}>
            <PhotoAvatar name={member.name} />
            {member.name}
          </ChoiceChip>
        ))}
      </ChoiceGrid>
    </span>
  );
}

function Overlays() {
  return (
    <Group
      note="画面の器と、電話の上に重なって出るもの。ページの上では出せないので、電話の中で開いて見ます。"
      title="画面と重なり"
    >
      <Item
        android="Scaffold ＋ LazyColumn、ModalBottomSheet、AlertDialog、全画面の Dialog。SystemAlert は OS が出す（POST_NOTIFICATIONS の許可など）"
        ios="NavigationStack の画面 ＋ ScrollView、.sheet、.alert、.fullScreenCover。SystemAlert は OS が出す（requestAuthorization、アイコン変更）"
        name="Screen + ScreenScroll / Sheet / ConfirmDialog / SystemAlert / PhotoViewer"
        where="すべての画面、内訳などのシート、確かめる質問、OS の確認（通知の許可など）、写真を大きく"
        wide
      >
        <OverlaySample />
      </Item>
    </Group>
  );
}

function OverlaySample() {
  const phone = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<
    "sheet" | "confirm" | "system" | "photo" | null
  >(null);
  const [photo] = useState(sampleRosterPhoto);
  const close = () => {
    setOpen(null);
  };
  return (
    <Phone ref={phone}>
      <PhoneContext value={phone}>
        <Screen>
          <PageHeader title="重なり" />
          <ScreenScroll>
            <Button
              onClick={() => {
                setOpen("sheet");
              }}
              variant="quiet"
            >
              シートを開く
            </Button>
            <Button
              onClick={() => {
                setOpen("confirm");
              }}
              variant="quiet"
            >
              確かめる質問を出す
            </Button>
            <Button
              onClick={() => {
                setOpen("system");
              }}
              variant="quiet"
            >
              OS の確認を出す
            </Button>
            <Button
              onClick={() => {
                setOpen("photo");
              }}
              variant="quiet"
            >
              写真を大きく見る
            </Button>
          </ScreenScroll>
        </Screen>
        <Sheet
          label="今月の内訳"
          onOpenChange={(next) => {
            if (!next) {
              close();
            }
          }}
          open={open === "sheet"}
        >
          <SheetHeading onClose={close} title="今月の内訳" />
        </Sheet>
        {open === "confirm" && (
          <ConfirmDialog
            action="抜ける"
            message="シフトの共有とチャットが見られなくなります。"
            onCancel={close}
            onConfirm={close}
            title="「家族」を抜けますか？"
          />
        )}
        {open === "system" && (
          <SystemAlert
            buttons={[{ label: "許可しない" }, { label: "許可" }]}
            onClose={close}
            title="“ポチカル”は通知を送信します。よろしいですか？"
          />
        )}
        <PhotoViewer
          label="勤務表の写真"
          onOpenChange={(next) => {
            if (!next) {
              close();
            }
          }}
          open={open === "photo"}
          photo={photo.src}
          whole
        />
      </PhoneContext>
    </Phone>
  );
}

function MenuSample() {
  const [layout, setLayout] = useState<"days" | "weeks">("days");
  return (
    <PullDownMenu label={layout === "days" ? "一覧" : "週ごと"}>
      <MenuPicker
        onValueChange={setLayout}
        options={[
          { label: "一覧", value: "days" },
          { label: "週ごと", value: "weeks" },
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
        name="SheetHeading（SheetPicture の中）"
        ios=".sheet の中の .navigationTitle ＋ ✕（.cancellationAction）"
        android="ModalBottomSheet の見出し行"
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
      <Item
        name="DecideHeading"
        ios=".sheet の中の .cancellationAction ＋ .confirmationAction"
        android="ModalBottomSheet の見出し行（キャンセル・決定）"
        where="決めるシート(日にちを共有)"
        wide
      >
        <SheetPicture handle={false}>
          <DecideHeading
            action="送る"
            onAction={() => undefined}
            onCancel={() => undefined}
            title="日にちを共有"
          />
        </SheetPicture>
      </Item>
      <Item
        name="Toast"
        wide
        ios="標準はないので、画面の下に独自に重ねる"
        android="Snackbar"
        where="入力・保存のあとの一言(Ark UI の Toast)。できたことはチェック、できなかったことは丸に「!」(kind: problem)"
      >
        <div className={toastKinds}>
          <p className={toastLook}>
            <Check aria-hidden="true" size={16} />
            10月のシフトを入れました
          </p>
          <p className={toastLook}>
            <CircleAlert aria-hidden="true" size={16} />
            この招待リンクは使えません
          </p>
        </div>
      </Item>
      <Item
        name="PullDownMenu + MenuPicker / MenuItem / MenuSeparator"
        ios="Menu"
        android="DropdownMenu"
        where="グループのシフト表(一覧・週ごと・1人ずつ)"
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
            ios="独自の View（同じ図柄を描く）"
            android="独自の Composable（同じ図柄を描く）"
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
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="入力済み"
        >
          <Cell entry={{ shift: "day" }} />
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="休み(色をつける)"
        >
          <Cell entry={{ shift: "off" }} />
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="休み(空白)"
        >
          <OffDisplayContext value="blank">
            <Cell entry={{ shift: "off" }} />
          </OffDisplayContext>
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="メモ"
        >
          <Cell entry={{ note: "棚卸し", shift: "day" }} />
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="残業"
        >
          <Cell entry={{ end: "20:00", shift: "day" }} />
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="選択中"
        >
          <Cell active entry={{ shift: "day" }} />
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="未入力"
        >
          <Cell />
        </Item>
        <Item
          name="DayCell"
          ios="独自の View"
          android="独自の Composable"
          where="前後の月"
        >
          <Cell entry={{ note: "棚卸し", shift: "day" }} outside />
        </Item>
        <Item
          name="WeekdayRow + dayGrid"
          ios="Grid（7列）"
          android="LazyVerticalGrid(GridCells.Fixed(7))"
          where="カレンダー・メンバーの月・保存する画像・見た目の見本"
          wide
        >
          <WeekSample />
        </Item>
      </Group>
      <Group title="画面の下と見出し(ポチカル独自)">
        <Item
          name="MonthSummary"
          ios="独自の行"
          android="独自の行"
          where="カレンダー下の今月のお休み、一緒の日を見ている間はその日数"
          wide
        >
          <MonthSummary
            days={9}
            month={new Date(2026, 8, 1)}
            onOpen={() => undefined}
          />
          <MonthSummary
            days={5}
            month={new Date(2026, 8, 1)}
            onOpen={() => undefined}
            person="田中"
          />
        </Item>
        <Item
          name="TabBar"
          ios="TabView（iOS 26 のガラスのタブバーは OS が描く）"
          android="NavigationBar"
          where="画面の一番下"
          wide
        >
          <div className={catalog.tabBarStage}>
            <UserStoreContext value={tabBarPerson}>
              <TabBar active="calendar" onSelect={() => undefined} />
            </UserStoreContext>
          </div>
        </Item>
        <Item
          name="PhotoAvatar"
          ios="AsyncImage を Circle で切る、写真がなければ頭文字"
          android="Coil の AsyncImage ＋ CircleShape、なければ頭文字"
          where="グループのメンバー"
        >
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
  outside = false,
}: {
  entry?: Parameters<typeof DayCell>[0]["entry"];
  active?: boolean;
  outside?: boolean;
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
        outside={outside}
      />
    </div>
  );
}
