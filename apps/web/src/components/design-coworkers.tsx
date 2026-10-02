import { COWORKERS_MAX, textLimits } from "@pochical/design/limits";
import { useContext, useState } from "react";

import type { Schedule } from "../lib/design-days";
import { composing, limitText } from "../lib/text-limits";
import { ConfirmDialog } from "./design-sheet";
import { ToastContext } from "./design-toast";
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
  SortableList,
} from "./design-ui";

// Said when adding past COWORKERS_MAX, from the list or from a day.
export const coworkersFull = `一緒に働く人は${COWORKERS_MAX}人までです`;

// The people you note on a day, like who is on the same shift. Only names:
// they are not app users, unlike the members of a group.
export type Coworkers = {
  names: string[];
  onAdd: (name: string) => void;
  onReorder: (names: string[]) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (name: string) => void;
};

function daysWith(schedule: Schedule, name: string) {
  return Object.values(schedule).filter((entry) =>
    entry?.members?.includes(name)
  ).length;
}

export function CoworkersPage({
  coworkers,
  schedule,
  onBack,
}: {
  coworkers: Coworkers;
  schedule: Schedule;
  onBack: () => void;
}) {
  const [view, setView] = useState<"list" | "sort">("list");
  const [editing, setEditing] = useState<string>();
  const [adding, setAdding] = useState(false);
  const toast = useContext(ToastContext);
  const { names } = coworkers;

  if (editing !== undefined) {
    return (
      <CoworkerEditor
        days={daysWith(schedule, editing)}
        name={editing}
        onBack={() => {
          setEditing(undefined);
        }}
        onDelete={() => {
          coworkers.onDelete(editing);
          setEditing(undefined);
        }}
        onSave={(name) => {
          coworkers.onRename(editing, name);
          setEditing(undefined);
        }}
        taken={names.filter((item) => item !== editing)}
      />
    );
  }

  // Held to the limit here too: a name confirmed and added in one go may
  // not have been cut to it yet.
  const add = (value: string) => {
    const name = limitText(value.trim(), textLimits.personName);
    setAdding(false);
    if (!name || names.includes(name)) {
      return;
    }
    // Counted again: the list may have grown while the name was typed.
    if (names.length >= COWORKERS_MAX) {
      toast(coworkersFull, "problem");
      return;
    }
    coworkers.onAdd(name);
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
                setEditing(name);
              }}
              label={name}
              truncate
              value={<>{daysWith(schedule, name)}日</>}
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
              if (names.length >= COWORKERS_MAX) {
                toast(coworkersFull, "problem");
                return;
              }
              setAdding(true);
            }}
          >
            人を追加
          </AddButton>
        ))}
      <Note>
        {sorting
          ? "つまみを上下に動かして並べ替えます。日付の詳細でも、この順に並びます。"
          : "同じシフトに入る人などを、日付の詳細でその日にメモできます。ここで直した名前は、入れてある日にも反映されます。"}
      </Note>
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
        back="一緒に働く人"
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
