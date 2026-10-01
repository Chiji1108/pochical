import { Bell, BellOff, Check, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { css, cx } from "styled-system/css";

import type { Schedule } from "../lib/design-days";
import { useDevice } from "../lib/design-device";
import { OwnPatternsContext, usePatterns } from "../lib/design-patterns";
import type { PatternBook, Shift } from "../lib/design-patterns";
import {
  beforeStartOptions,
  beforeText,
  defaultBeforeMinutes,
  defaultDayBeforeTime,
  firingText,
  nextFiring,
  notificationText,
  reminderName,
  remindable,
} from "../lib/design-reminders";
import type { Firing, Reminder, ReminderKind } from "../lib/design-reminders";
import { useSettings } from "../lib/design-settings-store";
import { useUser } from "../lib/design-user-store";
import { AppIcon, useAppIcons } from "./design-app-icon";
import { GroupIcon } from "./design-group-parts";
import { DecideHeading, Sheet, sheetBody, SystemAlert } from "./design-sheet";
import {
  Button,
  Chip,
  ChipGroup,
  DestructiveButton,
  List,
  ListRow,
  listRow,
  MenuPicker,
  Note,
  PageHeader,
  PullDownMenu,
  Section,
  Segment,
  SegmentedControl,
  srOnly,
  SwitchRow,
  TimeField,
  Toggle,
} from "./design-ui";
import { ShiftMark } from "./shift-mark";

// 通知: reminders of the person's own shifts, which the device sends by
// itself like alarms, and the chats' messages, which the server pushes
// unless a group is turned off. Neither arrives until the system allows
// the app to notify, so both pages lead with asking for that.

const card = {
  icon: css({
    bg: "accent.container",
    borderRadius: "circle",
    color: "accent.default",
    display: "grid",
    flexShrink: 0,
    height: "40px",
    placeItems: "center",
    width: "40px",
  }),
  lead: css({
    color: "text.tertiary",
    lineHeight: 1.5,
    margin: "0 0 8px",
    textStyle: "footnote",
  }),
  root: css({
    alignItems: "flex-start",
    bg: "fill.quaternary",
    borderRadius: "2xl",
    display: "flex",
    gap: "12px",
    padding: "16px",
  }),
  text: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  }),
  title: css({ fontWeight: 600, margin: 0, textStyle: "subheadline" }),
};

// Asking the system, as the app does the first time a notification is
// wanted: iOS's alert, or Android 13's, in their own words.
function PermissionPrompt({ onClose }: { onClose: () => void }) {
  const platform = useDevice((state) => state.platform);
  const answer = (allowed: boolean) => () => {
    useDevice.setState({ notifications: allowed ? "allowed" : "denied" });
  };
  return (
    <SystemAlert
      buttons={[
        { label: "許可しない", onPress: answer(false) },
        { label: "許可", onPress: answer(true) },
      ]}
      message={
        platform === "ios"
          ? "通知方法は、テキスト、サウンド、アイコンバッジが利用できる可能性があります。通知方法は“設定”で設定できます。"
          : undefined
      }
      onClose={onClose}
      title={
        platform === "ios"
          ? "“ポチカル”は通知を送信します。よろしいですか？"
          : "ポチカル に通知の送信を許可しますか？"
      }
    />
  );
}

// Opens the system's question while it has not been asked: on the card's
// button, and on turning on or adding a reminder, the moment a
// notification is first wanted. `after` goes on once it is answered, so a
// sheet asking stays under the question until then: closed first, its
// returning focus would dismiss the question.
function usePermissionPrompt() {
  const notifications = useDevice((state) => state.notifications);
  const [asking, setAsking] = useState<{ after?: () => void }>();
  const ask = (after?: () => void) => {
    if (notifications === "notAsked") {
      setAsking({ after });
    } else {
      after?.();
    }
  };
  const prompt = asking && (
    <PermissionPrompt
      onClose={() => {
        setAsking(undefined);
        asking.after?.();
      }}
    />
  );
  return { ask, prompt };
}

// Over a page's settings while nothing can arrive: before asking, a way to
// allow; once refused, only the system's settings can, so the way there.
function PermissionCard({ onAsk }: { onAsk: () => void }) {
  const notifications = useDevice((state) => state.notifications);
  if (notifications === "allowed") {
    return null;
  }
  const refused = notifications === "denied";
  // 設定を開く stands in for the system's settings, coming back from them
  // with notifications on.
  const openSettings = () => {
    useDevice.setState({ notifications: "allowed" });
  };
  return (
    <div className={card.root}>
      <span aria-hidden="true" className={card.icon}>
        {refused ? <BellOff size={20} /> : <Bell size={20} />}
      </span>
      <div className={card.text}>
        <p className={card.title}>
          {refused ? "通知がオフになっています" : "通知はまだオフです"}
        </p>
        <p className={card.lead}>
          {refused
            ? "スマホの設定で、ポチカルの通知をオンにしてください。"
            : "オンにすると、リマインドとチャットのメッセージが届きます。"}
        </p>
        <Button onClick={refused ? openSettings : onAsk} size="small">
          {refused ? "設定を開く" : "通知をオンにする"}
        </Button>
      </div>
    </div>
  );
}

// The two rows of 設定's 通知, each saying what arrives: nothing at all
// until the system allows it.
export function NotificationSection({
  onReminders,
  onChats,
}: {
  onReminders: () => void;
  onChats: () => void;
}) {
  const allowed = useDevice((state) => state.notifications) === "allowed";
  const reminders = useSettings((state) => state.device.reminders);
  const groups = useUser((state) => state.groups);
  const on = reminders.filter((reminder) => reminder.on);
  const heard = groups.filter((group) => !group.muted);
  let remindersValue = `${on.length}件`;
  if (!allowed || on.length === 0) {
    remindersValue = "オフ";
  } else if (on.length === 1) {
    remindersValue = reminderName(on[0]);
  }
  let chatsValue = `${heard.length}グループ`;
  if (!allowed || heard.length === 0) {
    chatsValue = "オフ";
  } else if (heard.length === groups.length) {
    chatsValue = "オン";
  }
  return (
    <Section title="通知">
      <List>
        <ListRow
          label="リマインド"
          onClick={onReminders}
          value={remindersValue}
        />
        <ListRow label="チャット" onClick={onChats} value={chatsValue} />
      </List>
    </Section>
  );
}

const page = css({ display: "flex", flexDirection: "column", gap: "24px" });

// A reminder as a row of the alarms' list: what it is and when it next
// goes off, opening it to edit, and its switch.
const reminderRow = {
  marks: css({ alignItems: "center", display: "inline-flex", gap: "4px" }),
  name: css({ alignItems: "center", display: "flex", gap: "8px" }),
  off: css({ color: "text.tertiary" }),
  open: css({
    alignItems: "center",
    alignSelf: "stretch",
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "flex",
    flex: 1,
    font: "inherit",
    minWidth: 0,
    padding: 0,
    textAlign: "left",
  }),
};

function ReminderRow({
  reminder,
  firing,
  onOpen,
  onSwitch,
}: {
  reminder: Reminder;
  firing: Firing | undefined;
  onOpen: () => void;
  onSwitch: (on: boolean) => void;
}) {
  const name = reminderName(reminder);
  const shown = remindable(reminder.kind, useContext(OwnPatternsContext));
  const picked = shown.filter((pattern) => !reminder.skip.includes(pattern.id));
  let detail: string | undefined;
  if (reminder.on) {
    detail = firing
      ? `次は ${firingText(firing.when)}・${firing.pattern.name}`
      : "この先、届くシフトがありません";
  }
  return (
    <div
      className={cx(
        detail === undefined ? listRow.root : listRow.twoLine,
        listRow.pressable
      )}
      data-list-row=""
    >
      <button className={reminderRow.open} onClick={onOpen} type="button">
        <span
          className={cx(
            listRow.label,
            listRow.labelGrow,
            !reminder.on && reminderRow.off
          )}
        >
          <span className={reminderRow.name}>
            {name}
            {/* The shifts it goes off for, when not all of them. */}
            {picked.length < shown.length && (
              <span className={reminderRow.marks}>
                {picked.map((pattern) => (
                  <ShiftMark key={pattern.id} shift={pattern.id} size={16} />
                ))}
                <span className={srOnly}>
                  {picked.map((pattern) => pattern.name).join("・")}だけ
                </span>
              </span>
            )}
          </span>
          {detail && <small>{detail}</small>}
        </span>
      </button>
      <Toggle checked={reminder.on} label={name} onChange={onSwitch} />
    </div>
  );
}

type Editing = { reminder?: Reminder } | undefined;

// Reminders as the clock app lists alarms: each on its own switch, a tap
// to change it, and as many as wanted.
export function RemindersPage({
  schedule,
  onBack,
}: {
  schedule: Schedule;
  onBack: () => void;
}) {
  const reminders = useSettings((state) => state.device.reminders);
  const setReminders = useSettings((state) => state.setReminders);
  const book = usePatterns();
  const { ask, prompt } = usePermissionPrompt();
  const [editing, setEditing] = useState<Editing>();
  const save = (saved: Reminder) => {
    ask(() => {
      setReminders(
        reminders.some((reminder) => reminder.id === saved.id)
          ? reminders.map((reminder) =>
              reminder.id === saved.id ? saved : reminder
            )
          : [...reminders, saved]
      );
      setEditing(undefined);
    });
  };
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="リマインド" />
      <div className={page}>
        <PermissionCard
          onAsk={() => {
            ask();
          }}
        />
        <section>
          <List>
            {reminders.map((reminder) => (
              <ReminderRow
                firing={nextFiring(reminder, schedule, book)}
                key={reminder.id}
                onOpen={() => {
                  setEditing({ reminder });
                }}
                onSwitch={(on) => {
                  setReminders(
                    reminders.map((item) =>
                      item.id === reminder.id ? { ...item, on } : item
                    )
                  );
                  if (on) {
                    ask();
                  }
                }}
                reminder={reminder}
              />
            ))}
            <ListRow
              arrow={
                <Plus aria-hidden="true" className={listRow.add} size={17} />
              }
              label="リマインドを追加"
              onClick={() => {
                setEditing({});
              }}
            />
          </List>
        </section>
      </div>
      <Sheet
        label={editing?.reminder ? "リマインドを編集" : "リマインドを追加"}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(undefined);
          }
        }}
        open={editing !== undefined}
      >
        {editing && (
          <ReminderSheet
            book={book}
            onCancel={() => {
              setEditing(undefined);
            }}
            onDelete={
              editing.reminder &&
              (() => {
                setReminders(
                  reminders.filter((item) => item.id !== editing.reminder?.id)
                );
                setEditing(undefined);
              })
            }
            onSave={save}
            reminder={editing.reminder}
            reminders={reminders}
            schedule={schedule}
          />
        )}
      </Sheet>
      {prompt}
    </>
  );
}

type Draft = {
  kind: ReminderKind;
  time: string;
  minutes: number;
  skip: Shift[];
};

function draftOf(reminder: Reminder | undefined): Draft {
  if (!reminder) {
    return {
      kind: "dayBefore",
      minutes: defaultBeforeMinutes,
      skip: [],
      time: defaultDayBeforeTime,
    };
  }
  return reminder.kind === "dayBefore"
    ? {
        kind: "dayBefore",
        minutes: defaultBeforeMinutes,
        skip: reminder.skip,
        time: reminder.time,
      }
    : {
        kind: "beforeStart",
        minutes: reminder.minutes,
        skip: reminder.skip,
        time: defaultDayBeforeTime,
      };
}

function reminderOf(draft: Draft, id: string, on: boolean): Reminder {
  const { skip } = draft;
  return draft.kind === "dayBefore"
    ? { id, kind: "dayBefore", on, skip, time: draft.time }
    : { id, kind: "beforeStart", minutes: draft.minutes, on, skip };
}

function newId(reminders: Reminder[]) {
  const used = new Set(reminders.map((reminder) => reminder.id));
  let count = reminders.length;
  while (used.has(`reminder-${count}`)) {
    count += 1;
  }
  return `reminder-${count}`;
}

const beforeOptions = beforeStartOptions.map((minutes) => ({
  label: `${beforeText(minutes)}前`,
  value: String(minutes),
}));

const kindOptions: { kind: ReminderKind; name: string }[] = [
  { kind: "dayBefore", name: "前日" },
  { kind: "beforeStart", name: "開始前" },
];

const sheetStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "16px",
});

// When a reminder goes off, with the notification it sends next drawn
// under it, so what arrives is seen before saving.
function ReminderSheet({
  reminder,
  reminders,
  schedule,
  book,
  onSave,
  onCancel,
  onDelete,
}: {
  reminder: Reminder | undefined;
  reminders: Reminder[];
  schedule: Schedule;
  book: PatternBook;
  onSave: (reminder: Reminder) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(reminder));
  const shown = remindable(draft.kind, useContext(OwnPatternsContext));
  const picked = shown.filter((pattern) => !draft.skip.includes(pattern.id));
  const saved = reminderOf(
    draft,
    reminder?.id ?? newId(reminders),
    reminder?.on ?? true
  );
  return (
    <>
      <DecideHeading
        action="保存"
        disabled={picked.length === 0}
        onAction={() => {
          onSave(saved);
        }}
        onCancel={onCancel}
        title={reminder ? "リマインドを編集" : "リマインドを追加"}
      />
      <div className={sheetBody}>
        <div className={sheetStack}>
          <SegmentedControl
            label="いつ"
            onValueChange={(kind) => {
              setDraft({
                ...draft,
                kind: kind === "beforeStart" ? "beforeStart" : "dayBefore",
              });
            }}
            size="compact"
            value={draft.kind}
          >
            {kindOptions.map((option) => (
              <Segment
                key={option.kind}
                label={option.name}
                value={option.kind}
              >
                {option.name}
              </Segment>
            ))}
          </SegmentedControl>
          <section>
            <List>
              {draft.kind === "dayBefore" ? (
                <ListRow
                  control={
                    <TimeField
                      label="時刻"
                      onValueChange={(time) => {
                        setDraft({ ...draft, time });
                      }}
                      value={draft.time}
                    />
                  }
                  label="時刻"
                />
              ) : (
                <ListRow
                  control={
                    <PullDownMenu label={`${beforeText(draft.minutes)}前`}>
                      <MenuPicker
                        onValueChange={(minutes) => {
                          setDraft({ ...draft, minutes: Number(minutes) });
                        }}
                        options={beforeOptions}
                        value={String(draft.minutes)}
                      />
                    </PullDownMenu>
                  }
                  label="シフトの開始"
                />
              )}
            </List>
          </section>
          <Section title="届くシフト">
            <ChipGroup label="届くシフト">
              {shown.map((pattern) => {
                const on = !draft.skip.includes(pattern.id);
                return (
                  <Chip
                    key={pattern.id}
                    onClick={() => {
                      setDraft({
                        ...draft,
                        skip: on
                          ? [...draft.skip, pattern.id]
                          : draft.skip.filter((id) => id !== pattern.id),
                      });
                    }}
                    selected={on}
                  >
                    {on && <Check aria-hidden="true" size={12} />}
                    <ShiftMark shift={pattern.id} size={16} />
                    {pattern.name}
                  </Chip>
                );
              })}
            </ChipGroup>
          </Section>
          <NotificationSample
            book={book}
            reminder={saved}
            schedule={schedule}
          />
          {onDelete && (
            <DestructiveButton onClick={onDelete}>
              このリマインドを削除
            </DestructiveButton>
          )}
        </div>
      </div>
    </>
  );
}

// A notification as the lock screen shows it: the app's icon, its name and
// when, then the title and its line.
const banner = {
  body: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  head: css({
    color: "text.tertiary",
    display: "flex",
    justifyContent: "space-between",
    textStyle: "caption",
  }),
  // Floating on its own ground, as a notification lies over the lock
  // screen, so it is not taken for one more of the rows above it.
  root: css({
    alignItems: "flex-start",
    bg: "background.card",
    borderRadius: "2xl",
    boxShadow: "md",
    display: "flex",
    gap: "12px",
    padding: "12px 16px",
  }),
  text: css({ textStyle: "subheadline" }),
  title: css({ fontWeight: 600, textStyle: "subheadline" }),
};

// The next one the reminder sends; with nothing ahead on the schedule, one
// for tomorrow's first pattern that it would fire for, so the words still
// show.
function NotificationSample({
  reminder,
  schedule,
  book,
}: {
  reminder: Reminder;
  schedule: Schedule;
  book: PatternBook;
}) {
  const icons = useAppIcons();
  const icon = useSettings((state) => state.device.appIcon);
  const next = nextFiring(reminder, schedule, book);
  const pattern =
    next?.pattern ??
    Object.values(book).find(
      (item) =>
        item !== undefined &&
        !reminder.skip.includes(item.id) &&
        (reminder.kind === "dayBefore" || item.time !== undefined)
    );
  if (!pattern) {
    return null;
  }
  const entry = next?.entry ?? { shift: pattern.id };
  const { title, body } = notificationText(reminder, { entry, pattern });
  return (
    <section>
      <h4 className={sampleTitle}>
        {next ? `次の通知・${firingText(next.when)}` : "通知の例"}
      </h4>
      <div aria-label="通知の見本" className={banner.root} role="img">
        <AppIcon size={38} src={icons[icon]} />
        <div className={banner.body}>
          <span className={banner.head}>
            ポチカル
            <span>今</span>
          </span>
          <span className={banner.title}>{title}</span>
          {body && <span className={banner.text}>{body}</span>}
        </div>
      </div>
    </section>
  );
}

const sampleTitle = css({
  color: "text.tertiary",
  fontWeight: 600,
  margin: "0 0 8px 16px",
  textStyle: "subheadline",
});

// The chats of each group, on or off. The same switch is in the group's own
// settings; off, its group chat and one-to-one chats alike stay quiet.
export function ChatNotificationsPage({ onBack }: { onBack: () => void }) {
  const groups = useUser((state) => state.groups);
  const setGroups = useUser((state) => state.setGroups);
  const { ask, prompt } = usePermissionPrompt();
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="チャット" />
      <div className={page}>
        <PermissionCard
          onAsk={() => {
            ask();
          }}
        />
        <Section title="グループ">
          <List>
            {groups.map((group) => (
              <SwitchRow
                checked={!group.muted}
                key={group.id}
                label={<span className={listRow.labelText}>{group.name}</span>}
                leading={
                  <span aria-hidden="true" className={groupMark}>
                    <GroupIcon mark={group.mark} size={16} />
                  </span>
                }
                onChange={(on) => {
                  setGroups(
                    groups.map((item) =>
                      item.id === group.id ? { ...item, muted: !on } : item
                    )
                  );
                  if (on) {
                    ask();
                  }
                }}
              />
            ))}
          </List>
          <Note>個人チャットも、そのグループと一緒にオン・オフされます。</Note>
        </Section>
      </div>
      {prompt}
    </>
  );
}

// The group's mark, as the group settings' row shows it.
const groupMark = css({
  bg: "background.card",
  borderRadius: "sm",
  display: "grid",
  flexShrink: 0,
  height: "28px",
  overflow: "hidden",
  placeItems: "center",
  width: "28px",
});
