import {
  BackButton,
  ReturnButton,
  TodayButton,
  DoneButton,
  HeaderAction,
  PageHeader,
} from "@pochical/prototype/components/design-header";
import { AddRow, List } from "@pochical/prototype/components/design-list";
import { IconMenu, MenuItem } from "@pochical/prototype/components/design-menu";
import {
  BarGroup,
  Button,
  DestructiveButton,
  IconButton,
} from "@pochical/prototype/components/design-ui";
import { css } from "@pochical/styled-system/css";
import {
  CalendarPlus,
  Download,
  Image as ImageIcon,
  Pencil,
  Settings,
  UserPlus,
  X,
} from "lucide-react";

import { Item, Items } from "./item";

const styles = {
  marks: css({ alignItems: "center", display: "flex", gap: "18px" }),
};

export function Buttons() {
  return (
    <Items>
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
    </Items>
  );
}

export function HeaderButtons() {
  return (
    <Items>
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
        <span className={styles.marks}>
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
        ios="ToolbarItem(placement: .confirmationAction) の Button(role: .confirm)、checkmark だけ（完了は読み上げ）"
        android="TopAppBar の actions の Button（✓と完了）"
        where="ポチポチ入力と、繰り返しの並びを入れる画面の完了だけ"
      >
        <DoneButton />
      </Item>
    </Items>
  );
}

export function OtherButtons() {
  return (
    <Items>
      <Item
        android="ListItem（leadingContent に Add）"
        ios="Label の plus（accent の色）"
        name="AddRow"
        where="リストに1つ足す（パターン、同僚、リマインド）"
        wide
      >
        <List>
          <AddRow label="パターンを追加" onClick={() => undefined} />
        </List>
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
        android="TopAppBar の actions の TextButton"
        ios="ToolbarItem の Button（ガラスは OS）"
        name="ReturnButton"
        where="並びを入れる月で、1日目の月から離れたとき（1日目へ）"
      >
        <ReturnButton onClick={() => undefined}>1日目へ</ReturnButton>
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
    </Items>
  );
}
