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
/// Each stretch signed in as someone has a generation (`Credentials`). A
/// change goes on as the stretch it began in until the server has done its
/// part, so one that fails leaves everything as it was; the stretch ends
/// only then, before anything of the account before is erased, so
/// whatever comes back for an earlier one (an answer, an upload, a
/// socket's frame) is dropped;
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
    /// Switching to an account, signing out or deleting, the server not
    /// done yet: signed in as before meanwhile, everything going on as it
    /// was, and no other change begins.
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
    /// The server's part done, the device erasing for the user after a
    /// switch, before it is signed in as them.
    case switching
    case erasing
    /// The session the server did not know, kept to try again with.
    case ended(StoredSession)
    /// The person's choice on it, made at once, and done once the
    /// sockets of its stretch have closed: from here, nothing that comes
    /// for the session before (a change the server did) is taken.
    case chosen(Choice, StoredSession)
  }

  /// What the person chose for a session the server did not know.
  private enum Choice {
    case tryAgain, startAfresh
  }

  private var state = State.starting {
    didSet { epoch += 1 }
  }
  /// The stretch a change under way began in, until the server has done
  /// its part or it has failed; none once any new stretch begins.
  private var changingIn: Int? {
    didSet { epoch += 1 }
  }
  /// Moves on with every change of `state` or `changingIn`, whatever made
  /// it: a change begun or answered, a 401, the person's choice. The one
  /// rule for whatever waits on something (the server's answer to a
  /// change, a choice waiting for the sockets to close): what it then does
  /// goes only if `epoch` is what it was as it began, nothing having moved
  /// meanwhile. The one exception is a change's answer after the 401 the
  /// change itself explains (`answerGoes`).
  private var epoch = 0
  /// A change's session ending as the server did not know it, while the
  /// change waited for the server: `epoch` as the change began, and as the
  /// session had ended.
  private var endedWhileChanging: (began: Int, ended: Int)?

  public var phase: Phase {
    switch state {
    case .starting: .starting
    case .signedIn: changingIn == nil ? .signedIn : .changing
    case .switching: .changing
    case .erasing: .erasing
    case .ended, .chosen: .ended
    }
  }

  /// While erasing after signing out or deleting: why, and whether it has
  /// failed so far, for the app to say so.
  public private(set) var erasing: Erasing?

  /// Which stretch of the account this is, moving on as the device signs
  /// in as someone, and as their account changes or is erased: what the
  /// screens of one stretch showed is not the next one's (AppRoot). A
  /// change that fails never ends its stretch, so the screens stay, and
  /// the failure is said where it was asked.
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
    shared: UserDefaults?, eraseFiles: @escaping @MainActor () -> Void,
    socketServer: URL = Server.url
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
    } else if let kept = try? keychain.kept() {
      resume(kept)
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
    case .switching, .erasing, .ended, .chosen:
      break
    }
  }

  /// The app went to the background: its sockets close once what waits is
  /// sent (spec/sync-protocol.md, Sockets).
  public func wentToBack() async {
    inFront = false
    // Come back to the front meanwhile, the sockets stay as the front has them.
    guard case .signedIn(let credentials) = state, let credentials = await claimed(credentials),
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
    guard case .signedIn(let credentials) = state, let credentials = await claimed(credentials)
    else { return }
    await userSocket.start(as: credentials)
    await userSocket.catchUp(within: limit)
    if !inFront {
      await userSocket.finishSending()
    }
  }

  /// Whether the user is linked to Apple or Google, as the server says;
  /// nil when it cannot be asked now, or the account changed meanwhile.
  public func linked() async -> Bool? {
    guard case .signedIn(let credentials) = state,
      let me = try? await server.me(credentials.token), credentials.isCurrent
    else { return nil }
    return !me.anonymous
  }

  /// Links Sign in with Apple's account to the user.
  public func linkApple(idToken: String, nonce: String) async throws -> LinkResult {
    guard case .signedIn(let credentials) = state else { throw NotSignedIn() }
    return try await server.linkApple(idToken: idToken, nonce: nonce, on: credentials.token)
  }

  // MARK: Changing the account

  /// アカウントのデータを使う: the device signs in to the user the Apple
  /// account is linked to, erases what it held, and catches up from the
  /// account; the user it was is deleted, tried again as the app comes back
  /// should that fail.
  public func useAccount(appleIDToken: String, nonce: String) async throws {
    guard case .signedIn(let before) = state, changingIn == nil else { throw NotSignedIn() }
    try await change(from: before) { [server] before in
      .switched(
        to: try await server.signInApple(idToken: appleIDToken, nonce: nonce, on: before.token))
    }
  }

  /// ログアウト: what waits in the outbox goes first, so signing in again
  /// finds it, the socket open after as before; the session ends on the
  /// server, and the device goes on as someone new, holding nothing of the
  /// user.
  public func signOut() async throws {
    guard case .signedIn(let credentials) = state, changingIn == nil,
      let credentials = await claimed(credentials)
    else { throw NotSignedIn() }
    await userSocket.send(as: credentials)
    try await change(from: credentials) { [server] before in
      try await server.signOut(before.token)
      return .left(.signedOut)
    }
  }

  /// アカウントを削除, only while signed in: Apple asked once more for a
  /// fresh authorization code (`appleCode`, nil when the person cancels),
  /// the account and everything of it deleted on the server with it, and
  /// the device going on as someone new, holding nothing of the user.
  /// False when the person canceled.
  public func deleteAccount(appleCode: @MainActor () async throws -> String?)
    async throws(DeletionFailure) -> Bool
  {
    guard case .signedIn(let asking) = state, changingIn == nil else { throw whyNotSignedIn }
    let code: String
    do {
      guard let asked = try await appleCode() else { return false }
      code = asked
    } catch {
      Logger.account.error("Asking Apple for a code failed: \(error)")
      throw .appleUnconfirmed
    }
    do {
      try await change(from: asking) { [server] before in
        try await server.deleteAccount(before.token, appleAuthorizationCode: code)
        return .left(.deleted)
      }
    } catch let failure as DeletionFailure {
      // A socket's 401 meanwhile says the session is gone, whatever this
      // answer was.
      if case .ended = state { throw .sessionEnded }
      throw failure
    } catch is AccountChanged {
      // The device is no longer the account Apple was asked for, or a
      // socket's 401 ended its session meanwhile.
      throw whyNotSignedIn
    } catch {
      Logger.account.error("Deleting the account failed: \(error)")
      throw .serverFailed
    }
    return true
  }

  /// Why a deletion cannot go as the device is now, not signed in as the
  /// account it was asked for.
  private var whyNotSignedIn: DeletionFailure {
    switch state {
    case .starting: .notSignedIn
    case .ended, .chosen: .sessionEnded
    case .signedIn, .switching, .erasing: .accountChanged
    }
  }

  /// How the server's part of a change ended.
  private enum Changed {
    /// Signed in to another user, the one before left behind.
    case switched(to: StoredSession)
    /// The session is over: signed out, or the account deleted.
    case left(Erasing.Why)
  }

  /// Changes who the device is, in an order a failure or the app ending at
  /// any step leaves safe. Until the server has done its part the device
  /// goes on as the stretch `before` it was asked in, its sockets, calls,
  /// loads and uploads as they were, so a change that fails leaves
  /// everything as it was, nothing to bring back. Only from one still
  /// current with no other change under way: one the account left
  /// meanwhile (signed out, started afresh, while Apple was asked) is
  /// refused (`AccountChanged`), so the user after it is never changed.
  /// Once the server has done its part, the stretch ends before anything
  /// is erased. A switch erases before the Keychain changes, so one that
  /// fails or is cut off before that leaves the device as the user it was,
  /// whose session still holds. Signed out or deleted, there is no going
  /// back: the device is erasing until both the session and its data are
  /// gone (`beginErasing`). A deletion's 401 ends the session as a
  /// socket's does (`sessionUnknown`); one to a socket meanwhile gives way
  /// to the change the server has done (`answerGoes`).
  private func change(from before: Credentials, _ onServer: (Credentials) async throws -> Changed)
    async throws
  {
    guard case .signedIn(let now) = state, now.generation == before.generation, changingIn == nil
    else { throw AccountChanged() }
    changingIn = before.generation
    let began = epoch
    defer {
      if epoch == began { changingIn = nil }
    }
    let changed: Changed
    do {
      changed = try await onServer(before)
    } catch DeletionFailure.sessionEnded {
      if epoch == began { endUnknown(before) }
      throw DeletionFailure.sessionEnded
    } catch {
      Logger.account.error("Changing the account failed: \(error)")
      throw error
    }
    guard answerGoes(began: began) else { throw AccountChanged() }
    switch changed {
    case .left(let why):
      // Noted before anything is awaited: an app ended from here on
      // starts erasing, never as the session the server ended.
      beginErasing(why)
      before.content.invalidateAndCancel()
    case .switched(let after):
      // What the device was, as kept: the session it had, or that session
      // ended should its 401 have come meanwhile (`answerGoes`).
      let prior =
        if case .ended(let kept) = state { kept } else {
          StoredSession(token: before.token, userID: before.userID)
        }
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
        restore(prior)
        throw error
      }
      enter(after)
      Task { await deleteLeftBehind() }
    }
  }

  /// Whether the server's answer to a change begun at `began` goes: when
  /// nothing moved meanwhile (`epoch`); and, the one exception, when all
  /// that did was the change's own session ending (a socket's 401), which
  /// the change the server has done explains, as signing out and deleting
  /// end that session: the person's request wins, rather than leaving them
  /// signed out of an account they asked to leave, its data kept. Anything
  /// after that 401 (もう一度つなぐ, はじめから使う, another 401, another
  /// change) moved `epoch` on again, so the answer loses to it: the latest
  /// thing the person chose is what the device does.
  private func answerGoes(began: Int) -> Bool {
    epoch == began || endedWhileChanging.map { $0 == (began, epoch) } == true
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

  /// A new stretch of the account, signed in as `session` or as no one,
  /// any change under way left behind.
  @discardableResult
  private func begin(_ session: StoredSession?) -> Credentials? {
    defer { generation += 1 }
    changingIn = nil
    return current.begin(session)
  }

  // MARK: A session the server does not know

  /// Back to `kept`, kept so in the Keychain in the same step, so the
  /// device and a relaunch are the same: signed in as it, or, one the
  /// server did not know, saying so as before.
  private func restore(_ kept: StoredSession) {
    do {
      try keychain.keep(kept)
    } catch {
      // The Keychain still has what it had, which is `kept` but for
      // this; a relaunch reads that.
      Logger.account.error("Keeping the session gone back to failed: \(error)")
    }
    resume(kept)
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
  /// chooses. A stretch already over says nothing of the one after it.
  fileprivate func sessionUnknown(in generation: Int) {
    guard case .signedIn(let credentials) = state, credentials.generation == generation
    else { return }
    endUnknown(credentials)
  }

  /// The session of `credentials`, which the server does not know, ended
  /// until the person chooses, the Keychain keeping it so for a relaunch:
  /// what its stretch handed out is not current from here, and every
  /// socket closes.
  private func endUnknown(_ credentials: Credentials) {
    let began = changingIn == credentials.generation ? epoch : nil
    defer { endedWhileChanging = began.map { ($0, epoch) } }
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
    choose(.tryAgain)
  }

  /// はじめから使う: the person's own choice to let the session go, and
  /// what the device holds with it, erasing as after signing out, then
  /// signing in afresh as a new install does.
  public func startAfresh() {
    choose(.startAfresh)
  }

  /// The person's choice for the session the server did not know, taken
  /// at once (a later one in its place), and done once the places' sockets
  /// of its stretch have closed.
  private func choose(_ choice: Choice) {
    switch state {
    case .ended(let kept), .chosen(_, let kept):
      state = .chosen(choice, kept)
    case .starting, .signedIn, .switching, .erasing:
      return
    }
    let ending = self.ending
    let chosen = epoch
    Task {
      await ending?.value
      // A later choice, or anything else since, goes instead.
      guard epoch == chosen, case .chosen(let choice, let kept) = state else { return }
      switch choice {
      case .tryAgain:
        let session = StoredSession(token: kept.token, userID: kept.userID)
        do {
          try keychain.keep(session)
        } catch {
          // Tried all the same: a relaunch says it ended again first.
          Logger.account.error("Keeping the session tried again failed: \(error)")
        }
        enter(session)
      case .startAfresh:
        beginErasing(.signedOut)
      }
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
    guard case .signedIn(let credentials) = state, let credentials = await claimed(credentials)
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
    guard let left = keychain.leftBehindToken(), case .signedIn(let now) = state,
      changingIn == nil
    else { return }
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
