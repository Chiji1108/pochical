import alarmSymbol from "@iconify-icons/material-symbols/alarm-outline-rounded";
import eventSymbol from "@iconify-icons/material-symbols/event-outline-rounded";
import helpSymbol from "@iconify-icons/material-symbols/help-outline-rounded";
import { SampleTag } from "@pochical/prototype/components/design-fields";
import {
  ListDivider,
  SummaryRow,
  List,
  ListRow,
  SwitchRow,
} from "@pochical/prototype/components/design-list";
import { SortableList } from "@pochical/prototype/components/design-sortable-list";
import {
  OptionCard,
  Note,
  Section,
  SegmentedContext,
} from "@pochical/prototype/components/design-ui";
import { css } from "@pochical/styled-system/css";
import { useState } from "react";

import { Item, Items } from "./item";

const styles = {
  // A picture's corner for the tag to sit on, as on a preview.
  tagStage: css({
    bg: "fill.quaternary",
    borderRadius: "2xl",
    height: "72px",
    position: "relative",
    width: "160px",
  }),
};

export function Rows() {
  const [on, setOn] = useState(true);
  return (
    <Items>
      <Item
        name="List + ListRow / SwitchRow(Toggle)"
        ios="List ＋ .listStyle(.insetGrouped)、行は LabeledContent・NavigationLink"
        android="Card の中に ListItem を並べる（設定のリストは下の SettingsLists）"
        where="グループのハブ、日の詳細など"
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
      <Item
        name="SettingsLists + List（Android）"
        ios="（iOS は上の List のまま）"
        android="SettingsSection ＋ SettingsRow（SegmentedListItem、先頭に Material Symbols Rounded）"
        where="設定とその下のページ、グループの設定、参加と作成"
        wide
      >
        <SegmentedContext value>
          <Section title="通知">
            <List>
              <ListRow
                label="リマインド"
                onClick={() => undefined}
                symbol={alarmSymbol}
                value="オフ"
              />
              <SwitchRow
                checked={on}
                label="休みの日も入れる"
                onChange={setOn}
                symbol={eventSymbol}
              />
              <ListRow
                label="ヘルプ"
                leaves
                onClick={() => undefined}
                symbol={helpSymbol}
              />
            </List>
          </Section>
        </SegmentedContext>
      </Item>
    </Items>
  );
}

export function CardPieces() {
  const [items, setItems] = useState([
    { id: "佐藤" },
    { id: "田中" },
    { id: "鈴木" },
  ]);
  return (
    <Items>
      <Item
        android="Card の中に ListItem（押せる）"
        ios="独自の Button（ボタンの中に絵文字と2行）"
        name="OptionCard"
        where="はじめての設定"
        wide
      >
        <OptionCard
          icon="🔁"
          note="当番・非番、工場の交代勤務、平日勤務など"
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
        <div className={styles.tagStage}>
          <SampleTag label="カレンダー" />
        </div>
      </Item>
    </Items>
  );
}
