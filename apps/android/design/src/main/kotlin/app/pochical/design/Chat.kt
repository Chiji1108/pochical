// Code generated from design/ by `mise run gen`. Do not edit.

package app.pochical.design

/** The chat's shared numbers (spec/chat.md); times in milliseconds. */
object Chat {
  const val announceSettleMs = 1000
  const val dayCardColumns = 6
  const val dayCardRows = 7
  const val floatingDayMs = 1500
  const val foldLines = 10
  const val largeEmojiMax = 3
  const val largeEmojiSize = 48
  const val lineGap = 4
  const val linkPreviewAspect = 1.91f
  const val linkPreviewSettleMs = 400
  const val longPressMs = 250
  const val maxPins = 5
  const val openMax = 200
  const val pageSize = 50
  const val photoDiskBytes = 200000000
  const val photoFadeMs = 200
  const val photoMaxBytes = 4000000
  const val photoMaxEdge = 2048
  const val photoMemoryBytes = 48000000
  const val photoPageAhead = 10
  const val photoPageSize = 100
  const val photoPrefetchScreens = 1
  const val photoSmallEdge = 960
  const val photoThumbHashMaxBytes = 25
  const val photosPerSend = 4
  const val pictureMaxEdge = 640
  const val pochicalMember = "pochical"
  const val prefetchScreens = 2
  const val replySwipe = 56
  const val replySwipeRubber = 0.3f
  const val runGap = 12
  const val supportPlace = "support"
  const val typingSendMs = 3000
  const val typingShowMs = 5000
  const val unsentAfterMs = 600000
}

/** What a chat can do by where it is kept (spec/chat.md, Where a chat is kept). */
data class ChatPlaceRules(
  val days: Boolean,
  val directChats: Boolean,
  val edit: Boolean,
  val mentions: Boolean,
  val pins: Boolean,
  val polls: Boolean,
  val reports: Boolean,
  val sendsDevice: Boolean,
) {
  companion object {
    val group = ChatPlaceRules(days = true, directChats = true, edit = true, mentions = true, pins = true, polls = true, reports = true, sendsDevice = false)
    val support = ChatPlaceRules(days = false, directChats = false, edit = false, mentions = false, pins = false, polls = false, reports = false, sendsDevice = true)
  }
}
