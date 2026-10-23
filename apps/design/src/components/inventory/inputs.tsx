import {
  LimitedInput,
  LimitedTextArea,
  MarkLetterInput,
  TimeRange,
} from "@pochical/prototype/components/design-fields";
import { List, ListRow } from "@pochical/prototype/components/design-list";
import { css } from "@pochical/styled-system/css";
import { useState } from "react";

import { Item, Items } from "./item";

const styles = {
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
};

export function Times() {
  const [times, setTimes] = useState({ end: "18:00", start: "9:00" });
  return (
    <Items>
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
    </Items>
  );
}

export function Fields() {
  const [name, setName] = useState("日勤");
  const [note, setNote] = useState("棚卸し");
  const [member, setMember] = useState("");
  const [message, setMessage] = useState("");
  const [letter, setLetter] = useState("日");
  return (
    <Items>
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
          className={styles.textArea}
          kind="chatMessage"
          onValueChange={setMessage}
          placeholder="メッセージ"
          value={message}
        />
      </Item>
    </Items>
  );
}
