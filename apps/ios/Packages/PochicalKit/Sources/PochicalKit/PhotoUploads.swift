import Foundation
import Observation

/// The member's photos on their way up (spec/chat.md, Photos): how far
/// each has gone, for its line to show, and a way to stop one, as Signal
/// and Telegram ring a photo going up with × to stop it.
@MainActor @Observable public final class PhotoUploads {
  public static let shared = PhotoUploads()

  /// How much of each photo going up now has gone, from 0 to 1, by its
  /// id; none for one not going up (waiting its turn, or for the network).
  public private(set) var sent: [String: Double] = [:]
  /// Stops each photo going up now.
  @ObservationIgnored private var stops: [String: @Sendable () -> Void] = [:]
  /// Each photo's try going up now, so a step of an earlier one, coming
  /// late, is not drawn.
  @ObservationIgnored private var tries: [String: UUID] = [:]

  /// Stops the photo `photoID` going up, if it is.
  public func stop(_ photoID: String) {
    stops.removeValue(forKey: photoID)?()
    sent[photoID] = nil
  }

  func began(_ photoID: String, try id: UUID, stop: @escaping @Sendable () -> Void) {
    stops[photoID] = stop
    tries[photoID] = id
    sent[photoID] = 0
  }

  /// A step drawn only past a hundredth, not at every packet, and never
  /// back, as the steps come by the main actor in no set order.
  func moved(_ photoID: String, try id: UUID, to fraction: Double) {
    guard tries[photoID] == id, let was = sent[photoID],
      fraction - was >= 0.01 || (fraction >= 1 && was < 1)
    else { return }
    sent[photoID] = min(fraction, 1)
  }

  func ended(_ photoID: String) {
    stops[photoID] = nil
    tries[photoID] = nil
    sent[photoID] = nil
  }
}

/// Tells how many bytes of an upload have gone.
final class UploadProgress: NSObject, URLSessionTaskDelegate, Sendable {
  private let onSent: @Sendable (Int64) -> Void

  init(onSent: @escaping @Sendable (Int64) -> Void) {
    self.onSent = onSent
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64
  ) {
    onSent(totalBytesSent)
  }
}
