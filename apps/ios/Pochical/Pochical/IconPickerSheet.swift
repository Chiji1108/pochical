import PochicalDesign
import PochicalKit
import SwiftUI

/// ほかのアイコンを選ぶ (/design's IconPickerSheet): every icon a mark can
/// take, sorted into kinds, each drawn as it would be, the one picked
/// edged in the accent, and a search over their names and the words they
/// stand for. Picking one closes it.
struct IconPickerSheet<Mark: View>: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let picked: String
  @ViewBuilder let mark: (String) -> Mark
  let onPick: (String) -> Void
  @State private var query = ""

  var body: some View {
    let sections = MarkIconSearch.sections(matching: query)
    NavigationStack {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 16) {
          if sections.isEmpty {
            Text("見つかりませんでした")
              .foregroundStyle(colors.textTertiary)
              .frame(maxWidth: .infinity)
              .padding(.top, 24)
          }
          ForEach(sections) { section in
            VStack(alignment: .leading, spacing: 8) {
              Text(section.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(colors.textTertiary)
                .accessibilityAddTraits(.isHeader)
              LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8), spacing: 4) {
                ForEach(section.icons, id: \.self) { icon in
                  Button {
                    onPick(icon)
                    dismiss()
                  } label: {
                    mark(icon)
                      .frame(maxWidth: .infinity, minHeight: 44)
                      .overlay {
                        if icon == picked {
                          RoundedRectangle(cornerRadius: Radius.md)
                            .strokeBorder(colors.accentDefault, lineWidth: 1.5)
                        }
                      }
                      .contentShape(.rect)
                  }
                  .buttonStyle(.plain)
                  .accessibilityLabel(MarkIconNames.names[icon] ?? icon)
                  .accessibilityAddTraits(icon == picked ? .isSelected : [])
                }
              }
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
      }
      .background(colors.backgroundBase)
      .searchable(text: $query, prompt: "検索（例：夜勤、配達）")
      .navigationTitle("アイコンを選ぶ")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
  }
}
