import Foundation
import Observation

/// The member's photos on their way up (spec/chat.md, Photos): how far
/// each has gone, for its line to show, and a way to stop one, as Signal
/// and Telegram ring a photo going up with × to stop it. Once a photo is
/// up and its line is being sent, it cannot be stopped any more: `stop`
/// and `sending` decide on the main actor, one before the other, so a ×
/// tapped as the upload ends either stops the line or does nothing.
@MainActor @Observable public final class PhotoUploads {
  public static let shared = PhotoUploads()

  /// How much of each photo going up now has gone, from 0 to 1, by its
  /// id; none for one not going up (waiting its turn, or for the network).
  public private(set) var sent: [String: Double] = [:]
  /// The photos up whose lines are being sent: past stopping.
  public private(set) var up: Set<String> = []
  /// Stops each photo going up now.
  @ObservationIgnored private var stops: [String: @Sendable () -> Void] = [:]
  /// Each photo's try going up now, so a step of an earlier one, coming
  /// late, is not drawn.
  @ObservationIgnored private var tries: [String: UUID] = [:]

  /// The photo `photoID` can still be stopped: it is not up with its line
  /// being sent.
  public func stoppable(_ photoID: String) -> Bool {
    !up.contains(photoID)
  }

  /// Stops the photo `photoID` going up, if it is; false, stopping
  /// nothing, once it is up and its line is being sent. The caller marks
  /// its line not sent only on true, in the same turn of the main actor.
  @discardableResult public func stop(_ photoID: String) -> Bool {
    guard stoppable(photoID) else { return false }
    stops.removeValue(forKey: photoID)?()
    tries[photoID] = nil
    sent[photoID] = nil
    return true
  }

  /// The photo `photoID` is up: its line goes now if `stillGoing` (not
  /// stopped with ×, nor taken back), and can then no longer be stopped;
  /// true for the line to be sent.
  public func sending(_ photoID: String, if stillGoing: @MainActor () -> Bool) -> Bool {
    guard stillGoing() else {
      sent[photoID] = nil
      return false
    }
    up.insert(photoID)
    sent[photoID] = 1
    return true
  }

  /// The photo `photoID`'s line has gone, or is taken back: it stops
  /// going up, if it is, and nothing of it is drawn any more.
  public func forget(_ photoID: String) {
    up.remove(photoID)
    stops.removeValue(forKey: photoID)?()
    tries[photoID] = nil
    sent[photoID] = nil
  }

  func began(_ photoID: String, try id: UUID, stop: @escaping @Sendable () -> Void) {
    up.remove(photoID)
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

  /// Its bytes are all up: the ring stays full, × still stopping its
  /// line, until `sending` decides.
  func finished(_ photoID: String) {
    stops[photoID] = nil
    tries[photoID] = nil
    if sent[photoID] != nil { sent[photoID] = 1 }
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
