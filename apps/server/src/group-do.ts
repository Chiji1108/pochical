import { create, fromBinary } from "@bufbuild/protobuf";
import { chatPlaces, chatRules } from "@pochical/design/chat";
import type { ChatPlaceKind, ChatPlaceRules } from "@pochical/design/chat";
import { GROUP_MAX_MEMBERS, syncLimits } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import { and, asc, count, eq, gt, isNull, min } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import type { Alert } from "./apns";
import { mentionOf } from "./chat-links";
import {
  ChangeSchema,
  ChangesSchema,
  ServerError_Code,
  TypingSchema,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatEdit,
  ChatEdits,
  ChatLine,
  Profile as UsualProfile,
} from "./gen/pochical/v1/sync_pb";
import {
  addPreview,
  answeredChanges,
  atLine,
  chatChangesAfter,
  chatHead,
  chatPage,
  alertOf,
  eraseMemberChat,
  GROUP_THREAD,
  blockersOf,
  latestPageAfter,
  mayRead,
  moveReadMark,
  otherIn,
  pageToRead,
  photosPage,
  seenBy,
  takeChatEdit,
  readMarkOf,
  unreadCount,
  reportContext,
  setMemberBlocks,
  readerView,
  writeNotice,
} from "./group-chat";
import migrations from "./group-do-migrations/migrations.js";
import {
  chatLines,
  chatRecalls,
  logHead,
  memberDays,
  memberPatterns,
  memberRepeatOrders,
  members,
  membershipOutbox,
  profile,
  supportSlackLines,
} from "./group-do-schema";
import { markColumns, markOfRow, sameMark } from "./group-marks";
import type { MarkValue } from "./group-marks";
import {
  forgetStalePhotos,
  forgetUnshown,
  notePhoto,
  noteSharedPhoto,
  oldestStalePhoto,
  showOwnPhoto,
  stalePhotos,
} from "./group-photos";
import type { PhotoNote } from "./group-photos";
import {
  memberDayChange,
  memberPatternChange,
  memberRepeatOrdersChange,
  takeMemberDay,
  takeMemberPattern,
  takeMemberRepeatOrders,
} from "./group-shifts";
import { linkPreview } from "./link-preview";
import { deleteGroupPhotos } from "./photos";
import { overLimit } from "./rate-limits";
import { retryWait } from "./retry-wait";
import { supportPlace } from "./support-lines";
import { relaySupport, supportPage } from "./support-place";
import {
  acceptSyncSocket,
  answerKeepalive,
  broadcastChanges,
  rejectAndClose,
  send,
  byCursor,
  closeSessionSockets,
  closeUserSockets,
  handleSyncMessage,
  relayTyping,
  welcome,
} from "./sync-socket";
import type { MembershipNews } from "./user-do";

/** What the group shows of itself to members and to invite links. */
export type GroupProfile = {
  name: string;
  mark: MarkValue;
};

/**
 * Someone joining the group: their usual name, and a name of their own for
 * it if they gave one (spec/sync-protocol.md, Profile).
 */
export type NewMember = {
  userId: string;
  usualName: string;
  ownName: string | null;
  // Their usual photo, already in the group's photos; empty for none.
  usualPhoto: string;
};

/** The app's words for the chat with Pochical's people, as a title. */
const SUPPORT_TITLE = "SUPPORT_TITLE";

/** The name Pochical's people answer under, as the app's own. */
const POCHICAL_NAME = "ポチカル";

/** How a member appears: their own name for the group, else their usual one. */
const shownName = (ownName: string | null, usualName: string, before = "") =>
  ownName ?? (usualName === "" ? before : usualName);

/** A member in one of the place's chats, as who is told what is kept by. */
const readerKey = (threadId: string, userId: string): string =>
  `${threadId}\n${userId}`;

// After telling a user's DO of their membership fails, the alarm tells it
// again after this long, twice as long each time it fails in a row, up to
// the most; it never stops, as the two must come to agree.
export const NEWS_RETRY_FIRST_MS = 10_000;
const NEWS_RETRY_MOST_MS = 3_600_000;

/**
 * How a join went: in now, in already, kept out of a full group, or of
 * one not set up (gone as its last member's account was).
 */
type JoinResult = "added" | "already" | "full" | "gone";

type ProfileRow = { cursor: number } & GroupProfile;
type MemberRow = typeof members.$inferSelect;

const profileChange = ({ cursor, mark, name }: ProfileRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(cursor),
    kind: { case: "groupProfile", value: { mark, name } },
  });

const memberChange = ({
  cursor,
  deleted,
  displayName,
  joinedAt,
  leftAt,
  markFill,
  markStyle,
  ownName,
  ownPhoto,
  removedBy,
  userId,
  usualPhoto,
}: MemberRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(cursor),
    kind: {
      case: "member",
      value: {
        deleted,
        displayName,
        joinedAtMs: BigInt(joinedAt.getTime()),
        left: leftAt !== null,
        markLook:
          markStyle === "" ? undefined : { fill: markFill, style: markStyle },
        ownName: ownName !== null,
        ownPhoto: ownPhoto !== null,
        photoId: ownPhoto ?? usualPhoto,
        removedBy: removedBy ?? "",
        userId,
      },
    },
  });

/** Someone in the group now: their row, not left. */
const inGroup = (userId?: string) =>
  and(
    isNull(members.leftAt),
    userId === undefined ? undefined : eq(members.userId, userId)
  );

/** One kind of value the group keeps, as GroupDO.logs lists them. */
type MemberLog = {
  after: (cursor: number) => Change[];
};

/** One Durable Object per group, named by the group's id. */
export class GroupDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase;
  // Set when a support chat's change asks for its relay, so a relay
  // running meanwhile leaves the next alarm to it.
  private relayRequested = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    answerKeepalive(ctx);
    // Nothing reaches the group before its tables are up to date.
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /** The group's name and mark, or null before the group is set up. */
  getProfile(): GroupProfile | null {
    const row = this.db.select().from(profile).get();
    return row === undefined ? null : { mark: markOfRow(row), name: row.name };
  }

  /**
   * Sets the group up with its first member, and tells their DO. False
   * when it already is, so a group id is never set up twice; what is still
   * to be told is told again.
   */
  async create(group: GroupProfile, creator: NewMember): Promise<boolean> {
    const made = this.getProfile() === null;
    if (made) {
      this.ctx.storage.transactionSync(() => {
        this.writeProfile(group);
        this.writeMember(creator);
        this.queueNews(creator.userId, true);
      });
    }
    await this.tellMemberships();
    return made;
  }

  /**
   * Adds a member unless they are in already or the group is full, and
   * tells their DO. The object takes one call at a time, so two joins
   * cannot both take the last place.
   */
  async addMember(member: NewMember): Promise<JoinResult> {
    const result = this.admit(member);
    await this.tellMemberships();
    return result;
  }

  private admit(member: NewMember): JoinResult {
    const { userId } = member;
    if (this.placeKind() !== "group") {
      return "gone";
    }
    if (this.isMember(userId)) {
      return "already";
    }
    if (this.memberCount() >= GROUP_MAX_MEMBERS) {
      return "full";
    }
    const joined = this.ctx.storage.transactionSync(() => {
      const written = this.writeMember(member);
      const notice = writeNotice(
        this.db,
        userId,
        { kind: "joined" },
        this.nextCursor()
      );
      // Lines from before they joined are not unread to them.
      const head = chatHead(this.db, GROUP_THREAD);
      const cursor = this.head() + 1;
      const mark = moveReadMark(this.db, userId, GROUP_THREAD, head, cursor);
      if (mark) {
        this.setHead(cursor);
      }
      this.queueNews(userId, true);
      return mark ? [written, notice, mark] : [written, notice];
    });
    broadcastChanges(this.ctx, joined);
    return "added";
  }

  /** Everyone in the group as they appear in it, in the order they joined. */
  memberList(): { displayName: string; userId: string; photoId: string }[] {
    return this.db
      .select()
      .from(members)
      .where(inGroup())
      .orderBy(asc(members.joinedAt))
      .all()
      .map(({ displayName, userId, ownPhoto, usualPhoto }) => ({
        displayName,
        photoId: ownPhoto ?? usualPhoto,
        userId,
      }));
  }

  /**
   * Whether the photo is one the group shows to whoever holds its link:
   * its mark, or someone in it now.
   */
  showsPhoto(photoId: string): boolean {
    return (
      this.getProfile()?.mark.photoId === photoId ||
      this.memberList().some((member) => member.photoId === photoId)
    );
  }

  /**
   * The member's own name for the group from now on, or none to follow
   * their usual one again; false when they are not in it.
   */
  setDisplayName(userId: string, ownName: string | null): boolean {
    const changed = this.ctx.storage.transactionSync(() => {
      const known = this.db.select().from(members).where(inGroup(userId)).get();
      if (known === undefined) {
        return undefined;
      }
      return this.db
        .update(members)
        .set({
          cursor: this.nextCursor(),
          displayName: shownName(ownName, known.usualName, known.displayName),
          ownName,
        })
        .where(eq(members.userId, userId))
        .returning()
        .get();
    });
    if (changed === undefined) {
      return false;
    }
    broadcastChanges(this.ctx, [memberChange(changed)]);
    return true;
  }

  /**
   * The member's photo in the group from now on: their usual one, one of
   * the group's photos they uploaded and have not sent, or none (empty);
   * false when they are not in it or the photo is not theirs. The one it
   * replaces goes, unless something else in the group shows it.
   */
  setGroupPhoto(
    userId: string,
    photo: { usual: boolean; photoId: string }
  ): boolean {
    const ownPhoto = photo.usual ? null : photo.photoId;
    const changed = this.ctx.storage.transactionSync(() => {
      const known = this.db.select().from(members).where(inGroup(userId)).get();
      if (known === undefined) {
        return undefined;
      }
      if (
        ownPhoto !== null &&
        ownPhoto !== "" &&
        !showOwnPhoto(this.db, ownPhoto, userId)
      ) {
        return undefined;
      }
      const row = this.db
        .update(members)
        .set({ cursor: this.nextCursor(), ownPhoto })
        .where(eq(members.userId, userId))
        .returning()
        .get();
      return { gone: forgetUnshown(this.db, [known.ownPhoto]), row };
    });
    if (changed?.row === undefined) {
      return false;
    }
    this.dropPhotos(changed.gone);
    broadcastChanges(this.ctx, [memberChange(changed.row)]);
    return true;
  }

  /**
   * Takes the member out: their row stays as left, at the next cursor, so
   * devices catching up hear of it, and their shifts go, and the photos the
   * group showed of them, as it hears of them no more. Their sockets here
   * close, and their DO is told. Leaving when not in it changes nothing
   * but telling what is still to be told. `by` is the member who took
   * them out, none when they left themselves.
   */
  async removeMember(userId: string, by?: string): Promise<void> {
    this.takeOut(userId, by);
    await this.tellMemberships();
  }

  private takeOut(userId: string, by?: string): void {
    const left = this.ctx.storage.transactionSync(() => {
      const known = this.db.select().from(members).where(inGroup(userId)).get();
      if (known === undefined) {
        return undefined;
      }
      this.db.delete(memberDays).where(eq(memberDays.userId, userId)).run();
      this.db
        .delete(memberPatterns)
        .where(eq(memberPatterns.userId, userId))
        .run();
      this.db
        .delete(memberRepeatOrders)
        .where(eq(memberRepeatOrders.userId, userId))
        .run();
      // Their sends are taken no more, so none is to be kept from coming.
      this.db.delete(chatRecalls).where(eq(chatRecalls.userId, userId)).run();
      const row = this.db
        .update(members)
        .set({
          cursor: this.nextCursor(),
          leftAt: new Date(),
          ownPhoto: null,
          removedBy: by ?? null,
          usualPhoto: "",
        })
        .where(eq(members.userId, userId))
        .returning()
        .get();
      const notice = writeNotice(
        this.db,
        by ?? userId,
        by === undefined
          ? { kind: "left" }
          : { kind: "removed", subjectId: userId },
        this.nextCursor()
      );
      // The photos the group showed of them, unless it shows them still.
      const gone = forgetUnshown(this.db, [known.usualPhoto, known.ownPhoto]);
      this.queueNews(userId, false);
      return row === undefined ? undefined : { gone, notice, row };
    });
    if (left === undefined) {
      return;
    }
    this.dropPhotos(left.gone);
    closeUserSockets(this.ctx, userId);
    broadcastChanges(this.ctx, [memberChange(left.row), left.notice]);
  }

  /**
   * A member's account deleted (spec/sync-protocol.md, Deleting an
   * account): out of the group as on leaving, with no name, every line
   * they wrote taken back and their photos deleted, their reactions and
   * votes taken off. Whether no one is left in the group, which then goes
   * whole (`erase`).
   */
  async deleteMember(userId: string): Promise<boolean> {
    const taken = this.ctx.storage.transactionSync(() => {
      const known = this.db
        .select()
        .from(members)
        .where(eq(members.userId, userId))
        .get();
      if (known === undefined || known.deleted) {
        return undefined;
      }
      this.db.delete(memberDays).where(eq(memberDays.userId, userId)).run();
      this.db
        .delete(memberPatterns)
        .where(eq(memberPatterns.userId, userId))
        .run();
      this.db
        .delete(memberRepeatOrders)
        .where(eq(memberRepeatOrders.userId, userId))
        .run();
      // Their DO goes with the account: nothing is to be told it.
      this.db
        .delete(membershipOutbox)
        .where(eq(membershipOutbox.userId, userId))
        .run();
      const chat = eraseMemberChat(this.db, userId, () => this.nextCursor());
      const row = this.db
        .update(members)
        .set({
          cursor: this.nextCursor(),
          deleted: true,
          displayName: "",
          leftAt: known.leftAt ?? new Date(),
          ownName: null,
          ownPhoto: null,
          usualName: "",
          usualPhoto: "",
        })
        .where(eq(members.userId, userId))
        .returning()
        .get();
      // Still in it, they leave as leaving says it.
      if (known.leftAt === null) {
        chat.changes.push(
          writeNotice(this.db, userId, { kind: "left" }, this.nextCursor())
        );
      }
      // Their lines' photos, and the photos the group showed of them
      // unless it shows them still.
      const photosGone = [
        ...chat.photosGone,
        ...forgetUnshown(this.db, [known.usualPhoto, known.ownPhoto]),
      ];
      return { ...chat, photosGone, row };
    });
    if (taken !== undefined) {
      const groupId = this.ctx.id.name;
      if (groupId !== undefined && taken.photosGone.length > 0) {
        await deleteGroupPhotos(this.env, groupId, taken.photosGone);
      }
      closeUserSockets(this.ctx, userId);
      broadcastChanges(
        this.ctx,
        taken.changes,
        seenBy,
        readerView(this.db, taken.changes)
      );
      if (taken.row !== undefined) {
        broadcastChanges(this.ctx, [memberChange(taken.row)]);
      }
    }
    return this.memberList().length === 0;
  }

  /**
   * Everything the group holds gone, as its last member's account is, but
   * what those who left before are still to be told of it, which the
   * alarm goes on telling. Nothing reaches it until its tables are back.
   */
  async erase(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      closeUserSockets(this.ctx);
      const untold = this.db.select().from(membershipOutbox).all();
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      // Empty, not broken: its tables again, for whatever still asks.
      await migrate(this.db, migrations);
      if (untold.length > 0) {
        this.db.insert(membershipOutbox).values(untold).run();
        await this.wakeBy(Date.now());
      }
    });
  }

  /** Closes a member's sockets opened with a session that has ended. */
  endSession(sessionId: string): void {
    closeSessionSockets(this.ctx, sessionId);
  }

  /**
   * Sets the place up as a user's chat with Pochical's people (spec/chat.md,
   * The chat with Pochical's people): a chat of two, the user and
   * Pochical's people (chatRules.pochicalMember), kept as a group's chat
   * is and doing what chatPlaces.support lets it. Setting it up again
   * changes nothing; only the place named for the user (supportPlace) is
   * made one, never a group.
   */
  setUpSupport(userId: string): boolean {
    if (this.ctx.id.name !== supportPlace(userId)) {
      return false;
    }
    const kind = this.placeKind();
    if (kind !== undefined) {
      return kind === "support" && this.isMember(userId);
    }
    this.ctx.storage.transactionSync(() => {
      this.db
        .insert(profile)
        .values({
          cursor: this.nextCursor(),
          id: 1,
          kind: "support",
          name: POCHICAL_NAME,
        })
        .run();
      // Neither's joining is said in the chat, nor read up to.
      this.writeMember({
        ownName: null,
        userId,
        usualName: "",
        usualPhoto: "",
      });
      this.writeMember({
        ownName: null,
        userId: chatRules.pochicalMember,
        usualName: POCHICAL_NAME,
        usualPhoto: "",
      });
    });
    return true;
  }

  /** What the place's chats can do (design/src/chat.ts, chatPlaces). */
  private placeRules(): ChatPlaceRules {
    return chatPlaces[this.placeKind() ?? "group"];
  }

  /**
   * The place's id as its members' User DOs and devices keep it: the
   * group's, or chatRules.supportPlace for the chat with Pochical's people.
   */
  private placeId(): string | undefined {
    return this.placeKind() === "support"
      ? chatRules.supportPlace
      : this.ctx.id.name;
  }

  /** What the place is, or undefined before it is set up. */
  private placeKind(): ChatPlaceKind | undefined {
    return this.db.select({ kind: profile.kind }).from(profile).get()?.kind;
  }

  /** Whether the user is in the group. */
  isMember(userId: string): boolean {
    return (
      this.db
        .select({ userId: members.userId })
        .from(members)
        .where(inGroup(userId))
        .get() !== undefined
    );
  }

  /** How many are in the group. */
  memberCount(): number {
    return (
      this.db.select({ n: count() }).from(members).where(inGroup()).get()?.n ??
      0
    );
  }

  /**
   * The group's new name and mark, told to each member's DO for their
   * list of groups. A photo mark it replaces goes, unless someone in the
   * group shows it.
   */
  async setProfile(group: GroupProfile, by: string): Promise<void> {
    const known = this.getProfile();
    const nameChanged = known?.name !== group.name;
    const markChanged = !sameMark(known?.mark, group.mark);
    const { changes, gone } = this.ctx.storage.transactionSync(() => {
      const written = this.writeProfile(group);
      for (const { userId } of this.memberList()) {
        this.queueNews(userId, true);
      }
      const unshown = forgetUnshown(this.db, [known?.mark.photoId ?? null]);
      // A new name or icon is said in the chat, as LINE's groups say it.
      if (!(nameChanged || markChanged)) {
        return { changes: [written], gone: unshown };
      }
      const notice = writeNotice(
        this.db,
        by,
        {
          kind: "profileChanged",
          markChanged,
          name: nameChanged ? group.name : undefined,
        },
        this.nextCursor()
      );
      return { changes: [written, notice], gone: unshown };
    });
    broadcastChanges(this.ctx, changes);
    this.dropPhotos(gone);
    await this.tellMemberships();
  }

  /**
   * Notes what the user's DO is to hear of their place in the group, in
   * the transaction that changed it: in it, or out of it, as of the
   * group's head. It replaces any news of them not yet told.
   */
  private queueNews(userId: string, member: boolean): void {
    const row = {
      cursor: this.head(),
      dueAt: new Date(),
      failures: 0,
      inGroup: member,
    };
    this.db
      .insert(membershipOutbox)
      .values({ userId, ...row })
      .onConflictDoUpdate({ set: row, target: membershipOutbox.userId })
      .run();
  }

  /**
   * Tells each user's DO the news of their place in the group still to
   * tell, at once, as someone waits on it, then has the alarm come back
   * for any not taken.
   */
  private async tellMemberships(): Promise<void> {
    await this.deliverNews();
    const due = this.newsDue();
    if (due !== undefined) {
      await this.wakeBy(due);
    }
  }

  /**
   * Tells each user's DO the news of their place in the group still to
   * tell, the group's name and mark with it while they are in it
   * (takeMembership). News taken goes, unless newer came meanwhile; news
   * not taken is due again twice as long after each time it fails in a
   * row.
   */
  private async deliverNews(): Promise<void> {
    const groupId = this.ctx.id.name;
    const untold = this.db.select().from(membershipOutbox).all();
    if (groupId === undefined || untold.length === 0) {
      return;
    }
    const group = this.getProfile();
    await Promise.all(
      untold.map(async ({ userId, cursor, inGroup: member, failures }) => {
        const news: MembershipNews = {
          cursor,
          group: member ? group : null,
        };
        const sent = and(
          eq(membershipOutbox.userId, userId),
          eq(membershipOutbox.cursor, cursor)
        );
        try {
          await this.env.USERS.getByName(userId).takeMembership(groupId, news);
        } catch (error) {
          console.error(`Telling ${userId} of group ${groupId} failed`, error);
          const wait = retryWait(
            failures + 1,
            NEWS_RETRY_FIRST_MS,
            NEWS_RETRY_MOST_MS
          );
          this.db
            .update(membershipOutbox)
            .set({ dueAt: new Date(Date.now() + wait), failures: failures + 1 })
            .where(sent)
            .run();
          return;
        }
        this.db.delete(membershipOutbox).where(sent).run();
      })
    );
  }

  /** When the next news of a membership is due, if any is still to tell. */
  private newsDue(): number | undefined {
    return this.db
      .select({ dueAt: min(membershipOutbox.dueAt) })
      .from(membershipOutbox)
      .get()
      ?.dueAt?.getTime();
  }

  /**
   * Says in the chat that `by` remade the invite link, so whoever sent the
   * old one knows it stopped working and to send the new one.
   */
  noteInviteRemade(by: string): void {
    if (!this.isMember(by)) {
      return;
    }
    const notice = this.ctx.storage.transactionSync(() =>
      writeNotice(this.db, by, { kind: "inviteRemade" }, this.nextCursor())
    );
    broadcastChanges(this.ctx, [notice]);
  }

  /** The group's name and mark at the next cursor, as a change. */
  private writeProfile({ name, mark }: GroupProfile): Change {
    const cursor = this.nextCursor();
    const row = { cursor, name, ...markColumns(mark) };
    this.db
      .insert(profile)
      .values({ id: 1, ...row })
      .onConflictDoUpdate({ set: row, target: profile.id })
      .run();
    return profileChange({ cursor, mark, name });
  }

  /**
   * A member's usual name and photo as their User DO pushes them, at
   * `cursor`: shown unless they gave the group their own. Nothing when they
   * are the ones known. A usual photo replaced goes from the group's
   * photos, unless the group shows it still.
   */
  private takeUsualProfile(
    userId: string,
    { name, photoId, markLook }: UsualProfile,
    cursor: number
  ): Change | undefined {
    const known = this.db.select().from(members).where(inGroup(userId)).get();
    // A profile from before the look was sent keeps the one known.
    const markStyle = markLook?.style ?? known?.markStyle ?? "";
    const markFill = markLook?.fill ?? known?.markFill ?? true;
    if (
      known === undefined ||
      (known.usualName === name &&
        known.usualPhoto === photoId &&
        known.markStyle === markStyle &&
        known.markFill === markFill)
    ) {
      return undefined;
    }
    const row = this.db
      .update(members)
      .set({
        cursor,
        displayName: shownName(known.ownName, name, known.displayName),
        markFill,
        markStyle,
        usualName: name,
        usualPhoto: photoId,
      })
      .where(eq(members.userId, userId))
      .returning()
      .get();
    this.dropPhotos(forgetUnshown(this.db, [known.usualPhoto]));
    return row === undefined ? undefined : memberChange(row);
  }

  /** Photos the group no longer has deleted from storage, with their small versions. */
  private dropPhotos(photoIds: string[]): void {
    const groupId = this.ctx.id.name;
    if (groupId === undefined || photoIds.length === 0) {
      return;
    }
    this.ctx.waitUntil(deleteGroupPhotos(this.env, groupId, photoIds));
  }

  /** A new member at the next cursor, or one who left coming back, as a change. */
  private writeMember({
    userId,
    usualName,
    ownName,
    usualPhoto,
  }: NewMember): Change {
    const row = {
      cursor: this.nextCursor(),
      deleted: false,
      displayName: shownName(ownName, usualName),
      joinedAt: new Date(),
      leftAt: null,
      ownName,
      ownPhoto: null,
      // Back in by a live link: no longer taken out.
      removedBy: null,
      userId,
      usualName,
      usualPhoto,
    };
    // Their look stays as last pushed; it comes with their profile.
    const written = this.db
      .insert(members)
      .values(row)
      .onConflictDoUpdate({ set: row, target: members.userId })
      .returning()
      .get();
    return memberChange(written);
  }

  /** Gives out the cursor after the newest, for a value written now. */
  private nextCursor(): number {
    const cursor = this.head() + 1;
    this.setHead(cursor);
    return cursor;
  }

  /**
   * How new lines' notifications word them, the names and the group read
   * once for them all.
   */
  private alerts(): (line: ChatLine) => Alert {
    // Everyone who was ever in it, for a name in the words.
    const names = new Map(
      this.db
        .select({ displayName: members.displayName, userId: members.userId })
        .from(members)
        .all()
        .map((member) => [member.userId, member.displayName])
    );
    const support = this.placeKind() === "support";
    const group = {
      id: this.placeId() ?? "",
      name: this.getProfile()?.name ?? "",
    };
    return (line) => {
      const alert = alertOf(
        line,
        group,
        (id) => names.get(id) ?? "メンバー",
        // The chat with Pochical's people is a chat of two, worded as one.
        support || line.threadId !== GROUP_THREAD
      );
      // Only Pochical's people notify in the chat with them: it is titled
      // with the chat, as 設定's row names it, with no writer of its own
      // (spec/chat.md, The chat with Pochical's people).
      return support
        ? { ...alert, title: { args: [], key: SUPPORT_TITLE } }
        : alert;
    };
  }

  /**
   * Whom a member has blocked, all of them, as their User DO says it
   * (spec/chat.md, Reporting and blocking): kept so a one-to-one chat's
   * line from them is not delivered.
   */
  setBlocks(userId: string, blockedIds: string[]): void {
    this.ctx.storage.transactionSync(() => {
      setMemberBlocks(this.db, userId, blockedIds);
    });
  }

  /**
   * What a member's report of a line or a member is kept with: the line
   * and the few around it as they are, or the member's name; null when the
   * reporter is not in the group, cannot read the line, or reports
   * themselves.
   */
  reportContext(
    reporterId: string,
    target: { threadId: string; seq: number } | { userId: string }
  ): {
    targetId: string;
    targetName: string;
    context: string;
    groupName: string;
    reporterName: string;
  } | null {
    if (!(this.placeRules().reports && this.isMember(reporterId))) {
      return null;
    }
    const everyone = this.memberList();
    const memberOf = (id: string) =>
      everyone.find((member) => member.userId === id);
    const found = reportContext(this.db, reporterId, target, memberOf);
    return found === null
      ? null
      : {
          ...found,
          groupName: this.getProfile()?.name ?? "",
          reporterName: memberOf(reporterId)?.displayName ?? "メンバー",
        };
  }

  /**
   * Notes a photo a member uploads, which the Worker asks before it stores
   * it (group-photos.ts, notePhoto); refused when the user is not in the
   * group.
   */
  async notePhoto(photoId: string, userId: string): Promise<PhotoNote> {
    if (!this.isMember(userId)) {
      return "refused";
    }
    const note = notePhoto(this.db, photoId, userId);
    if (note === "noted") {
      await this.wakeBy(Date.now() + chatRules.unsentAfterMs);
    }
    return note;
  }

  /**
   * Notes a copy of someone's own photo the Worker makes into the group's
   * photos, before the group shows it as their face or its mark; false
   * when the id is an upload's, which is then not copied over. One the
   * group never comes to name goes as an upload not sent does.
   */
  async noteSharedPhoto(photoId: string, userId: string): Promise<boolean> {
    if (!noteSharedPhoto(this.db, photoId, userId)) {
      return false;
    }
    await this.wakeBy(Date.now() + chatRules.unsentAfterMs);
    return true;
  }

  /**
   * The alarm set for `due` at the latest: for a photo noted now once it
   * is past chatRules.unsentAfterMs, or news of a membership still to tell.
   */
  private async wakeBy(due: number): Promise<void> {
    const set = await this.ctx.storage.getAlarm();
    if (set === null || set > due) {
      await this.ctx.storage.setAlarm(due);
    }
  }

  /**
   * The photos nothing came to hold (spec/sync-protocol.md, Chat), deleted
   * chatRules.unsentAfterMs after they were last noted: uploads not sent,
   * and copies of someone's photo the group never came to name. From
   * storage first, then from the group, but those noted or named again
   * meanwhile. A line's photo, a face or the mark is never one. When the
   * next are due, if any.
   */
  private async sweepPhotos(): Promise<number | undefined> {
    const groupId = this.ctx.id.name;
    if (groupId === undefined) {
      return undefined;
    }
    const before = new Date(Date.now() - chatRules.unsentAfterMs);
    const stale = stalePhotos(this.db, before);
    if (stale.length > 0) {
      await deleteGroupPhotos(this.env, groupId, stale);
      forgetStalePhotos(this.db, before);
    }
    const oldest = oldestStalePhoto(this.db);
    return oldest === undefined
      ? undefined
      : oldest.getTime() + chatRules.unsentAfterMs;
  }

  /**
   * A member's socket, forwarded by the Worker once their own DO lists the
   * group; the group decides, and lets in members alone, as it accepts it
   * and at each frame after. Taking someone out closes theirs.
   */
  fetch(request: Request): Response {
    return acceptSyncSocket(this.ctx, request, (userId) =>
      this.isMember(userId)
    );
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    handleSyncMessage(ws, message, {
      admits: (userId) => this.isMember(userId),
      chatEdits: (socket, userId, edits) => {
        this.takeChatEdits(socket, userId, edits);
      },
      chatPageRequest: (socket, userId, { threadId, beforeSeq }) => {
        send(socket, {
          case: "chatPage",
          value: {
            beforeSeq,
            threadId,
            ...chatPage(this.db, userId, threadId, beforeSeq),
          },
        });
      },
      chatPhotosRequest: (socket, userId, { after, seq, threadId }) => {
        send(socket, {
          case: "chatPhotos",
          value: {
            after,
            // The head the page counts every change up to, for the device
            // to drop a page older than a change it has taken.
            cursor: BigInt(this.head()),
            seq,
            threadId,
            ...photosPage(this.db, userId, threadId, seq, after),
          },
        });
      },
      typing: (_socket, userId, { threadId, on }) => {
        // Only writing in a chat they may write in is relayed.
        if (mayRead(threadId, userId)) {
          relayTyping(
            this.ctx,
            create(TypingSchema, { on, threadId, userId }),
            mayRead
          );
        }
      },
      welcome: (socket, cursor, userId) => {
        welcome(socket, cursor, this.head(), (after) =>
          this.changesAfter(after, userId)
        );
      },
    });
  }

  /**
   * A member's shared days and patterns, pushed by their User DO as
   * pochical.v1.Changes' bytes: each value kept when newer, at the group's
   * own cursor, and sent to everyone with the group open. Pushes from
   * someone no longer in the group are dropped.
   */
  takeMemberShifts(userId: string, pushed: Uint8Array): void {
    if (!this.isMember(userId)) {
      return undefined;
    }
    const { changes } = fromBinary(ChangesSchema, pushed);
    const taken = this.ctx.storage.transactionSync(() => {
      let cursor = this.head();
      const kept: Change[] = [];
      for (const { kind } of changes) {
        let change: Change | undefined;
        if (kind.case === "day") {
          change = takeMemberDay(this.db, userId, kind.value, cursor + 1);
        } else if (kind.case === "pattern") {
          change = takeMemberPattern(this.db, userId, kind.value, cursor + 1);
        } else if (kind.case === "repeatOrders") {
          change = takeMemberRepeatOrders(
            this.db,
            userId,
            kind.value,
            cursor + 1
          );
        } else if (kind.case === "profile") {
          change = this.takeUsualProfile(userId, kind.value, cursor + 1);
        }
        if (change) {
          cursor = Number(change.cursor);
          kept.push(change);
        }
      }
      if (kept.length > 0) {
        this.db
          .insert(logHead)
          .values({ cursor, id: 1 })
          .onConflictDoUpdate({ set: { cursor }, target: logHead.id })
          .run();
      }
      return kept;
    });
    broadcastChanges(this.ctx, taken);
  }

  /**
   * A member's chat edits in one transaction, each change at the next
   * cursor; sends what changed to everyone with the group open, the lines
   * a refused edit concerned back to the sender, then acknowledges every
   * edit to the sender, as the User DO does its owner's (spec/sync-protocol.md,
   * Outbox). Someone not in the group never gets this far (`admits`).
   */
  private takeChatEdits(
    ws: WebSocket,
    userId: string,
    { edits }: ChatEdits
  ): void {
    if (edits.length > syncLimits.editsPerFrame) {
      rejectAndClose(
        ws,
        ServerError_Code.BAD_FRAME,
        `At most ${syncLimits.editsPerFrame} edits a frame`
      );
      return;
    }
    const { refused } = this.takeEdits(userId, edits);
    if (refused.length > 0) {
      send(ws, { case: "changes", value: { changes: refused } });
    }
    send(ws, {
      case: "acked",
      value: { opIds: edits.map(({ opId }) => opId) },
    });
  }

  /**
   * A member's chat edits taken, each change at the next cursor, and sent
   * to everyone with the place open; their counts and notifications told,
   * and in a support place, told outside (support-place.ts). The lines a
   * refused edit concerned, for the writer, and the new lines.
   */
  private takeEdits(
    userId: string,
    edits: ChatEdit[]
  ): { refused: Change[]; sent: ChatLine[] } {
    // Whose unread lines changed, by chat: everyone else's with a new
    // line, the reader's with a read.
    const counted = new Map<string, Set<string>>();
    // Who read, by chat, for their read mark to go with the count.
    const reads = new Set<string>();
    // Each reader's notification of a new line, the latest of a chat's,
    // and whether it mentions them.
    const alerts = new Map<string, { alert: Alert; mentioned: boolean }>();
    const recount = (threadId: string, userIds: string[]): void => {
      const users = counted.get(threadId) ?? new Set<string>();
      for (const id of userIds) {
        users.add(id);
      }
      counted.set(threadId, users);
    };
    // The other members, who blocked the writer, and how a line's
    // notification words it: read once for every send in the frame.
    let others: string[] | undefined;
    let blockers: Set<string> | undefined;
    let alertOfLine: ((line: ChatLine) => Alert) | undefined;
    const photosGone: string[] = [];
    // The new lines, whose answered lines go out with them.
    const sent: ChatLine[] = [];
    // Lines sent before their page came, whose page the server reads.
    const pages: {
      threadId: string;
      seq: number;
      link: string;
      userId: string;
    }[] = [];
    const rules = this.placeRules();
    const { changed, refused } = this.ctx.storage.transactionSync(() => {
      const made: Change[] = [];
      const back: Change[] = [];
      for (const edit of edits) {
        const cursor = this.head() + 1;
        const taken = takeChatEdit(
          this.db,
          userId,
          edit,
          cursor,
          (id) => this.isMember(id),
          rules
        );
        if (taken.change) {
          this.setHead(cursor);
          made.push(taken.change);
          if (taken.alsoChanged) {
            this.setHead(cursor + 1);
            made.push(taken.alsoChanged);
          }
          if (edit.kind.case === "send") {
            const { threadId } = edit.kind.value;
            // A one-to-one chat's line is the other's alone to read.
            const other = otherIn(threadId, userId);
            others ??= this.memberList()
              .map((member) => member.userId)
              .filter((id) => id !== userId);
            const readers = other === undefined ? others : [other];
            recount(threadId, readers);
            if (taken.change.kind.case === "chatLine") {
              const line = taken.change.kind.value;
              sent.push(line);
              const link = pageToRead(edit.kind.value);
              if (link !== undefined) {
                pages.push({ link, seq: Number(line.seq), threadId, userId });
              }
              alertOfLine ??= this.alerts();
              blockers ??= blockersOf(this.db, userId);
              const alert = alertOfLine(line);
              for (const reader of readers) {
                if (!blockers.has(reader)) {
                  alerts.set(readerKey(threadId, reader), {
                    alert,
                    mentioned: line.text.includes(mentionOf(reader)),
                  });
                }
              }
            }
          } else if (edit.kind.case === "read") {
            recount(edit.kind.value.threadId, [userId]);
            reads.add(readerKey(edit.kind.value.threadId, userId));
          }
        }
        if (taken.refused) {
          back.push(taken.refused);
        }
        if (taken.photoGone !== undefined) {
          photosGone.push(taken.photoGone);
        }
      }
      return { changed: made, refused: back };
    });
    // A photo taken back goes from the place's photos for everyone.
    const groupId = this.ctx.id.name;
    if (groupId !== undefined && photosGone.length > 0) {
      this.ctx.waitUntil(deleteGroupPhotos(this.env, groupId, photosGone));
    }
    // A reply to a line before the chat's latest page, which every device
    // with the group open holds, goes after that line, so its quote reads
    // as the line (spec/sync-protocol.md, Chat).
    const farBack = sent.filter(
      ({ threadId, replyTo }) =>
        Number(replyTo) <= latestPageAfter(this.db, threadId)
    );
    const told = [...answeredChanges(this.db, farBack), ...changed];
    broadcastChanges(this.ctx, told, seenBy, readerView(this.db, told));
    this.tellUnread(counted, alerts, reads);
    for (const page of pages) {
      this.ctx.waitUntil(this.addPage(page));
    }
    if (changed.length > 0 && this.placeKind() === "support") {
      this.relayRequested = true;
      this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now()));
    }
    return { refused, sent };
  }

  /**
   * The chat with Pochical's people told outside as it changes: to D1's
   * index and its Slack thread (support-place.ts). A failure comes back
   * after the wait the relay gives, the relayed cursor kept; a change
   * made while it runs has set the next alarm already, which is kept. The
   * photos nothing carries are swept, and the alarm comes back for the
   * next (`sweepPhotos`). News of a membership due is told, and the alarm
   * comes back for any not taken, until it is.
   */
  async alarm(): Promise<void> {
    this.relayRequested = false;
    const userId = this.supportUser();
    const waitMs =
      userId === undefined
        ? null
        : await relaySupport(this.env, this.db, userId);
    const photosDue = await this.sweepPhotos();
    await this.deliverNews();
    if (this.relayRequested) {
      return;
    }
    const newsDue = this.newsDue();
    const dues = [
      ...(waitMs === null ? [] : [Date.now() + waitMs]),
      ...(photosDue === undefined ? [] : [photosDue]),
      ...(newsDue === undefined ? [] : [newsDue]),
    ];
    if (dues.length > 0) {
      await this.ctx.storage.setAlarm(Math.min(...dues));
    }
  }

  /** The user whose chat with Pochical's people this is, if it is one. */
  private supportUser(): string | undefined {
    if (this.placeKind() !== "support") {
      return undefined;
    }
    return this.memberList().find(
      ({ userId }) => userId !== chatRules.pochicalMember
    )?.userId;
  }

  /**
   * Pochical's people's edits of the chat with them, from the admin pages
   * or Slack, taken as a member's are (chatRules.pochicalMember): new
   * lines, reactions, lines taken back. A line written in Slack keeps its
   * message there (`slackTs`), so it is not posted again. The seqs of the
   * sends' lines, taken now or before by their op_id, so a send repeated
   * is one line and answers as the first did; none outside a support
   * place.
   */
  answerAsPochical(edits: ChatEdit[], slackTs?: string): number[] {
    if (this.placeKind() !== "support") {
      return [];
    }
    this.takeEdits(chatRules.pochicalMember, edits);
    const seqs = edits.flatMap(({ kind, opId }) => {
      const line =
        kind.case === "send"
          ? this.db
              .select({ seq: chatLines.seq })
              .from(chatLines)
              .where(
                and(
                  eq(chatLines.opId, opId),
                  eq(chatLines.authorId, chatRules.pochicalMember)
                )
              )
              .get()
          : undefined;
      return line === undefined ? [] : [line.seq];
    });
    if (slackTs !== undefined) {
      for (const seq of seqs) {
        this.db
          .insert(supportSlackLines)
          .values({ seq, slackTs })
          .onConflictDoNothing()
          .run();
      }
    }
    return seqs;
  }

  /** Whether the chat with Pochical's people's line `seq` is the user's. */
  isUsersLine(seq: number): boolean {
    const userId = this.supportUser();
    return (
      userId !== undefined &&
      this.db
        .select({ authorId: chatLines.authorId })
        .from(chatLines)
        .where(atLine(GROUP_THREAD, seq))
        .get()?.authorId === userId
    );
  }

  /** A page of the chat with Pochical's people, for the admin pages. */
  supportPage(beforeSeq: number): ReturnType<typeof supportPage> | null {
    const userId = this.supportUser();
    return userId === undefined
      ? null
      : supportPage(this.db, userId, beforeSeq);
  }

  /**
   * Reads the page of a line sent before its preview came and adds it to
   * the line for everyone, as the sender's app would have (spec/chat.md,
   * Previews). A line taken back or changed meanwhile keeps as it is. The
   * sender's reads count as GetLinkPreview's do, so sending is no way
   * round its limit.
   */
  private async addPage(page: {
    threadId: string;
    seq: number;
    link: string;
    userId: string;
  }): Promise<void> {
    if (await overLimit(this.env.LINK_PREVIEW_LIMIT, page.userId)) {
      return;
    }
    const preview = await linkPreview(this.env.PHOTOS, new URL(page.link));
    if (preview === null) {
      return;
    }
    const added = this.ctx.storage.transactionSync(() => {
      const cursor = this.head() + 1;
      const change = addPreview(this.db, page, preview, cursor);
      if (change !== undefined) {
        this.setHead(cursor);
      }
      return change;
    });
    if (added !== undefined) {
      broadcastChanges(this.ctx, [added], seenBy, readerView(this.db, [added]));
    }
  }

  /**
   * Gives each member's User DO their new count of a chat's unread lines,
   * with the cursor it was counted at, for their badges
   * (spec/sync-protocol.md, Unread summary). One that fails is put right
   * by the member's next count.
   */
  private tellUnread(
    counted: Map<string, Set<string>>,
    alerts = new Map<string, { alert: Alert; mentioned: boolean }>(),
    // Who read in which chat, by readerKey: their read mark goes
    // too, for their devices to take back what was notified.
    reads = new Set<string>()
  ): void {
    const groupId = this.placeId();
    if (groupId === undefined || counted.size === 0) {
      return;
    }
    const cursor = this.head();
    const calls = [...counted].flatMap(([threadId, userIds]) =>
      // Pochical's people have no User DO: they read every chat with them
      // on the admin pages.
      [...userIds]
        .filter((userId) => userId !== chatRules.pochicalMember)
        .map(async (userId) => {
          await this.env.USERS.getByName(userId).setUnread(
            groupId,
            threadId,
            unreadCount(this.db, userId, threadId),
            cursor,
            alerts.get(readerKey(threadId, userId)),
            reads.has(readerKey(threadId, userId))
              ? readMarkOf(this.db, userId, threadId)
              : undefined
          );
        })
    );
    this.ctx.waitUntil(Promise.allSettled(calls));
  }

  /** Moves the log's head to `cursor`, a value having been written there. */
  private setHead(cursor: number): void {
    this.db
      .insert(logHead)
      .values({ cursor, id: 1 })
      .onConflictDoUpdate({ set: { cursor }, target: logHead.id })
      .run();
  }

  /**
   * Every kind of value the group keeps, of itself and its members, in
   * one list so catch-up covers them all.
   */
  private logs(): MemberLog[] {
    const { db } = this;
    return [
      {
        after: (cursor) =>
          db
            .select()
            .from(profile)
            .where(gt(profile.cursor, cursor))
            .all()
            .map((row) =>
              profileChange({
                cursor: row.cursor,
                mark: markOfRow(row),
                name: row.name,
              })
            ),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(members)
            .where(gt(members.cursor, cursor))
            .all()
            .map(memberChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberDays)
            .where(gt(memberDays.cursor, cursor))
            .all()
            .map(memberDayChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberPatterns)
            .where(gt(memberPatterns.cursor, cursor))
            .all()
            .map(memberPatternChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberRepeatOrders)
            .where(gt(memberRepeatOrders.cursor, cursor))
            .all()
            .map(memberRepeatOrdersChange),
      },
    ];
  }

  /**
   * The newest cursor the group's log has given out, 0 before any: kept
   * in a row of its own, not read off the values, which leaving members
   * take away.
   */
  private head(): number {
    return (
      this.db.select({ cursor: logHead.cursor }).from(logHead).get()?.cursor ??
      0
    );
  }

  /**
   * Every value changed after `cursor` that the member may see, in cursor
   * order; of the chats' lines, those chatChangesAfter gives.
   */
  private changesAfter(cursor: number, userId: string): Change[] {
    return byCursor([
      ...this.logs().flatMap(({ after }) => after(cursor)),
      ...chatChangesAfter(this.db, userId, cursor),
    ]);
  }
}
