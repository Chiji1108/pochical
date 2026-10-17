// Code generated from design/ by `mise run gen`. Do not edit.

/// The chat's shared numbers (spec/chat.md); times in milliseconds.
public enum Chat {
  public static let dayCardColumns = 6
  public static let dayCardRows = 7
  public static let floatingDayMs = 1500
  public static let foldLines = 10
  public static let largeEmojiMax = 3
  public static let largeEmojiSize = 48
  public static let lineGap = 4
  public static let linkPreviewAspect = 1.91
  public static let linkPreviewSettleMs = 400
  public static let longPressMs = 250
  public static let maxPins = 5
  public static let openMax = 200
  public static let pageSize = 50
  public static let photoDiskBytes = 200000000
  public static let photoFadeMs = 200
  public static let photoMaxBytes = 4000000
  public static let photoMaxEdge = 2048
  public static let photoMemoryBytes = 48000000
  public static let photoPrefetchScreens = 1
  public static let photoSmallEdge = 960
  public static let photoThumbHashMaxBytes = 25
  public static let photosPerSend = 4
  public static let pictureMaxEdge = 640
  public static let pochicalMember = "pochical"
  public static let prefetchScreens = 2
  public static let replySwipe = 56
  public static let replySwipeRubber = 0.3
  public static let runGap = 12
  public static let typingSendMs = 3000
  public static let typingShowMs = 5000
  public static let unsentAfterMs = 600000
}

/// What a chat can do by where it is kept (spec/chat.md, Where a chat is kept).
public struct ChatPlaceRules: Hashable, Sendable {
  public let days: Bool
  public let directChats: Bool
  public let edit: Bool
  public let mentions: Bool
  public let pins: Bool
  public let polls: Bool
  public let reports: Bool
  public let sendsDevice: Bool
  public static let group = ChatPlaceRules(days: true, directChats: true, edit: true, mentions: true, pins: true, polls: true, reports: true, sendsDevice: false)
  public static let support = ChatPlaceRules(days: false, directChats: false, edit: false, mentions: false, pins: false, polls: false, reports: false, sendsDevice: true)
}
