import { create, toBinary } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { syncLimits } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import {
  and,
  count as rowCount,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { sendAlert, sendWithdrawal } from "./apns";
import type { Alert, Sent } from "./apns";
import { hasKey, SHARED_DAY_FIELDS } from "./day-values";
import {
  ChangesSchema,
  DayField,
  ServerError_Code,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  CoworkerEdits,
  DayEdits,
  Hlc,
  PatternEdits,
  PreferenceEdits,
  RepeatOrdersEdits,
} from "./gen/pochical/v1/sync_pb";
import type { GroupProfile } from "./group-do";
import { markColumns } from "./group-marks";
import { isAhead } from "./hlc";
import { sharePersonPhoto } from "./photos";
import { devicesOf, dropPushToken } from "./push-tokens";
import type { Device } from "./push-tokens";
import { retryWait } from "./retry-wait";
import { supportPlace } from "./support-lines";
import {
  acceptSyncSocket,
  answerKeepalive,
  broadcastChanges,
  byCursor,
  closeSessionSockets,
  handleSyncMessage,
  rejectAndClose,
  send,
  welcome,
} from "./sync-socket";
import {
  applyCoworker,
  applyCoworkerOrder,
  applyDay,
  applyPattern,
  applyPatternOrder,
  applyPreference,
  applyRepeatOrders,
  orderFloors,
} from "./user-do-edits";
import migrations from "./user-do-migrations/migrations.js";
import {
  coworkerOrder,
  coworkers,
  dayFields,
  groupRequests,
  knownGroups,
  memberships,
  patternOrder,
  patterns,
  preferences,
  repeatOrders,
  blocks,
  chatMutes,
  chatNotified,
  chatSettings,
  profile,
  unreadCounts,
} from "./user-do-schema";
import {
  clockOfHlc,
  coworkerChange,
  coworkerOrderChange,
  dayChange,
  membershipChange,
  orderChange,
  patternChange,
  preferenceChange,
  repeatOrdersChange,
  blockChange,
  chatMuteChange,
  chatSettingsChange,
  notifyingCount,
  profileChange,
  unreadCountChange,
} from "./user-do-values";

/** The count a `select({ n: rowCount() })` gives. */
const counted = (rows: { n: number }[]): number => rows[0]?.n ?? 0;

// Values in one push to a group.
const VALUES_PER_PUSH = 500;
// After a push to a group fails, the alarm comes back for it after this
// long, twice as long each time it fails in a row, up to the most…
export const PUSH_RETRY_FIRST_MS = 10_000;
const PUSH_RETRY_MOST_MS = 3_600_000;
// …and stops coming back after this many in a row, about a day: the
// user's next change tries it again.
const PUSH_RETRIES_MOST = 30;

// How many pushes to the group have failed in a row, in the DO's storage.
const pushFailuresKey = (groupId: string): string => `pushFailures:${groupId}`;

// Set in the DO's storage once the account is deleted, so news a group was
// still telling it writes nothing.
const ERASED_KEY = "erased";

/**
 * What a group tells a user's DO of their place in it (membership_outbox
 * in the Group DO): in it, with the group's name and mark, or out of it
 * (null), as of the group's `cursor`.
 */
export type MembershipNews = {
  cursor: number;
  group: GroupProfile | null;
};

type MembershipRow = typeof memberships.$inferSelect;

/** A chat's unread lines for the user, and how many mention them. */
export type Unread = { count: number; mentions: number };

/** One kind of value the user owns, as UserDO.logs lists them. */
type SyncedLog = {
  after: (cursor: number, sharedOnly: boolean) => Change[];
  shared: boolean;
  table:
    | typeof dayFields
    | typeof patterns
    | typeof patternOrder
    | typeof repeatOrders
    | typeof coworkers
    | typeof coworkerOrder
    | typeof preferences
    | typeof memberships
    | typeof unreadCounts
    | typeof blocks
    | typeof chatMutes
    | typeof chatSettings
    | typeof profile;
};

/**
 * One Durable Object per signed-in user, named by their better-auth user
 * id. It owns their days, patterns, repeating orders and coworkers, synced between their own
 * devices over their socket (spec/sync-protocol.md, Shifts), and knows
 * which groups they are in.
 */
export class UserDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase;
  // Set when a change asks for a push, so an alarm running meanwhile
  // leaves the next one to it.
  private pushRequested = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    answerKeepalive(ctx);
    // Nothing reaches the user before their tables are up to date.
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /**
   * Closes the sockets the session opened, here, in the user's groups and
   * in their chat with Pochical's people, once it has ended.
   */
  async endSession(sessionId: string): Promise<void> {
    closeSessionSockets(this.ctx, sessionId);
    const userId = this.ctx.id.name;
    const places = this.db
      .select({ groupId: memberships.groupId })
      .from(memberships)
      .where(isNull(memberships.leftAt))
      .all()
      .map(({ groupId }) => groupId);
    if (userId !== undefined) {
      places.push(supportPlace(userId));
    }
    await Promise.all(
      places.map(async (placeId) => {
        await this.env.GROUPS.getByName(placeId).endSession(sessionId);
      })
    );
  }

  /** The group the user's request made, or null for a new request. */
  groupOf(requestId: string): string | null {
    return (
      this.db
        .select({ groupId: groupRequests.groupId })
        .from(groupRequests)
        .where(eq(groupRequests.requestId, requestId))
        .get()?.groupId ?? null
    );
  }

  /**
   * The id of the group the user's request makes: a new one the first
   * time the request id comes, the same one each time after, so a
   * repeated CreateGroup sets up the same group. The object takes one call
   * at a time, so two tries at once get the same id. Known from then on
   * (`noteGroup`).
   */
  groupIdFor(requestId: string): string {
    const made = this.groupOf(requestId);
    if (made !== null) {
      return made;
    }
    const groupId = crypto.randomUUID();
    this.ctx.storage.transactionSync(() => {
      this.db.insert(groupRequests).values({ groupId, requestId }).run();
      this.noteGroup(groupId);
    });
    return groupId;
  }

  /**
   * Notes a group the user is about to join, before the group hears of
   * them, so deleting the account reaches it whatever happens after
   * (`groupsEver`).
   */
  noteGroup(groupId: string): void {
    this.db.insert(knownGroups).values({ groupId }).onConflictDoNothing().run();
  }

  /**
   * Whether the user's chats are kept in the place: one of their groups,
   * or their chat with Pochical's people (chatRules.supportPlace), which
   * every user has.
   */
  private hasPlace(placeId: string): boolean {
    return placeId === chatRules.supportPlace || this.isMember(placeId);
  }

  /** Whether the user is in the group. */
  isMember(groupId: string): boolean {
    return (
      this.db
        .select({ groupId: memberships.groupId })
        .from(memberships)
        .where(
          and(eq(memberships.groupId, groupId), isNull(memberships.leftAt))
        )
        .get() !== undefined
    );
  }

  /**
   * What a group tells of the user's place in it, the group deciding: in
   * it, with its name and mark for their devices' list of groups, or out
   * of it. Their devices hear of it at once, and joining starts their
   * shared days and patterns on their way to the group, which also learns
   * whom they have blocked. News no newer than the latest taken from the
   * group, by its cursor, changes nothing, so it may come twice or late;
   * a deleted account takes none.
   */
  takeMembership(groupId: string, news: MembershipNews): void {
    if (this.ctx.storage.kv.get(ERASED_KEY) === true) {
      return;
    }
    const taken = this.ctx.storage.transactionSync(() => {
      const known = this.db
        .select({ newsCursor: knownGroups.newsCursor })
        .from(knownGroups)
        .where(eq(knownGroups.groupId, groupId))
        .get();
      if (known !== undefined && known.newsCursor >= news.cursor) {
        return undefined;
      }
      this.db
        .insert(knownGroups)
        .values({ groupId, newsCursor: news.cursor })
        .onConflictDoUpdate({
          set: { newsCursor: news.cursor },
          target: knownGroups.groupId,
        })
        .run();
      return news.group === null
        ? this.leaveGroup(groupId)
        : this.enterGroup(groupId, news.group);
    });
    if (taken === undefined) {
      return;
    }
    broadcastChanges(this.ctx, [membershipChange(taken.row)]);
    if (taken.joined) {
      this.ctx.waitUntil(this.tellGroup(groupId));
      this.schedulePush();
    }
  }

  /**
   * The user in the group with its name and mark as told, at the next
   * cursor: a group left before starts again, its values pushed whole.
   */
  private enterGroup(
    groupId: string,
    group: GroupProfile
  ): { row: MembershipRow; joined: boolean } {
    const joined = !this.isMember(groupId);
    const set = {
      cursor: this.head() + 1,
      ...markColumns(group.mark),
      name: group.name,
      ...(joined
        ? { joinedAt: new Date(), leftAt: null, pushedCursor: 0 }
        : {}),
    };
    const row = this.db
      .insert(memberships)
      .values({ groupId, joinedAt: new Date(), ...set })
      .onConflictDoUpdate({ set, target: memberships.groupId })
      .returning()
      .get();
    return { joined, row };
  }

  /**
   * Blocks someone in every group the two share, or unblocks them
   * (spec/chat.md, Reporting and blocking): kept, sent to the user's
   * devices, and told to each of the user's groups. Setting it as it is
   * changes nothing.
   */
  async setBlocked(blockedId: string, on: boolean): Promise<void> {
    const changed = this.ctx.storage.transactionSync(() => {
      const kept = this.db
        .select()
        .from(blocks)
        .where(eq(blocks.userId, blockedId))
        .get();
      if ((kept?.blocked ?? false) === on) {
        return undefined;
      }
      const row = { blocked: on, cursor: this.head() + 1, userId: blockedId };
      return this.db
        .insert(blocks)
        .values(row)
        .onConflictDoUpdate({ set: row, target: blocks.userId })
        .returning()
        .get();
    });
    if (changed === undefined) {
      return;
    }
    broadcastChanges(this.ctx, [blockChange(changed)]);
    const groups = this.db
      .select({ groupId: memberships.groupId })
      .from(memberships)
      .where(isNull(memberships.leftAt))
      .all();
    // Told before answering, so the block holds once the call returns.
    await Promise.allSettled(
      groups.map(async ({ groupId }) => {
        await this.tellGroup(groupId);
      })
    );
  }

  /** Whom the user has blocked now. */
  private blockedIds(): string[] {
    return this.db
      .select({ userId: blocks.userId })
      .from(blocks)
      .where(eq(blocks.blocked, true))
      .all()
      .map(({ userId }) => userId);
  }

  /**
   * Tells a group whom the user has blocked, all of them, so one that
   * fails is put right with the next block, or when the user joins again.
   */
  private async tellGroup(groupId: string): Promise<void> {
    const userId = this.ctx.id.name;
    if (userId === undefined) {
      return;
    }
    await this.env.GROUPS.getByName(groupId).setBlocks(
      userId,
      this.blockedIds()
    );
  }

  /**
   * What the user holds that the person entered (spec/sync-protocol.md,
   * Switching to an account in use): days with a shift, whether a
   * repeating order is set, coworkers, and the groups they are in.
   */
  holdings(): {
    shiftDays: number;
    repeating: boolean;
    coworkers: number;
    groups: number;
  } {
    const shiftDays = counted(
      this.db
        .select({ n: rowCount() })
        .from(dayFields)
        .where(
          and(
            eq(dayFields.field, DayField.PATTERN),
            isNotNull(dayFields.value),
            ne(dayFields.value, "")
          )
        )
        .all()
    );
    const named = counted(
      this.db
        .select({ n: rowCount() })
        .from(coworkers)
        .where(isNotNull(coworkers.name))
        .all()
    );
    const groups = counted(
      this.db
        .select({ n: rowCount() })
        .from(memberships)
        .where(isNull(memberships.leftAt))
        .all()
    );
    const order = this.db.select().from(repeatOrders).get();
    // Set when its timeline holds any order at all.
    const repeating = order !== undefined && /\[\s*\{/u.test(order.data);
    return { coworkers: named, groups, repeating, shiftDays };
  }

  /**
   * Every group the user ever asked to make or join, or was told of: the
   * groups deleting the account goes through. Each of the three keeps
   * some: a group noted or told of (known_groups), one listed
   * (memberships, kept from before known_groups too), and one asked to be
   * made (group_requests).
   */
  groupsEver(): string[] {
    const ids = [
      ...this.db.select({ id: knownGroups.groupId }).from(knownGroups).all(),
      ...this.db.select({ id: memberships.groupId }).from(memberships).all(),
      ...this.db
        .select({ id: groupRequests.groupId })
        .from(groupRequests)
        .all(),
    ].map(({ id }) => id);
    return [...new Set(ids)];
  }

  /** Whether the user ever asked to make or join the group (`groupsEver`). */
  knowsGroup(groupId: string): boolean {
    return this.groupsEver().includes(groupId);
  }

  /**
   * The user's account deleted (spec/sync-protocol.md, Deleting an
   * account): every socket closed, and everything kept here gone, their
   * days, patterns, coworkers, groups and push tokens with it; news a
   * group still tells of them is taken no more. Nothing reaches it until
   * its tables are back.
   */
  async erase(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const socket of this.ctx.getWebSockets()) {
        socket.close(1000, "The account is deleted");
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      // Empty, not broken: its tables again, for whatever still asks.
      await migrate(this.db, migrations);
      this.ctx.storage.kv.put(ERASED_KEY, true);
    });
  }

  /**
   * The user out of the group: it stays as left, at the next cursor, so
   * their devices catching up hear of it, and nothing more is pushed to
   * it. Its unread counts go. None when they were not in it.
   */
  private leaveGroup(
    groupId: string
  ): { row: MembershipRow; joined: false } | undefined {
    if (!this.isMember(groupId)) {
      return undefined;
    }
    // Taken before its counts go, so the head never goes back.
    const cursor = this.head() + 1;
    // Its counts go with it: devices drop them as they hear of the
    // leaving, and joining again starts at the chats' end.
    this.db.delete(unreadCounts).where(eq(unreadCounts.groupId, groupId)).run();
    this.db.delete(chatNotified).where(eq(chatNotified.groupId, groupId)).run();
    const row = this.db
      .update(memberships)
      .set({ cursor, leftAt: new Date() })
      .where(eq(memberships.groupId, groupId))
      .returning()
      .get();
    return row === undefined ? undefined : { joined: false, row };
  }

  /**
   * How many lines of a chat in one of the user's groups they have not
   * read, as the group counted them at its cursor `groupCursor`, for their
   * devices' badges, sent to them when it changed. One counted no later
   * than the count kept, or for a group they are not in, changes nothing.
   */
  setUnread(
    groupId: string,
    threadId: string,
    unread: Unread,
    groupCursor: number,
    // A new line to tell the user's devices of, with the count, and
    // whether it mentions the user.
    line?: { alert: Alert; mentioned: boolean },
    // Where the user's read mark in the chat is, when they read.
    read?: number
  ): void {
    this.storeUnread(groupId, threadId, unread, groupCursor);
    if (
      line !== undefined &&
      this.notifies(groupId, threadId, line.mentioned)
    ) {
      this.ctx.waitUntil(this.notify(line.alert));
    }
    if (read !== undefined) {
      this.ctx.waitUntil(this.withdraw(groupId, threadId, read));
    }
  }

  /**
   * Keeps that the user's devices were told of a chat's line `seq`, for a
   * read reaching it to take the notification back.
   */
  private keepNotified(groupId: string, threadId: string, seq: number): void {
    this.db
      .insert(chatNotified)
      .values({ firstSeq: seq, groupId, lastSeq: seq, threadId })
      .onConflictDoUpdate({
        set: {
          firstSeq: sql`min(${chatNotified.firstSeq}, ${seq})`,
          lastSeq: sql`max(${chatNotified.lastSeq}, ${seq})`,
        },
        target: [chatNotified.groupId, chatNotified.threadId],
      })
      .run();
  }

  /**
   * The user read a chat up to `readTo`: when that reaches lines their
   * devices were notified of, each device is told to take those back
   * (spec/chat.md, Notifications), once; lines notified after it wait for
   * a later read.
   */
  private async withdraw(
    groupId: string,
    threadId: string,
    readTo: number
  ): Promise<void> {
    const chat = and(
      eq(chatNotified.groupId, groupId),
      eq(chatNotified.threadId, threadId)
    );
    const notified = this.db.select().from(chatNotified).where(chat).get();
    if (notified === undefined || readTo < notified.firstSeq) {
      return;
    }
    if (readTo >= notified.lastSeq) {
      this.db.delete(chatNotified).where(chat).run();
    } else {
      this.db
        .update(chatNotified)
        .set({ firstSeq: readTo + 1 })
        .where(chat)
        .run();
    }
    await this.toDevices(
      async (device) =>
        await sendWithdrawal(this.env, device, { groupId, readTo, threadId })
    );
  }

  /**
   * Whether a new line in a chat notifies (spec/chat.md, Notifications):
   * in a group the user is in, a chat that is on, or one turned off when
   * the line mentions them and mentions notify.
   */
  private notifies(
    groupId: string,
    threadId: string,
    mentioned: boolean
  ): boolean {
    // Any of the user's places: their groups, and their chat with
    // Pochical's people, whose answers notify as any line does.
    if (!this.hasPlace(groupId)) {
      return false;
    }
    return (
      notifyingCount(
        { count: 1, mentions: mentioned ? 1 : 0 },
        this.isMuted(groupId, threadId),
        this.mentionsWhenMuted()
      ) > 0
    );
  }

  private isMuted(groupId: string, threadId: string): boolean {
    return (
      this.db
        .select({ muted: chatMutes.muted })
        .from(chatMutes)
        .where(
          and(eq(chatMutes.groupId, groupId), eq(chatMutes.threadId, threadId))
        )
        .get()?.muted ?? false
    );
  }

  /** メンションはいつも通知: on until the user turns it off. */
  private mentionsWhenMuted(): boolean {
    return (
      this.db
        .select({ on: chatSettings.mentionsWhenMuted })
        .from(chatSettings)
        .get()?.on ?? true
    );
  }

  /**
   * Turns a chat's notifications off, or on again (spec/chat.md,
   * Notifications): kept and sent to the user's devices. Setting it as it
   * is changes nothing; false for a group the user is not in.
   */
  setChatMuted(groupId: string, threadId: string, muted: boolean): boolean {
    if (!this.hasPlace(groupId)) {
      return false;
    }
    const changed = this.ctx.storage.transactionSync(() => {
      if (this.isMuted(groupId, threadId) === muted) {
        return undefined;
      }
      const row = { cursor: this.head() + 1, groupId, muted, threadId };
      return this.db
        .insert(chatMutes)
        .values(row)
        .onConflictDoUpdate({
          set: { cursor: row.cursor, muted },
          target: [chatMutes.groupId, chatMutes.threadId],
        })
        .returning()
        .get();
    });
    if (changed !== undefined) {
      broadcastChanges(this.ctx, [chatMuteChange(changed)]);
    }
    return true;
  }

  /** Sets メンションはいつも通知, sent to the user's devices. */
  setChatNotifications(mentionsWhenMuted: boolean): void {
    const changed = this.ctx.storage.transactionSync(() => {
      const row = { cursor: this.head() + 1, id: 1, mentionsWhenMuted };
      return this.db
        .insert(chatSettings)
        .values(row)
        .onConflictDoUpdate({
          set: { cursor: row.cursor, mentionsWhenMuted },
          target: chatSettings.id,
        })
        .returning()
        .get();
    });
    broadcastChanges(this.ctx, [chatSettingsChange(changed)]);
  }

  /** The usual name and photo, each empty before the user sets them. */
  profileOf(): { name: string; photoId: string } {
    const row = this.db.select().from(profile).get();
    return { name: row?.name ?? "", photoId: row?.photoId ?? "" };
  }

  /**
   * Sets the usual name and photo, each empty for none, sent to the user's
   * devices and pushed to their groups. The photo it replaces, for the
   * caller to delete; empty when none.
   */
  setProfile(name: string, photoId: string): string {
    const before = this.profileOf().photoId;
    const changed = this.ctx.storage.transactionSync(() => {
      const row = { cursor: this.head() + 1, id: 1, name, photoId };
      return this.db
        .insert(profile)
        .values(row)
        .onConflictDoUpdate({
          set: { cursor: row.cursor, name, photoId },
          target: profile.id,
        })
        .returning()
        .get();
    });
    broadcastChanges(this.ctx, [profileChange(changed)]);
    this.schedulePush();
    return before === photoId ? "" : before;
  }

  /**
   * Sets the shape the user's marks are drawn in, sent to their devices
   * and pushed to their groups as the profile is; the same again changes
   * nothing.
   */
  setMarkLook(style: string, fill: boolean): void {
    const known = this.db.select().from(profile).get();
    if (known?.markStyle === style && known.markFill === fill) {
      return;
    }
    const changed = this.ctx.storage.transactionSync(() => {
      const cursor = this.head() + 1;
      return this.db
        .insert(profile)
        .values({ cursor, id: 1, markFill: fill, markStyle: style, name: "" })
        .onConflictDoUpdate({
          set: { cursor, markFill: fill, markStyle: style },
          target: profile.id,
        })
        .returning()
        .get();
    });
    broadcastChanges(this.ctx, [profileChange(changed)]);
    this.schedulePush();
  }

  /**
   * Tells each of the user's devices of `alert`, the app icon's badge at
   * the user's unread lines in every group, keeping a chat's line as
   * notified for a read to take back.
   */
  private async notify(alert: Alert): Promise<void> {
    if (alert.line !== undefined) {
      this.keepNotified(alert.groupId, alert.threadId, alert.line.seq);
    }
    const badge = this.badge();
    await this.toDevices(
      async (device, recipientId) =>
        await sendAlert(this.env, device, alert, { badge, recipientId })
    );
  }

  /**
   * Sends to each of the user's devices, those of their sessions now; a
   * token APNs says is gone is dropped.
   */
  private async toDevices(
    push: (device: Device, userId: string) => Promise<Sent>
  ): Promise<void> {
    const userId = this.ctx.id.name;
    if (userId === undefined) {
      return;
    }
    const devices = await devicesOf(this.env.DB, userId);
    await Promise.all(
      devices.map(async (device) => {
        const sent = await push(device, userId).catch((): Sent => "failed");
        if (sent === "gone") {
          await dropPushToken(this.env.DB, device.token);
        }
      })
    );
  }

  /**
   * The app icon's badge: the unread lines that count in every chat of
   * every group, as what notifies (spec/chat.md, Unread lines).
   */
  private badge(): number {
    const muted = new Set(
      this.db
        .select({ groupId: chatMutes.groupId, threadId: chatMutes.threadId })
        .from(chatMutes)
        .where(eq(chatMutes.muted, true))
        .all()
        .map(({ groupId, threadId }) => `${groupId}\n${threadId}`)
    );
    const mentionsWhenMuted = this.mentionsWhenMuted();
    let total = 0;
    for (const row of this.db.select().from(unreadCounts).all()) {
      total += notifyingCount(
        row,
        muted.has(`${row.groupId}\n${row.threadId}`),
        mentionsWhenMuted
      );
    }
    return total;
  }

  private storeUnread(
    groupId: string,
    threadId: string,
    { count, mentions }: Unread,
    groupCursor: number
  ): void {
    const changed = this.ctx.storage.transactionSync(() => {
      if (!this.hasPlace(groupId)) {
        return undefined;
      }
      const stored = this.db
        .select({
          count: unreadCounts.count,
          groupCursor: unreadCounts.groupCursor,
          mentions: unreadCounts.mentions,
        })
        .from(unreadCounts)
        .where(
          and(
            eq(unreadCounts.groupId, groupId),
            eq(unreadCounts.threadId, threadId)
          )
        )
        .get();
      // One counted no later than the count kept says nothing new.
      if (stored !== undefined && stored.groupCursor >= groupCursor) {
        return undefined;
      }
      // The same count, newer: kept as newer, so an older one arriving
      // after it changes nothing, but the devices hear nothing.
      if (stored?.count === count && stored.mentions === mentions) {
        this.db
          .update(unreadCounts)
          .set({ groupCursor })
          .where(
            and(
              eq(unreadCounts.groupId, groupId),
              eq(unreadCounts.threadId, threadId)
            )
          )
          .run();
        return undefined;
      }
      const row = {
        count,
        cursor: this.head() + 1,
        groupCursor,
        groupId,
        mentions,
        threadId,
      };
      return this.db
        .insert(unreadCounts)
        .values(row)
        .onConflictDoUpdate({
          set: { count, cursor: row.cursor, groupCursor, mentions },
          target: [unreadCounts.groupId, unreadCounts.threadId],
        })
        .returning()
        .get();
    });
    if (changed !== undefined) {
      broadcastChanges(this.ctx, [unreadCountChange(changed)]);
    }
  }

  /**
   * Pushes each of the user's groups what changed for it since it last
   * took a push. Run by the DO's alarm. A group that could not be reached
   * keeps its cursor and gets the values on a later round, without holding
   * back the groups after it; they carry their clocks, so one taken twice
   * changes nothing.
   *
   * The runtime's own retries of an alarm that throws stop after a few,
   * which would leave the values waiting for the user's next change, so
   * the alarm comes back for a failed group itself, each group waiting by
   * its own failures. A change made while it runs has set the next alarm
   * already, which is kept.
   */
  async alarm(): Promise<void> {
    const userId = this.ctx.id.name;
    if (userId === undefined) {
      return;
    }
    this.pushRequested = false;
    const head = this.head();
    const groups = this.db
      .select()
      .from(memberships)
      .where(isNull(memberships.leftAt))
      .all();
    const retries: number[] = [];
    for (const { groupId, pushedCursor } of groups) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one group at a time
        await this.pushTo(groupId, userId, this.sharedAfter(pushedCursor));
      } catch (error) {
        console.error(`Pushing to group ${groupId} failed`, error);
        const wait = this.pushFailed(groupId);
        if (wait !== undefined) {
          retries.push(wait);
        }
        continue;
      }
      this.pushSucceeded(groupId);
      this.db
        .update(memberships)
        .set({ pushedCursor: head })
        .where(eq(memberships.groupId, groupId))
        .run();
    }
    if (!this.pushRequested && retries.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + Math.min(...retries));
    }
  }

  /**
   * Counts a failed push to the group: how long to wait before trying it
   * again, or undefined once it has failed too many times in a row.
   */
  private pushFailed(groupId: string): number | undefined {
    const { kv } = this.ctx.storage;
    const stored: unknown = kv.get(pushFailuresKey(groupId));
    const failures = (typeof stored === "number" ? stored : 0) + 1;
    kv.put(pushFailuresKey(groupId), failures);
    if (failures > PUSH_RETRIES_MOST) {
      return undefined;
    }
    return retryWait(failures, PUSH_RETRY_FIRST_MS, PUSH_RETRY_MOST_MS);
  }

  private pushSucceeded(groupId: string): void {
    const { kv } = this.ctx.storage;
    if (kv.get(pushFailuresKey(groupId)) !== undefined) {
      kv.delete(pushFailuresKey(groupId));
    }
  }

  private schedulePush(): void {
    this.pushRequested = true;
    void this.ctx.storage.setAlarm(Date.now());
  }

  /**
   * Every kind of value the user owns, in one list so catch-up, the cursor
   * head and the pushes to groups cover the same ones: its table, its rows
   * changed after a cursor as changes (only what groups see, when asked),
   * and whether groups see it at all.
   */
  private logs(): SyncedLog[] {
    const { db } = this;
    return [
      {
        after: (cursor, sharedOnly) =>
          db
            .select()
            .from(dayFields)
            .where(
              and(
                gt(dayFields.cursor, cursor),
                // Only the fields groups see: memos and people, and any
                // field not named there, stay with their owner.
                sharedOnly
                  ? inArray(dayFields.field, SHARED_DAY_FIELDS)
                  : undefined
              )
            )
            .all()
            .map(dayChange),
        shared: true,
        table: dayFields,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(patterns)
            .where(gt(patterns.cursor, cursor))
            .all()
            .map(patternChange),
        shared: true,
        table: patterns,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(patternOrder)
            .where(gt(patternOrder.cursor, cursor))
            .all()
            .map(orderChange),
        shared: false,
        table: patternOrder,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(repeatOrders)
            .where(gt(repeatOrders.cursor, cursor))
            .all()
            .map(repeatOrdersChange),
        shared: true,
        table: repeatOrders,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(coworkers)
            .where(gt(coworkers.cursor, cursor))
            .all()
            .map(coworkerChange),
        shared: false,
        table: coworkers,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(coworkerOrder)
            .where(gt(coworkerOrder.cursor, cursor))
            .all()
            .map(coworkerOrderChange),
        shared: false,
        table: coworkerOrder,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(preferences)
            .where(gt(preferences.cursor, cursor))
            .all()
            .map(preferenceChange),
        shared: false,
        table: preferences,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberships)
            .where(gt(memberships.cursor, cursor))
            .all()
            .map(membershipChange),
        shared: false,
        table: memberships,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(unreadCounts)
            .where(gt(unreadCounts.cursor, cursor))
            .all()
            .map(unreadCountChange),
        shared: false,
        table: unreadCounts,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(blocks)
            .where(gt(blocks.cursor, cursor))
            .all()
            .map(blockChange),
        shared: false,
        table: blocks,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(chatMutes)
            .where(gt(chatMutes.cursor, cursor))
            .all()
            .map(chatMuteChange),
        shared: false,
        table: chatMutes,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(chatSettings)
            .where(gt(chatSettings.cursor, cursor))
            .all()
            .map(chatSettingsChange),
        shared: false,
        table: chatSettings,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(profile)
            .where(gt(profile.cursor, cursor))
            .all()
            .map(profileChange),
        // The groups show it unless the user gave one a name of its own.
        shared: true,
        table: profile,
      },
    ];
  }

  /** The newest cursor across everything the user owns, 0 before any. */
  private head(): number {
    const heads = this.logs().map(
      ({ table }) =>
        this.db
          .select({ head: max(table.cursor) })
          .from(table)
          .get()?.head ?? 0
    );
    return Math.max(0, ...heads);
  }

  /** Every value changed after `cursor`, in cursor order. */
  private changesAfter(cursor: number): Change[] {
    return byCursor(this.logs().flatMap(({ after }) => after(cursor, false)));
  }

  /**
   * What a group sees of the user, changed after `cursor`: days' pattern
   * and times, never the memo or the people, their patterns and their
   * repeating orders.
   */
  private sharedAfter(cursor: number): Change[] {
    return byCursor(
      this.logs().flatMap(({ after, shared }) =>
        shared ? after(cursor, true) : []
      )
    );
  }

  private async pushTo(
    groupId: string,
    userId: string,
    changes: Change[]
  ): Promise<void> {
    const group = this.env.GROUPS.getByName(groupId);
    // The usual photo goes into the group's photos before the group hears
    // of it, so its members can read it at once.
    for (const { kind } of changes) {
      if (kind.case === "profile" && kind.value.photoId !== "") {
        // oxlint-disable-next-line no-await-in-loop -- one at most a push
        await sharePersonPhoto(this.env, userId, kind.value.photoId, groupId);
      }
    }
    for (let at = 0; at < changes.length; at += VALUES_PER_PUSH) {
      const pushed = toBinary(
        ChangesSchema,
        create(ChangesSchema, {
          changes: changes.slice(at, at + VALUES_PER_PUSH),
        })
      );
      // oxlint-disable-next-line no-await-in-loop -- in order, to one group
      await group.takeMemberShifts(userId, pushed);
    }
  }

  /** The user's own socket, forwarded once the Worker has checked them. */
  fetch(request: Request): Response {
    return acceptSyncSocket(this.ctx, request);
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    handleSyncMessage(ws, message, {
      coworkerEdits: (socket, edits) => {
        this.takeCoworkerEdits(socket, edits);
      },
      dayEdits: (socket, edits) => {
        this.takeDayEdits(socket, edits);
      },
      patternEdits: (socket, edits) => {
        this.takePatternEdits(socket, edits);
      },
      preferenceEdits: (socket, edits) => {
        this.takePreferenceEdits(socket, edits);
      },
      repeatOrdersEdits: (socket, edits) => {
        this.takeRepeatOrdersEdits(socket, edits);
      },
      welcome: (socket, cursor) => {
        welcome(socket, cursor, this.head(), (after) =>
          this.changesAfter(after)
        );
      },
    });
  }

  /**
   * Takes a frame of edits in one transaction, each change given the next
   * cursor; sends what changed to every device of the user, then
   * acknowledges every edit to the sender. An edit may change nothing, one value, or several
   * (an order and the days it takes back), from `cursor` on. A frame with
   * a clock too far past the server's time is refused whole, so the
   * device corrects its clock and sends the edits again.
   */
  private takeEdits<Edit extends { opId: string }>(
    ws: WebSocket,
    edits: Edit[],
    clockOf: (edit: Edit) => Hlc | undefined,
    apply: (edit: Edit, cursor: number) => Change | Change[] | undefined
  ): void {
    if (edits.length > syncLimits.editsPerFrame) {
      rejectAndClose(
        ws,
        ServerError_Code.BAD_FRAME,
        `At most ${syncLimits.editsPerFrame} edits a frame`
      );
      return;
    }
    const now = Date.now();
    if (edits.some((edit) => isAhead(clockOfHlc(clockOf(edit)), now))) {
      rejectAndClose(
        ws,
        ServerError_Code.CLOCK_AHEAD,
        `A clock runs more than ${syncLimits.clockAheadMs} ms past the server's`
      );
      return;
    }
    const changed = this.ctx.storage.transactionSync(() => {
      let cursor = this.head();
      const changes: Change[] = [];
      for (const edit of edits) {
        const made = [apply(edit, cursor + 1) ?? []].flat();
        const last = made.at(-1);
        if (last) {
          cursor = Number(last.cursor);
          changes.push(...made);
        }
      }
      return changes;
    });
    if (changed.length > 0) {
      this.schedulePush();
    }
    broadcastChanges(this.ctx, changed);
    // After the changes, so the sender has the server's value by the time
    // its edits leave the outbox (spec/sync-protocol.md, Outbox).
    send(ws, {
      case: "acked",
      value: { opIds: edits.map(({ opId }) => opId) },
    });
  }

  /**
   * The owner's day edits: each field taken when its clock is newer than
   * the one stored. An edit whose value does not fit its field is answered
   * with the stored value under a newer clock, so the device that made it
   * is corrected; one for no real day or field is only acknowledged.
   */
  private takeDayEdits(ws: WebSocket, { edits }: DayEdits): void {
    // Read once a frame: no day edit lays a floor.
    const floors = orderFloors(this.db);
    this.takeEdits(
      ws,
      edits,
      ({ value }) => value?.hlc,
      ({ value }, cursor) =>
        hasKey(value) ? applyDay(this.db, value, cursor, floors) : undefined
    );
  }

  /** The owner's pattern edits, taken as their days are. */
  private takePatternEdits(ws: WebSocket, { edits }: PatternEdits): void {
    this.takeEdits(
      ws,
      edits,
      ({ kind }) => kind.value?.hlc,
      ({ kind }, cursor) => {
        if (kind.case === "pattern") {
          return applyPattern(this.db, kind.value, cursor);
        }
        if (kind.case === "order") {
          return applyPatternOrder(this.db, kind.value, cursor);
        }
        return undefined;
      }
    );
  }

  /** The owner's repeating orders, each edit one whole timeline. */
  private takeRepeatOrdersEdits(
    ws: WebSocket,
    { edits }: RepeatOrdersEdits
  ): void {
    this.takeEdits(
      ws,
      edits,
      ({ orders }) => orders?.hlc,
      (edit, cursor) => applyRepeatOrders(this.db, edit, cursor)
    );
  }

  /** The owner's coworker edits, taken as their patterns are. */
  private takeCoworkerEdits(ws: WebSocket, { edits }: CoworkerEdits): void {
    this.takeEdits(
      ws,
      edits,
      ({ kind }) => kind.value?.hlc,
      ({ kind }, cursor) => {
        if (kind.case === "coworker") {
          return applyCoworker(this.db, kind.value, cursor);
        }
        if (kind.case === "order") {
          return applyCoworkerOrder(this.db, kind.value, cursor);
        }
        return undefined;
      }
    );
  }

  /** The owner's preferences, taken as their coworkers are. */
  private takePreferenceEdits(ws: WebSocket, { edits }: PreferenceEdits): void {
    this.takeEdits(
      ws,
      edits,
      ({ value }) => value?.hlc,
      ({ value }, cursor) =>
        value === undefined
          ? undefined
          : applyPreference(this.db, value, cursor)
    );
  }
}
