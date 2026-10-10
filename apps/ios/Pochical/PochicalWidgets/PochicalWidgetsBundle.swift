import SwiftUI
import WidgetKit

/// The widgets in the gallery (spec/widgets.md, In the widget gallery).
@main
struct PochicalWidgetsBundle: WidgetBundle {
  var body: some Widget {
    SimpleWidget()
    UpcomingWidget()
    CalendarWidget()
  }
}
