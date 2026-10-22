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
} from "@pochical/prototype/components/design-choices";
import { PhotoAvatar } from "@pochical/prototype/components/design-group-parts";
import { Pager } from "@pochical/prototype/components/design-pager";
import {
  NameTabs,
  OffLookTabs,
} from "@pochical/prototype/components/design-settings-style";
import { ShiftMark } from "@pochical/prototype/components/shift-mark";
import type { OffLookId } from "@pochical/prototype/components/shift-mark";
import { css, cva } from "@pochical/styled-system/css";
import { Check } from "lucide-react";
import { useState } from "react";

import { Item, Items } from "./item";

const styles = {
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
};

export function Switches() {
  const [off, setOff] = useState<OffLookId>("highlight");
  const [names, setNames] = useState(false);
  const [day, setDay] = useState(0);
  return (
    <Items>
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
    </Items>
  );
}

const sampleColors = ["#5b7a55", "#c29a4a", "#c9796a", "#7a86c4", "#9a9a94"];

export function Choices() {
  const [color, setColor] = useState("0");
  const [appearance, setAppearance] = useState("system");
  const [page, setPage] = useState(0);
  return (
    <Items>
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
    </Items>
  );
}

export function Chips() {
  const [picked, setPicked] = useState(["田中"]);
  const [off, setOff] = useState("off");
  return (
    <Items>
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
    </Items>
  );
}

const tileSamples = [
  { emoji: "🌿", id: "moss", name: "モス" },
  { emoji: "📄", id: "paper", name: "紙" },
  { emoji: "🌙", id: "night", name: "夜" },
];

export function Tiles() {
  const [small, setSmall] = useState("moss");
  const [large, setLarge] = useState("moss");
  const [page, setPage] = useState(0);
  return (
    <Items>
      <Item
        android="LazyVerticalGrid の selectable な Card"
        ios="LazyVGrid の選べるボタン（独自）"
        name="ChoiceTile size=small"
        where="スタイルのテーマ（3つ並び）"
        wide
      >
        <ChoiceGrid
          className={styles.tiles({ columns: 3 })}
          label="テーマ"
          onValueChange={setSmall}
          value={small}
        >
          {tileSamples.map((tile) => (
            <ChoiceTile key={tile.id} size="small" value={tile.id}>
              <span className={styles.tileEmoji}>{tile.emoji}</span>
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
          className={styles.tiles({ columns: 2 })}
          label="アイコン"
          onValueChange={setLarge}
          value={large}
        >
          {tileSamples.slice(0, 2).map((tile) => (
            <ChoiceTile key={tile.id} size="large" value={tile.id}>
              <span className={styles.tileEmoji}>{tile.emoji}</span>
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
        <div className={styles.pager}>
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
                  <div className={styles.page}>
                    {tile.emoji} {tile.name}
                  </div>
                )
              );
            }}
          />
        </div>
      </Item>
    </Items>
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
    <span className={styles.chipRows}>
      <ChoiceGrid
        className={styles.chipRow}
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
        className={styles.chipRow}
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
