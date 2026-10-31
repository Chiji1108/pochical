import Foundation

/// The site, whose invitations' and days' links the app holds as
/// Universal Links (spec/sync-protocol.md, Groups).
let siteHost = "pochical.app"

/// Where the site's links to a day begin.
let siteDayLinks = "https://\(siteHost)/day/"

/// The link that opens the app on a day: the calendar on its week with
/// that day picked (spec/widgets.md, Opening the app).
public func dayLink(_ day: Day) -> URL {
  URL(string: "pochical://day/\(day.key)")!
}

/// The site's link to a day, which opens the app on it as `dayLink` does,
/// as a Universal Link, and elsewhere the site's page saying so: for text
/// another app shows, which makes it a link, as a device calendar's event
/// notes (spec/calendar.md).
public func siteDayLink(_ day: Day) -> URL {
  URL(string: "\(siteDayLinks)\(day.key)")!
}

/// The day a link opening the app names (spec/vectors/device-calendar.json,
/// daysOpened): pochical://day/2026-09-24, or the site's
/// https://pochical.app/day/2026-09-24, the host in any case, a trailing
/// `/`, a query and a fragment allowed.
public func openedDay(of url: URL) -> Day? {
  let path = url.path(percentEncoded: false).split(separator: "/").map(String.init)
  switch (url.scheme?.lowercased(), url.host()?.lowercased()) {
  case ("pochical", "day"):
    return path.count == 1 ? Day(path[0]) : nil
  case ("https", siteHost):
    return path.count == 2 && path[0] == "day" ? Day(path[1]) : nil
  default:
    return nil
  }
}
