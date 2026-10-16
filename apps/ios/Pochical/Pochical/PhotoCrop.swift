import PochicalDesign
import SwiftUI

/// What a picked photo is cut to: a face's circle, or a group mark's
/// rounded square, as `GroupMarkView` rounds it.
enum PhotoCropShape {
  case round
  case square
}

/// A photo taken or picked for a face or a mark, waiting to be cut.
struct CroppingPhoto: Identifiable {
  let id = UUID()
  let image: UIImage
}

/// A picked photo to move and zoom inside its frame before it becomes a
/// face or a group's mark (/design's PhotoCrop), as Contacts and LINE ask:
/// drag to move, pinch to zoom, キャンセル or 選択 at the foot. The photo
/// always covers the whole frame.
struct PhotoCrop: View {
  @Environment(\.themeColors) private var colors
  let image: UIImage
  var shape: PhotoCropShape = .round
  /// The square cut from it, or nil when cancelled.
  let onDone: (UIImage?) -> Void

  /// How far in a photo can be brought, past filling the frame.
  private static let maxZoom: CGFloat = 4
  /// The frame's room on either side.
  private static let inset: CGFloat = 16
  /// The room the title and the buttons take, above and below.
  private static let bars: CGFloat = 56

  @State private var offset = CGSize.zero
  @State private var zoom: CGFloat = 1
  /// Where the photo was as the gesture began.
  @State private var start: (offset: CGSize, zoom: CGFloat)?

  var body: some View {
    GeometryReader { geometry in
      // Square within the screen, leaving the title and the buttons their
      // room when the phone lies on its side.
      let side = min(geometry.size.width, geometry.size.height - Self.bars * 2) - Self.inset * 2
      let scale = side / min(image.size.width, image.size.height) * zoom
      ZStack {
        colors.mediaBackground
        Image(uiImage: image)
          .resizable()
          .frame(width: image.size.width * scale, height: image.size.height * scale)
          .offset(offset)
        shade(side: side)
      }
      .frame(width: geometry.size.width, height: geometry.size.height)
      .contentShape(Rectangle())
      .gesture(gesture(side: side))
      .overlay(alignment: .top) {
        Text("移動と拡大縮小")
          .font(.headline)
          .foregroundStyle(colors.mediaText)
          .padding(.top, 12)
      }
      .overlay(alignment: .bottom) {
        HStack {
          Button("キャンセル") { onDone(nil) }
          Spacer()
          Button("選択") { onDone(cut(side: side)) }
            .fontWeight(.semibold)
        }
        .foregroundStyle(colors.mediaText)
        .padding(.horizontal, 20)
        .padding(.bottom, 8)
      }
    }
    .background(colors.mediaBackground)
    .statusBarHidden()
  }

  /// The frame's outline, with the rest dimmed around it.
  private func shade(side: CGFloat) -> some View {
    ZStack {
      colors.mediaShade
      frame(side: side)
        .frame(width: side, height: side)
        .blendMode(.destinationOut)
    }
    .compositingGroup()
    .overlay {
      frame(side: side)
        .stroke(colors.mediaTextSecondary, lineWidth: 1)
        .frame(width: side, height: side)
    }
    .allowsHitTesting(false)
  }

  private func frame(side: CGFloat) -> AnyShape {
    switch shape {
    case .round: AnyShape(Circle())
    case .square: AnyShape(RoundedRectangle(cornerRadius: side * 0.28))
    }
  }

  /// A drag moves the photo and a pinch zooms it about the frame's middle,
  /// so what is there stays there; both at once with two fingers.
  private func gesture(side: CGFloat) -> some Gesture {
    SimultaneousGesture(DragGesture(minimumDistance: 0), MagnifyGesture())
      .onChanged { value in
        let base = start ?? (offset, zoom)
        start = base
        let drag = value.first?.translation ?? .zero
        let next = min(max(base.zoom * (value.second?.magnification ?? 1), 1), Self.maxZoom)
        let grown = next / base.zoom
        zoom = next
        offset = clamped(
          CGSize(
            width: base.offset.width * grown + drag.width,
            height: base.offset.height * grown + drag.height),
          side: side)
      }
      .onEnded { _ in start = nil }
  }

  /// Kept from moving so far an edge of the photo shows inside the frame.
  private func clamped(_ offset: CGSize, side: CGFloat) -> CGSize {
    let scale = side / min(image.size.width, image.size.height) * zoom
    let spareX = (image.size.width * scale - side) / 2
    let spareY = (image.size.height * scale - side) / 2
    return CGSize(
      width: min(max(offset.width, -spareX), spareX),
      height: min(max(offset.height, -spareY), spareY))
  }

  /// The square of the photo inside the frame, no larger than a face is
  /// kept.
  private func cut(side: CGFloat) -> UIImage {
    let scale = side / min(image.size.width, image.size.height) * zoom
    let length = side / scale
    let origin = CGPoint(
      x: image.size.width / 2 - offset.width / scale - length / 2,
      y: image.size.height / 2 - offset.height / scale - length / 2)
    let edge = min(length * image.scale, CGFloat(Chat.pictureMaxEdge))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let drawn = edge / length
    return UIGraphicsImageRenderer(size: CGSize(width: edge, height: edge), format: format)
      .image { _ in
        image.draw(
          in: CGRect(
            x: -origin.x * drawn, y: -origin.y * drawn,
            width: image.size.width * drawn, height: image.size.height * drawn))
      }
  }
}
