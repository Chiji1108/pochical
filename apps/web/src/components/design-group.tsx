import { useContext, useState } from "react";

import type { Schedule } from "../lib/design-days";
import type { Pattern } from "../lib/design-patterns";
import { useUser } from "../lib/design-user-store";
import { ChatPage } from "./design-group-chat";
import type { PhotoSend } from "./design-group-chat";
import {
  chatKey,
  chatTitle,
  groupChat,
  isMuted,
  meFrom,
  sampleOthers,
  withMuted,
  withNotice,
} from "./design-group-data";
import type { Chat, Group, Member, Profile } from "./design-group-data";
import { GroupHub, GroupRail, MemberSheet, NoGroups } from "./design-group-hub";
import {
  InvitePage,
  JoinScreen,
  ScanPage,
  invitedGroupId,
  sampleInvite,
} from "./design-group-join";
import type { ScanResult } from "./design-group-join";
import { hub } from "./design-group-parts";
import {
  GroupSettingsPage,
  NewGroupPage,
  colorOfMark,
  profileIn,
} from "./design-group-settings";
import type { GroupEdit } from "./design-group-settings";
import { ShiftsPage, marksUpTo } from "./design-group-shifts";
import type { Layout } from "./design-group-shifts";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import { ToastContext } from "./design-toast";
import { Screen, ScreenScroll } from "./design-ui";

// The グループ tab: which of its screens shows and how one leads to the
// next. The screens have files of their own, as the native apps' views:
// the hub (design-group-hub), chats (-chat), everyone's shifts (-shifts),
// joining and inviting (-join) and a group's settings (-settings), with
// the pieces they share (-parts) and the data behind them (-data).

type Page =
  | { name: "hub" }
  // `from` is the chat that opened it, to go back there.
  | { name: "shifts"; month?: Date; day?: Date; from?: string }
  // `from` is the chat whose member picture opened it, to go back there;
  // `attach` is days brought from the shift table to share, set above
  // the composer until sent.
  // `sharedFirst` opens it on its last shared day rather than its latest line.
  | {
      name: "chat";
      chatId: string;
      from?: string;
      attach?: Date[];
      sharedFirst?: boolean;
    }
  | { name: "invite" }
  | { name: "new" }
  | { name: "settings" }
  // Reading a group's QR code to join it.
  | { name: "scan" }
  // And the invitation it read, to join.
  | { name: "join" };

export type GroupStart = "hub" | "shifts" | "chat" | "message";

export function DesignGroup({
  schedule,
  patterns,
  profile,
  onTab,
  initialGroupId = "family",
  initialPage = "hub",
  scanResult = "invite",
  photoSend = "ok",
}: {
  schedule: Schedule;
  patterns: Pattern[];
  profile: Profile;
  // The group to open on, like one just joined from a link.
  initialGroupId?: string;
  // Its hub, or straight on its shift table or its group chat, as the top
  // page shows them; message is the group chat at its latest line, as a
  // notification of it opens it.
  initialPage?: GroupStart;
  // What the QR page finds, as 比べる案 sets it.
  scanResult?: ScanResult;
  // Whether a photo's upload goes through, as 比べる案 sets it.
  photoSend?: PhotoSend;

  onTab: (tab: Tab) => void;
}) {
  const groups = useUser((state) => state.groups);
  const setGroups = useUser((state) => state.setGroups);
  const [groupId, setGroupId] = useState(initialGroupId);
  const chats = useUser((state) => state.chats);
  const setChats = useUser((state) => state.setChats);
  // The table layout each group was last seen in.
  const [layouts, setLayouts] = useState<Record<string, Layout>>({});
  const [page, setPage] = useState<Page>(() => {
    if (initialPage === "chat") {
      return { chatId: groupChat, name: "chat", sharedFirst: true };
    }
    if (initialPage === "message") {
      return { chatId: groupChat, name: "chat" };
    }
    return { name: initialPage };
  });

  // The member whose profile sheet is open.
  const [profileOf, setProfileOf] = useState<Member>();
  // Members taken out of each group, by group id.
  const [removed, setRemoved] = useState<Record<string, string[]>>({});
  const toast = useContext(ToastContext);
  const meIn = (id: string) => {
    const found = groups.find((item) => item.id === id);
    const shown = found ? profileIn(found, profile) : profile;
    return meFrom(schedule, patterns, shown.photo);
  };
  const membersOf = (id: string): Member[] => [meIn(id), ...sampleOthers(id)];
  const chatOf = (id: string, chatId: string): Chat =>
    chats[chatKey(id, chatId)] ?? { messages: [], unread: 0 };
  const addNotice = (id: string, notice: string) => {
    setChats((all) => withNotice(all, id, notice));
  };
  const scanPage = (
    <ScanPage
      onClose={() => {
        setPage({ name: "hub" });
      }}
      result={scanResult}
      onRead={() => {
        setPage({ name: "hub" });
        const invited = sampleInvite().group;
        if (groups.some((item) => item.id === invitedGroupId)) {
          setGroupId(invitedGroupId);
          toast(`「${invited}」にはもう参加しています`);
        } else {
          setPage({ name: "join" });
        }
      }}
    />
  );
  // It takes the scanner's place, as LINE goes on from a read code.
  const joinPage = (
    <JoinScreen
      onClose={() => {
        setPage({ name: "hub" });
      }}
      onJoin={(joined) => {
        setGroups([...groups, joined]);
        setGroupId(joined.id);
        setPage({ name: "hub" });
        toast(`「${joined.name}」に参加しました`);
      }}
      profile={profile}
    />
  );
  const onScan = () => {
    setPage({ name: "scan" });
  };

  const newGroupPage = (
    <NewGroupPage
      onBack={() => {
        setPage({ name: "hub" });
      }}
      onCreate={({ myName, ...created }) => {
        const id = `group-${groups.length}`;
        const mine = myName === profile.name ? undefined : { name: myName };
        setGroups([...groups, { ...created, id, mine }]);
        setGroupId(id);
        setPage({ name: "invite" });
      }}
      profile={profile}
      usedColors={groups.map((item) => colorOfMark(item.mark))}
    />
  );

  // In no group yet, or none left: what sharing looks like, and the two
  // ways in.
  if (groups.length === 0) {
    if (page.name === "scan") {
      return scanPage;
    }
    if (page.name === "join") {
      return joinPage;
    }
    return (
      <Screen>
        <ScreenScroll>
          {page.name === "new" ? (
            newGroupPage
          ) : (
            <NoGroups
              onNew={() => {
                setPage({ name: "new" });
              }}
              onScan={onScan}
            />
          )}
        </ScreenScroll>
        {page.name !== "new" && <TabBar active="group" onSelect={onTab} />}
      </Screen>
    );
  }

  const summary = groups.find((item) => item.id === groupId) ?? groups[0];
  const group: Group = {
    ...summary,
    members: membersOf(summary.id).filter(
      (member) => !removed[summary.id]?.includes(member.id)
    ),
  };
  // Turns one of this group's chats' notifications off or back on.
  const setMuted = (chatId: string, muted: boolean) => {
    setGroups(
      groups.map((item) =>
        item.id === group.id ? withMuted(item, chatId, muted) : item
      )
    );
  };
  // A day shared from the shift table opens the group chat with the day
  // set above the composer, as sharing into a chat app does: nothing
  // reaches everyone until you send it, with a word if you like.
  const shareDay = (date: Date) => {
    const key = chatKey(group.id, groupChat);
    setChats({
      ...chats,
      [key]: { ...chatOf(group.id, groupChat), unread: 0 },
    });
    setPage({ attach: [date], chatId: groupChat, name: "chat" });
  };
  const removeMember = (member: Member) => {
    setProfileOf(undefined);
    setRemoved({
      ...removed,
      [group.id]: [...(removed[group.id] ?? []), member.id],
    });
    addNotice(
      group.id,
      `${profileIn(group, profile).name}が${member.name}をグループから外しました`
    );
    toast(`${member.name}を外しました`);
  };
  const openChat = (chatId: string, from?: string) => {
    setProfileOf(undefined);
    setChats({
      ...chats,
      [chatKey(group.id, chatId)]: { ...chatOf(group.id, chatId), unread: 0 },
    });
    setPage({ chatId, from, name: "chat" });
  };
  // Tapping a member opens their profile, where a one-to-one chat starts.
  const onMember = (member: Member) => {
    if (!member.me) {
      setProfileOf(member);
    }
  };
  const memberSheet = (
    <MemberSheet
      group={group}
      member={profileOf}
      onClose={() => {
        setProfileOf(undefined);
      }}
      onRemove={page.name === "settings" ? removeMember : undefined}
      onMessage={
        // Already in the one-to-one chat with them: nothing to open.
        page.name === "chat" && page.chatId === profileOf?.id
          ? undefined
          : (member) => {
              openChat(
                member.id,
                page.name === "chat" ? page.chatId : undefined
              );
            }
      }
    />
  );

  const unreadOf = (id: string) =>
    Object.entries(chats)
      .filter(([key]) => key.startsWith(`${id}:`))
      .reduce((total, [, chat]) => total + chat.unread, 0);

  if (page.name === "scan") {
    return scanPage;
  }

  if (page.name === "join") {
    return joinPage;
  }

  if (page.name === "chat") {
    const key = chatKey(group.id, page.chatId);
    // The other person, in a one-to-one chat.
    const chatMember = group.members.find(
      (member) => !member.me && member.id === page.chatId
    );
    return (
      <>
        <ChatPage
          attach={page.attach}
          photoSend={photoSend}
          sharedFirst={page.sharedFirst}
          backLabel={page.from ? chatTitle(group, page.from) : group.name}
          chat={chatOf(group.id, page.chatId)}
          formerMembers={membersOf(group.id).filter((member) =>
            removed[group.id]?.includes(member.id)
          )}
          group={group}
          onMember={onMember}
          onBack={() => {
            setPage(
              page.from ? { chatId: page.from, name: "chat" } : { name: "hub" }
            );
          }}
          onChange={(messages) => {
            setChats({ ...chats, [key]: { messages, unread: 0 } });
          }}
          onOpenDay={(date) => {
            setPage({
              from: page.chatId,
              month: new Date(date.getFullYear(), date.getMonth(), 1),
              name: "shifts",
            });
          }}
          people={
            page.chatId === groupChat
              ? group.members
              : group.members.filter(
                  (member) => member.me || member.id === page.chatId
                )
          }
          title={chatTitle(group, page.chatId)}
          onShifts={
            page.chatId === groupChat
              ? () => {
                  setPage({ from: page.chatId, name: "shifts" });
                }
              : undefined
          }
          onProfile={
            chatMember
              ? () => {
                  onMember(chatMember);
                }
              : undefined
          }
          muted={isMuted(group, page.chatId)}
          onMuted={(muted) => {
            setMuted(page.chatId, muted);
            toast(muted ? "通知をオフにしました" : "通知をオンにしました");
          }}
        />
        {memberSheet}
      </>
    );
  }

  return (
    <Screen>
      {page.name === "hub" ? (
        <div className={hub.layout}>
          <GroupRail
            groups={groups}
            onNew={() => {
              setPage({ name: "new" });
            }}
            onScan={onScan}
            onSelect={setGroupId}
            selected={group.id}
            unreadOf={unreadOf}
          />
          <ScreenScroll beside>
            <GroupHub
              chatOf={(chatId) => chatOf(group.id, chatId)}
              group={group}
              onChat={(chatId) => {
                setChats({
                  ...chats,
                  [chatKey(group.id, chatId)]: {
                    ...chatOf(group.id, chatId),
                    unread: 0,
                  },
                });
                setPage({ chatId, name: "chat" });
              }}
              onInvite={() => {
                setPage({ name: "invite" });
              }}
              onSettings={() => {
                setPage({ name: "settings" });
              }}
              onShifts={() => {
                setPage({ name: "shifts" });
              }}
              onShiftsDay={(date) => {
                setPage({
                  day: date,
                  month: new Date(date.getFullYear(), date.getMonth(), 1),
                  name: "shifts",
                });
              }}
            />
          </ScreenScroll>
        </div>
      ) : (
        <ScreenScroll>
          {page.name === "shifts" && (
            <ShiftsPage
              backLabel={page.from ? chatTitle(group, page.from) : group.name}
              group={group}
              layout={layouts[group.id] ?? defaultLayout(group.members.length)}
              day={page.day}
              month={page.month}
              onBack={() => {
                setPage(
                  page.from
                    ? { chatId: page.from, name: "chat" }
                    : { name: "hub" }
                );
              }}
              onLayout={(layout) => {
                setLayouts({ ...layouts, [group.id]: layout });
              }}
              onShareDay={shareDay}
            />
          )}
          {page.name === "settings" && (
            <GroupSettingsPage
              group={group}
              onLeave={() => {
                const rest = groups.filter((item) => item.id !== group.id);
                setGroups(rest);
                if (rest.length > 0) {
                  setGroupId(rest[0].id);
                }
                setPage({ name: "hub" });
                toast(`「${group.name}」から抜けました`);
              }}
              onMember={onMember}
              onBack={() => {
                setPage({ name: "hub" });
              }}
              onChange={(mine) => {
                setGroups(
                  groups.map((item) =>
                    item.id === group.id ? { ...item, mine } : item
                  )
                );
              }}
              onMuted={(muted) => {
                setMuted(groupChat, muted);
              }}
              onInvite={() => {
                setPage({ name: "invite" });
              }}
              onEdit={(edit) => {
                setGroups(
                  groups.map((item) =>
                    item.id === group.id ? { ...item, ...edit } : item
                  )
                );
                const notice = editNotice(
                  profileIn(group, profile).name,
                  group,
                  edit
                );
                addNotice(group.id, notice);
              }}
              profile={profile}
            />
          )}
          {page.name === "invite" && (
            <InvitePage
              group={group}
              onBack={() => {
                setPage({ name: "hub" });
              }}
              onRemake={() => {
                addNotice(
                  group.id,
                  `${profileIn(group, profile).name}が招待リンクを作り直しました`
                );
              }}
            />
          )}
          {page.name === "new" && newGroupPage}
        </ScreenScroll>
      )}
      {page.name === "hub" && <TabBar active="group" onSelect={onTab} />}
      {memberSheet}
    </Screen>
  );
}

function defaultLayout(count: number): Layout {
  return count <= marksUpTo ? "days" : "weeks";
}

// The line the group chat gets when someone saves a new name or icon.
function editNotice(by: string, before: GroupEdit, after: GroupEdit) {
  const renamed = before.name !== after.name;
  const remarked = JSON.stringify(before.mark) !== JSON.stringify(after.mark);
  if (renamed && remarked) {
    return `${by}がグループ名を「${after.name}」にして、アイコンを変更しました`;
  }
  if (renamed) {
    return `${by}がグループ名を「${after.name}」に変更しました`;
  }
  return `${by}がグループのアイコンを変更しました`;
}
