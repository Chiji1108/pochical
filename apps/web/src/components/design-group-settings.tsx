import { iconNames } from "@pochical/design/mark-icon-names";
import { UserPlus, X } from "lucide-react";
import { useState } from "react";
import { css } from "styled-system/css";

import { useUser } from "../lib/design-user-store";
import { firstCharacter } from "../lib/text-limits";
import {
  Choice,
  ChoiceGrid,
  colorGrid,
  markGrid,
  Segment,
  SegmentedControl,
} from "./design-choices";
import { EmojiPickerSheet } from "./design-emoji-picker";
import { LimitedInput, MarkLetterInput, markValue } from "./design-fields";
import { groupChat, isMuted } from "./design-group-data";
import type {
  Group,
  GroupMark,
  GroupMarkKind,
  GroupProfile,
  GroupSummary,
  Member,
  Profile,
} from "./design-group-data";
import {
  Avatar,
  GroupIcon,
  PhotoAvatar,
  PhotoEditor,
  PhotoPicker,
  hub,
  markFrame,
  markPart,
} from "./design-group-parts";
import { HeaderAction, PageHeader } from "./design-header";
import { IconPickerSheet } from "./design-icon-picker";
import { List, ListRow, SwitchRow } from "./design-list";
import { OtherChoicesButton, withPicked } from "./design-look-editor";
import { ConfirmDialog } from "./design-sheet";
import {
  DestructiveButton,
  fieldLabel,
  IconButton,
  Note,
  Section,
} from "./design-ui";
import { useMarkColors, nextColor } from "./shift-mark";
import type { MarkIcon } from "./shift-mark";

// A group's settings: its name and mark, your profile in it, and making
// a new group.

// The same rounded square as the rail, small, before a row's name.
const smallMarkFrame = css({
  bg: "background.card",
  borderRadius: "sm",
  display: "grid",
  height: "28px",
  overflow: "hidden",
  placeItems: "center",
  width: "28px",
});

// How you appear in one group, starting from your usual profile, and who
// else is in it.
export function GroupSettingsPage({
  group,
  profile,
  onChange,
  onEdit,
  onMuted,
  onInvite,
  onBack,
  onMember,
  onLeave,
}: {
  group: Group;
  profile: Profile;
  onMuted: (muted: boolean) => void;
  onMember?: (member: Member) => void;
  onLeave: () => void;
  onChange: (mine: GroupProfile | undefined) => void;
  onEdit: (edit: GroupEdit) => void;
  onInvite: () => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<"settings" | "edit" | "profile">("settings");
  const mentionsWhenMuted = useUser((state) => state.mentionsWhenMuted);
  const [leaving, setLeaving] = useState(false);
  const shown = profileIn(group, profile);
  if (view === "edit") {
    return (
      <GroupEditPage
        group={group}
        onCancel={() => {
          setView("settings");
        }}
        onSave={(edit) => {
          onEdit(edit);
          setView("settings");
        }}
      />
    );
  }
  if (view === "profile") {
    return (
      <GroupProfilePage
        back="グループの設定"
        group={group}
        onBack={() => {
          setView("settings");
        }}
        onChange={onChange}
        profile={profile}
      />
    );
  }
  return (
    <>
      <PageHeader back={group.name} onBack={onBack} title="グループの設定" />
      <Section title="グループ">
        <List>
          <ListRow
            onClick={() => {
              setView("edit");
            }}
            label={group.name}
            truncate
            value="編集"
            leading={
              <>
                <span className={smallMarkFrame}>
                  <GroupIcon mark={group.mark} size={16} />
                </span>
              </>
            }
          />
        </List>
        <Note>グループ名とアイコンは、メンバー全員に表示されます。</Note>
      </Section>
      <Section title="このグループでのあなた">
        <List>
          <GroupProfileRow
            group={group}
            onOpen={() => {
              setView("profile");
            }}
            profile={profile}
          />
        </List>
      </Section>
      {/* The group chat's, as LINE keeps a room's 通知 in its settings;
          the same switch is in 設定's チャット with every group's. A
          one-to-one chat has its own, in its menu. */}
      <Section title="通知">
        <List>
          <SwitchRow
            checked={!isMuted(group, groupChat)}
            label="全体チャットの通知"
            onChange={(on) => {
              onMuted(!on);
            }}
          />
        </List>
        {mentionsWhenMuted && (
          <Note>オフにしても、自分へのメンションは通知されます。</Note>
        )}
      </Section>
      <Section title="メンバー">
        <List>
          {group.members.map((member) => (
            <ListRow
              key={member.id}
              label={<>{member.me ? `${shown.name}（自分）` : member.name}</>}
              truncate
              onClick={
                onMember && !member.me
                  ? () => {
                      onMember(member);
                    }
                  : undefined
              }
              leading={
                <>
                  <Avatar member={member} />
                </>
              }
            />
          ))}
          <ListRow
            onClick={onInvite}
            label="メンバーを招待"
            leading={
              <>
                <UserPlus
                  aria-hidden="true"
                  className={hub.rowIcon}
                  size={18}
                />
              </>
            }
          />
        </List>
      </Section>
      <DestructiveButton
        onClick={() => {
          setLeaving(true);
        }}
      >
        このグループから抜ける
      </DestructiveButton>
      {leaving && (
        <ConfirmDialog
          action="抜ける"
          message={`「${group.name}」のシフトとチャットが見られなくなります。もう一度入るには、招待してもらう必要があります。`}
          onCancel={() => {
            setLeaving(false);
          }}
          onConfirm={() => {
            setLeaving(false);
            onLeave();
          }}
          title="グループから抜けますか？"
        />
      )}
    </>
  );
}

export type GroupEdit = { name: string; mark: GroupMark };

// The group's name and icon, which everyone in it sees: changes stay a
// draft until 保存, so picking a photo or an emoji on the way reaches no
// one.
function GroupEditPage({
  group,
  onCancel,
  onSave,
}: {
  group: GroupEdit;
  onCancel: () => void;
  onSave: (edit: GroupEdit) => void;
}) {
  const [name, setName] = useState(group.name);
  const [mark, setMark] = useState(group.mark);
  const [editingMark, setEditingMark] = useState(false);
  const draft = { mark, name: name.trim() };
  const changed =
    draft.name !== group.name ||
    JSON.stringify(mark) !== JSON.stringify(group.mark);
  const canSave = changed && draft.name !== "";
  if (editingMark) {
    return (
      <GroupMarkPage
        back="グループを編集"
        mark={mark}
        name={name}
        onBack={() => {
          setEditingMark(false);
        }}
        onChange={setMark}
      />
    );
  }
  return (
    <>
      <PageHeader
        leading={
          <IconButton label="キャンセル" onClick={onCancel}>
            <X aria-hidden="true" size={22} />
          </IconButton>
        }
        trailing={
          <HeaderAction
            disabled={!canSave}
            prominent
            onClick={() => {
              onSave(draft);
            }}
          >
            保存
          </HeaderAction>
        }
        title="グループを編集"
      />
      <div className={hub.editMark}>
        <span className={markFrame({ size: "large" })}>
          <GroupIcon mark={mark} size={40} />
        </span>
      </div>
      <List>
        <ListRow
          label="グループ名"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="groupName"
                onValueChange={setName}
                placeholder="例：家族"
                value={name}
              />
            </>
          }
        />
        <MarkRow
          mark={mark}
          onOpen={() => {
            setEditingMark(true);
          }}
        />
      </List>
      <Note>
        保存すると、メンバー全員の画面に反映され、グループのチャットにもお知らせが届きます。
      </Note>
    </>
  );
}

// How you appear in a group, as a row that opens GroupProfilePage: the
// same in the group's settings and on the invitation to join it.
export function GroupProfileRow({
  group,
  profile,
  onOpen,
}: {
  group: GroupSummary;
  profile: Profile;
  onOpen: () => void;
}) {
  const shown = profileIn(group, profile);
  return (
    <ListRow
      onClick={onOpen}
      label={shown.name}
      truncate
      value={group.mine ? "このグループだけ" : "いつもと同じ"}
      leading={
        <>
          <PhotoAvatar name={shown.name} photo={shown.photo} size={28} />
        </>
      }
    />
  );
}

// How you appear in this group. It is yours, so changes apply at once. An
// empty name or no photo of its own means the usual ones from settings.
// Before joining, it changes what the invitation will join with.
export function GroupProfilePage({
  group,
  profile,
  back,
  joining = false,
  onChange,
  onBack,
}: {
  group: GroupSummary;
  profile: Profile;
  back: string;
  joining?: boolean;
  onChange: (mine: GroupProfile | undefined) => void;
  onBack: () => void;
}) {
  const mine = group.mine ?? {};
  const shown = profileIn(group, profile);
  const update = (change: GroupProfile) => {
    const next = { ...mine, ...change };
    const plain =
      (next.name === undefined || next.name === profile.name) &&
      next.photo === undefined &&
      !next.noPhoto;
    onChange(plain ? undefined : next);
  };
  const usualPhoto = mine.photo === undefined && !mine.noPhoto;
  return (
    <>
      <PageHeader back={back} onBack={onBack} title="グループでのあなた" />
      <PhotoEditor
        name={shown.name}
        onRemove={
          shown.photo
            ? () => {
                update({ noPhoto: true, photo: undefined });
              }
            : undefined
        }
        onUpload={(photo) => {
          update({ noPhoto: false, photo });
        }}
        onUsual={
          usualPhoto
            ? undefined
            : () => {
                update({ noPhoto: false, photo: undefined });
              }
        }
        photo={shown.photo}
        size={88}
      />
      <List className={hub.profileList}>
        <ListRow
          label="名前"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="personName"
                onValueChange={(name) => {
                  update({ name: name || undefined });
                }}
                placeholder={profile.name}
                value={mine.name ?? ""}
              />
            </>
          }
        />
      </List>
      <Note>
        {joining && "参加すると、"}
        {group.name}
        の人にだけ、この名前と写真で表示されます。名前が空欄なら「{profile.name}
        」、写真を入れなければいつもの写真のままです。
      </Note>
    </>
  );
}

// Your name and picture in a group: its own, or the usual ones.
export function profileIn(
  group: Omit<Group, "members">,
  profile: Profile
): Profile {
  const { mine } = group;
  return {
    name: mine?.name || profile.name,
    photo: mine?.noPhoto ? undefined : (mine?.photo ?? profile.photo),
  };
}

// Words in a name that suggest an emoji.
const groupHints: { words: string[]; emoji: string }[] = [
  { emoji: "🏠", words: ["家族", "家", "夫婦"] },
  { emoji: "🎓", words: ["学校", "同期", "クラス", "ゼミ"] },
  { emoji: "💼", words: ["職場", "会社", "仕事", "病棟"] },
  { emoji: "✈️", words: ["旅行", "旅"] },
  { emoji: "🍙", words: ["ごはん", "飲み", "ランチ"] },
  { emoji: "👭", words: ["友達", "友だち", "仲間"] },
];

// From the name alone: a fitting emoji, or else its first letter.
function guessGroupMark(name: string, color: number): GroupMark {
  const hint = groupHints.find(({ words }) =>
    words.some((word) => name.includes(word))
  );
  return hint
    ? { emoji: hint.emoji, kind: "emoji" }
    : { color, kind: "letter", text: firstCharacter(name) };
}

export function colorOfMark(mark: GroupMark) {
  return mark.kind === "icon" || mark.kind === "letter" ? mark.color : 0;
}

const groupIcons: MarkIcon[] = [
  "house",
  "users",
  "heart",
  "baby",
  "graduationCap",
  "briefcase",
  "hospital",
  "utensils",
  "coffee",
  "plane",
  "music",
  "dumbbell",
  "star",
  "flower",
  "pawPrint",
  "partyPopper",
];

const groupEmojis = [
  "🏠",
  "👭",
  "🎓",
  "💼",
  "🌷",
  "🍙",
  "☕️",
  "✈️",
  "🎵",
  "⚽️",
  "🐾",
  "⭐️",
];

// A photo is uploaded from the picture itself, as with your profile, so
// only the marks made here have tabs.
type DrawnMarkKind = Exclude<GroupMarkKind, "photo">;

const markKinds: { kind: DrawnMarkKind; label: string }[] = [
  { kind: "emoji", label: "絵文字" },
  { kind: "icon", label: "アイコン" },
  { kind: "letter", label: "文字" },
];

// One page to pick the group's mark: a kind, then one choice of it.
function GroupMarkPage({
  back,
  name,
  mark,
  onBack,
  onChange,
}: {
  back: string;
  name: string;
  mark: GroupMark;
  onBack: () => void;
  onChange: (mark: GroupMark) => void;
}) {
  // No tab is picked while the mark is a photo.
  const [kind, setKind] = useState<DrawnMarkKind | undefined>(
    mark.kind === "photo" ? undefined : mark.kind
  );
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const [pickingIcon, setPickingIcon] = useState(false);
  const color = colorOfMark(mark);
  const letter =
    mark.kind === "letter" ? mark.text : firstCharacter(name) || "グ";
  return (
    <>
      <PageHeader back={back} onBack={onBack} title="アイコン" />
      {/* Drawn marks are picked with the tabs below, so the sheet only
          brings in a photo. */}
      <PhotoPicker
        label={mark.kind === "photo" ? "写真を変更" : "写真を使う"}
        onPhoto={(photo) => {
          onChange({ kind: "photo", photo });
          setKind(undefined);
        }}
        picture={
          <span className={markFrame({ size: "large" })}>
            <GroupIcon mark={mark} size={40} />
          </span>
        }
      />
      <SegmentedControl
        label="アイコンの種類"
        onValueChange={setKind}
        value={kind ?? null}
      >
        {markKinds.map((option) => (
          <Segment key={option.kind} value={option.kind}>
            {option.label}
          </Segment>
        ))}
      </SegmentedControl>
      {kind === "emoji" && (
        <>
          <ChoiceGrid
            className={markGrid}
            label="絵文字"
            onValueChange={(emoji) => {
              onChange({ emoji, kind: "emoji" });
            }}
            value={mark.kind === "emoji" ? mark.emoji : null}
          >
            {withPicked(
              groupEmojis,
              mark.kind === "emoji" ? mark.emoji : undefined
            ).map((emoji) => (
              <Choice
                className={markPart.choiceEmoji}
                key={emoji}
                value={emoji}
              >
                {emoji}
              </Choice>
            ))}
          </ChoiceGrid>
          <OtherChoicesButton
            onClick={() => {
              setPickingEmoji(true);
            }}
          >
            ほかの絵文字を選ぶ
          </OtherChoicesButton>
          <EmojiPickerSheet
            onOpenChange={setPickingEmoji}
            onPick={(emoji) => {
              onChange({ emoji, kind: "emoji" });
            }}
            open={pickingEmoji}
          />
        </>
      )}
      {kind === "icon" && (
        <>
          <ChoiceGrid
            className={markGrid}
            label="アイコン"
            onValueChange={(icon) => {
              onChange({ color, icon, kind: "icon" });
            }}
            value={mark.kind === "icon" ? mark.icon : null}
          >
            {withPicked(
              groupIcons,
              mark.kind === "icon" ? mark.icon : undefined
            ).map((icon) => (
              <Choice key={icon} label={iconNames[icon]} value={icon}>
                <GroupIcon
                  bare
                  mark={{ color, icon, kind: "icon" }}
                  size={22}
                />
              </Choice>
            ))}
          </ChoiceGrid>
          <OtherChoicesButton
            onClick={() => {
              setPickingIcon(true);
            }}
          >
            ほかのアイコンを選ぶ
          </OtherChoicesButton>
          <IconPickerSheet
            renderIcon={(icon) => (
              <GroupIcon bare mark={{ color, icon, kind: "icon" }} size={24} />
            )}
            onOpenChange={setPickingIcon}
            onPick={(icon) => {
              onChange({ color, icon, kind: "icon" });
            }}
            open={pickingIcon}
            picked={mark.kind === "icon" ? mark.icon : undefined}
          />
          <MarkColors
            color={color}
            onPick={(value) => {
              onChange(
                mark.kind === "icon"
                  ? { ...mark, color: value }
                  : { color: value, icon: groupIcons[0], kind: "icon" }
              );
            }}
          />
        </>
      )}
      {kind === "letter" && (
        <>
          <List>
            <ListRow
              label="文字"
              control={
                <MarkLetterInput
                  kind="groupMark"
                  onLetter={(text) => {
                    onChange({ color, kind: "letter", text });
                  }}
                  value={letter}
                />
              }
            />
          </List>
          <MarkColors
            color={color}
            onPick={(value) => {
              onChange({ color: value, kind: "letter", text: letter });
            }}
          />
        </>
      )}
      <Note>
        メンバー全員に、このアイコンがそのまま表示されます。シフトの見た目のスタイルには左右されません。
      </Note>
    </>
  );
}

function MarkColors({
  color,
  onPick,
}: {
  color: number;
  onPick: (color: number) => void;
}) {
  const colors = useMarkColors();
  return (
    <ChoiceGrid
      className={colorGrid}
      label="色"
      labelClassName={fieldLabel({ place: "grid" })}
      onValueChange={(value) => {
        onPick(Number(value));
      }}
      value={String(color)}
    >
      {colors.map((option, index) => (
        <Choice
          key={option.name}
          label={option.name}
          style={{ background: option.tint, color: option.color }}
          value={String(index)}
        />
      ))}
    </ChoiceGrid>
  );
}

export function NewGroupPage({
  usedColors,
  profile,
  onBack,
  onCreate,
}: {
  usedColors: number[];
  profile: Profile;
  onBack: () => void;
  onCreate: (group: { name: string; mark: GroupMark; myName: string }) => void;
}) {
  const [name, setName] = useState("");
  // Starts as your usual name; change it only if this group calls you
  // something else.
  const [myName, setMyName] = useState(profile.name);
  const [color] = useState(() => nextColor(usedColors));
  const [mark, setMark] = useState<GroupMark>(() => guessGroupMark("", color));
  // Once picked, the mark stays when the name changes afterwards.
  const [picked, setPicked] = useState(false);
  const [editingMark, setEditingMark] = useState(false);
  const canCreate = name.trim() !== "" && myName.trim() !== "";
  if (editingMark) {
    return (
      <GroupMarkPage
        back="グループを作る"
        mark={mark}
        name={name}
        onBack={() => {
          setEditingMark(false);
        }}
        onChange={(next) => {
          setMark(next);
          setPicked(true);
        }}
      />
    );
  }
  return (
    <>
      <PageHeader
        back="グループ"
        onBack={onBack}
        trailing={
          <HeaderAction
            disabled={!canCreate}
            prominent
            onClick={() => {
              onCreate({ mark, myName: myName.trim(), name: name.trim() });
            }}
          >
            作る
          </HeaderAction>
        }
        title="グループを作る"
      />
      <List>
        <ListRow
          label="グループ名"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="groupName"
                onValueChange={(next) => {
                  setName(next);
                  if (!picked) {
                    setMark(guessGroupMark(next, color));
                  }
                }}
                placeholder="例：家族"
                value={name}
              />
            </>
          }
        />
        <MarkRow
          mark={mark}
          onOpen={() => {
            setEditingMark(true);
          }}
        />
        <ListRow
          label="このグループでの名前"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="personName"
                onValueChange={setMyName}
                placeholder="例：さくら"
                value={myName}
              />
            </>
          }
        />
      </List>
      <Note>
        アイコンはグループ名から自動で入ります。このグループでの名前は、最初はいつもの名前です。写真はあとからグループの設定で変えられます。
      </Note>
    </>
  );
}

function MarkRow({ mark, onOpen }: { mark: GroupMark; onOpen: () => void }) {
  return (
    <ListRow
      onClick={onOpen}
      label="アイコン"
      value={
        <>
          <span className={smallMarkFrame}>
            <GroupIcon mark={mark} size={16} />
          </span>
        </>
      }
      valueClassName={markValue}
    />
  );
}
