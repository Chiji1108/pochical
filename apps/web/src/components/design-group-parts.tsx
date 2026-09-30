import { Camera, ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { useContext, useId, useState } from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";

import { changeOn, patternOn } from "./design-group-data";
import type { GroupMark, Member } from "./design-group-data";
import { Sheet } from "./design-sheet";
import { List, ListRow, srOnly } from "./design-ui";
import type { DayTone } from "./design-week";
import {
  IconWeightContext,
  MarkGlyph,
  useMarkColor,
  markIcons,
  ShiftMarkStyleContext,
} from "./shift-mark";
import type { Look } from "./shift-mark";

// Pieces the group screens share: faces, marks, a group's icon and
// picking a photo.

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// A group's mark in its frame: groups are rounded squares, people circles.
// On the rail the open one's ring sits on top of the mark, inside its
// edge, so a photo does not hide it and it keeps clear of the flag and
// badge. Larger for the join sheet and the mark's own pages, so a photo
// is cropped there as members see it.
export const markFrame = cva({
  base: {
    "&::after": {
      borderRadius: "inherit",
      boxShadow: "inset 0 0 0 2px transparent, inset 0 0 0 4px transparent",
      content: '""',
      inset: 0,
      pointerEvents: "none",
      position: "absolute",
      transition: "box-shadow 0.15s",
    },
    "[aria-current=page] > &": {
      // A thin gap keeps the ring clear of a photo's own colors.
      "&::after": {
        boxShadow:
          "inset 0 0 0 2px token(colors.accent.default), inset 0 0 0 4px token(colors.background.card)",
      },
      bg: "accent.container",
      borderRadius: "md",
    },
    _motionReduce: { transition: "none" },
    bg: "background.card",
    borderRadius: "lg",
    display: "grid",
    fontFamily: EMOJI_FONT,
    fontSize: "22px",
    height: "42px",
    overflow: "hidden",
    placeItems: "center",
    position: "relative",
    transition: "border-radius 0.15s",
    width: "42px",
  },
  variants: {
    size: {
      large: {
        bg: "fill.quaternary",
        borderRadius: "2xl",
        height: "76px",
        width: "76px",
      },
    },
  },
});

// A group mark fills its frame, the same for every member: a photo, an
// emoji, a letter or an icon.
export const markPart = {
  choiceEmoji: css({ fontFamily: EMOJI_FONT, fontSize: "20px" }),
  emoji: css({ fontFamily: EMOJI_FONT, lineHeight: 1 }),
  icon: css({
    display: "grid",
    height: "100%",
    placeItems: "center",
    width: "100%",
  }),
  iconBare: css({ display: "grid", placeItems: "center" }),
  letter: css({
    display: "grid",
    fontWeight: 700,
    height: "100%",
    lineHeight: 1,
    placeItems: "center",
    width: "100%",
  }),
  photo: css({
    display: "grid",
    height: "100%",
    objectFit: "cover",
    placeItems: "center",
    width: "100%",
  }),
};

// A person's round picture, yours in the accent.
const avatar = cva({
  base: {
    "& img": {
      borderRadius: "circle",
      height: "100%",
      objectFit: "cover",
      width: "100%",
    },
    bg: "fill.secondary",
    borderRadius: "circle",
    color: "text.secondary",
    display: "grid",
    flexShrink: 0,
    fontSize: "11px",
    fontWeight: 600,
    height: "24px",
    placeItems: "center",
    width: "24px",
  },
  variants: { me: { true: { bg: "accent.fill", color: "accent.onFill" } } },
});

// A day with no shift, as a small dot.
const emptyMark = css({
  bg: "fill.secondary",
  borderRadius: "circle",
  height: "6px",
  width: "6px",
});

// The group's page: its name, the week everyone works as a card with the
// next day all are off, then its chats and the rows of its settings.
export const hub = {
  chatAll: css({
    bg: "accent.container",
    borderRadius: "sm",
    color: "accent.default",
    display: "grid",
    flexShrink: 0,
    height: "28px",
    placeItems: "center",
    width: "28px",
  }),
  editMark: css({
    display: "grid",
    margin: "4px 0 20px",
    placeItems: "center",
  }),
  header: css({
    alignItems: "center",
    display: "flex",
    gap: "2px",
    paddingTop: "4px",
  }),
  icon: css({
    bg: "fill.quaternary",
    borderRadius: "sm",
    display: "grid",
    flexShrink: 0,
    height: "26px",
    overflow: "hidden",
    placeItems: "center",
    width: "26px",
  }),
  // The rail against the phone's left edge, the flag of the open group at
  // the edge as the chat apps' rails have it, the page beside it.
  layout: css({
    display: "flex",
    flex: 1,
    gap: "8px",
    marginLeft: "calc(-1 * var(--screen-left))",
    minHeight: 0,
  }),
  // A long group name gives way to the controls instead of wrapping.
  name: css({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  profileList: css({ marginTop: "20px" }),
  qr: css({
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    color: "text.primary",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px 16px 20px",
  }),
  qrNote: css({ color: "text.tertiary", textStyle: "caption" }),
  rowIcon: css({ color: "accent.default", flexShrink: 0 }),
  sectionHead: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
  }),
  sectionHeadTitle: css({
    color: "text.tertiary",
    fontWeight: 600,
    margin: "0 0 0 12px",
    textStyle: "footnote",
  }),
  sectionLink: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "accent.default",
    display: "inline-flex",
    fontWeight: 600,
    gap: "1px",
    padding: "0 2px 0 8px",
    textStyle: "footnote",
  }),
  title: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    fontWeight: 700,
    gap: "8px",
    margin: 0,
    minWidth: 0,
    textStyle: "title2",
  }),
  // Only a frame on the screen's own color: the raised ground is white
  // like the screen's in light mode but lifted in dark, where the card
  // would float.
  weekCard: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    color: "text.primary",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 8px 12px 4px",
    textAlign: "left",
    width: "100%",
  }),
  // 次にみんな休み: a row under the week, laid out like 今月のみんな休み.
  weekCardNext: css({
    "& svg": { color: "text.quaternary" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderTop: "1px solid token(colors.separator)",
    color: "text.secondary",
    display: "flex",
    gap: "8px",
    marginTop: "2px",
    padding: "12px 8px 2px 12px",
    textAlign: "left",
    textStyle: "footnote",
    width: "100%",
  }),
  weekCardNextValue: css({
    color: "accent.default",
    fontWeight: 600,
    marginLeft: "auto",
  }),
  weekCardTable: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    padding: 0,
    textAlign: "left",
    width: "100%",
  }),
};

// A profile's photo with a camera badge to change it, as the platforms'
// contact cards have it; the choices open in a sheet.
export const photoPicker = {
  action: css({
    bg: "transparent",
    border: 0,
    color: "accent.default",
    cursor: "pointer",
    fontWeight: 600,
    padding: 0,
    textStyle: "body",
  }),
  badge: css({
    bg: "background.card",
    borderRadius: "circle",
    bottom: "-2px",
    boxShadow: "sm",
    color: "accent.default",
    display: "grid",
    height: "26px",
    placeItems: "center",
    position: "absolute",
    right: "-2px",
    width: "26px",
  }),
  cancel: css({
    bg: "fill.quaternary",
    border: 0,
    borderRadius: "lg",
    color: "text.primary",
    fontWeight: 600,
    marginTop: "12px",
    minHeight: "48px",
    textStyle: "callout",
    width: "100%",
  }),
  edit: css({
    bg: "transparent",
    border: 0,
    cursor: "pointer",
    padding: 0,
    position: "relative",
  }),
  root: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  }),
};

export const memberButton = css({
  background: "transparent",
  border: 0,
  borderRadius: "circle",
  display: "grid",
  padding: 0,
});

// How many are unread, on a chat's row and on the rail's group icon.
export const badge = css({
  bg: "danger.fill",
  borderRadius: "full",
  color: "danger.onFill",
  display: "inline-grid",
  fontSize: "10px",
  fontWeight: 700,
  height: "18px",
  minWidth: "18px",
  padding: "0 4px",
  placeItems: "center",
});

// A date colored as the week's settings say: Sundays and holidays red,
// Saturdays blue.
export const toneColor: Record<DayTone, string | undefined> = {
  holiday: css({ color: "calendar.holiday" }),
  plain: undefined,
  saturday: css({ color: "calendar.saturday" }),
};

// The month in the corner where the dates and names meet.
export const cornerMonth = css({
  color: "text.tertiary",
  fontSize: "11px",
  fontWeight: 600,
});

export const smallWeekday = css({
  fontSize: "9px",
  fontWeight: 400,
  marginLeft: "2px",
});

// A member's own shape for the marks inside, in the viewer's テーマ and
// light or dark, so everyone's colors sit together on one screen. You and
// members without a style of their own use the viewer's shape.
export function MemberLook({
  member,
  children,
}: {
  member: Member;
  children: ReactNode;
}) {
  const theirs = member.style?.look;
  if (!theirs) {
    return <>{children}</>;
  }
  return (
    <ShiftMarkStyleContext value={theirs.style}>
      <IconWeightContext value={theirs.fill ? "duotone" : "regular"}>
        {children}
      </IconWeightContext>
    </ShiftMarkStyleContext>
  );
}

export function MemberMark({
  member,
  look,
  size,
  date,
}: {
  member: Member;
  look: Look;
  size: number;
  // The day it stands for, which brings its 早出 and 残業 with it.
  date?: Date;
}) {
  const change = date && changeOn(member, date);
  return (
    <MemberLook member={member}>
      <ViewerMark
        early={change?.early}
        late={change?.late}
        look={look}
        size={size}
      />
    </MemberLook>
  );
}

function ViewerMark({
  look,
  size,
  early,
  late,
}: {
  look: Look;
  size: number;
  early?: boolean;
  late?: boolean;
}) {
  const style = useContext(ShiftMarkStyleContext);
  return (
    <MarkGlyph
      early={early}
      late={late}
      look={look}
      size={size}
      style={style}
    />
  );
}

export function Avatar({ member, size }: { member: Member; size?: number }) {
  return (
    <PhotoAvatar
      me={member.me}
      name={member.name}
      photo={member.photo}
      size={size}
    />
  );
}

// A round picture, or the first letter of the name without one.
export function PhotoAvatar({
  name,
  photo,
  me = false,
  size = defaultAvatarSize,
}: {
  name: string;
  photo?: string;
  me?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={avatar({ me })}
      // Marks a letter drawn for someone else, for places that ink it.
      data-letter={photo || me ? undefined : ""}
      style={{
        fontSize: Math.max(minLetterSize, Math.round(size * 0.45)),
        height: size,
        width: size,
      }}
    >
      {photo ? (
        <img alt="" height={size} loading="lazy" src={photo} width={size} />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}

const defaultAvatarSize = 24;
// A letter in place of a photo never gets smaller than this.
const minLetterSize = 9;

export function Mark({
  member,
  date,
  size,
}: {
  member: Member;
  date: Date;
  size: number;
}) {
  const item = patternOn(member, date);
  if (!item) {
    return <span aria-hidden="true" className={emptyMark} />;
  }
  return (
    <MemberMark date={date} look={item.look} member={member} size={size} />
  );
}

// A picture with one way in, as in other apps: tapping it or the link
// under it opens a sheet to take or pick a photo, and to go back to the
// usual one or delete it when that applies. Its rows act rather than go
// on, so none has an arrow.
export function PhotoPicker({
  picture,
  label,
  onPhoto,
  onUsual,
  onRemove,
}: {
  picture: ReactNode;
  label: string;
  onPhoto: (photo: string) => void;
  // A group's own picture can go back to the usual one.
  onUsual?: () => void;
  // Shown while there is a picture to delete.
  onRemove?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const cameraId = useId();
  const libraryId = useId();
  const open = () => {
    setSheetOpen(true);
  };
  const close = () => {
    setSheetOpen(false);
  };
  const choose = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      onPhoto(URL.createObjectURL(file));
    }
    close();
  };
  return (
    <div className={photoPicker.root}>
      <input
        accept="image/*"
        capture="user"
        className={srOnly}
        id={cameraId}
        onChange={(event) => {
          choose(event.target.files);
        }}
        type="file"
      />
      <input
        accept="image/*"
        className={srOnly}
        id={libraryId}
        onChange={(event) => {
          choose(event.target.files);
        }}
        type="file"
      />
      <button
        aria-label={label}
        className={photoPicker.edit}
        onClick={open}
        type="button"
      >
        {picture}
        <span aria-hidden="true" className={photoPicker.badge}>
          <Camera size={14} />
        </span>
      </button>
      <button className={photoPicker.action} onClick={open} type="button">
        {label}
      </button>
      <Sheet label={label} onOpenChange={setSheetOpen} open={sheetOpen}>
        <List>
          <ListRow
            htmlFor={cameraId}
            label="写真を撮る"
            leading={
              <>
                <Camera aria-hidden="true" size={20} />
              </>
            }
          />
          <ListRow
            htmlFor={libraryId}
            label="写真を選ぶ"
            leading={
              <>
                <ImageIcon aria-hidden="true" size={20} />
              </>
            }
          />
          {onUsual && (
            <ListRow
              arrow={false}
              onClick={() => {
                onUsual();
                close();
              }}
              label="いつもの写真に戻す"
              leading={
                <>
                  <RotateCcw aria-hidden="true" size={20} />
                </>
              }
            />
          )}
          {onRemove && (
            <ListRow
              arrow={false}
              onClick={() => {
                onRemove();
                close();
              }}
              label="写真を削除"
              leading={
                <>
                  <Trash2 aria-hidden="true" size={20} />
                </>
              }
              danger
            />
          )}
        </List>
        <button className={photoPicker.cancel} onClick={close} type="button">
          キャンセル
        </button>
      </Sheet>
    </div>
  );
}

// Your picture: a photo from the device, or the first letter of your name.
export function PhotoEditor({
  name,
  photo,
  size,
  onUpload,
  onRemove,
  onUsual,
}: {
  name: string;
  photo?: string;
  size: number;
  onUpload: (photo: string) => void;
  onRemove?: () => void;
  onUsual?: () => void;
}) {
  return (
    <PhotoPicker
      label="写真を編集"
      onPhoto={onUpload}
      onRemove={onRemove}
      onUsual={onUsual}
      picture={<PhotoAvatar name={name} photo={photo} size={size} />}
    />
  );
}

// Draws the mark to fill a round frame; styles never change it. `bare`
// leaves out the tinted ground, for choices laid out on their own tiles.
export function GroupIcon({
  mark,
  size,
  bare = false,
}: {
  mark: GroupMark;
  size: number;
  bare?: boolean;
}) {
  const { color, tint } = useMarkColor("color" in mark ? mark.color : 0);
  if (mark.kind === "photo") {
    return (
      <img
        alt=""
        className={markPart.photo}
        height={size}
        loading="lazy"
        src={mark.photo}
        width={size}
      />
    );
  }
  if (mark.kind === "emoji") {
    return (
      <span className={markPart.emoji} style={{ fontSize: size }}>
        {mark.emoji}
      </span>
    );
  }
  if (mark.kind === "letter") {
    return (
      <span
        className={markPart.letter}
        style={{ background: tint, color, fontSize: Math.round(size * 0.6) }}
      >
        {mark.text}
      </span>
    );
  }
  const Icon = markIcons[mark.icon];
  if (!Icon) {
    return null;
  }
  return (
    <span
      className={bare ? markPart.iconBare : markPart.icon}
      style={{ background: bare ? undefined : tint, color }}
    >
      <Icon size={size} weight="duotone" />
    </span>
  );
}
