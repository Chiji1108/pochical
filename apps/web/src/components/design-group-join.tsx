import {
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ImageIcon,
  QrCode,
  Send,
  Share,
  X,
} from "lucide-react";
import { useContext, useState } from "react";
import { css, cx } from "styled-system/css";

import { useUser } from "../lib/design-user-store";
import { useLongPress } from "./design-chat-actions";
import { PhonePopover, PopoverMenuItem } from "./design-chat-popover";
import { withNotice } from "./design-group-data";
import type {
  Group,
  GroupMark,
  GroupProfile,
  GroupSummary,
  Profile,
} from "./design-group-data";
import { GroupIcon, PhotoAvatar, hub, markFrame } from "./design-group-parts";
import { cousins, partner } from "./design-group-samples";
import {
  GroupProfilePage,
  GroupProfileRow,
  profileIn,
} from "./design-group-settings";
import { PageHeader } from "./design-header";
import { List, ListRow } from "./design-list";
import { ConfirmDialog, Sheet, SheetHeading, sheetBody } from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  Button,
  IconButton,
  Note,
  Screen,
  ScreenScroll,
  Section,
} from "./design-ui";

// Joining a group: reading a QR code, the invitation someone opens, and
// inviting others.

// Reading a group's QR code, as the camera shows it. The prototype has no
// camera: pressing the frame, or 写真から読み取る, reads the sample code.
export function ScanPage({
  result,
  onClose,
  onRead,
}: {
  result: ScanResult;
  onClose: () => void;
  onRead: () => void;
}) {
  const [expired, setExpired] = useState(false);
  const toast = useContext(ToastContext);
  const read = (from: "camera" | "photo") => {
    if (result === "invite") {
      onRead();
      return;
    }
    // An invitation that no longer works needs a new code from whoever
    // sent it, so that stays on screen; the rest just need another try.
    if (result === "expired") {
      setExpired(true);
      return;
    }
    // The camera only reports codes it finds; with none in view it keeps
    // looking, as camera apps do.
    if (result === "none" && from === "camera") {
      return;
    }
    toast(scanRetries[result], "problem");
  };
  return (
    <Screen
      className={scan.root}
      data-toast-above=""
      fullBleed
      statusBar="light"
    >
      <header className={scan.header}>
        <button
          aria-label="閉じる"
          className={scan.close}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
        <h3 className={scan.title}>QRコードで参加</h3>
      </header>
      {expired && (
        <p className={scan.problem} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          この招待は使えなくなっています。招待した人に、新しいQRコードを見せてもらってください。
        </p>
      )}
      <div className={scan.body}>
        <button
          aria-label="QRコードを読み取る（デモ）"
          className={scan.frame}
          onClick={() => {
            read("camera");
          }}
          type="button"
        >
          <span aria-hidden="true" className={scan.corners} />
        </button>
        <p className={scan.hint}>
          グループの招待QRコードを枠に合わせてください
        </p>
        <small className={scan.demo}>デモでは枠を押すと読み取れます</small>
      </div>
      <button
        className={scan.library}
        onClick={() => {
          read("photo");
        }}
        type="button"
      >
        <ImageIcon aria-hidden="true" size={18} />
        写真から読み取る
      </button>
    </Screen>
  );
}

export type ScanResult = "invite" | "other" | "expired" | "none";

// What the QR page says, briefly, when another try is all it takes.
const scanRetries: Record<"other" | "none", string> = {
  none: "写真にQRコードが見つかりませんでした",
  other: "ポチカルの招待QRコードではありません",
};

const scanCorner = "3px solid white";

const scan = {
  body: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "20px",
    justifyContent: "center",
  }),
  close: css({
    bg: "media.fill",
    border: 0,
    borderRadius: "circle",
    color: "media.text",
    display: "grid",
    height: "action",
    placeItems: "center",
    width: "action",
  }),
  // Four corner marks, drawn by the frame's own corners.
  corners: css({
    _after: {
      borderBottom: scanCorner,
      borderLeft: scanCorner,
      bottom: 0,
      content: '""',
      height: "32px",
      left: 0,
      position: "absolute",
      width: "32px",
    },
    _before: {
      borderLeft: scanCorner,
      borderTop: scanCorner,
      content: '""',
      height: "32px",
      left: 0,
      position: "absolute",
      top: 0,
      width: "32px",
    },
    inset: 0,
    position: "absolute",
  }),
  demo: css({ color: "media.textSecondary", textStyle: "caption" }),
  frame: css({
    _after: {
      borderBottom: scanCorner,
      borderRight: scanCorner,
      bottom: 0,
      content: '""',
      height: "32px",
      position: "absolute",
      right: 0,
      width: "32px",
    },
    _before: {
      borderRight: scanCorner,
      borderTop: scanCorner,
      content: '""',
      height: "32px",
      position: "absolute",
      right: 0,
      top: 0,
      width: "32px",
    },
    bg: "media.fillFaint",
    border: 0,
    borderRadius: "md",
    height: "220px",
    position: "relative",
    width: "220px",
  }),
  header: css({ alignItems: "center", display: "flex", gap: "12px" }),
  hint: css({
    margin: 0,
    textAlign: "center",
    textStyle: "body",
    textWrap: "balance",
  }),
  library: css({
    alignItems: "center",
    alignSelf: "center",
    bg: "media.fill",
    border: 0,
    borderRadius: "full",
    color: "media.text",
    display: "flex",
    fontWeight: 600,
    gap: "8px",
    marginBottom: "12px",
    padding: "12px 20px",
    textStyle: "body",
  }),
  problem: css({
    "& svg": { color: "media.warning", flexShrink: 0, marginTop: "1px" },
    alignItems: "flex-start",
    bg: "media.fill",
    borderRadius: "lg",
    display: "flex",
    gap: "12px",
    lineHeight: 1.5,
    margin: "16px 0 0",
    padding: "12px 16px",
    textStyle: "subheadline",
  }),
  root: css({ bg: "media.background", color: "media.text" }),
  title: css({ fontWeight: 600, margin: 0, textStyle: "headline" }),
};

// Cut short with … on one line.
const ellipsisStyle = css({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// 参加の画面: who it is from on top, then the group, its mark and name
// together with room around them, and who is in it; then how you will
// appear in it, and at the foot what joining shares over 参加する.
const joinScreen = {
  // The faces overlap, each ringed in the screen's color, as the
  // reactions' do.
  faces: css({
    "& > *": { boxShadow: "0 0 0 2px token(colors.background.base)" },
    "& > * + *": { marginInlineStart: "-8px" },
    display: "flex",
  }),
  // What joining shares, right over 参加する, read as it is pressed.
  consent: css({
    color: "text.tertiary",
    lineHeight: 1.6,
    margin: "0 8px 12px",
    textAlign: "center",
    textStyle: "footnote",
    // Evened out, as the site's headings. It leaves the group's name to the
    // screen above, so a long one cannot stretch it.
    textWrap: "balance",
  }),
  foot: css({ display: "flex", flexDirection: "column", paddingTop: "12px" }),
  from: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    margin: 0,
    maxWidth: "100%",
    textStyle: "subheadline",
  }),
  // A long name is cut short, and からの招待 stays whole after it.
  fromName: ellipsisStyle,
  fromAvatar: css({ display: "flex", flexShrink: 0, marginRight: "8px" }),
  fromRest: css({ flexShrink: 0 }),
  group: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBlock: "32px 24px",
  }),
  head: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    paddingBottom: "12px",
    textAlign: "center",
  }),
  // One line: long names are cut short, and the whole list is a tap
  // away.
  memberLine: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    gap: "2px",
    maxWidth: "100%",
    textStyle: "footnote",
  }),
  members: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  }),
  membersButton: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    cursor: "pointer",
    maxWidth: "100%",
    padding: 0,
  }),
  arrow: css({ flexShrink: 0 }),
  // The whole name, as the one place it is read before joining; a name
  // longer than three lines is cut short.
  title: css({ fontWeight: 700, lineClamp: 3, margin: 0, textStyle: "title1" }),
};

// Who is in a group, by name while that stays short, and by as many
// faces as sit side by side without crowding.
const namedMembers = 3;
const shownFaces = 5;

// It opens the list of them, so with every name there it gives the count
// too, and nobody wonders whether the list holds more.
function memberLine(names: string[]) {
  if (names.length === 1) {
    return `${names[0]}が参加中`;
  }
  if (names.length <= namedMembers) {
    return `${names.join("、")}の${names.length}人が参加中`;
  }
  const rest = names.length - (namedMembers - 1);
  return `${names.slice(0, namedMembers - 1).join("、")}ほか${rest}人が参加中`;
}

// A group's invitation, as its link carries it.
type Invite = {
  group: string;
  mark: GroupMark;
  from: { name: string; photo?: string };
  members: { name: string; photo?: string }[];
};

// The group the sample invitation joins.
export const invitedGroupId = "cousins";

// The code in the sample invitation's link. Any other code is a link that
// no longer works: remade since, or its group deleted.
export const sampleInviteCode = "Toko2345";

export const sampleInvite = (): Invite => ({
  from: { name: partner.name, photo: partner.photo },
  group: "いとこ会",
  mark: { emoji: "🍉", kind: "emoji" },
  members: cousins().map(({ name, photo }) => ({ name, photo })),
});

// Opened by an invitation link over the calendar, right after the first
// setup if one was opened during it, and by a QR code read in the group
// tab: the one place anyone joins from. A screen of its own rather than a
// sheet, as LINE's invitations are, so how you will appear can open its
// own page from it. That starts as the usual profile, shown in one row as
// in the group's settings: most join as they are, with one tap. Only ✕
// turns it down.
export function JoinScreen({
  profile,
  onJoin,
  onClose,
}: {
  profile: Profile;
  onJoin: (group: GroupSummary) => void;
  onClose: () => void;
}) {
  const invite = sampleInvite();
  const setChats = useUser((state) => state.setChats);
  const [mine, setMine] = useState<GroupProfile>();
  const [editing, setEditing] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const names = invite.members.map((member) => member.name);
  // The line opens everyone, each face beside its name, however many
  // there are. Only names and faces: shifts are seen once both are in the
  // group.
  const members = (
    <>
      <span className={joinScreen.faces}>
        {invite.members.slice(0, shownFaces).map((member) => (
          <PhotoAvatar
            key={member.name}
            name={member.name}
            photo={member.photo}
            size={32}
          />
        ))}
      </span>
      <small className={joinScreen.memberLine}>
        <span className={ellipsisStyle}>{memberLine(names)}</span>
        <ChevronRight
          aria-hidden="true"
          className={joinScreen.arrow}
          size={14}
        />
      </small>
    </>
  );
  const group: GroupSummary = {
    id: invitedGroupId,
    mark: invite.mark,
    mine,
    name: invite.group,
  };
  if (editing) {
    return (
      <Screen>
        <ScreenScroll>
          <GroupProfilePage
            back={invite.group}
            group={group}
            joining
            onBack={() => {
              setEditing(false);
            }}
            onChange={setMine}
            profile={profile}
          />
        </ScreenScroll>
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenScroll>
        <PageHeader
          leading={
            <IconButton label="閉じる" onClick={onClose}>
              <X aria-hidden="true" size={20} />
            </IconButton>
          }
        />
        <div className={joinScreen.head}>
          <p className={joinScreen.from}>
            <span className={joinScreen.fromAvatar}>
              <PhotoAvatar
                name={invite.from.name}
                photo={invite.from.photo}
                size={20}
              />
            </span>
            <span className={joinScreen.fromName}>{invite.from.name}</span>
            <span className={joinScreen.fromRest}>からの招待</span>
          </p>
          <div className={joinScreen.group}>
            <span className={markFrame({ size: "large" })}>
              <GroupIcon mark={invite.mark} size={40} />
            </span>
            <h3 className={joinScreen.title}>{invite.group}</h3>
          </div>
          <button
            className={cx(joinScreen.members, joinScreen.membersButton)}
            onClick={() => {
              setMembersOpen(true);
            }}
            type="button"
          >
            {members}
          </button>
        </div>
        <Section title="このグループでのあなた">
          <List>
            <GroupProfileRow
              group={group}
              onOpen={() => {
                setEditing(true);
              }}
              profile={profile}
            />
          </List>
        </Section>
      </ScreenScroll>
      <div className={joinScreen.foot}>
        <p className={joinScreen.consent}>
          参加すると、あなたのシフトもメンバーに見えるようになります。
        </p>
        <Button
          onClick={() => {
            // Told here, so that joining from the hub's QR and from a
            // link opened on the calendar both say so in the chat.
            const { name } = profileIn(group, profile);
            setChats((chats) =>
              withNotice(chats, group.id, `${name}がグループに参加しました`)
            );
            onJoin(group);
          }}
          variant="primary"
        >
          参加する
        </Button>
      </div>
      <Sheet
        label={`${invite.group}のメンバー`}
        onOpenChange={setMembersOpen}
        open={membersOpen}
      >
        <SheetHeading
          eyebrow={invite.group}
          onClose={() => {
            setMembersOpen(false);
          }}
          title={`${invite.members.length}人のメンバー`}
        />
        <div className={sheetBody}>
          <List>
            {invite.members.map((member) => (
              <ListRow
                key={member.name}
                label={member.name}
                truncate
                leading={
                  <>
                    <PhotoAvatar
                      name={member.name}
                      photo={member.photo}
                      size={28}
                    />
                  </>
                }
              />
            ))}
          </List>
        </div>
      </Sheet>
    </Screen>
  );
}

export function InvitePage({
  group,
  onBack,
  onRemake,
}: {
  group: Omit<Group, "members">;
  onBack: () => void;
  // A new link, told in the group chat: links the others have sent stop
  // working, and they should know why.
  onRemake: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const toast = useContext(ToastContext);
  return (
    <>
      <PageHeader back={group.name} onBack={onBack} title="メンバーを招待" />
      <div className={hub.qr}>
        <InviteQr />
        <small className={hub.qrNote}>
          この画面を相手に読み取ってもらいます
        </small>
      </div>
      <Button variant="primary">
        <Send aria-hidden="true" size={16} />
        招待リンクを送る
      </Button>
      <Button variant="quiet">
        <Copy aria-hidden="true" size={15} />
        リンクをコピー
      </Button>
      <Note>
        リンクを知っている人は、だれでも「{group.name}
        」に参加できます。送る相手に気をつけてください。
      </Note>
      <Button
        onClick={() => {
          setConfirming(true);
        }}
        variant="text"
      >
        招待リンクを作り直す
      </Button>
      {confirming && (
        <ConfirmDialog
          action="作り直す"
          message="今のリンクとQRコードでは、もう参加できなくなります。今いるメンバーはそのままです。"
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            onRemake();
            toast("招待リンクを作り直しました");
          }}
          title="招待リンクを作り直しますか？"
        />
      )}
    </>
  );
}

const inviteQr = css({
  WebkitTouchCallout: "none",
  bg: "transparent",
  border: 0,
  borderRadius: "md",
  color: "inherit",
  display: "grid",
  padding: 0,
  placeItems: "center",
});

// The invitation's QR code. A long press (or a right click) shares or saves
// it, as the platforms' own images do; Enter or Space opens the same menu.
// A tap does nothing: it is there to be read off the screen.
function InviteQr() {
  const [menuOpen, setMenuOpen] = useState(false);
  const toast = useContext(ToastContext);
  const press = useLongPress(() => {
    setMenuOpen(true);
  });
  return (
    <PhonePopover
      anchor={
        <button
          aria-label="招待のQRコード。長押しで共有と保存"
          className={inviteQr}
          onClick={(event) => {
            if (press.consumeLongPress()) {
              return;
            }
            // A click with no pointer is Enter or Space.
            if (event.detail === 0) {
              setMenuOpen(true);
            }
          }}
          type="button"
          {...press.handlers}
        >
          <QrCode aria-hidden="true" size={132} strokeWidth={1.2} />
        </button>
      }
      label="QRコード"
      onOpenChange={setMenuOpen}
      open={menuOpen}
      positioning={{ gutter: 4, placement: "bottom" }}
    >
      <PopoverMenuItem
        icon={<Share aria-hidden="true" size={18} />}
        onClick={() => {
          setMenuOpen(false);
          toast("LINEなどに送れるメニューが開きます（見本）");
        }}
      >
        共有
      </PopoverMenuItem>
      <PopoverMenuItem
        icon={<Download aria-hidden="true" size={18} />}
        onClick={() => {
          setMenuOpen(false);
          toast("写真に保存しました");
        }}
      >
        写真に保存
      </PopoverMenuItem>
    </PhonePopover>
  );
}
