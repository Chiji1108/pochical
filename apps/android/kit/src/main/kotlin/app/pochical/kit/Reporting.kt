package app.pochical.kit

import app.pochical.design.Chat
import app.pochical.design.ChatPlaceRules

// Where a chat is kept and what its place lets it do, and reporting and blocking as every platform
// decides them (spec/chat.md, Where a chat is kept; Reporting and blocking; spec/vectors/chat.json,
// folded and reportable).

/** What the chats of the place the device keeps by [placeId] can do: the chat with Pochical's people's, else a group's. */
fun placeRules(placeId: String): ChatPlaceRules = if (placeId == Chat.supportPlace) ChatPlaceRules.support else ChatPlaceRules.group

/**
 * Whether a line of [kind] shows folded to ブロック中のメンバーのメッセージ: someone's message in the
 * place's own chat ([ownChat]) whose writer the reader blocked ([writerBlocked]). Their one-to-one
 * lines sent while blocked come hidden instead, and those sent before stay as they were.
 */
fun folds(kind: LineKind, ownChat: Boolean, writerBlocked: Boolean): Boolean = ownChat && writerBlocked && kind.isMessage

/** Whether the line shows folded for a reader who blocked those in [blocked] (`folds`). */
fun ChatLine.folds(blocked: Set<String>): Boolean = folds(content.kind, ownChat = threadId == GROUP_THREAD, writerBlocked = authorId in blocked)

/** Whether a line of [kind] offers 通報 in its menu: someone else's message ([mine] false), where the place's [rules] take reports. */
fun reportable(kind: LineKind, mine: Boolean, rules: ChatPlaceRules): Boolean = !mine && rules.reports && kind.isMessage

/** A line someone wrote and the reader sees: not the app's notice, one taken back, or one not delivered to them. */
private val LineKind.isMessage: Boolean
  get() = this == LineKind.Words || this == LineKind.Photos || this == LineKind.Days || this == LineKind.Poll

/** What is reported (`ChatService.Report`): someone else's line, sent with the few around it, or a member. */
sealed interface Reported {
  data class Line(val threadId: String, val seq: Long) : Reported

  data class Member(val userId: String) : Reported
}
