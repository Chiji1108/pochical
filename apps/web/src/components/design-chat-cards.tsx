import { chatRules } from "@pochical/design/chat";
import { Link2Off } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { dateKey, formatDay } from "../lib/design-days";
import type { Photo } from "../lib/design-sample-photos";
import { MessageActions, useLongPress } from "./design-chat-actions";
import type { LineActions } from "./design-chat-actions";
import { photoSize } from "./design-chat-photos";
import { PeopleList, PhonePopover } from "./design-chat-popover";
import { chatStyle } from "./design-chat-style";
import { Tag } from "./design-choices";
import { everyoneOff, patternOn } from "./design-group-data";
import type {
  GroupMark,
  LinkPreview,
  Member,
  Reaction,
} from "./design-group-data";
import {
  Avatar,
  cornerMonth,
  GroupIcon,
  Mark,
  smallWeekday,
  toneColor,
} from "./design-group-parts";
import { shortMonthOf } from "./design-month-name";
import { PhotoViewer } from "./design-sheet";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";

// What a chat's line carries besides its words: a link's page, a group's
// invitation, a photo, shared days, and the reactions under it.

// The group an invitation link in a message opens, as the server's
// InviteService gives it, and whether you are in it already.
export type InviteLook = {
  name: string;
  mark: GroupMark;
  members: number;
  joined: boolean;
};

// A photo of yours on its way up, or one that could not be sent.
export type Upload = "sending" | "failed";

// How long a photo takes to go up in the prototype.
export const uploadMilliseconds = 1600;

const linkCard = {
  // Inset in the bubble, on the card's own ground and edge in either
  // bubble (as a shared day's card), as the chat apps set a page apart
  // from the words above it.
  card: css({
    bg: "background.card",
    borderRadius: "md",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
    color: "text.primary",
    display: "flex",
    flexDirection: "column",
    margin: "0 4px 4px",
    overflow: "hidden",
    textDecoration: "none",
    // A long press opens the actions, not the phone's own callout.
    userSelect: "none",
    WebkitTouchCallout: "none",
  }),
  // Pages give their picture at 1.91:1, the size previews are made for.
  image: css({
    aspectRatio: String(chatRules.linkPreviewAspect),
    bg: "fill.tertiary",
    display: "block",
    objectFit: "cover",
    width: "100%",
  }),
  site: css({ color: "text.tertiary", textStyle: "caption2" }),
  title: css({
    fontWeight: 600,
    lineClamp: 2,
    lineHeight: 1.4,
    textStyle: "footnote",
  }),
  words: css({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "8px 12px",
  }),
};

// The page a message's first link leads to, under its words inside the
// bubble, as LINE shows one: its picture, title and site. A tap opens
// it; a long press opens the message's actions, as on its words.
export function LinkCard({
  preview,
  onLongPress,
}: {
  preview: LinkPreview;
  onLongPress: () => void;
}) {
  const press = useLongPress(onLongPress);
  return (
    <a
      className={linkCard.card}
      href={preview.url}
      onClick={(event) => {
        if (press.consumeLongPress()) {
          event.preventDefault();
        }
      }}
      rel="noopener noreferrer"
      target="_blank"
      {...press.handlers}
    >
      {preview.image && (
        <img
          alt=""
          className={linkCard.image}
          draggable={false}
          src={preview.image}
        />
      )}
      <span className={linkCard.words}>
        <span className={linkCard.title}>{preview.title}</span>
        <small className={linkCard.site}>{preview.site}</small>
      </span>
    </a>
  );
}

const inviteCard = {
  // The link card's ground and edge, laid out in a row: the group's mark
  // as the hub shows it, then its name.
  card: css({
    WebkitTouchCallout: "none",
    alignItems: "center",
    bg: "background.card",
    border: 0,
    borderRadius: "md",
    color: "text.primary",
    display: "flex",
    gap: "12px",
    margin: "0 4px 4px",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
    padding: "8px 12px",
    textAlign: "start",
    userSelect: "none",
    width: "calc(100% - 8px)",
  }),
  // The group's mark at the hub's size, on a tint so it stands off the
  // card; a broken link sits in the same frame once the link no longer
  // works.
  mark: css({
    bg: "fill.quaternary",
    borderRadius: "lg",
    color: "text.tertiary",
    display: "grid",
    flexShrink: 0,
    height: "42px",
    overflow: "hidden",
    placeItems: "center",
    width: "42px",
  }),
  words: css({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  name: css({
    fontWeight: 600,
    lineClamp: 1,
    textStyle: "footnote",
  }),
  note: css({ color: "text.tertiary", textStyle: "caption2" }),
  // The member count moves to the next line whole in a narrow bubble.
  count: css({ whiteSpace: "nowrap" }),
};

// An invitation link's group, under the message's words where a page's
// card would be, as LINE and Discord show their own invitations. A tap
// opens it in the app; a long press opens the message's actions. Once the
// link no longer works it says so and opens nothing.
export function InviteCard({
  invite,
  onOpen,
  onLongPress,
}: {
  invite: InviteLook | undefined;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const press = useLongPress(onLongPress);
  if (!invite) {
    return (
      <span className={inviteCard.card} {...press.handlers}>
        <span aria-hidden="true" className={inviteCard.mark}>
          <Link2Off size={20} />
        </span>
        <span className={inviteCard.words}>
          <span className={inviteCard.name}>この招待は使えません</span>
          <small className={inviteCard.note}>グループへの招待</small>
        </span>
      </span>
    );
  }
  return (
    <button
      className={inviteCard.card}
      onClick={() => {
        if (!press.consumeLongPress()) {
          onOpen();
        }
      }}
      type="button"
      {...press.handlers}
    >
      <span aria-hidden="true" className={inviteCard.mark}>
        <GroupIcon mark={invite.mark} size={24} />
      </span>
      <span className={inviteCard.words}>
        <span className={inviteCard.name}>{invite.name}</span>
        <small className={inviteCard.note}>
          {invite.joined ? (
            "参加中のグループ"
          ) : (
            <>
              グループへの招待・
              <span className={inviteCard.count}>{invite.members}人</span>
            </>
          )}
        </small>
      </span>
    </button>
  );
}

// A photo in a chat, as the messaging apps show one: in its own shape
// with no bubble, unless it answers a line, when the quote's bubble holds
// it. A tap opens it large, with 保存; its reactions and menu (with 保存
// too) open from a long press, as on a photo in LINE.
export function PhotoLine({
  photo,
  label,
  quote,
  actions,
  onSave,
  upload,
}: {
  photo: Photo;
  // Still going up, or not sent; neither takes reactions yet.
  upload?: Upload;
  // Whose photo it is, for a screen reader and the large view.
  label: string;
  quote?: ReactNode;
  actions: LineActions;
  onSave: () => void;
}) {
  const [viewing, setViewing] = useState(false);
  const size = photoSize(photo);
  const quoted = quote !== undefined;
  return (
    <>
      <span
        className={
          quoted ? chatStyle.bubble({ mine: actions.mine }) : chatStyle.photo
        }
        data-part="bubble"
        style={{ width: size.width }}
      >
        {quote}
        <MessageActions
          {...actions}
          disabled={upload !== undefined}
          keyboardOpens={false}
          onSave={onSave}
        >
          <button
            aria-label={`${label}。押すと大きく表示、長押しでリアクションと返信`}
            className={chatStyle.photoButton}
            onClick={() => {
              setViewing(true);
            }}
            type="button"
          >
            <img
              alt=""
              className={chatStyle.photoImage({ quoted })}
              draggable={false}
              height={size.height}
              src={photo.src}
              width={size.width}
            />
            {upload === "sending" && (
              <span className={chatStyle.uploading} role="status">
                <svg
                  aria-hidden="true"
                  className={chatStyle.uploadRing}
                  viewBox="0 0 36 36"
                >
                  <circle cx="18" cy="18" r="15" />
                  <circle
                    cx="18"
                    cy="18"
                    pathLength="100"
                    r="15"
                    style={{ animationDuration: `${uploadMilliseconds}ms` }}
                  />
                </svg>
                <span className={srOnly}>送信中</span>
              </span>
            )}
          </button>
        </MessageActions>
      </span>
      <PhotoViewer
        label={label}
        onOpenChange={setViewing}
        onSave={onSave}
        open={viewing}
        photo={photo.src}
        whole
      />
    </>
  );
}

// A reaction under a message: the emoji and who chose it, as the members
// are few; past a handful two faces and "+N", as avatar groups in MUI
// and Slack do. A tap adds yours or takes it back, a long press (or a
// right click) lists everyone who chose it.
export function ReactionPill({
  reaction,
  people,
  onToggle,
}: {
  reaction: Reaction;
  people: Member[];
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => {
    setOpen(true);
  });
  const crowded = people.length > maxReactionFaces;
  const faces = crowded ? people.slice(0, maxReactionFaces - 1) : people;
  return (
    <PhonePopover
      anchor={
        <button
          aria-label={`${reaction.emoji} ${people.map((person) => person.name).join("、")}`}
          aria-pressed={reaction.by.includes("me")}
          className={reactionPill.pill}
          onClick={() => {
            if (!press.consumeLongPress()) {
              onToggle();
            }
          }}
          type="button"
          {...press.handlers}
        >
          {reaction.emoji}
          <span className={reactionPill.faces}>
            {faces.map((person) => (
              <Avatar key={person.id} member={person} size={reactionFaceSize} />
            ))}
          </span>
          {crowded && (
            <small className={reactionPill.more}>
              +{people.length - faces.length}
            </small>
          )}
        </button>
      }
      label={`${reaction.emoji}を付けた人`}
      onOpenChange={setOpen}
      open={open}
      positioning={{ gutter: 6, placement: "top" }}
    >
      <span className={reactionPill.listEmoji}>{reaction.emoji}</span>
      <PeopleList people={people} />
    </PhonePopover>
  );
}

const reactionPill = {
  // The faces overlap a little, each ringed in the pill's own color. A
  // letter in place of a photo is inked dark with the letter cut out in
  // the pill's color, so its round shows on the pill as a photo would.
  faces: css({
    "& > *": { boxShadow: "0 0 0 1.5px var(--reaction-bg)" },
    "& > [data-letter]": {
      bg: "text.tertiary",
      color: "var(--reaction-bg)",
      fontWeight: 700,
    },
    // Just enough to read as one group without cutting into a letter.
    "& > * + *": { marginInlineStart: "-2px" },
    display: "flex",
  }),
  listEmoji: css({
    display: "block",
    padding: "4px 12px",
    textStyle: "title2",
  }),
  more: css({
    color: "text.tertiary",
    paddingInlineEnd: "4px",
    textStyle: "caption",
  }),
  pill: css({
    "&[aria-pressed=true]": {
      "--reaction-bg": "token(colors.accent.container)",
      borderColor: "accent.default",
    },
    "--reaction-bg": "token(colors.background.card)",
    alignItems: "center",
    bg: "var(--reaction-bg)",
    border: "1px solid token(colors.border.default)",
    borderRadius: "full",
    display: "inline-flex",
    gap: "4px",
    height: "24px",
    padding: "0 2px 0 8px",
    textStyle: "subheadline",
    // A long press opens the list, not the phone's own callout or a
    // text selection.
    userSelect: "none",
    WebkitTouchCallout: "none",
  }),
};

// Shared days in a message: one day spreads its people out; several make
// a small table, a row per day.
const dayCard = {
  card: cva({
    base: {
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "lg",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      // Never wider than its bubble, so the time beside it stays in view.
      maxWidth: "100%",
      // One day's card is as wide with みんな休み as without, and for any
      // date: room for 12月27日(日) and the tag, so shared days stacked
      // in a chat line up. More people than that holds widen it.
      minWidth: "184px",
      padding: "12px 12px",
    },
    variants: {
      many: { true: { gap: 0, minWidth: 0, padding: "8px 8px" } },
    },
  }),
  cell: cva({
    base: {
      borderRadius: "sm",
      display: "grid",
      height: "24px",
      placeItems: "center",
      width: "100%",
    },
    // The cell itself is the tile; the tables' inset tile, positioned
    // against the whole screen here, washed it all in the tile's color.
    variants: { off: { true: { bg: "accent.container" } } },
  }),
  date: css({
    bg: "transparent",
    border: 0,
    fontSize: "11px",
    fontWeight: 600,
    justifySelf: "start",
    padding: "0 0 0 4px",
  }),
  // A day over its column when the table turns; the weekday under it,
  // and a day everyone is off on the band's color.
  dayHead: cva({
    base: {
      alignItems: "center",
      borderRadius: "sm",
      display: "flex",
      flexDirection: "column",
      fontSize: "11px",
      fontWeight: 600,
      lineHeight: 1.2,
      padding: "2px 0",
      width: "100%",
    },
    variants: { together: { true: { bg: "accent.container" } } },
  }),
  dayHeadWeekday: css({ fontSize: "9px", fontWeight: 400 }),
  head: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "text.primary",
    display: "flex",
    fontSize: "12px",
    fontWeight: 600,
    gap: "8px",
    padding: 0,
    textAlign: "left",
  }),
  // The people share the card's width in even columns, a few spread
  // across it; many wrap onto more lines in the same columns rather than
  // widen the card.
  people: css({ display: "grid", rowGap: "8px" }),
  person: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    flexDirection: "column",
    fontSize: "9px",
    gap: "4px",
  }),
  rest: css({
    color: "text.tertiary",
    padding: "4px 4px 0",
    textAlign: "end",
    textStyle: "caption2",
  }),
  row: cva({
    base: {
      alignItems: "center",
      borderRadius: "sm",
      display: "grid",
      gap: "4px",
      justifyItems: "center",
      minHeight: "28px",
    },
    variants: {
      names: { true: { minHeight: "30px" } },
      together: { true: { bg: "accent.container" } },
    },
  }),
};

// Shared dates with each person's shift. One day spreads out, wrapping
// when the people are many; several become a small table, a row per day,
// or a row per person when the people don't fit across. Either keeps to
// a week of days, so a month shared does not fill the chat; the rest are
// left to シフト表で見る under it.
export function DayCard({
  days,
  members,
}: {
  days: Date[];
  members: Member[];
}) {
  const weekTools = useWeek();
  const [first] = days;
  if (days.length === 1 && first) {
    const together = everyoneOff(members, first);
    return (
      <span className={dayCard.card()} data-part="day-card">
        <span className={dayCard.head}>
          {formatDay(first)}
          {together && (
            <Tag size="sm" tone="accent">
              みんな休み
            </Tag>
          )}
        </span>
        <span
          className={dayCard.people}
          style={{
            gridTemplateColumns: `repeat(${Math.min(members.length, chatRules.dayCardColumns)}, minmax(36px, 1fr))`,
          }}
        >
          {members.map((member) => (
            <span className={dayCard.person} key={member.id}>
              <Avatar member={member} />
              <Mark date={first} member={member} size={16} />
              <small>{patternOn(member, first)?.name ?? "未入力"}</small>
            </span>
          ))}
        </span>
      </span>
    );
  }
  if (members.length > chatRules.dayCardColumns) {
    return <DayCardByPerson days={days} members={members} />;
  }
  const columns = {
    gridTemplateColumns: `44px repeat(${members.length}, 26px)`,
  };
  const shown = days.slice(0, chatRules.dayCardRows);
  const rest = days.length - shown.length;
  return (
    <span className={dayCard.card({ many: true })} data-part="day-card">
      <span className={dayCard.row({ names: true })} style={columns}>
        <span />
        {members.map((member) => (
          <span key={member.id}>
            <Avatar member={member} />
            <span className={srOnly}>{member.name}</span>
          </span>
        ))}
      </span>
      {shown.map((date) => (
        <span
          className={dayCard.row({ together: everyoneOff(members, date) })}
          key={dateKey(date)}
          style={columns}
        >
          <span
            className={cx(dayCard.date, toneColor[weekTools.dateTone(date)])}
          >
            {date.getMonth() + 1}/{date.getDate()}
            <small className={smallWeekday}>
              {weekTools.weekdayName(date.getDay())}
            </small>
          </span>
          {members.map((member) => (
            <span
              className={dayCard.cell({
                off: patternOn(member, date)?.off === true,
              })}
              key={member.id}
            >
              <Mark date={date} member={member} size={15} />
              <span className={srOnly}>
                {member.name}：{patternOn(member, date)?.name ?? "未入力"}
              </span>
            </span>
          ))}
        </span>
      ))}
      {rest > 0 && <small className={dayCard.rest}>ほか{rest}日</small>}
    </span>
  );
}

// Several days for more people than fit across: the table turns, a row
// per person and a column per day, as the people can't be fewer but the
// days can. Days past what fits are left to シフト表で見る.
function DayCardByPerson({
  days,
  members,
}: {
  days: Date[];
  members: Member[];
}) {
  const weekTools = useWeek();
  const shown = days.slice(0, chatRules.dayCardColumns);
  const rest = days.length - shown.length;
  const columns = {
    gridTemplateColumns: `26px repeat(${shown.length}, 28px)`,
  };
  return (
    <span className={dayCard.card({ many: true })} data-part="day-card">
      <span className={dayCard.row({ names: true })} style={columns}>
        {/* As in the shift table, the month once in the corner and the
            days by number, with a new month's where it turns. */}
        <span className={cornerMonth}>
          {shown[0] ? shortMonthOf(shown[0], weekTools.english) : ""}
        </span>
        {shown.map((date, index) => (
          <span
            className={cx(
              dayCard.dayHead({ together: everyoneOff(members, date) }),
              toneColor[weekTools.dateTone(date)]
            )}
            key={dateKey(date)}
          >
            {index > 0 && date.getMonth() !== shown[index - 1]?.getMonth()
              ? `${date.getMonth() + 1}/${date.getDate()}`
              : date.getDate()}
            <small className={dayCard.dayHeadWeekday}>
              {weekTools.weekdayName(date.getDay())}
            </small>
          </span>
        ))}
      </span>
      {members.map((member) => (
        <span className={dayCard.row()} key={member.id} style={columns}>
          <span>
            <Avatar member={member} />
            <span className={srOnly}>{member.name}</span>
          </span>
          {shown.map((date) => (
            <span
              className={dayCard.cell({
                off: patternOn(member, date)?.off === true,
              })}
              key={dateKey(date)}
            >
              <Mark date={date} member={member} size={15} />
              <span className={srOnly}>
                {formatDay(date)}：{patternOn(member, date)?.name ?? "未入力"}
              </span>
            </span>
          ))}
        </span>
      ))}
      {rest > 0 && <small className={dayCard.rest}>ほか{rest}日</small>}
    </span>
  );
}

const reactionFaceSize = 18;

// Past this many, a reaction shows two faces and "+N".
const maxReactionFaces = 3;
