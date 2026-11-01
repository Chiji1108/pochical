import LicenseList
import PochicalDesign
import SwiftUI

/// ライセンス, from 設定's ポチカルについて (spec/calendar.md, ライセンス):
/// everything the app is built with from other projects, by name, each
/// opening its license. The packages are those this build resolved, with
/// the LICENSE of each checkout, which LicenseList's build plugin reads as
/// the app builds, so the list is never one kept by hand; what design/
/// writes in from other projects (Notices) stands beside them.
struct LicensesPage: View {
  var body: some View {
    List {
      Section {
        ForEach(Self.libraries) { library in
          PageLink {
            LicensePage(library: library)
          } label: {
            Text(library.name)
          }
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("ライセンス")
  }

  private static let libraries: [Library] =
    (Library.libraries
      + Notices.all.map { Library(name: $0.name, url: $0.url, licenseBody: $0.text) })
    .sorted { $0.name.lowercased() < $1.name.lowercased() }
}

/// One of ライセンス's: its license's text under its name, its links
/// opening in the browser, as LicenseList draws it, on the テーマ's page.
private struct LicensePage: View {
  @Environment(\.themeColors) private var colors
  let library: Library

  var body: some View {
    LicenseView(library: library)
      .textSelection(.enabled)
      .background(colors.backgroundBase)
  }
}
