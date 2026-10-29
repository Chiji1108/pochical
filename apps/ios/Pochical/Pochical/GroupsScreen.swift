import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import Synchronization

/// The places' sockets the environment holds until the app puts its own,
/// none of them ever opened, as no session gives them anyone to connect as.
private let placeholderSockets = GroupSockets(database: try! DatabaseQueue())

/// Opens one of Pochical's invitations on its join screen, as an action
/// the environment carries, as SwiftUI's OpenURLAction is.
struct OpenInviteAction {
  let open: @MainActor (String) -> Void

  @MainActor func callAsFunction(_ code: String) {
    open(code)
  }
}

extension EnvironmentValues {
  /// The server's GroupService, as the signed-in user: as no one until
  /// the app puts its own.
  @Entry var groupCalls = GroupCalls(current: CurrentAccount())
  /// The chats' places' sockets, each place's client for its screens.
  @Entry var groupSockets = placeholderSockets
  /// Opens one of Pochical's invitations on its join screen, as reading
  /// its link does.
  @Entry var openInvite = OpenInviteAction { _ in }
  /// The group whose photos its screens' faces are, for those that know a
  /// member's photo but not the group (MemberAvatar).
  @Entry var photoShelf: PhotoShelf? = nil
  /// Each member's photo by their id, for faces given only who it is.
  @Entry var memberFaces: [String: String] = [:]
  /// The signed-in user's id, once known, for faces to know their own.
  @Entry var meID: String?
}

/// The グループ tab (/design's DesignGroup): with no group yet, what groups
/// are for and a way to start one; else the groups down the side, as
/// /design's rail, and the one open beside them. Its pages open over the
/// tabs (RootNavigation), and its buttons are in the bar (GroupHubButtons).
struct GroupsScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.rootNavigator) private var navigator
  @Environment(\.barTop) private var barTop
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  /// The group open beside the rail, the first until one is picked.
  @Binding var openID: String?
  /// Each group's unread lines that count.
  let unread: [String: Int]
  /// Opens the camera to read a group's QR code.
  let onScan: () -> Void

  var body: some View {
    Group {
      if let open = openGroup(openID, among: groups) {
        HStack(alignment: .top, spacing: 0) {
          GroupRail(
            groups: groups, openID: open.id, unread: unread,
            onOpen: { pick($0, over: open.id) }, onNew: newGroup, onScan: onScan)
          // Up beside the bar's heading, as it stood beside the page's.
          .padding(.top, barTop)
          .ignoresSafeArea(.container, edges: .top)
          GroupHub(group: open) { day in
            navigator?.open(.group(.shifts(open, day: day)))
          } onChat: { thread, other in
            navigator?.open(.group(.chat(open, thread: thread, with: other)))
          }
          .padding(.horizontal, 16)
          .tabRoot()
        }
        // The group's heading in the bar's band, beside its buttons, not
        // an item of the bar: an item there would turn into the next
        // page's back button as it is pushed.
        .overlay(alignment: .topLeading) {
          GroupHeading(group: open)
            // Level with the bar's buttons, at its top.
            .frame(maxWidth: .infinity, minHeight: Metrics.touch, alignment: .leading)
            .padding(.leading, GroupRail.width + 16)
            .padding(.trailing, GroupHub.actionsWidth)
            .padding(.top, barTop)
            .ignoresSafeArea(.container, edges: .top)
        }
      } else {
        NoGroups(onNew: newGroup, onScan: onScan)
          .padding(.horizontal, 20)
          // Up under the bar, which has nothing in it here, as it stood
          // under the status bar alone.
          .padding(.top, barTop)
          .ignoresSafeArea(.container, edges: .top)
          .tabRoot()
      }
    }
    // The app's ground, as the calendar's, which dark mode lifts off black.
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(colors.backgroundBase)
    .environment(\.photoShelf, openGroup(openID, among: groups).map { .group($0.id) })
  }

  private func newGroup() {
    navigator?.open(.group(.newGroup))
  }

  /// Opens another group beside the rail, taking away the pages of the one
  /// open: on a wide screen they stand beside it (RootNavigation).
  private func pick(_ id: String, over open: String) {
    if id != open { navigator?.close(open) }
    openID = id
  }
}

/// The open group's buttons in the bar over the グループ tab: a tab's own
/// content does not reach the bar through the TabView (RootView).
struct GroupHubButtons: ToolbarContent {
  let group: GroupRow
  let navigator: RootNavigator

  var body: some ToolbarContent {
    ToolbarItemGroup(placement: .topBarTrailing) {
      Button("メンバーを招待", systemImage: "person.badge.plus") {
        navigator.open(.group(.invite(group)))
      }
      Button("グループの設定", systemImage: "slider.horizontal.3") {
        navigator.open(.group(.settings(group)))
      }
    }
  }
}

/// One of a group's pages over the tabs, showing the group as it is now,
/// renamed meanwhile or not.
struct GroupPage: View {
  @Environment(\.rootNavigator) private var navigator
  @FetchAll(GroupRow.order(by: \.joinedAtMs)) private var groups
  let route: GroupRoute
  /// The person has left a group, from its settings: its id.
  let onLeft: (String) -> Void
  /// A group has been made, its id.
  let onMade: (String) -> Void

  var body: some View {
    switch route {
    case .newGroup:
      NewGroupPage(onMade: onMade)
    case .invite(let group):
      InvitePage(group: live(group))
    case .shifts(let group, let day):
      GroupShiftsPage(group: live(group), day: day)
    case .chat(let group, let thread, let other, let sharing):
      ChatScreen(place: .group(live(group)), threadID: thread, otherID: other, sharing: sharing)
    case .settings(let group):
      GroupSettingsPage(group: live(group)) {
        navigator?.open(.group(.invite(group)))
      } onLeft: {
        onLeft(group.id)
      }
    }
  }

  private func live(_ group: GroupRow) -> GroupRow {
    groups.first { $0.id == group.id } ?? group
  }
}

enum GroupRoute: Hashable {
  case newGroup
  case invite(GroupRow)
  /// Everyone's shifts by the month, on a day when one is given.
  case shifts(GroupRow, day: Day?)
  case settings(GroupRow)
  /// One of the group's chats: 全体チャット, or a one-to-one chat with the
  /// member `with`; `sharing`, a day brought from みんなのシフト to share.
  case chat(GroupRow, thread: String, with: String?, sharing: Day? = nil)

  /// The group the page is of; none for a new one.
  var group: GroupRow? {
    switch self {
    case .newGroup: nil
    case .invite(let group), .shifts(let group, _), .settings(let group), .chat(let group, _, _, _):
      group
    }
  }
}

/// No group yet: a sample of 一覧, the table a group is mostly read in,
/// filling the screen and fading out under what sharing shifts is for and
/// the buttons, 作成 and QR参加, at the foot (/design's NoGroups). Text
/// too large to leave the sample room scrolls the words alone.
private struct NoGroups: View {
  @Environment(\.english) private var english
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  /// The sample's rows pick nothing.
  @State private var pickNothing = Handler<Day>()
  let onNew: () -> Void
  let onScan: () -> Void

  var body: some View {
    ViewThatFits(in: .vertical) {
      VStack(spacing: 0) {
        sample
        foot
      }
      ScrollView {
        foot.padding(.vertical, 24)
      }
    }
  }

  /// What the days are drawn with, for the rows and weeks to compare.
  private var drawing: DayDrawing {
    DayDrawing(colors: colors, look: look, english: english, week: settings.device.week)
  }

  /// As much of the table as there is room for, at least a few rows, its
  /// lower part fading into the ground; a picture only.
  private var sample: some View {
    let days = (0..<sampleDays).map { Day.today.adding(days: $0) }
    let members = sampleMembers(days)
    return Color.clear
      .frame(minHeight: 180, maxHeight: .infinity)
      .overlay(alignment: .top) {
        VStack(spacing: 0) {
          GroupDayHeader(members: members, groupID: "sample")
          ForEach(days, id: \.self) { day in
            GroupDayRow(
              day: day, members: members, picked: false, onPick: pickNothing, drawing: drawing
            )
            .equatable()
          }
        }
        .fixedSize(horizontal: false, vertical: true)
      }
      .clipped()
      .mask {
        LinearGradient(
          stops: [.init(color: .black, location: 0.35), .init(color: .clear, location: 0.92)],
          startPoint: .top, endPoint: .bottom)
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }

  private var foot: some View {
    VStack(spacing: 12) {
      Text("グループでシフトを共有できます")
        .font(.title2.bold())
        .multilineTextAlignment(.center)
      Text("家族や友達とシフトを見せ合って、\n休みが重なる日がすぐ分かります。")
        .font(.subheadline)
        .foregroundStyle(colors.textTertiary)
        .multilineTextAlignment(.center)
        .lineSpacing(4)
        .padding(.bottom, 12)
      Button(action: onNew) {
        Label("グループを作る", systemImage: "plus")
          .font(.headline)
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
      Button(action: onScan) {
        Label("QRコードで参加", systemImage: "qrcode.viewfinder")
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .quietButton()
    }
    .padding(.bottom, 16)
  }
}

/// The sample's days, from today: a month, more than even a tall screen
/// shows, so the table always runs on into its fade.
private let sampleDays = 31

/// The sample's people, as /design's: a partner at the office, home on
/// Wednesdays; a mother part-time on Mondays, Wednesdays and Fridays, both
/// off on weekends and holidays; a nurse whose week, the same every week,
/// has Saturday off too, so everyone is off one day.
private func sampleMembers(_ days: [Day]) -> [GroupMember] {
  let off = sample("off", "休み", "🌿", "leaf", 0, off: true)
  let office = sample("office", "出勤", "💼", "briefcase", 9)
  let home = sample("home", "在宅", "🏠", "house", 10)
  let part = sample("part", "パート", "🛒", "shoppingBag", 2)
  let nurse = ["day", "night", "after", "off"].compactMap(ReadyPatterns.pattern).map { ready in
    Pattern(
      id: ready.id, name: ready.name, emoji: ready.emoji, symbol: ready.symbol, icon: ready.icon,
      color: ready.color, time: ready.time.map { ShiftTime(start: $0.start, end: $0.end) },
      countsAsOff: ready.countsAsOff)
  }
  // Sunday on: 明け, 休み, 日勤, 日勤, 夜勤, 明け, 休み.
  let nurseWeek = ["after", "off", "day", "day", "night", "after", "off"]
  let rests = { (day: Day) in day.weekday == 0 || day.weekday == 6 || day.holidayName != nil }
  let shifts = { (shift: (Day) -> PatternID) in
    Dictionary(uniqueKeysWithValues: days.map { ($0, shift($0)) })
  }
  return [
    sampleMember(
      "yuki", "ゆうき", face: 1005,
      MemberCalendar(
        patterns: [office, home, off],
        days: shifts { rests($0) ? off.id : $0.weekday == 3 ? home.id : office.id })),
    sampleMember(
      "mother", "お母さん", face: 429,
      MemberCalendar(
        patterns: [part, off],
        days: shifts { [1, 3, 5].contains($0.weekday) && $0.holidayName == nil ? part.id : off.id })),
    sampleMember(
      "misaki", "みさき", face: 823,
      MemberCalendar(patterns: nurse, days: shifts { nurseWeek[$0.weekday] })),
  ]
}

/// One of the sample's people, with /design's sample photo of the id, held
/// in the app as SampleFace〈id〉.
private func sampleMember(_ id: String, _ name: String, face: Int, _ calendar: MemberCalendar)
  -> GroupMember
{
  var member = GroupMember(userID: id, name: name, calendar: calendar)
  member.photoID = "\(samplePhoto)SampleFace\(face)"
  return member
}

private func sample(
  _ id: String, _ name: String, _ emoji: String, _ icon: String, _ color: Int, off: Bool = false
) -> Pattern {
  Pattern(
    id: id, name: name, emoji: emoji, symbol: String(name.prefix(1)), icon: icon, color: color,
    countsAsOff: off)
}

/// The groups down the left edge, as the messaging apps' server rails: a
/// mark each, the open one ringed and flagged at the edge, then the ways to
/// start or join one (/design's GroupRail).
private struct GroupRail: View {
  @Environment(\.themeColors) private var colors
  let groups: [GroupRow]
  let openID: String
  let unread: [String: Int]
  let onOpen: (String) -> Void
  let onNew: () -> Void
  let onScan: () -> Void
  /// How far over the screen's foot the tab bar's top is: the rail fades
  /// out above it.
  @State private var barTop: CGFloat = 0

  /// The height the rail fades out over, gone at the tab bar's top, as
  /// /design's rail does over its 56 points' tab bar 20 over the foot.
  private static var fade: CGFloat { 72 }
  /// The rail's width, which the page beside it starts after.
  static var width: CGFloat { 60 }

  var body: some View {
    ScrollView {
      VStack(spacing: 12) {
        ForEach(groups) { group in
          let isOpen = group.id == openID
          let count = unread[group.id] ?? 0
          Button {
            onOpen(group.id)
          } label: {
            GroupMark(mark: group.mark, shelf: .group(group.id), isOpen: isOpen)
              .frame(width: 60, height: 48)
              .overlay(alignment: .leading) {
                // The flag at the edge, by the open group.
                UnevenRoundedRectangle(bottomTrailingRadius: Radius.xs, topTrailingRadius: Radius.xs)
                  .fill(colors.accentDefault)
                  .frame(width: 4, height: isOpen ? 32 : 0)
              }
              .overlay(alignment: .bottomTrailing) {
                // Its chats' unread, ringed in the rail's ground.
                if count > 0 {
                  UnreadCount(count: count)
                    .padding(2)
                    .background(colors.fillQuaternary, in: Capsule())
                    .offset(x: -1, y: 2)
                    .accessibilityHidden(true)
                }
              }
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(count > 0 ? "\(group.name)、未読\(count)件" : group.name)
          .accessibilityAddTraits(isOpen ? .isSelected : [])
        }
        Capsule()
          .fill(colors.borderDefault)
          .frame(width: 28, height: 2)
          .accessibilityHidden(true)
        Button("グループを作る", systemImage: "plus", action: onNew)
          .labelStyle(.iconOnly)
          .font(.title3)
          .foregroundStyle(colors.accentDefault)
          .frame(width: 44, height: 44)
          .background(colors.backgroundCard, in: Circle())
          .buttonStyle(.plain)
        Button("QRコードで参加", systemImage: "qrcode.viewfinder", action: onScan)
          .labelStyle(.iconOnly)
          .font(.title3)
          .foregroundStyle(colors.accentDefault)
          .frame(width: 44, height: 44)
          .background(colors.backgroundCard, in: Circle())
          .buttonStyle(.plain)
      }
      .padding(.vertical, 12)
      .animation(.easeOut(duration: 0.15), value: openID)
    }
    .scrollIndicators(.hidden)
    // Under the bar only where its heading is, which leaves the marks clear.
    .scrollEdgeEffectHidden(true, for: .top)
    // The last of many groups can rise clear of the fade.
    .contentMargins(.bottom, barTop + Self.fade, for: .scrollContent)
    .frame(width: Self.width)
    .background(
      colors.fillQuaternary,
      in: UnevenRoundedRectangle(topTrailingRadius: Radius.xl)
    )
    // Runs on to the screen's foot like the page beside it, fading out
    // just over the tab bar with what scrolls in it, as Discord's rail
    // does over its own panel.
    .mask {
      GeometryReader { proxy in
        let height = max(proxy.size.height, 1)
        LinearGradient(
          stops: [
            .init(color: .black, location: max(0, (height - barTop - Self.fade) / height)),
            .init(color: .clear, location: max(0, (height - barTop) / height)),
          ], startPoint: .top, endPoint: .bottom)
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { barTop = $0 }
    .ignoresSafeArea(edges: .bottom)
  }
}

/// A group's mark on its rounded square: on the card's ground, and when
/// open on the accent's with a ring round it, the corners drawn in.
private struct GroupMark: View {
  @Environment(\.themeColors) private var colors
  let mark: GroupMarkValue
  /// The group's photos, for a photo mark.
  let shelf: PhotoShelf
  let isOpen: Bool

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: isOpen ? Radius.md : Radius.lg)
    GroupMarkView(mark: mark, size: 44, shelf: shelf)
      .background(isOpen ? colors.accentContainer : colors.backgroundCard, in: shape)
      .clipShape(shape)
      .overlay {
        if isOpen {
          shape.strokeBorder(colors.accentDefault, lineWidth: 2)
            .overlay(shape.inset(by: 2).strokeBorder(colors.backgroundCard, lineWidth: 2))
        }
      }
  }
}

/// The open group: this week of everyone's shifts and its chats under its
/// mark and name, 招待 and 設定 being in the bar (/design's GroupHub).
private struct GroupHub: View {
  @Environment(\.themeColors) private var colors
  @Fetch private var members: [GroupMember] = []
  let group: GroupRow
  /// Opens everyone's shifts by the month, on a day when one is given.
  let onShifts: (Day?) -> Void
  /// Opens a chat: its thread, and the other member of a one-to-one chat.
  let onChat: (String, String?) -> Void

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text("シフト")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(colors.textTertiary)
              .accessibilityAddTraits(.isHeader)
            Spacer()
            Button {
              onShifts(nil)
            } label: {
              HStack(spacing: 2) {
                Text("月で見る")
                Image(systemName: "chevron.right").imageScale(.small)
              }
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(colors.accentDefault)
            }
            .buttonStyle(.plain)
          }
          MemberWeek(members: members, onOpen: onShifts)
        }
        VStack(alignment: .leading, spacing: 8) {
          Text("チャット")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(colors.textTertiary)
            .accessibilityAddTraits(.isHeader)
          ChatList(group: group, members: members) { thread, other in
            onChat(thread, other)
          }
        }
      }
      .padding(.bottom, 24)
    }
    .scrollIndicators(.hidden)
    .contentMargins(.top, 8, for: .scrollContent)
    .task(id: request) {
      _ = try? await $members.load(request)
    }
  }

  /// The group's members with their days from today, as far ahead as
  /// 次のみんな休み looks.
  private var request: GroupMembersRequest {
    let ahead = Day.today.adding(days: nextTogetherDays - 1)
    return GroupMembersRequest(groupID: group.id, from: Day.today, through: ahead)
  }

  /// Room for the bar's two buttons on their glass, and a gap before them.
  static var actionsWidth: CGFloat { Metrics.touch * 2 + 48 }
}

/// The open group's mark and name, over its page.
private struct GroupHeading: View {
  @Environment(\.themeColors) private var colors
  let group: GroupRow

  var body: some View {
    HStack(spacing: 8) {
      GroupMarkView(mark: group.mark, size: 26, shelf: .group(group.id))
        .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.sm))
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        .accessibilityHidden(true)
      Text(group.name)
        .font(.title2.bold())
        .lineLimit(1)
        .accessibilityAddTraits(.isHeader)
    }
  }
}

/// The socket of the place open on screen, held while it shows and the app
/// is in front (spec/sync-protocol.md, Sockets): the open group's in グループ,
/// the chat with Pochical's people's in 設定. One hold at a time, moved as
/// the place changes, whatever covers the screen meanwhile, so the screens
/// over a place (its chat, its photos open large) share it rather than
/// each holding it. They take the place's client from GroupSockets, held
/// yet or not. The session opens the socket held only while signed in.
@MainActor @Observable final class OpenPlaceSocket {
  @ObservationIgnored private let session: AccountSession
  /// The place whose socket is wanted now; nil for none.
  @ObservationIgnored private var wanted: String?
  /// The hold, with the stretch of the account it was taken in: one of an
  /// earlier stretch went with the user before's places (GroupSockets).
  @ObservationIgnored private var held: (placeID: String, hold: UUID, generation: Int)?
  @ObservationIgnored private var moving = false

  init(session: AccountSession) {
    self.session = session
  }

  /// Holds `placeID`'s socket from now, letting go of any other; none for
  /// nil. Wanting the same again in the same stretch of the account changes
  /// nothing, and wishes made while one is under way end at the latest.
  func want(_ placeID: String?) {
    wanted = placeID
    guard !moving, !holdsWanted else { return }
    moving = true
    Task {
      while !holdsWanted {
        if let held {
          self.held = nil
          await session.release(held.hold, of: held.placeID)
        }
        if let placeID = wanted {
          let generation = session.generation
          held = (placeID, await session.hold(placeID), generation)
        }
      }
      moving = false
    }
  }

  /// Whether what is held is what is wanted, in this stretch.
  private var holdsWanted: Bool {
    guard let held else { return wanted == nil }
    return held.placeID == wanted && held.generation == session.generation
  }
}

/// The group open in グループ: the one picked, the first until one is or
/// once the one picked is gone.
func openGroup(_ openID: String?, among groups: [GroupRow]) -> GroupRow? {
  groups.first { $0.id == openID } ?? groups.first
}

/// Everyone in a group with their shifts, read again as the group's
/// values change.
struct GroupMembersRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let from: Day
  let through: Day

  func fetch(_ db: Database) throws -> [GroupMember] {
    #if DEBUG
      // As slow as a busy database, for the UI tests (POC-162).
      let late = UserDefaults.standard.integer(forKey: "membersReadLate")
      if late > 0 { Thread.sleep(forTimeInterval: Double(late) / 1000) }
    #endif
    return try GroupSync.members(of: groupID, from: from, through: through, in: db)
  }
}
