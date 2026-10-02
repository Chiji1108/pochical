import { textLimits } from "@pochical/design/limits";
import { useState } from "react";

import { dateKey, dateOfKey } from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import { usePatterns } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { composing, limitText } from "../lib/text-limits";
import { ConfirmDialog } from "./design-sheet";
import {
  AddButton,
  BackButton,
  DestructiveButton,
  HeaderAction,
  LimitedInput,
  List,
  ListRow,
  listRow,
  Note,
  PageHeader,
  Section,
  SortableList,
} from "./design-ui";
import { useWeek } from "./design-week";
import { ShiftMark } from "./shift-mark";

// The people you note on a day, like who is on the same shift. Only names:
// they are not app users, unlike the members of a group.
export type Coworkers = {
  names: string[];
  onAdd: (name: string) => void;
  onReorder: (names: string[]) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
};

// The days someone is on, as dateKeys from the earliest.
function daysWith(schedule: Schedule, name: string) {
  return Object.keys(schedule)
    .filter((key) => schedule[key]?.members?.includes(name))
    .toSorted();
}

// `initialPerson` opens on someone's days, as going back to settings does
// after one of them was opened in the calendar.
export function CoworkersPage({
  coworkers,
  schedule,
  initialPerson,
  onBack,
  onOpenDay,
}: {
  coworkers: Coworkers;
  schedule: Schedule;
  initialPerson?: string;
  onBack: () => void;
  onOpenDay: (person: string, date: Date) => void;
}) {
  const [view, setView] = useState<"list" | "sort">("list");
  const [opened, setOpened] = useState(initialPerson);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const { names } = coworkers;
  const person =
    opened !== undefined && names.includes(opened) ? opened : undefined;

  if (person !== undefined && editing) {
    return (
      <CoworkerEditor
        days={daysWith(schedule, person).length}
        name={person}
        onBack={() => {
          setEditing(false);
        }}
        onDelete={() => {
          coworkers.onDelete(person);
          setOpened(undefined);
          setEditing(false);
        }}
        onSave={(name) => {
          coworkers.onRename(person, name);
          setOpened(name);
          setEditing(false);
        }}
        taken={names.filter((item) => item !== person)}
      />
    );
  }
  if (person !== undefined) {
    return (
      <CoworkerDays
        days={daysWith(schedule, person)}
        name={person}
        onBack={() => {
          setOpened(undefined);
        }}
        onEdit={() => {
          setEditing(true);
        }}
        onOpenDay={(date) => {
          onOpenDay(person, date);
        }}
        schedule={schedule}
      />
    );
  }

  // Held to the limit here too: a name confirmed and added in one go may
  // not have been cut to it yet.
  const add = (value: string) => {
    const name = limitText(value.trim(), textLimits.personName);
    setAdding(false);
    if (name && !names.includes(name)) {
      coworkers.onAdd(name);
    }
  };
  const sorting = view === "sort";
  return (
    <>
      <PageHeader
        leading={
          <BackButton disabled={sorting} onClick={onBack}>
            設定
          </BackButton>
        }
        trailing={
          names.length > 1 && (
            <HeaderAction
              prominent={sorting}
              onClick={() => {
                setView(sorting ? "list" : "sort");
              }}
            >
              {sorting ? "完了" : "並び替え"}
            </HeaderAction>
          )
        }
        title="一緒に働く人"
      />
      {sorting && (
        <SortableList
          items={names.map((name) => ({ id: name }))}
          label={(item) => item.id}
          onChange={(items) => {
            coworkers.onReorder(items.map((item) => item.id));
          }}
        >
          {(item) => <span className={listRow.label}>{item.id}</span>}
        </SortableList>
      )}
      {!sorting && names.length > 0 && (
        <List>
          {names.map((name) => (
            <ListRow
              key={name}
              onClick={() => {
                setOpened(name);
              }}
              label={name}
              truncate
              value={<>{daysWith(schedule, name).length}日</>}
            />
          ))}
        </List>
      )}
      {!sorting &&
        (adding ? (
          <List>
            <div className={listRow.root} data-list-row="">
              <LimitedInput
                aria-label="追加する人の名前"
                autoFocus
                look="inline"
                kind="personName"
                onBlur={(event) => {
                  add(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !composing(event)) {
                    add(event.currentTarget.value);
                  } else if (event.key === "Escape") {
                    setAdding(false);
                  }
                }}
                placeholder="名前"
              />
            </div>
          </List>
        ) : (
          <AddButton
            onClick={() => {
              setAdding(true);
            }}
          >
            人を追加
          </AddButton>
        ))}
      <Note>
        {sorting
          ? "つまみを上下に動かして並べ替えます。日付の詳細でも、この順に並びます。"
          : "同じシフトに入る人などを、日付の詳細でその日にメモできます。"}
      </Note>
    </>
  );
}

// A day's date as a row of a list: 9/19(土), or 9/19 Sat when 月と曜日 is
// English, with the year in front outside this one.
function dayLabel(date: Date, english: boolean, weekday: string) {
  const year =
    date.getFullYear() === designToday.getFullYear()
      ? ""
      : `${date.getFullYear()}/`;
  const day = `${year}${date.getMonth() + 1}/${date.getDate()}`;
  return english ? `${day} ${weekday}` : `${day}(${weekday})`;
}

// Someone's days: the ones to come from the nearest, then the ones gone
// from the latest. Pressing one opens it in the calendar.
function CoworkerDays({
  name,
  days,
  schedule,
  onBack,
  onEdit,
  onOpenDay,
}: {
  name: string;
  days: string[];
  schedule: Schedule;
  onBack: () => void;
  onEdit: () => void;
  onOpenDay: (date: Date) => void;
}) {
  const book = usePatterns();
  const { english, weekdayName } = useWeek();
  const today = dateKey(designToday);
  const coming = days.filter((key) => key >= today);
  const past = days.filter((key) => key < today).toReversed();
  const row = (key: string) => {
    const date = dateOfKey(key);
    const shift = schedule[key]?.shift;
    return (
      <ListRow
        key={key}
        label={dayLabel(date, english, weekdayName(date.getDay()))}
        leading={shift && <ShiftMark shift={shift} size={20} />}
        onClick={() => {
          onOpenDay(date);
        }}
        value={shift ? book[shift]?.name : undefined}
      />
    );
  };
  return (
    <>
      <PageHeader
        back="一緒に働く人"
        onBack={onBack}
        trailing={<HeaderAction onClick={onEdit}>編集</HeaderAction>}
        title={name}
      />
      {coming.length > 0 && (
        <Section note={`${coming.length}日`} title="これから">
          <List>{coming.map(row)}</List>
        </Section>
      )}
      {past.length > 0 && (
        <Section note={`${past.length}日`} title="これまで">
          <List>{past.map(row)}</List>
        </Section>
      )}
      {days.length === 0 && <Note>一緒の日はまだありません。</Note>}
    </>
  );
}

// Renaming changes every day the name is on; deleting takes it off them,
// which the second press confirms.
function CoworkerEditor({
  name,
  days,
  taken,
  onSave,
  onDelete,
  onBack,
}: {
  name: string;
  days: number;
  taken: string[];
  onSave: (name: string) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const trimmed = draft.trim();
  const duplicate = taken.includes(trimmed);
  return (
    <>
      <PageHeader
        back={name}
        onBack={onBack}
        trailing={
          <HeaderAction
            disabled={!trimmed || duplicate}
            onClick={() => {
              onSave(trimmed);
            }}
          >
            保存
          </HeaderAction>
        }
        title={name}
      />
      <List>
        <ListRow
          label="名前"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="personName"
                onValueChange={setDraft}
                value={draft}
              />
            </>
          }
        />
      </List>
      <Note>
        {duplicate
          ? "同じ名前の人がもういます。"
          : `${days}日の予定に入っています。名前を変えると、その日の表示も変わります。`}
      </Note>
      <DestructiveButton
        onClick={() => {
          setConfirming(true);
        }}
      >
        この人を削除
      </DestructiveButton>
      {confirming && (
        <ConfirmDialog
          action="削除"
          message={`${days}日の予定から${name}が外れます。`}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
          title={`${name}を削除しますか？`}
        />
      )}
    </>
  );
}
