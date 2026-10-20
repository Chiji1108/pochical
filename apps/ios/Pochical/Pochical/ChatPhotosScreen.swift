import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// A chat's photos alone (spec/chat.md, Photos; /design's ChatPhotoList),
// as LINE's 写真・動画, WhatsApp's メディア and Messages' 詳細 › 写真 list
// them: pushed from the chat's ⋯, a grid of squares four across, the
// latest first, paged from the group as it scrolls (PhotoRun, from the
// latest), each opening large among the chat's photos and closing back
// into its square.

struct ChatPhotosScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.groupSockets) private var groupSockets
  @Dependency(\.defaultDatabase) private var database
  /// The chat, and who wrote each photo's line.
  let photos: PhotosOfChat
  private var names: [String: String] { photos.names }
  @State private var run = PhotoRun(latest: Chat.photoPageAhead)
  @State private var viewing: PhotoViewing?
  /// The grid's width, each square a quarter of it less the gaps.
  @State private var width: CGFloat = 0

  private static let across = 4
  /// A hairline apart, as the platforms' photo grids.
  private static let gap: CGFloat = 2

  /// Where the chat's photos come from, over its place's socket, as the
  /// chat's own (ChatScreen).
  private var pager: PhotoPager {
    PhotoPager(
      placeID: photos.placeID, threadID: photos.threadID,
      client: groupSockets.client(photos.placeID), database: database)
  }

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(colors.backgroundBase)
      .navigationTitle("写真")
      .navigationBarTitleDisplayMode(.inline)
      .task {
        await pager.follow { edit in
          edit(&run)
          ask()
        }
      }
      .photoViewer($viewing, groupID: pager.placeID) { photo in
        await savePhoto(photo, in: pager.placeID, calls: groupCalls)
      }
  }

  @ViewBuilder private var content: some View {
    if !run.photos.isEmpty {
      let side = max((width - Self.gap * CGFloat(Self.across - 1)) / CGFloat(Self.across), 0)
      ScrollView {
        LazyVGrid(
          columns: Array(
            repeating: GridItem(.flexible(), spacing: Self.gap), count: Self.across),
          spacing: Self.gap
        ) {
          ForEach(run.photos.reversed()) { item in
            PhotoSquare(
              item: item, groupID: pager.placeID, side: side, writer: names[item.authorID]
            ) {
              open(item)
            }
            // The one last come into sight, for the pages before it to
            // be asked for as it nears the oldest held.
            .onAppear {
              run.show(item.seq)
              ask()
            }
          }
        }
      }
      .onGeometryChange(for: CGFloat.self) {
        $0.size.width
      } action: {
        width = $0
      }
    } else if run.total == nil {
      ProgressView()
    } else {
      ContentUnavailableView("写真はまだありません", systemImage: "photo.on.rectangle")
    }
  }

  /// The pages the photos held want now, each asked once until it comes.
  private func ask() {
    for ask in run.asks() {
      Task {
        let asked = await pager.client.requestPhotos(
          of: pager.threadID, seq: ask.seq, after: ask.after)
        if !asked { run.unasked(ask) }
      }
    }
  }

  /// `item` opened large among the photos held, its count known at once,
  /// paging on from there.
  private func open(_ item: ChatPhotoItem) {
    viewing = PhotoViewing(item, listed: run, pager: pager)
    viewing?.names = names
  }
}

/// One square: the photo cut to it, as a line's photo comes (its small
/// version over its blur, ↻ on one that could not be fetched), its place
/// left empty while it is open large from here.
private struct PhotoSquare: View {
  let item: ChatPhotoItem
  let groupID: String
  let side: CGFloat
  let writer: String?
  let onOpen: () -> Void

  var body: some View {
    ChatPhotoImage(
      photo: item.photo, groupID: groupID, shown: CGSize(width: side, height: side),
      whileInSight: true, retries: true
    )
    .frame(width: side, height: side)
    .clipped()
    .contentShape(.rect)
    .onTapGesture(perform: onOpen)
    .photoSpot(item.photo.id)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(writer ?? "")が送った写真、\(Day(item.sentAt, in: .current).monthDayText)"
    )
    .accessibilityAddTraits([.isImage, .isButton])
    .accessibilityAction { onOpen() }
  }
}
