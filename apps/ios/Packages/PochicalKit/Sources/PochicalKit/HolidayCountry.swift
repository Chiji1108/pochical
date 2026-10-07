import Foundation
import PochicalDesign

/// The country whose national holidays this device's days take
/// (spec/calendar.md, Holidays): its region's when Pochical has them, else
/// Japan's. Every date colored as a holiday reads it, and so does a new
/// order's 祝日は休みにする.
public enum HolidayCountry {
  public static var current: String {
    Holidays.country(for: Locale.current.region?.identifier)
  }
}

extension Day {
  /// The national holiday on this day in the device's holiday country, or nil.
  public var holidayName: String? {
    Holidays.name(on: key, in: HolidayCountry.current)
  }
}
