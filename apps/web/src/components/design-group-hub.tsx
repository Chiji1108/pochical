import {
  Ban,
  ChevronRight,
  Ellipsis,
  Flag,
  MessageCircle,
  MessagesSquare,
  Plus,
  ScanLine,
  Settings2,
  UserPlus,
} from "lucide-react";
import { useContext, useState } from "react";
import { css, cx } from "styled-system/css";

import { addDays, dayMilliseconds, formatDay } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { useUser } from "../lib/design-user-store";
import { Tag } from "./design-choices";
import { ChatRow } from "./design-group-chat";
import { everyoneOff, groupChat, isMuted } from "./design-group-data";
import type { Chat, Group, Member } from "./design-group-data";
import {
  Avatar,
  GroupIcon,
  badge,
  hub,
  markFrame,
  memberButton,
} from "./design-group-parts";
import { misaki, mother, partner } from "./design-group-samples";
import { MemberTable } from "./design-group-shifts-weeks";
import { List, ListRow } from "./design-list";
import { IconMenu, MenuItem, MenuSeparator } from "./design-menu";
import {
  ConfirmDialog,
  PhotoViewer,
  Sheet,
  SheetHeading,
  sheetBody,
} from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  BarGroup,
  Button,
  DestructiveButton,
  IconButton,
  Note,
  Section,
} from "./design-ui";
import { useWeek } from "./design-week";

// A group's hub: the rail of groups at its side, this week's shifts and
// the chats, the group without members yet, and a member's sheet.

// A made-up group for the no-group screen's picture of sharing.
const sampleGroup = (): Group => ({
  id: "sample",
  mark: { emoji: "🏠", kind: "emoji" },
  members: [partner, mother, misaki()],
  name: "サンプル",
});

// No group yet: a sample week of shared shifts, then 作成 and QR参加, as
// the old app showed it.
export function NoGroups({
  onNew,
  onScan,
}: {
  onNew: () => void;
  onScan: () => void;
}) {
  const weekTools = useWeek();
  return (
    <div className={noGroups.root}>
      <h3 className={noGroups.title}>グループでシフトを共有できます</h3>
      <div
        aria-label="サンプルの共有シフト表"
        className={hub.weekCard}
        role="img"
      >
        <MemberTable
          compact
          dates={weekTools.weekDates(designToday)}
          group={sampleGroup()}
          month={designToday}
        />
      </div>
      <p className={noGroups.note}>
        家族や友達とシフトを見せ合って、休みが重なる日がすぐ分かります。
      </p>
      <div className={noGroups.actions}>
        <Button onClick={onNew}>
          <Plus aria-hidden="true" size={18} />
          グループを作成
        </Button>
        <Button onClick={onScan} variant="quiet">
          <ScanLine aria-hidden="true" size={17} />
          QRコードで参加
        </Button>
      </div>
    </div>
  );
}

const noGroups = {
  actions: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  note: css({
    color: "text.tertiary",
    lineHeight: 1.6,
    margin: 0,
    textAlign: "center",
    textStyle: "subheadline",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    margin: "auto 0",
    paddingBlock: "24px",
  }),
  title: css({
    fontWeight: 700,
    margin: 0,
    textAlign: "center",
    textStyle: "title2",
  }),
};

// The groups down the left edge, as the messaging apps' server rails: a
// mark each, the open one ringed and flagged at the edge, then the ways to
// start or join one.
const rail = {
  action: css({
    bg: "background.card",
    border: 0,
    borderRadius: "circle",
    color: "accent.default",
    display: "grid",
    height: "44px",
    placeItems: "center",
    width: "44px",
  }),
  badge: css({
    bottom: 0,
    boxShadow: "0 0 0 2px token(colors.fill.quaternary)",
    position: "absolute",
    right: "3px",
  }),
  divider: css({
    bg: "border.default",
    borderRadius: "full",
    height: "2px",
    width: "28px",
  }),
  // The flag at the edge grows by the open group.
  item: css({
    "&::before": {
      _motionReduce: { transition: "none" },
      bg: "accent.default",
      borderRadius: "0 token(radii.xs) token(radii.xs) 0",
      content: '""',
      height: 0,
      left: 0,
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      transition: "height 0.15s",
      width: "4px",
    },
    "&[aria-current=page]::before": { height: "32px" },
    bg: "transparent",
    border: 0,
    display: "grid",
    height: "48px",
    padding: 0,
    placeItems: "center",
    position: "relative",
    width: "60px",
  }),
  // Beside the page and like it, it runs on to the screen's foot and
  // scrolls when the groups outgrow it, so only its top is rounded. It
  // fades out just over the tab bar, as Discord's rail does over its own
  // panel, and what scrolls fades with it.
  root: css({
    "& > *": { flexShrink: 0 },
    alignItems: "center",
    bg: "fill.quaternary",
    borderRadius: "0 token(radii.xl) 0 0",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "12px",
    maskImage:
      "linear-gradient(to bottom, #000 calc(100% - var(--tab-bar-bottom) - 128px), transparent calc(100% - var(--tab-bar-bottom) - 56px))",
    overflowY: "auto",
    // The last of many groups can rise clear of the fade.
    padding: "12px 0 calc(var(--tab-bar-bottom) + 128px)",
    width: "60px",
  }),
};

// Groups down the side, like chat apps with many rooms. The count is
// unread messages across the group's chats.
export function GroupRail({
  groups,
  selected,
  unreadOf,
  onSelect,
  onNew,
  onScan,
}: {
  groups: Omit<Group, "members">[];
  selected: string;
  unreadOf: (id: string) => number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onScan: () => void;
}) {
  return (
    <nav aria-label="グループ" className={rail.root} data-screen-rail="">
      {groups.map((group) => {
        const unread = unreadOf(group.id);
        return (
          <button
            aria-current={group.id === selected ? "page" : undefined}
            aria-label={`${group.name}${unread > 0 ? `、未読${unread}件` : ""}`}
            className={rail.item}
            key={group.id}
            onClick={() => {
              onSelect(group.id);
            }}
            type="button"
          >
            <span aria-hidden="true" className={markFrame()}>
              <GroupIcon mark={group.mark} size={25} />
            </span>
            {unread > 0 && (
              <span aria-hidden="true" className={cx(badge, rail.badge)}>
                {unread}
              </span>
            )}
          </button>
        );
      })}
      <span aria-hidden="true" className={rail.divider} />
      <button
        aria-label="グループを作る"
        className={rail.action}
        onClick={onNew}
        type="button"
      >
        <Plus aria-hidden="true" size={20} />
      </button>
      <button
        aria-label="QRコードで参加"
        className={rail.action}
        onClick={onScan}
        type="button"
      >
        <ScanLine aria-hidden="true" size={19} />
      </button>
    </nav>
  );
}

// The group at a glance: this week for everyone, then its chats.
export function GroupHub({
  group,
  chatOf,
  onShifts,
  onShiftsDay,
  onChat,
  onInvite,
  onSettings,
}: {
  group: Group;
  chatOf: (chatId: string) => Chat;
  onShifts: () => void;
  // Opens the month with that day picked, as if pressed in the table.
  onShiftsDay: (date: Date) => void;
  onChat: (chatId: string) => void;
  onInvite: () => void;
  onSettings: () => void;
}) {
  const weekTools = useWeek();
  const week = weekTools.weekDates(designToday);
  const nextOff = Array.from({ length: 60 }, (_, index) =>
    addDays(designToday, index)
  ).find(
    (date) => group.members.length > 1 && everyoneOff(group.members, date)
  );
  const blocked = useUser((state) => state.blocked);
  // Blocked members have no one-to-one chat with you.
  const others = group.members.filter(
    (member) => !member.me && !blocked.includes(member.id)
  );
  // Members you already have a one-to-one chat with, in this group.
  const talking = others.filter(
    (member) => chatOf(member.id).messages.length > 0
  );
  const [picking, setPicking] = useState(false);
  return (
    <>
      <header className={hub.header}>
        <h3 className={hub.title}>
          <span aria-hidden="true" className={hub.icon}>
            <GroupIcon mark={group.mark} size={16} />
          </span>
          <span className={hub.name}>{group.name}</span>
        </h3>
        <BarGroup>
          <IconButton label="メンバーを招待" onClick={onInvite}>
            <UserPlus aria-hidden="true" size={18} />
          </IconButton>
          <IconButton label="グループの設定" onClick={onSettings}>
            <Settings2 aria-hidden="true" size={18} />
          </IconButton>
        </BarGroup>
      </header>
      <Section
        title="シフト"
        trailing={
          <button className={hub.sectionLink} onClick={onShifts} type="button">
            月で見る
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        }
      >
        <div className={hub.weekCard}>
          <button
            aria-label="今週のみんなのシフト。押すと月で見られます"
            className={hub.weekCardTable}
            onClick={onShifts}
            type="button"
          >
            <MemberTable
              compact
              dates={week}
              group={group}
              month={designToday}
            />
          </button>
          {nextOff ? (
            <button
              className={hub.weekCardNext}
              onClick={() => {
                onShiftsDay(nextOff);
              }}
              type="button"
            >
              <span>次のみんな休み</span>
              <span className={hub.weekCardNextValue}>
                {formatDay(nextOff)}・{daysFromToday(nextOff)}
              </span>
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          ) : (
            <div className={hub.weekCardNext}>
              <span>次のみんな休み</span>
              <span className={hub.weekCardNextNone}>なし</span>
            </div>
          )}
        </div>
      </Section>
      <Section title="チャット">
        <List>
          <ChatRow
            chat={chatOf(groupChat)}
            icon={
              <span className={hub.chatAll}>
                <MessagesSquare aria-hidden="true" size={15} />
              </span>
            }
            group={group}
            label="全体チャット"
            muted={isMuted(group, groupChat)}
            onOpen={() => {
              onChat(groupChat);
            }}
          />
          {talking.map((member) => (
            <ChatRow
              chat={chatOf(member.id)}
              icon={<Avatar member={member} size={28} />}
              key={member.id}
              group={group}
              label={member.name}
              muted={isMuted(group, member.id)}
              onOpen={() => {
                onChat(member.id);
              }}
            />
          ))}
          {others.length > talking.length && (
            <ListRow
              label="個人チャットを始める"
              leading={
                <>
                  <Plus aria-hidden="true" className={hub.rowIcon} size={18} />
                </>
              }
              onClick={() => {
                setPicking(true);
              }}
            />
          )}
        </List>
        {group.members.length <= 1 && (
          <Note>メンバーを招待すると、1対1でも話せます。</Note>
        )}
        <Sheet
          label="個人チャットを始める"
          onOpenChange={setPicking}
          open={picking}
        >
          <SheetHeading
            onClose={() => {
              setPicking(false);
            }}
            title="個人チャットを始める"
          />
          <div className={sheetBody}>
            <section>
              <List>
                {others
                  .filter((member) => !talking.includes(member))
                  .map((member) => (
                    <ListRow
                      key={member.id}
                      label={member.name}
                      truncate
                      leading={
                        <>
                          <Avatar member={member} size={28} />
                        </>
                      }
                      onClick={() => {
                        setPicking(false);
                        onChat(member.id);
                      }}
                    />
                  ))}
              </List>
              <Note>{group.name}での名前とアイコンで話します。</Note>
            </section>
          </div>
        </Sheet>
      </Section>
    </>
  );
}

// A member as this group knows them, and a way to talk one to one. The
// one-to-one chat belongs to the group, so both of you keep this group's
// names and pictures there.
export function MemberSheet({
  member,
  group,
  onClose,
  onMessage,
  onRemove,
  onReport,
}: {
  member?: Member;
  group: Omit<Group, "members">;
  onClose: () => void;
  onMessage?: (member: Member) => void;
  // Takes them out of the group; any member may, as in LINE's groups.
  onRemove?: (member: Member) => void;
  // Tells Pochical about them; the sheet closes for the reasons'.
  onReport?: (member: Member) => void;
}) {
  const [viewing, setViewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const blocked = useUser((state) => state.blocked);
  const setBlocked = useUser((state) => state.setBlocked);
  const toast = useContext(ToastContext);
  const isBlocked = member !== undefined && blocked.includes(member.id);
  return (
    <Sheet
      label={member?.name ?? ""}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={member !== undefined}
    >
      {member && (
        <>
          {/* Blocking and reporting, rarely used, wait in ⋯ rather than
              in red under someone's face, as in Discord's and Telegram's
              profiles. Blocking hides their messages and one-to-one chat
              from you in every group you share; their shifts stay, as the
              group is for shifts: leaving or taking them out is the step
              for that. Reporting tells Pochical. Neither is shown to them. */}
          <SheetHeading
            menu={
              <IconMenu
                icon={<Ellipsis aria-hidden="true" size={20} />}
                label={`${member.name}のメニュー`}
              >
                {isBlocked ? (
                  <MenuItem
                    icon={<Ban aria-hidden="true" size={18} />}
                    onSelect={() => {
                      setBlocked(blocked.filter((id) => id !== member.id));
                      toast(`${member.name}のブロックを解除しました`);
                    }}
                    value="unblock"
                  >
                    ブロックを解除
                  </MenuItem>
                ) : (
                  <MenuItem
                    icon={<Ban aria-hidden="true" size={18} />}
                    onSelect={() => {
                      setBlocking(true);
                    }}
                    value="block"
                  >
                    ブロック
                  </MenuItem>
                )}
                {onReport && (
                  <>
                    <MenuSeparator />
                    <MenuItem
                      danger
                      icon={<Flag aria-hidden="true" size={18} />}
                      onSelect={() => {
                        onReport(member);
                      }}
                      value="report"
                    >
                      通報
                    </MenuItem>
                  </>
                )}
              </IconMenu>
            }
            onClose={onClose}
            title=""
          />
          <div className={profileStyle.root}>
            {member.photo ? (
              <button
                aria-label={`${member.name}の写真を大きく見る`}
                className={memberButton}
                onClick={() => {
                  setViewing(true);
                }}
                type="button"
              >
                <Avatar member={member} size={72} />
              </button>
            ) : (
              <Avatar member={member} size={72} />
            )}
            <h3 className={profileStyle.name}>{member.name}</h3>
            {/* With the actions in ⋯, the face says it is blocked. */}
            {isBlocked && <Tag size="sm">ブロック中</Tag>}
            <span className={profileStyle.where}>
              <span aria-hidden="true" className={hub.icon}>
                <GroupIcon mark={group.mark} size={14} />
              </span>
              {group.name}でのプロフィール
            </span>
            {onMessage && !isBlocked && (
              <Button
                className={profileStyle.message}
                onClick={() => {
                  onMessage(member);
                }}
              >
                <MessageCircle aria-hidden="true" size={18} />
                メッセージを送る
              </Button>
            )}
          </div>
          {onRemove && (
            <DestructiveButton
              onClick={() => {
                setConfirming(true);
              }}
            >
              このグループから外す
            </DestructiveButton>
          )}
        </>
      )}
      {member && blocking && (
        <ConfirmDialog
          action="ブロック"
          message="メッセージが表示されなくなり、個人チャットも届かなくなります。ブロックしたことは相手に知らされません。"
          onCancel={() => {
            setBlocking(false);
          }}
          onConfirm={() => {
            setBlocking(false);
            setBlocked([...blocked, member.id]);
            toast(`${member.name}をブロックしました`);
          }}
          title={`${member.name}をブロックしますか？`}
        />
      )}
      {member && onRemove && confirming && (
        <ConfirmDialog
          action="外す"
          message={`${member.name}は「${group.name}」のシフトとチャットを見られなくなります。外したことは全体チャットに表示されます。`}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            onRemove(member);
          }}
          title={`${member.name}を外しますか？`}
        />
      )}
      {member?.photo && (
        <PhotoViewer
          label={`${member.name}の写真`}
          onOpenChange={setViewing}
          open={viewing}
          photo={member.photo}
        />
      )}
    </Sheet>
  );
}

const profileStyle = {
  message: css({ alignSelf: "stretch", marginTop: "8px" }),
  name: css({ fontWeight: 700, margin: 0, textStyle: "title2" }),
  root: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "0 16px 16px",
  }),
  where: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    gap: "8px",
    textStyle: "footnote",
  }),
};

// How far a day is from today, the way people say it: 今日, 明日, 3日後.
function daysFromToday(date: Date) {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(
        designToday.getFullYear(),
        designToday.getMonth(),
        designToday.getDate()
      ).getTime()) /
      dayMilliseconds
  );
  if (days === 0) {
    return "今日";
  }
  if (days === 1) {
    return "明日";
  }
  return `${days}日後`;
}
