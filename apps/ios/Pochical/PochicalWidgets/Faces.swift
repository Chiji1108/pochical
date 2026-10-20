import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

// Faces and groups' marks as the widgets draw them, from what the app keeps
// in the App Group; the notifications' extension draws them too.

/// Someone's face as their group shows it: their photo once the app has
/// it on the device, else the first letter of their name, the person's
/// own in the テーマ's accent.
struct WidgetFace: View {
  @Environment(\.themeColors) private var colors
  let person: WidgetWith
  let size: CGFloat
  var me = false

  var body: some View {
    if !person.photoID.isEmpty,
      let data = ChatPhotos.held(person.photoID, in: .group(person.groupID)),
      let image = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: size * 3, height: size * 3))
    {
      Image(uiImage: image)
        .resizable()
        .scaledToFill()
        .frame(width: size, height: size)
        .clipShape(Circle())
    } else {
      Text(person.name.first.map(String.init) ?? "")
        .font(.system(size: max(9, (size * 0.45).rounded()), weight: .semibold))
        .foregroundStyle(me ? colors.accentOnFill : colors.textSecondary)
        .frame(width: size, height: size)
        .background(me ? colors.accentFill : colors.fillSecondary, in: Circle())
    }
  }
}

/// A group's mark in its rounded square, as the app's list of groups
/// frames it: a photo, an icon or letters on their tint, or an emoji.
struct WidgetGroupMark: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.widgetRenderingMode) private var renderingMode
  let group: WidgetWith
  let size: CGFloat

  var body: some View {
    if renderingMode == .fullColor {
      drawn
    } else {
      // In the system's one-color looks an emoji or a photo would turn
      // one solid shape: drawn as a picture, desaturated, as the poodle is.
      let renderer = ImageRenderer(content: drawn.environment(\.themeColors, colors))
      let _ = renderer.scale = 3
      if let image = renderer.uiImage {
        Image(uiImage: image)
          .resizable()
          .widgetAccentedRenderingMode(.desaturated)
          .frame(width: size, height: size)
      }
    }
  }

  @ViewBuilder private var drawn: some View {
    let mark = group.mark
    let color = colors.mark(mark.color)
    let shape = RoundedRectangle(cornerRadius: size * 0.28)
    Group {
      if !mark.photoID.isEmpty, let data = ChatPhotos.held(mark.photoID, in: .group(group.groupID)),
        let image = UIImage(data: data)?.preparingThumbnail(
          of: CGSize(width: size * 3, height: size * 3))
      {
        Image(uiImage: image).resizable().scaledToFill()
      } else if !mark.icon.isEmpty,
        let layers = MarkIcons.layers(mark.icon, filled: true, size: size * 0.62)
      {
        ZStack {
          ForEach(layers.indices, id: \.self) { index in
            layers[index].path.fill(color.color.opacity(layers[index].opacity))
          }
        }
        .frame(width: size * 0.62, height: size * 0.62)
        .frame(width: size, height: size)
        .background(color.tint)
      } else if !mark.letter.isEmpty {
        Text(mark.letter)
          .font(.system(size: (size * 0.37).rounded(), weight: .bold))
          .minimumScaleFactor(0.5)
          .foregroundStyle(color.color)
          .frame(width: size, height: size)
          .background(color.tint)
      } else {
        Text(mark.emoji)
          .font(.system(size: (size * 0.62).rounded()))
          .frame(width: size, height: size)
          .background(colors.fillQuaternary)
      }
    }
    .frame(width: size, height: size)
    .clipShape(shape)
  }
}
