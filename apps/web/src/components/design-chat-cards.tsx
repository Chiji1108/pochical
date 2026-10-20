import { chatRules } from "@pochical/design/chat";
import { Link2Off, RotateCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { albumRows } from "../lib/chat-messages";
import { dateKey, formatDay } from "../lib/design-days";
import type { Photo } from "../lib/design-sample-photos";
import { MessageActions, useLongPress } from "./design-chat-actions";
import type { LineActions } from "./design-chat-actions";
import { BubbleOutline } from "./design-chat-bubble";
import { blurOf, photoSize } from "./design-chat-photos";
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
import { PhotoViewer } from "./design-photo-viewer";
import type { ViewerPhoto } from "./design-photo-viewer";
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

// A photo of a line of yours going out: on its way up, up, or not, as
// the line could not be sent.
export type PhotoUpload = "sending" | "up" | "failed";

// A line of yours going out, from its photos: still going while any goes
// up, not sent once any could not, and sent (undefined) once all are up.
export type Upload = "sending" | "failed";

export function uploadOfLine(photos: PhotoUpload[]): Upload | undefined {
  if (photos.includes("sending")) {
    return "sending";
  }
  return photos.includes("failed") ? "failed" : undefined;
}

// How long a photo takes to go up in the prototype.
export const uploadMilliseconds = 1600;

// How long someone else's photo takes to come in the prototype, the first
// time it shows; after that it is on the device, as the apps keep it.
const comingMilliseconds = 1200;
const arrivedPhotos = new Set<string>();

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

// One of a chat's photos, swiped through opened large.
// `when` is the day it was sent, as its line says it (今日, 昨日).
export type ChatPhoto = {
  photo: Photo;
  label: string;
  mine: boolean;
  when: string;
};

// A chat's photo opened large: your own, or one come before, shows at
// once; someone else's still coming shows its blur until it comes.
export function viewerPhotoOf({ photo, label, mine }: ChatPhoto): ViewerPhoto {
  const blur =
    photo.thumbHash === undefined
      ? undefined
      : { aspect: photo.width / photo.height, src: blurOf(photo.thumbHash) };
  const here = mine || arrivedPhotos.has(photo.src) || blur === undefined;
  return {
    blur,
    coming: here
      ? undefined
      : {
          after: comingMilliseconds,
          onCome: () => {
            arrivedPhotos.add(photo.src);
          },
        },
    label,
    src: photo.src,
  };
}

// Hands a photo to the system's share sheet, where the browser has one;
// let go of, or not shared, nothing is said.
export async function sharePhoto({ src, label }: ViewerPhoto) {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const file = new File([blob], "photo.jpg", { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: label });
    }
  } catch {
    // Let go of, or not shared.
  }
}

// None but its own, outside a chat.
const noPhotos: ChatPhoto[] = [];

// How far in from a reply's bubble its photo sits (chatStyle.photoInBubble).
const photoInset = 4;

// As wide as a line with a link's page, and an album's photos this far
// apart.
const albumWidth = 240;
const albumGap = 2;

// A photo line in a chat, as the messaging apps show one: one photo in
// its own shape with no bubble, or several as an album, one grid of rows
// (albumRows) as Telegram, WhatsApp and Messages draw one, each photo
// cropped to its cell; a row of several is as tall as a cell is wide, the
// one over two half the grid's width. Answering a line, the quote's
// bubble holds it. A tap on a photo opens it large, with 保存 and 共有,
// swiped through the chat's photos; the line's reactions and menu (with
// 保存 of all its photos) open from a long press, the whole line lifted,
// as on a photo in LINE.
export function PhotoLine({
  photos,
  among = noPhotos,
  mine,
  label,
  quote,
  actions,
  onSave,
  onStop,
  upload,
  fetchFails = false,
}: {
  photos: Photo[];
  // The chat's photos in the order of its lines, these among them.
  among?: ChatPhoto[];
  mine: boolean;
  // Each photo's way up, by its place in the line, while the line is
  // yours going out or not sent; it takes no reactions until sent.
  upload?: PhotoUpload[];
  // × on any of its photos going up, stopping the line.
  onStop?: () => void;
  // Someone else's photo cannot be fetched the first time it comes,
  // showing ↻ to fetch it again, which brings it.
  fetchFails?: boolean;
  // Whose photos they are, for a screen reader and the large view.
  label: string;
  quote?: ReactNode;
  // Its reactions and menu, from a long press.
  actions: LineActions;
  // 保存 in its menu saves every photo of the line, in the large view
  // the one shown.
  onSave?: () => void;
}) {
  const quoted = quote !== undefined;
  // The photo opened large, by its place in the line.
  const [viewing, setViewing] = useState<number>();
  const [single] = photos;
  const alone = single !== undefined && photos.length === 1;
  const tile = (photo: Photo, index: number) => (
    <PhotoTile
      cell={!alone}
      fetchFails={fetchFails}
      inBubble={alone && quoted}
      label={
        alone
          ? `${label}。押すと大きく表示、長押しでリアクションと返信`
          : `${index + 1}枚目を大きく表示`
      }
      mine={mine}
      onOpen={() => {
        setViewing(index);
      }}
      onStop={onStop}
      photo={photo}
      upload={upload?.[index]}
    />
  );
  const rows = albumRows(photos.length);
  const drawn = alone ? (
    tile(single, 0)
  ) : (
    <span
      aria-label={`${photos.length}枚の写真。${label}。長押しでリアクションと返信`}
      className={cx(chatStyle.album, quoted && chatStyle.photoInBubble)}
      role="group"
      style={{ width: albumWidth }}
    >
      {rows.map((count, row) => {
        const start = rows.slice(0, row).reduce((sum, one) => sum + one, 0);
        const width = (albumWidth - albumGap * (count - 1)) / count;
        return (
          <span
            className={chatStyle.albumRow}
            key={start}
            style={{ height: count === 1 ? albumWidth / 2 : width }}
          >
            {photos.slice(start, start + count).map((photo, at) => (
              <span className={chatStyle.albumCell} key={photo.src}>
                {tile(photo, start + at)}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
  const width = alone ? photoSize(single).width : albumWidth;
  const shown = viewing === undefined ? undefined : photos[viewing];
  const listed =
    shown && !among.some((entry) => entry.photo.src === shown.src)
      ? [{ label, mine, photo: shown, when: "" }]
      : among;
  // Apart from the line's long press, which a press in it would reach.
  const viewer = (
    <PhotoViewer
      onOpenChange={(open) => {
        if (!open) {
          setViewing(undefined);
        }
      }}
      onSave={onSave}
      onShare={(one) => {
        sharePhoto(one).catch(() => undefined);
      }}
      open={shown !== undefined}
      photos={listed.map(viewerPhotoOf)}
      start={Math.max(
        listed.findIndex((entry) => entry.photo.src === shown?.src),
        0
      )}
      whole
    />
  );
  const held = (
    <MessageActions
      {...actions}
      disabled={upload !== undefined}
      keyboardOpens={false}
      onSave={onSave}
    >
      {/* The quote is held with the photos, a tap on it its own. */}
      <>
        {quote}
        {drawn}
      </>
    </MessageActions>
  );
  return (
    <>
      {quoted ? (
        // A reply always starts a run.
        <BubbleOutline
          first
          mine={mine}
          style={{ width: width + photoInset * 2 }}
        >
          {held}
        </BubbleOutline>
      ) : (
        <span className={chatStyle.photo} data-part="bubble" style={{ width }}>
          {held}
        </span>
      )}
      {viewer}
    </>
  );
}

// One photo of a line: the button opening it large, over it ↻ for one
// that could not be fetched, or the ring of one going up with × to stop
// its line; in an album, filling its cell of the grid.
function PhotoTile({
  photo,
  mine,
  label,
  onOpen,
  onStop,
  upload,
  fetchFails,
  cell,
  inBubble,
}: {
  photo: Photo;
  mine: boolean;
  label: string;
  onOpen: () => void;
  onStop?: () => void;
  upload?: PhotoUpload;
  fetchFails: boolean;
  cell: boolean;
  inBubble: boolean;
}) {
  // Someone else's photo comes over the network the first time it shows;
  // your own is already on the device.
  const [here, setHere] = useState(() => mine || arrivedPhotos.has(photo.src));
  // Already on the device as it is drawn, it shows at once; one that
  // comes later comes in over its blur.
  const [heldBefore] = useState(here);
  // Drawn, over its blur or grey; one that cannot come stops breathing.
  const [drawn, setDrawn] = useState(false);
  const [missing, setMissing] = useState(false);
  // Fetched again with ↻.
  const [tries, setTries] = useState(0);
  const blur = useMemo(
    () => (photo.thumbHash === undefined ? undefined : blurOf(photo.thumbHash)),
    [photo.thumbHash]
  );
  useEffect(() => {
    const timer = here
      ? undefined
      : setTimeout(() => {
          if (fetchFails && tries === 0) {
            setMissing(true);
            return;
          }
          arrivedPhotos.add(photo.src);
          setHere(true);
        }, comingMilliseconds);
    return () => {
      clearTimeout(timer);
    };
  }, [here, photo.src, fetchFails, tries]);
  const size = photoSize(photo);
  return (
    <span
      className={cx(
        chatStyle.photoFrame({ cell }),
        inBubble && chatStyle.photoInBubble
      )}
    >
      <button
        aria-label={label}
        className={chatStyle.photoButton({ cell })}
        onClick={onOpen}
        type="button"
      >
        <span
          // Its blur while it comes, else its grey breathing.
          className={cx(
            chatStyle.photoPlace({ cell }),
            !drawn && !missing && blur === undefined && chatStyle.photoLoading
          )}
          // Its own width, so its place is kept before the photo is drawn;
          // in an album, its cell's.
          style={{
            aspectRatio: cell ? undefined : `${size.width} / ${size.height}`,
            backgroundImage: blur === undefined ? undefined : `url(${blur})`,
            width: cell ? undefined : size.width,
          }}
        >
          {here && (
            <img
              alt=""
              className={chatStyle.photoImage}
              draggable={false}
              height={size.height}
              onError={() => {
                setMissing(true);
              }}
              onLoad={() => {
                setDrawn(true);
              }}
              ref={(image) => {
                if (heldBefore && image?.complete === true) {
                  setDrawn(true);
                }
              }}
              src={photo.src}
              style={{
                // Over its blur it comes in, as the chat apps fade a photo
                // in over its placeholder.
                animation:
                  drawn && blur !== undefined && !heldBefore
                    ? `fadeIn ${chatRules.photoFadeMs}ms ease-out`
                    : undefined,
                visibility: drawn ? "visible" : "hidden",
              }}
              width={size.width}
            />
          )}
        </span>
      </button>
      {missing && !drawn && (
        <button
          aria-label="写真をもう一度読み込む"
          className={chatStyle.photoRetry({ cell })}
          onClick={() => {
            setMissing(false);
            setHere(false);
            setTries((before) => before + 1);
          }}
          type="button"
        >
          <span className={chatStyle.photoMark}>
            <RotateCw aria-hidden="true" size={20} strokeWidth={2.5} />
          </span>
        </button>
      )}
      {upload === "sending" && (
        <span className={chatStyle.uploading({ cell })}>
          <span className={chatStyle.photoMark} role="status">
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
            {onStop && (
              <button
                aria-label="送信をやめる"
                className={chatStyle.uploadStop}
                onClick={onStop}
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={3} />
              </button>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

// A reaction under a message: the emoji and who chose it, as the members
// are few; past a handful two faces and "+N", as avatar groups in MUI
// and Slack do. A tap adds yours or takes it back, a long press (or a
// right click) lists everyone who chose it.
export function ReactionPill({
  reaction,
  people,
  counted = false,
  onToggle,
}: {
  reaction: Reaction;
  people: Member[];
  // In a chat of two, who chose it needs no face: the emoji alone, and
  // how many once both did.
  counted?: boolean;
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
          data-counted={counted || undefined}
          onClick={() => {
            if (!press.consumeLongPress()) {
              onToggle();
            }
          }}
          type="button"
          {...press.handlers}
        >
          {reaction.emoji}
          {counted ? (
            people.length > 1 && (
              <small className={reactionPill.count}>{people.length}</small>
            )
          ) : (
            <span className={reactionPill.faces}>
              {faces.map((person) => (
                <Avatar
                  key={person.id}
                  member={person}
                  size={reactionFaceSize}
                />
              ))}
            </span>
          )}
          {!counted && crowded && (
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
  count: css({
    color: "text.secondary",
    textStyle: "caption",
  }),
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
    "&[data-counted]": { paddingInlineEnd: "8px" },
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
