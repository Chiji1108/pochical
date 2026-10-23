import AuthenticationServices
import GoogleSignIn
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import SwiftUINavigation

/// How signing in ended: the provider's account linked to this user,
/// keeping what the device holds, or the device switched to the account's
/// user, whose data it catches up on.
enum SignedIn {
  case linked, switched
}

/// The ways in (spec/sync-protocol.md, Signing in; Switching to an account
/// in use), for 設定 › アカウント and the first run's ログイン alike: Sign in
/// with Apple first, as Apple's guidelines ask of an app offering another,
/// then Google, each the same size. Either links the provider's account to
/// this user, or, when it is another user's already, keeps one side,
/// asking which only when both hold something.
struct SignInButtons: View {
  @Environment(AccountSession.self) private var session
  @Environment(\.groupCalls) private var groupCalls
  @Dependency(\.defaultDatabase) private var database
  /// Told once signed in, the buttons busy until it returns.
  let onSignedIn: (LinkedAccount, SignedIn) async -> Void
  @State private var busy = false
  @State private var failed = false
  /// The provider whose account is suspended by Pochical's people: said
  /// as such, as trying again would not help.
  @State private var suspended: LinkedAccount.Provider?
  /// The choice of which side to keep, when the provider's account is in
  /// use.
  @State private var choosing: Choice?

  /// A provider's account in use by another user, and what each side holds.
  struct Choice: Identifiable {
    let token: ProviderToken
    let account: Holdings
    let device: Holdings
    var id: String { token.idToken }
  }

  var body: some View {
    VStack(spacing: 12) {
      AppleButton(
        signedIn: { token in await signedIn(token) },
        failed: { failed = true })
      GoogleButton(
        busy: $busy,
        signedIn: { token in await signedIn(token) },
        failed: { failed = true })
    }
    .disabled(busy)
    .opacity(busy ? 0.5 : 1)
    .overlay {
      if busy { ProgressView() }
    }
    .alert("ログインできませんでした。時間をおいてもう一度お試しください。", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    }
    .alert(
      "このアカウントは利用を停止されています",
      isPresented: Binding($suspended),
      presenting: suspended
    ) { _ in
      Button("OK", role: .cancel) {}
    } message: { provider in
      Text("この\(provider.name)アカウントではログインできません。")
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
        "この\(choice.token.provider.name)アカウントには、ほかの端末で使っていたデータがあります。\n\nアカウント：\(Self.summary(choice.account))\nこの端末：\(Self.summary(choice.device))\n\n使わないほうのデータは削除されます。"
      )
    }
  }

  /// Links the provider's account to this user, keeping everything the
  /// device holds; any failure says it could not.
  private func signedIn(_ token: ProviderToken) async {
    busy = true
    defer { busy = false }
    switch try? await session.link(token) {
    case .linked:
      await keep(token, .linked)
    case .inUse:
      await chooseSide(token)
    case nil:
      failed = true
    }
  }

  private func keep(_ token: ProviderToken, _ how: SignedIn) async {
    LinkedAccount.keep(token.account)
    await onSignedIn(token.account, how)
  }

  /// The provider's account is another user's already: a side that holds
  /// nothing goes without asking, the device's first, as a new phone's
  /// first sign-in does; else the person chooses, seeing what each holds.
  private func chooseSide(_ token: ProviderToken) async {
    let held: Holdings
    let here: Holdings
    do {
      held = try await groupCalls.peekAccount(token)
      here = try await database.read { try Holdings.onDevice(in: $0) }
    } catch {
      failedOrSuspended(error, token)
      return
    }
    let choice = Choice(token: token, account: held, device: here)
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
      try await session.useAccount(choice.token)
    } catch {
      failedOrSuspended(error, choice.token)
      return
    }
    await keep(choice.token, .switched)
  }

  /// この端末のデータを使う: the account's user deleted, and the
  /// provider's account linked here instead.
  private func keepDevice(_ choice: Choice) async {
    busy = true
    defer { busy = false }
    do {
      try await groupCalls.takeAccount(choice.token)
    } catch {
      failedOrSuspended(error, choice.token)
      return
    }
    await keep(choice.token, .linked)
  }

  /// A step that failed, said as the account being suspended when it is,
  /// else as a failure to try again.
  private func failedOrSuspended(_ error: any Error, _ token: ProviderToken) {
    if error is AccountSuspended {
      suspended = token.provider
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

/// Sign in with Apple, asking for the email and with a nonce Apple puts
/// the SHA-256 of in its ID token; one the person cancelled says nothing.
private struct AppleButton: View {
  @Environment(\.colorScheme) private var colorScheme
  let signedIn: (ProviderToken) async -> Void
  let failed: () -> Void
  /// The nonce the sign-in under way was asked with.
  @State private var nonce = SignInNonce()

  var body: some View {
    SignInWithAppleButton(.continue) { request in
      nonce = SignInNonce()
      request.requestedScopes = [.email]
      request.nonce = nonce.hashed
    } onCompletion: { result in
      Task { await completed(result) }
    }
    .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
    .frame(height: Metrics.signIn)
    .clipShape(Capsule())
  }

  private func completed(_ result: Result<ASAuthorization, Error>) async {
    switch result {
    case .success(let authorization):
      guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
        let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8)
      else { return failed() }
      await signedIn(ProviderToken(provider: .apple, idToken: idToken, nonce: nonce.raw))
    case .failure(let error):
      if (error as? ASAuthorizationError)?.code != .canceled { failed() }
    }
  }
}

/// Googleで続ける, as Google's branding guidelines draw it: its four-color
/// G, on white with a gray outline, or on near-black in dark mode, round
/// ended as Sign in with Apple's beside it. Google Sign-In is asked for an
/// ID token alone (the email, with the nonce itself in the token), and is
/// signed out of at once, so the device keeps no Google session: Pochical
/// needs nothing of Google's after the token. One the person cancelled says
/// nothing.
private struct GoogleButton: View {
  @Environment(\.colorScheme) private var colorScheme
  /// Set from the tap, so a second tap starts no second sign-in.
  @Binding var busy: Bool
  let signedIn: (ProviderToken) async -> Void
  let failed: () -> Void

  var body: some View {
    let colors = colorScheme == .dark ? GoogleButtonColors.dark : .light
    Button {
      Task { await signIn() }
    } label: {
      HStack(spacing: 8) {
        Image("GoogleG")
          .resizable()
          .frame(width: 18, height: 18)
          .accessibilityHidden(true)
        Text("Googleで続ける")
          .font(.system(size: 19, weight: .medium))
      }
      .foregroundStyle(colors.text)
      .frame(maxWidth: .infinity, minHeight: Metrics.signIn)
      .background(colors.fill, in: Capsule())
      .overlay { Capsule().strokeBorder(colors.stroke, lineWidth: 1) }
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }

  private func signIn() async {
    guard let presenting = UIApplication.shared.topViewController else { return failed() }
    busy = true
    defer { busy = false }
    let nonce = SignInNonce().raw
    let result: GIDSignInResult
    do {
      result = try await GIDSignIn.sharedInstance.signIn(
        withPresenting: presenting, hint: nil, additionalScopes: nil, nonce: nonce)
    } catch {
      if (error as? GIDSignInError)?.code != .canceled { failed() }
      return
    }
    GIDSignIn.sharedInstance.signOut()
    guard let idToken = result.user.idToken?.tokenString else { return failed() }
    await signedIn(ProviderToken(provider: .google, idToken: idToken, nonce: nonce))
  }
}

/// The provider's mark, as 設定's アカウント shows it beside its name:
/// Apple's in the text's color, Google's G in its own.
struct ProviderMark: View {
  let provider: LinkedAccount.Provider
  var size: CGFloat = 16

  var body: some View {
    switch provider {
    case .apple:
      Image(systemName: "apple.logo")
        .font(.system(size: size))
    case .google:
      Image("GoogleG")
        .resizable()
        .frame(width: size, height: size)
    }
  }
}
