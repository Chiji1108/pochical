import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import type { Schedule } from "./design-calendar";
import { SortableList } from "./design-pattern-editor";

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

  const add = (value: string) => {
    const name = value.trim();
    setAdding(false);
    if (name && !names.includes(name)) {
      coworkers.onAdd(name);
    }
  };
  const sorting = view === "sort";
  return (
    <>
      <header className="st-page-header">
        <div className="pe-topbar">
          <button
            className="st-back"
            disabled={sorting}
            onClick={onBack}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
            設定
          </button>
          {names.length > 1 && (
            <button
              className="pe-save"
              onClick={() => {
                setView(sorting ? "list" : "sort");
              }}
              type="button"
            >
              {sorting ? "完了" : "並び替え"}
            </button>
          )}
        </div>
        <h3 className="st-title">一緒に働く人</h3>
      </header>
      {sorting && (
        <SortableList
          items={names.map((name) => ({ id: name }))}
          label={(item) => item.id}
          onChange={(items) => {
            coworkers.onReorder(items.map((item) => item.id));
          }}
        >
          {(item) => <span className="st-row-label">{item.id}</span>}
        </SortableList>
      )}
      {!sorting && names.length > 0 && (
        <div className="st-list">
          {names.map((name) => (
            <button
              className="st-row"
              key={name}
              onClick={() => {
                setEditing(name);
              }}
              type="button"
            >
              <span className="st-row-label">{name}</span>
              <span className="st-row-value">{daysWith(schedule, name)}日</span>
              <ChevronRight
                aria-hidden="true"
                className="st-row-arrow"
                size={17}
              />
            </button>
          ))}
        </div>
      )}
      {!sorting &&
        (adding ? (
          <div className="st-list">
            <input
              aria-label="追加する人の名前"
              autoFocus
              className="st-row st-coworker-input"
              onBlur={(event) => {
                add(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  add(event.currentTarget.value);
                } else if (event.key === "Escape") {
                  setAdding(false);
                }
              }}
              placeholder="名前"
            />
          </div>
        ) : (
          <button
            className="st-add"
            onClick={() => {
              setAdding(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={14} />
            人を追加
          </button>
        ))}
      <p className="st-note">
        {sorting
          ? "つまみを上下に動かして並べ替えます。日付の詳細でも、この順に並びます。"
          : "同じシフトに入る人などを、日付の詳細でその日にメモできます。ここで直した名前は、入れてある日にも反映されます。"}
      </p>
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
      <header className="st-page-header">
        <div className="pe-topbar">
          <button className="st-back" onClick={onBack} type="button">
            <ChevronLeft aria-hidden="true" size={20} />
            一緒に働く人
          </button>
          <button
            className="pe-save"
            disabled={!trimmed || duplicate}
            onClick={() => {
              onSave(trimmed);
            }}
            type="button"
          >
            保存
          </button>
        </div>
        <h3 className="st-title">{name}</h3>
      </header>
      <div className="st-list">
        <label className="st-row">
          <span className="st-row-label">名前</span>
          <input
            className="pe-inline-input"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            value={draft}
          />
        </label>
      </div>
      <p className="st-note">
        {duplicate
          ? "同じ名前の人がもういます。"
          : `${days}日の予定に入っています。名前を変えると、その日の表示も変わります。`}
      </p>
      <button
        className="pe-delete"
        onClick={() => {
          confirming ? onDelete() : setConfirming(true);
        }}
        type="button"
      >
        {confirming
          ? `もう一度押すと削除します（${days}日の予定から外れます）`
          : "この人を削除"}
      </button>
    </>
  );
}
