import AuthenticationServices
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import SwiftUINavigation

/// How signing in ended: Apple's account linked to this user, keeping what
/// the device holds, or the device switched to the account's user, whose
/// data it catches up on.
enum SignedIn {
  case linked, switched
}

/// Sign in with Apple (spec/sync-protocol.md, Signing in; Switching to an
/// account in use), for 設定 › アカウント and the first run's ログイン
/// alike: links Apple's account to this user, or, when it is another
/// user's already, keeps one side, asking which only when both hold
/// something.
struct AppleSignInButton: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(AccountSession.self) private var session
  @Environment(\.groupCalls) private var groupCalls
  @Dependency(\.defaultDatabase) private var database
  /// Told once signed in, the button busy until it returns.
  let onSignedIn: (LinkedAccount, SignedIn) async -> Void
  /// The nonce the sign-in under way was asked with.
  @State private var nonce = SignInNonce()
  @State private var busy = false
  @State private var failed = false
  /// The account is suspended by Pochical's people: said as such, as
  /// trying again would not help.
  @State private var suspended = false
  /// The choice of which side to keep, when the Apple account is in use.
  @State private var choosing: Choice?

  /// An Apple account in use by another user, and what each side holds.
  struct Choice: Identifiable {
    let idToken: String
    let nonce: String
    let email: String?
    let account: Holdings
    let device: Holdings
    var id: String { idToken }
  }

  var body: some View {
    SignInWithAppleButton(.continue) { request in
      nonce = SignInNonce()
      request.requestedScopes = [.email]
      request.nonce = nonce.hashed
    } onCompletion: { result in
      Task { await signedIn(result) }
    }
    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
    .frame(height: 50)
    .clipShape(Capsule())
    .disabled(busy)
    .opacity(busy ? 0.5 : 1)
    .overlay {
      if busy { ProgressView() }
    }
    .alert("ログインできませんでした。時間をおいてもう一度お試しください。", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    }
    .alert("このアカウントは利用を停止されています", isPresented: $suspended) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("このAppleアカウントではログインできません。")
    }
    .alert(
      "どちらのデータを使いますか？",
      isPresented: Binding($choosing),
      presenting: choosing
    ) { choice in
      Button("アカウントのデータを使う") { Task { await useAccount(choice) } }
      Button("この端末のデータを使う") { Task { await keepDevice(choice) } }
      Button("キャンセル", role: .cancel) {}
    } message: { choice in
      Text(
        "このAppleアカウントには、ほかの端末で使っていたデータがあります。\n\nアカウント：\(Self.summary(choice.account))\nこの端末：\(Self.summary(choice.device))\n\n使わないほうのデータは削除されます。"
      )
    }
  }

  /// Links Apple's account to this user, keeping everything the device
  /// holds; one the person cancelled says nothing, any other failure says
  /// it could not.
  private func signedIn(_ result: Result<ASAuthorization, Error>) async {
    let authorization: ASAuthorization
    switch result {
    case .success(let signed):
      authorization = signed
    case .failure(let error):
      if (error as? ASAuthorizationError)?.code != .canceled {
        failed = true
      }
      return
    }
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8)
    else {
      failed = true
      return
    }
    busy = true
    defer { busy = false }
    let email = LinkedAccount.email(in: idToken)
    switch try? await session.linkApple(idToken: idToken, nonce: nonce.raw) {
    case .linked:
      await keep(email: email, .linked)
    case .inUse:
      await chooseSide(idToken: idToken, nonce: nonce.raw, email: email)
    case nil:
      failed = true
    }
  }

  private func keep(email: String?, _ how: SignedIn) async {
    let linked = LinkedAccount(provider: .apple, email: email)
    LinkedAccount.keep(linked)
    await onSignedIn(linked, how)
  }

  /// The Apple account is another user's already: a side that holds
  /// nothing goes without asking, the device's first, as a new phone's
  /// first sign-in does; else the person chooses, seeing what each holds.
  private func chooseSide(idToken: String, nonce: String, email: String?) async {
    let held: Holdings
    let here: Holdings
    do {
      held = try await groupCalls.peekAccount(appleIDToken: idToken, nonce: nonce)
      here = try await database.read { try Holdings.onDevice(in: $0) }
    } catch {
      failedOrSuspended(error)
      return
    }
    let choice = Choice(idToken: idToken, nonce: nonce, email: email, account: held, device: here)
    if here.isEmpty {
      await useAccount(choice)
    } else if held.isEmpty {
      await keepDevice(choice)
    } else {
      choosing = choice
    }
  }

  /// アカウントのデータを使う: signed in to the account's user, the device's
  /// own deleted, and the device catching up from the account; one that
  /// fails at any step leaves the device as it was, and says so.
  private func useAccount(_ choice: Choice) async {
    busy = true
    defer { busy = false }
    do {
      try await session.useAccount(appleIDToken: choice.idToken, nonce: choice.nonce)
    } catch {
      failedOrSuspended(error)
      return
    }
    await keep(email: choice.email, .switched)
  }

  /// この端末のデータを使う: the account's user deleted, and the Apple
  /// account linked here instead.
  private func keepDevice(_ choice: Choice) async {
    busy = true
    defer { busy = false }
    do {
      try await groupCalls.takeAccount(appleIDToken: choice.idToken, nonce: choice.nonce)
    } catch {
      failedOrSuspended(error)
      return
    }
    await keep(email: choice.email, .linked)
  }

  /// A step that failed, said as the account being suspended when it is,
  /// else as a failure to try again.
  private func failedOrSuspended(_ error: any Error) {
    if error is AccountSuspended {
      suspended = true
    } else {
      failed = true
    }
  }

  /// What one side holds, in a few words.
  private static func summary(_ held: Holdings) -> String {
    var parts: [String] = []
    if held.shiftDays > 0 { parts.append("シフト\(held.shiftDays)日") }
    if held.repeating { parts.append("繰り返しの設定") }
    if held.coworkers > 0 { parts.append("一緒に働く人\(held.coworkers)人") }
    if held.groups > 0 { parts.append("グループ\(held.groups)つ") }
    return parts.isEmpty ? "なし" : parts.joined(separator: "、")
  }
}

