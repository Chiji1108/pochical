import Connect
import Foundation
import OSLog
import SQLiteData

/// Who the device is, and the one owner of everything that goes as them
/// (spec/sync-protocol.md, Signing in; Switching to an account in use;
/// Signing out; Deleting an account): the session kept, every socket (the
/// user's, and the places' through GroupSockets) and the credentials every
/// call carries. Nothing else starts a socket: the app coming to the
/// front, a badge to set and a place opened on screen ask it.
///
/// Changes of the account go one at a time: while the server answers one,
/// the device goes on as it was and nothing else changes who it is, a 401
/// meanwhile noted for when the answer comes. So a change that fails
/// leaves everything as it was, sockets, calls, loads and uploads.
///
/// Each stretch signed in as someone has a generation (`Credentials`). A
/// change ends the stretch once the server has done its part, before
/// anything is erased, so whatever comes back for an earlier one (an
/// answer, an upload, a socket's frame) is dropped;
/// and the database records whose it is (`SyncState.owner`), so a socket
/// never sends from nor takes into another user's data, whatever the
/// order things happen in.
@MainActor @Observable public final class AccountSession {
  /// Where the session is.
  public enum Phase: Equatable, Sendable {
    /// No session yet: a first launch signing in, or the device after
    /// signing out or deleting, until it has; tried again as the app comes
    /// to the front.
    case starting
    case signedIn
    /// Switching to an account, signing out or deleting, until it is done:
    /// signed in as before while the server answers.
    case changing
    /// Signed out or deleted on the server, the device's data still being
    /// erased (`erasing`): the app shows none of it, and signs in afresh
    /// only once it is gone.
    case erasing
    /// The server does not know the session (a 401 to any of its sockets):
    /// signed out or deleted on another device or by request, or the
    /// server misconfigured. Nothing syncs and nothing is cleared until the
    /// person tries again (`tryAgain`) or starts afresh (`startAfresh`)
    /// (spec/sync-protocol.md, Reconnecting).
    case ended
  }

  /// Why the device's data is being erased, and whether a try failed.
  public struct Erasing: Equatable, Sendable {
    public enum Why: String, Sendable {
      case signedOut, deleted
    }

    public let why: Why
    public var failed = false
  }

  private enum State {
    case starting
    case signedIn(Credentials)
    /// The server answering a change, the device signed in as before
    /// meanwhile; `heardUnknown` once a socket's 401 has come, which the
    /// answer settles (`change`).
    case changing(Credentials, heardUnknown: Bool)
    /// The server switched the account, the device erasing for the user
    /// after.
    case switching
    case erasing
    /// The session the server did not know, kept to try again with.
    case ended(StoredSession)
  }

  private var state = State.starting

  public var phase: Phase {
    switch state {
    case .starting: .starting
    case .signedIn: .signedIn
    case .changing, .switching: .changing
    case .erasing: .erasing
    case .ended: .ended
    }
  }

  /// While erasing after signing out or deleting: why, and whether it has
  /// failed so far, for the app to say so.
  public private(set) var erasing: Erasing?

  /// Which stretch of the account this is, moving on as the device signs
  /// in as someone, and as their account changes or is erased: what the
  /// screens of one stretch showed is not the next one's (AppRoot). A
  /// change that fails before the server has done its part never ends its
  /// stretch, so the screens stay, and the failure is said where it was
  /// asked.
  public private(set) var generation = 0

  /// The signed-in user's id, as their groups know them: known offline,
  /// as the session keeps it with its token. Nil until signed in, and from
  /// the moment the account's data is erased.
  public private(set) var userID: String?

  /// The credentials the calls and the places' sockets read from any
  /// thread.
  @ObservationIgnored public let current = CurrentAccount()
  /// The user's own socket, open while the app is in the foreground.
  @ObservationIgnored public let userSocket: SyncClient
  /// The chats' places' sockets, each place's client for its screens.
  @ObservationIgnored public let places: GroupSockets
  /// What the app lets go of with the account's data beyond the session's
  /// own: the notifications shown, and the app icon's badge.
  @ObservationIgnored public var onErase: @MainActor () async -> Void = {}

  /// Erases what the device keeps of the user outside the database: the
  /// chats' photos, the linked account and the URL cache.
  @ObservationIgnored private let eraseFiles: @MainActor () -> Void
  @ObservationIgnored private let server: AccountServer
  @ObservationIgnored private let keychain: SessionKeychain
  @ObservationIgnored private let database: any DatabaseWriter
  /// Where the widgets and the notification service read the user's id.
  @ObservationIgnored private let shared: UserDefaults?
  @ObservationIgnored private var inFront = false
  @ObservationIgnored private var signingIn: Task<Void, Never>?
  /// The stretch whose claim on the database is done.
  @ObservationIgnored private var claimedIn: Int?
  /// The places' sockets closing as the server did not know the session.
  @ObservationIgnored private var ending: Task<Void, Never>?
  /// The wait before erasing is tried again, cut short by `eraseAgain`.
  @ObservationIgnored private var backoff: Task<Void, Never>?

  public convenience init(database: any DatabaseWriter, server: URL = Server.url) {
    self.init(
      database: database, server: Account(server: server), keychain: SessionKeychain(),
      shared: UserDefaults(suiteName: appGroup), eraseFiles: LocalData.eraseFiles,
      socketServer: server)
  }

  init(
    database: any DatabaseWriter, server: AccountServer, keychain: SessionKeychain,
    shared: UserDefaults?, eraseFiles: @escaping @MainActor () -> Void, socketServer: URL
  ) {
    self.eraseFiles = eraseFiles
    self.database = database
    self.server = server
    self.keychain = keychain
    self.shared = shared
    let ends = SessionEnds()
    userSocket = SyncClient(database: database, server: socketServer) { generation in
      await ends.unknown(in: generation)
    }
    places = GroupSockets(database: database, server: socketServer) { generation in
      await ends.unknown(in: generation)
    }
    // Cut off while erasing: the session kept, if the Keychain still has
    // it, is the one that ended, and is never signed in as again.
    if let why = shared?.string(forKey: Self.erasingKey).flatMap(Erasing.Why.init) {
      beginErasing(why)
    } else {
      goOnAsKept()
    }
    ends.session = self
  }

  // MARK: The app

  /// The app came to the front: the user's socket opens, or the device
  /// signs in when it has no session yet; a user a switch left behind is
  /// deleted if that failed before.
  public func cameToFront() {
    inFront = true
    switch state {
    case .starting:
      signInAnew()
    case .signedIn:
      Task {
        await connect()
        await deleteLeftBehind()
      }
    case .changing:
      Task { await connect() }
    case .switching, .erasing, .ended:
      break
    }
  }

  /// The app went to the background: its sockets close once what waits is
  /// sent (spec/sync-protocol.md, Sockets).
  public func wentToBack() async {
    inFront = false
    // Come back to the front meanwhile, the sockets stay as the front has them.
    guard let credentials = live, let credentials = await claimed(credentials),
      !inFront
    else { return }
    await userSocket.finishSending(as: credentials)
    await places.finishSending()
  }

  /// The time iOS gave in the background runs out: every socket closes.
  public func stopSending() async {
    await userSocket.stop()
    await places.stop()
  }

  /// A hold on a place's socket, open while held and signed in.
  public func hold(_ placeID: String) async -> UUID {
    await places.open(placeID)
  }

  public func release(_ hold: UUID, of placeID: String) async {
    await places.close(hold, of: placeID)
  }

  /// What the user's socket brings in, for a while at most, the app in the
  /// background too (as for the badge after an answer from a
  /// notification), closing again once sent if it is.
  public func catchUp(within limit: Duration) async {
    guard let credentials = live, let credentials = await claimed(credentials)
    else { return }
    await userSocket.start(as: credentials)
    await userSocket.catchUp(within: limit)
    if !inFront {
      await userSocket.finishSending()
    }
  }

  /// The provider the user is linked to, as the server says, nil while
  /// anonymous; throws when it cannot be asked now, or the account changed
  /// meanwhile.
  public func linkedProvider() async throws -> LinkedAccount.Provider? {
    guard let credentials = live else { throw NotSignedIn() }
    let me = try await server.me(credentials.token)
    guard credentials.isCurrent else { throw AccountChanged() }
    return me.linked
  }

  /// Links the provider's account to the user.
  public func link(_ account: ProviderToken) async throws -> LinkResult {
    guard case .signedIn(let credentials) = state else { throw NotSignedIn() }
    return try await server.link(account, on: credentials.token)
  }

  // MARK: Changing the account

  /// アカウントのデータを使う: the device signs in to the user the
  /// provider's account is linked to, erases what it held, and catches up
  /// from the account; the user it was is deleted, tried again as the app
  /// comes back should that fail.
  public func useAccount(_ account: ProviderToken) async throws {
    guard case .signedIn(let before) = state else { throw NotSignedIn() }
    try await change(from: before) { [server] before in
      .switched(to: try await server.signIn(with: account, on: before.token))
    }
  }

  /// ログアウト: what waits in the outbox goes first, so signing in again
  /// finds it, the socket open after as before; the session ends on the
  /// server, and the device goes on as someone new, holding nothing of the
  /// user.
  public func signOut() async throws {
    guard case .signedIn(let credentials) = state, let credentials = await claimed(credentials)
    else { throw NotSignedIn() }
    await userSocket.send(as: credentials)
    try await change(from: credentials) { [server] before in
      try await server.signOut(before.token)
      return .left(.signedOut)
    }
  }

  /// アカウントを削除, only while signed in: a user the server says is
  /// linked to Apple has Apple asked once more for a fresh authorization
  /// code (`appleCode`, nil when the person cancels), as Apple's tokens
  /// are revoked with it, and any other user nothing, as nothing of
  /// Google's is revoked; the account and everything of it deleted on the
  /// server, and the device going on as someone new, holding nothing of
  /// the user.
  /// False when the person canceled.
  public func deleteAccount(appleCode: @MainActor () async throws -> String?)
    async throws(DeletionFailure) -> Bool
  {
    guard case .signedIn(let asking) = state else { throw whyNotSignedIn }
    var code = ""
    if try await linkedProvider(of: asking) == .apple {
      do {
        guard let asked = try await appleCode() else { return false }
        code = asked
      } catch {
        Logger.account.error("Asking Apple for a code failed: \(error)")
        throw .appleUnconfirmed
      }
    }
    do {
      try await change(from: asking) { [server] before in
        try await server.deleteAccount(before.token, appleAuthorizationCode: code)
        return .left(.deleted)
      }
    } catch let failure as DeletionFailure {
      // A socket's 401 meanwhile, settled as the session ended.
      if case .ended = state { throw .sessionEnded }
      throw failure
    } catch is AccountChanged {
      // The device is no longer the account Apple was asked for.
      throw whyNotSignedIn
    } catch {
      Logger.account.error("Deleting the account failed: \(error)")
      throw .serverFailed
    }
    return true
  }

  /// The provider the user of `asking` is linked to, as the server says
  /// now rather than as the device last noted, as only an Apple account
  /// needs Apple asked again; a 401 ends the session as a socket's does.
  private func linkedProvider(of asking: Credentials) async throws(DeletionFailure)
    -> LinkedAccount.Provider?
  {
    let linked: LinkedAccount.Provider?
    do {
      linked = try await server.me(asking.token).linked
    } catch {
      let failure = (error as? ConnectError).map(DeletionFailure.init) ?? .serverFailed
      if failure == .sessionEnded { sessionUnknown(in: asking.generation) }
      throw failure
    }
    guard asking.isCurrent else { throw whyNotSignedIn }
    return linked
  }

  /// Why a deletion cannot go as the device is now, not signed in as the
  /// account it was asked for.
  private var whyNotSignedIn: DeletionFailure {
    switch state {
    case .starting: .notSignedIn
    case .ended: .sessionEnded
    case .signedIn, .changing, .switching, .erasing: .accountChanged
    }
  }

  /// How the server's part of a change ended.
  private enum Changed {
    /// Signed in to another user, the one before left behind.
    case switched(to: StoredSession)
    /// The session is over: signed out, or the account deleted.
    case left(Erasing.Why)
  }

  /// Changes who the device is, one change at a time, in an order a
  /// failure or the app ending at any step leaves safe. Until the server
  /// has done its part the device goes on as `before`, as it was, and
  /// nothing else changes who it is: a socket's 401 meanwhile is only noted
  /// (`sessionUnknown`). The answer settles it, here alone: done, the
  /// change goes on, as it is the likeliest reason for that 401 (signing
  /// out and deleting end the session); failed, the device is back as it
  /// was, or ended should a 401 have come. Done, the stretch ends before
  /// anything is erased. A switch erases before the Keychain changes, so
  /// one that fails or is cut off before that goes back to what was kept
  /// (`restore`). Signed out or deleted, there is no going back: the device
  /// is erasing until both the session and its data are gone
  /// (`beginErasing`). Only from the stretch `before` it was asked in: one
  /// the account left meanwhile (signed out, started afresh, while Apple
  /// was asked) is refused (`AccountChanged`), so the user after it is
  /// never changed.
  private func change(from before: Credentials, _ onServer: (Credentials) async throws -> Changed)
    async throws
  {
    guard case .signedIn(let now) = state, now.generation == before.generation else {
      throw AccountChanged()
    }
    state = .changing(before, heardUnknown: false)
    let changed: Changed
    do {
      changed = try await onServer(before)
    } catch {
      Logger.account.error("Changing the account failed: \(error)")
      if heardUnknown || error as? DeletionFailure == .sessionEnded {
        endUnknown(before)
      } else {
        state = .signedIn(before)
      }
      throw error
    }
    switch changed {
    case .left(let why):
      // Noted before anything is awaited: an app ended from here on
      // starts erasing, never as the session the server ended.
      beginErasing(why)
      before.content.invalidateAndCancel()
    case .switched(let after):
      let kept = StoredSession(token: before.token, userID: before.userID, ended: heardUnknown)
      state = .switching
      begin(nil)
      before.content.invalidateAndCancel()
      await userSocket.stop()
      await places.forgetAccount()
      do {
        try await erase()
        try keychain.keepLeftBehind(before.token)
        try keychain.keep(after)
      } catch {
        Logger.account.error("Switching the account failed: \(error)")
        restore(kept)
        throw error
      }
      enter(after)
      Task { await deleteLeftBehind() }
    }
  }

  /// Whether a socket's 401 came while the server answered the change.
  private var heardUnknown: Bool {
    if case .changing(_, heardUnknown: true) = state { true } else { false }
  }

  /// Where the device notes it is erasing, as soon as the server has ended
  /// the session and until the erasing is done, so an app cut off meanwhile
  /// goes on erasing as it starts, never as the session that ended.
  static let erasingKey = "erasingAfter"

  /// Erasing after the session ended on the server: the session forgotten
  /// and the data erased, tried again after a wait that doubles until both
  /// are, and only then a new session signed in, as a new install's.
  private func beginErasing(_ why: Erasing.Why) {
    shared?.set(why.rawValue, forKey: Self.erasingKey)
    begin(nil)
    state = .erasing
    erasing = Erasing(why: why)
    userID = nil
    shared?.removeObject(forKey: SignedInUser.key)
    Task {
      // Nothing more of the user before is taken in or sent.
      await userSocket.stop()
      await places.forgetAccount()
      var wait = Duration.seconds(1)
      while true {
        do {
          try keychain.forget()
          try await erase()
          break
        } catch {
          Logger.account.error("Erasing the device failed: \(error)")
          erasing?.failed = true
          let waiting = Task { [wait] in _ = try? await Task.sleep(for: wait) }
          backoff = waiting
          await waiting.value
          wait = min(wait * 2, Self.longestEraseWait)
        }
      }
      shared?.removeObject(forKey: Self.erasingKey)
      erasing = nil
      state = .starting
      current.signingIn()
      if inFront {
        signInAnew()
      }
    }
  }

  /// 再試行: erasing is tried again now rather than after the wait.
  public func eraseAgain() {
    backoff?.cancel()
  }

  static let longestEraseWait = Duration.seconds(30)

  /// Everything the device holds of the user gone, the database no one's.
  private func erase() async throws {
    try await database.write { try LocalData.erase(in: $0) }
    eraseFiles()
    userID = nil
    shared?.removeObject(forKey: SignedInUser.key)
    await onErase()
  }

  /// A new stretch of the account, signed in as `session` or as no one.
  @discardableResult
  private func begin(_ session: StoredSession?) -> Credentials? {
    defer { generation += 1 }
    return current.begin(session)
  }

  /// The credentials of the stretch going on, a change's answer awaited or
  /// not.
  private var live: Credentials? {
    switch state {
    case .signedIn(let credentials), .changing(let credentials, _): credentials
    case .starting, .switching, .erasing, .ended: nil
    }
  }

  // MARK: A session the server does not know

  /// Back to `kept`: written to the Keychain, then gone on as what the
  /// Keychain holds, which a write that failed leaves as it was, so the
  /// device is only ever what a relaunch would be.
  private func restore(_ kept: StoredSession) {
    do {
      try keychain.keep(kept)
    } catch {
      Logger.account.error("Keeping the session gone back to failed: \(error)")
    }
    goOnAsKept()
  }

  /// As a launch goes on: as the session the Keychain holds; with none, or
  /// a Keychain it cannot read (as before the first unlock), starting,
  /// read again and signed in as the app comes to the front (`established`).
  private func goOnAsKept() {
    if let kept = try? keychain.kept() {
      resume(kept)
    } else {
      state = .starting
      current.signingIn()
      if inFront {
        signInAnew()
      }
    }
  }

  /// Goes on as the session kept: signed in as it, or, one the server did
  /// not know, saying so as before.
  private func resume(_ kept: StoredSession) {
    if kept.ended {
      state = .ended(kept)
      userID = kept.userID
    } else {
      enter(kept)
    }
  }

  /// A socket in the stretch `generation` was refused as a
  /// session the server does not know: every socket closes and the device
  /// keeps what it holds, its outbox too, saying so until the person
  /// chooses; noted only, while the server answers a change, for its answer
  /// to settle. A stretch already over says nothing of the one after it.
  fileprivate func sessionUnknown(in generation: Int) {
    switch state {
    case .signedIn(let credentials) where credentials.generation == generation:
      endUnknown(credentials)
    case .changing(let credentials, _) where credentials.generation == generation:
      state = .changing(credentials, heardUnknown: true)
    case .starting, .signedIn, .changing, .switching, .erasing, .ended:
      break
    }
  }

  /// The session of `credentials`, which the server does not know, ended
  /// until the person chooses, the Keychain keeping it so for a relaunch:
  /// what its stretch handed out is not current from here, and every
  /// socket closes.
  private func endUnknown(_ credentials: Credentials) {
    let ended = StoredSession(token: credentials.token, userID: credentials.userID, ended: true)
    do {
      try keychain.keep(ended)
    } catch {
      // A relaunch tries the session again, and is refused again.
      Logger.account.error("Keeping the session as ended failed: \(error)")
    }
    state = .ended(ended)
    begin(nil)
    credentials.content.invalidateAndCancel()
    ending = Task {
      await userSocket.stop()
      await places.forgetAccount()
    }
  }

  /// もう一度つなぐ: the session the server did not know, tried again, as
  /// a server set right since knows it again.
  public func tryAgain() {
    afterEnding { [self] kept in
      let session = StoredSession(token: kept.token, userID: kept.userID)
      do {
        try keychain.keep(session)
      } catch {
        // Tried all the same: a relaunch says it ended again first.
        Logger.account.error("Keeping the session tried again failed: \(error)")
      }
      enter(session)
    }
  }

  /// はじめから使う: the person's own choice to let the session go, and
  /// what the device holds with it, erasing as after signing out, then
  /// signing in afresh as a new install does.
  public func startAfresh() {
    afterEnding { [self] _ in beginErasing(.signedOut) }
  }

  /// `then` with the session the server did not know, once the places'
  /// sockets of its stretch have closed, if the person has not chosen
  /// meanwhile.
  private func afterEnding(_ then: @escaping @MainActor (StoredSession) -> Void) {
    let ending = self.ending
    Task {
      await ending?.value
      guard case .ended(let kept) = state else { return }
      then(kept)
    }
  }

  // MARK: Signed in

  /// A new stretch, signed in as `session`, its sockets connecting.
  private func enter(_ session: StoredSession) {
    guard let credentials = begin(session) else { return }
    state = .signedIn(credentials)
    userID = session.userID
    shared?.set(session.userID, forKey: SignedInUser.key)
    Task { await connect() }
  }

  /// The sockets connect as the user now: the places' held, and the user's
  /// own while the app is in front.
  private func connect() async {
    guard let credentials = live, let credentials = await claimed(credentials)
    else { return }
    await places.use(credentials)
    if inFront {
      await userSocket.start(as: credentials)
    }
  }

  /// `credentials` once the database is their user's, claimed once in each
  /// stretch: if it is no one's, it becomes theirs; one another user left
  /// (a session the Keychain no longer has, as after a restore without
  /// it) is erased first, as no session on the device can send what it
  /// holds any more. Nil once the account has changed.
  private func claimed(_ credentials: Credentials) async -> Credentials? {
    if claimedIn == credentials.generation {
      return credentials.isCurrent ? credentials : nil
    }
    // Claimed only in the stretch it is for: a claim coming after the
    // account changed, and its data was erased, would give the next
    // user's database to the one before.
    let claim = try? await database.write { db -> Claim in
      guard credentials.isCurrent else { return .stale }
      if try SyncState.claim(for: credentials.userID, in: db) { return .theirs }
      Logger.account.notice("Erasing the data another user left on the device")
      try LocalData.erase(in: db)
      return try SyncState.claim(for: credentials.userID, in: db) ? .erased : .stale
    }
    switch claim {
    case .theirs?:
      break
    case .erased?:
      eraseFiles()
      await onErase()
    case .stale?, nil:
      return nil
    }
    guard credentials.isCurrent else { return nil }
    claimedIn = credentials.generation
    return credentials
  }

  private enum Claim {
    case theirs
    /// Another user's, erased and claimed.
    case erased
    /// The account changed meanwhile.
    case stale
  }

  /// Signs in anonymously, once at a time, while the device has no session.
  private func signInAnew() {
    guard signingIn == nil else { return }
    signingIn = Task {
      defer { signingIn = nil }
      do {
        let session = try await established()
        guard case .starting = state else { return }
        resume(session)
      } catch {
        Logger.account.error("Signing in failed: \(error)")
      }
    }
  }

  private func established() async throws -> StoredSession {
    if let kept = try keychain.kept() {
      return kept
    }
    let made = try await server.signInAnonymously()
    try keychain.keep(made)
    return made
  }

  /// Deletes the user a switch left behind, its session kept in the
  /// Keychain until done (POC-15): forgotten once the server deletes the
  /// user or no longer knows the session, unless a later switch left
  /// another behind meanwhile. One that is the device's own session (a
  /// switch that failed past keeping it) is only forgotten.
  private func deleteLeftBehind() async {
    guard let left = keychain.leftBehindToken(), case .signedIn(let now) = state else { return }
    guard left != now.token else {
      keychain.forgetLeftBehind()
      return
    }
    do {
      try await server.deleteAccount(left, appleAuthorizationCode: "")
    } catch .sessionEnded {
    } catch {
      return
    }
    if keychain.leftBehindToken() == left {
      keychain.forgetLeftBehind()
    }
  }
}

extension Logger {
  static let account = Logger(subsystem: "app.pochical", category: "account")
}

/// Where the user's socket tells the session of a session the server does
/// not know, made before the session it tells is.
@MainActor private final class SessionEnds {
  weak var session: AccountSession?

  func unknown(in generation: Int) {
    session?.sessionUnknown(in: generation)
  }
}
