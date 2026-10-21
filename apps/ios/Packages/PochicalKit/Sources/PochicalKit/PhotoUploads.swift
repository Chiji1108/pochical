import Foundation
import GRDB
import Observation
import PochicalDesign
import PochicalProto
import SQLiteData

/// The member's photo lines on their way up (spec/chat.md, Photos): how
/// far each photo going up has gone, for its line to show, and a way to
/// stop a line, as Signal and Telegram ring a photo going up with × to
/// stop it. A line uploads its photos not yet up one after another (which
/// are up is kept with it in the outbox, `PhotosUp`), is sent once all are,
/// and is then taken, or else not sent. Once its photos are all up and it
/// is being sent, it cannot be stopped any more: `stop` and `send` decide
/// on the main actor, one before the other, so a × tapped as the last
/// upload ends either stops the line or does nothing.
@MainActor @Observable public final class PhotoUploads {
  public static let shared = PhotoUploads()

  /// How much of each photo going up now has gone, from 0 to 1, by its
  /// id; none for one not going up (up already, waiting its turn, or for
  /// the network).
  public private(set) var sent: [String: Double] = [:]
  /// The lines whose photos are all up, being sent, by op_id: past
  /// stopping.
  public private(set) var sending: Set<String> = []
  /// Stops the photo going up now of each line, by the line's op_id.
  @ObservationIgnored private var stops: [String: @Sendable () -> Void] = [:]
  /// Each photo's try going up now, so a step of an earlier one, coming
  /// late, is not drawn.
  @ObservationIgnored private var tries: [String: UUID] = [:]

  /// The line `opID` can still be stopped: it is not being sent.
  public func stoppable(_ opID: String) -> Bool {
    !sending.contains(opID)
  }

  /// Stops the line `opID`'s photos going up, if they are; false,
  /// stopping nothing, once they are up and it is being sent. The caller
  /// marks the line not sent only on true, in the same turn of the main
  /// actor.
  @discardableResult public func stop(_ opID: String) -> Bool {
    guard stoppable(opID) else { return false }
    stops.removeValue(forKey: opID)?()
    return true
  }

  /// The line `opID`'s photos are all up: it goes now if `stillGoing`
  /// (not stopped with ×, nor taken back), and can then no longer be
  /// stopped; true for the line to be sent.
  public func send(_ opID: String, if stillGoing: @MainActor () -> Bool) -> Bool {
    guard stillGoing() else { return false }
    sending.insert(opID)
    return true
  }

  /// The line `opID`, of `photos`, has gone, or is taken back: its photo
  /// going up stops, if one is, and nothing of it is drawn any more.
  public func forget(_ opID: String, photos: [String]) {
    sending.remove(opID)
    stops.removeValue(forKey: opID)?()
    for photoID in photos {
      tries[photoID] = nil
      sent[photoID] = nil
    }
  }

  /// The photo `photoID` began going up, for the line `opID` when it is a
  /// chat line's, which `stop` then stops.
  func began(
    _ photoID: String, of opID: String?, try id: UUID, stop: @escaping @Sendable () -> Void
  ) {
    if let opID {
      sending.remove(opID)
      stops[opID] = stop
    }
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

  /// Its bytes are all up: the ring stays full until the line goes.
  func finished(_ photoID: String, of opID: String?) {
    if let opID { stops[opID] = nil }
    tries[photoID] = nil
    if sent[photoID] != nil { sent[photoID] = 1 }
  }

  /// Its upload failed or was stopped.
  func ended(_ photoID: String, of opID: String?) {
    if let opID { stops[opID] = nil }
    tries[photoID] = nil
    sent[photoID] = nil
  }
}

/// Which of a waiting line's photos are up, and when the upload of the
/// latest began, by the server's time.
struct PhotosUp: Hashable, Sendable, Codable {
  var ids: Set<String> = []
  var atMs: Int64 = 0

  /// The group lets go of an uploader's photos no line carries once they
  /// have uploaded nothing for `Chat.unsentAfterMs`, timed from when each
  /// upload reached it. Those up are trusted for half that, from before
  /// the upload began, so a line sent on them reaches the group well
  /// before it lets go of them, whatever the corrected clock is off by.
  static let trustedForMs = Int64(Chat.unsentAfterMs) / 2

  /// Those up may have gone from the group by the server's time `now`.
  func lapsed(at now: Int64) -> Bool {
    now - atMs >= Self.trustedForMs
  }

  /// Of the line's `photos`, those to upload at the server's time `now`:
  /// those not up, or all of them once those up have lapsed.
  func toUpload(_ photos: [String], now: Int64) -> [String] {
    lapsed(at: now) ? photos : photos.filter { !ids.contains($0) }
  }

  /// `photoID` went up, its upload begun at the server's time `began`.
  func adding(_ photoID: String, began: Int64) -> PhotosUp {
    PhotosUp(ids: (lapsed(at: began) ? [] : ids).union([photoID]), atMs: began)
  }
}

extension Chats {
  /// The line `opID`'s photos to upload at the device's time `now`
  /// (`PhotosUp.toUpload`), in its order.
  static func photosToUpload(_ opID: String, now: Int64, in db: Database) throws -> [String] {
    guard let row = try ChatOutboxRow.where({ $0.opID.eq(opID) }).fetchOne(db),
      case .send(let send) = try Pochical_V1_ChatEdit(serializedBytes: row.edit).kind
    else { return [] }
    return row.up.toUpload(LineContent(send.content).photos.map(\.id), now: try SyncState.corrected(now, in: db))
  }

  /// The line `opID`'s photo `photoID` went up, its upload begun at the
  /// device's time `began`.
  static func photoUp(_ photoID: String, of opID: String, began: Int64, in db: Database) throws {
    guard var row = try ChatOutboxRow.where({ $0.opID.eq(opID) }).fetchOne(db) else { return }
    row.up = row.up.adding(photoID, began: try SyncState.corrected(began, in: db))
    let upJSON = row.upJSON
    try ChatOutboxRow.where { $0.opID.eq(opID) }.update { $0.upJSON = upJSON }.execute(db)
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
