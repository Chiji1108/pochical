import GRDB
import PochicalKit
import SQLiteData
import SwiftUI
import WidgetKit

/// Asks the widgets for new entries at once as what they show changes on
/// the device: the person's days, patterns or repeating orders, or the
/// settings they are drawn in (spec/widgets.md, When an entry is made).
struct WidgetReloads: ViewModifier {
  @Environment(Settings.self) private var settings
  @Dependency(\.defaultDatabase) private var database

  func body(content: Content) -> some View {
    content
      .task {
        // The tables a widget's entry is read from.
        let observation = DatabaseRegionObservation(
          tracking: ["days", "patterns", "patternOrder", "repeatOrders"].map {
            GRDB.Table<GRDB.Row>($0)
          })
        let watching = observation.start(in: database) { _ in
        } onChange: { _ in
          WidgetCenter.shared.reloadAllTimelines()
        }
        // Kept while the screen is, let go as the task ends.
        while !Task.isCancelled {
          try? await Task.sleep(for: .seconds(3600))
        }
        watching.cancel()
      }
      .onChange(of: settings.device) { _, _ in
        WidgetCenter.shared.reloadAllTimelines()
      }
  }
}
