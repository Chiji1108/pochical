import AuthenticationServices
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import WidgetKit

/// 設定's アカウント row (/design's AccountRow): the provider signed in
/// with, or ログインしていません.
struct AccountRow: View {
  @Environment(\.groupCalls) private var groupCalls
  @State private var linked = LinkedAccount.kept

  var body: some View {
    NavigationLink {
      AccountPage(linked: $linked)
    } label: {
      LabeledContent("アカウント") {
        if linked == nil {
          Text("ログインしていません")
        } else {
          ProviderName()
        }
      }
    }
    // As the server says: linked here, or on another of the person's
    // devices, or no longer.
    .task {
      guard let isLinked = await groupCalls.linked() else { return }
      if !isLinked {
        linked = nil
      } else if linked == nil {
        linked = LinkedAccount(provider: .apple, email: nil)
      }
      LinkedAccount.keep(linked)
    }
  }
}

/// The provider signed in with, its mark before its name, as 設定's
/// アプリアイコン row shows its icon.
private struct ProviderName: View {
  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "apple.logo")
      Text("Apple")
    }
  }
}

/// アカウント (/design's AccountPage): before signing in, what it keeps and
/// the way in; after, which account it is. Signing in is optional, so the
/// page never pushes it beyond saying what it keeps safe.
struct AccountPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.account) private var account
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.userSocket) private var userSocket
  @Dependency(\.defaultDatabase) private var database
  @Binding var linked: LinkedAccount?
  @State private var confirmingDelete = false
  @State private var confirmingSignOut = false
  @State private var deleted = false
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
  /// The nonce the sign-in under way was asked with.
  @State private var nonce = SignInNonce()
  @State private var busy = false
  @State private var problem: Problem?

  enum Problem: String, Identifiable {
    case failed = "ログインできませんでした。時間をおいてもう一度お試しください。"
    case notDeleted = "削除できませんでした。時間をおいてもう一度お試しください。"
    case notSignedOut = "ログアウトできませんでした。時間をおいてもう一度お試しください。"
    var id: String { rawValue }
  }

  var body: some View {
    List {
      if let linked {
        Section {
          LabeledContent {
            Text(linked.email ?? "")
              .foregroundStyle(colors.textTertiary)
          } label: {
            ProviderName()
          }
        } header: {
          Text("ログイン中")
        } footer: {
          Text("シフトとグループはこのアカウントに保存され、ほかの端末でも同じデータを使えます。")
        }
        .settingsRows()
        // Each asks first, on the spot, so no arrow as for a page.
        Section {
          Button("ログアウト", role: .destructive) { confirmingSignOut = true }
            .disabled(busy)
        }
        .settingsRows()
        Section {
          Button("アカウントを削除", role: .destructive) { confirmingDelete = true }
            .disabled(busy)
        }
        .settingsRows()
      } else {
        signIn
      }
    }
    .settingsList()
    .navigationTitle("アカウント")
    .navigationBarTitleDisplayMode(.inline)
    .alert(item: $problem) { problem in
      Alert(title: Text(problem.rawValue))
    }
    .alert("アカウントを削除しますか？", isPresented: $confirmingDelete) {
      Button("キャンセル", role: .cancel) {}
      Button("アカウントとすべてのデータを削除", role: .destructive) {
        Task { await deleteAccount() }
      }
    } message: {
      Text("シフト、グループ、チャットがすべて削除されます。元に戻せません。")
    }
    .alert("アカウントを削除しました", isPresented: $deleted) {
      Button("OK", role: .cancel) {}
    }
    .alert("ログアウトしますか？", isPresented: $confirmingSignOut) {
      Button("キャンセル", role: .cancel) {}
      Button("ログアウト", role: .destructive) { Task { await signOut() } }
    } message: {
      Text("この端末からデータが消えます。もう一度ログインすれば、同じデータを使えます。")
    }
    .alert(
      "どちらのデータを使いますか？",
      isPresented: Binding { choosing != nil } set: { if !$0 { choosing = nil } },
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
    .overlay {
      if busy { ProgressView() }
    }
  }

  /// What signing in keeps, and Sign in with Apple.
  private var signIn: some View {
    Section {
      VStack(spacing: 8) {
        Image(systemName: "checkmark.icloud")
          .font(.system(size: 28))
          .foregroundStyle(colors.accentDefault)
          .frame(width: 56, height: 56)
          .background(colors.accentContainer, in: Circle())
          .padding(.bottom, 8)
          .accessibilityHidden(true)
        Text("ログインして、データを守る")
          .font(.title3.weight(.bold))
          .foregroundStyle(colors.textPrimary)
        Text("機種変更しても、スマホとタブレットでも、同じシフトとグループを使えます。")
          .font(.subheadline)
          .foregroundStyle(colors.textTertiary)
      }
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
      .settingsOnPage()
      .listRowSeparator(.hidden)
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
      .settingsOnPage()
    } footer: {
      Text("はじめてなら、この端末のデータがそのまま引き継がれます。すでにアカウントがあれば、そのデータを開きます。ログインしなくても、この端末ではそのまま使えます。")
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
        problem = .failed
      }
      return
    }
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8)
    else {
      problem = .failed
      return
    }
    busy = true
    defer { busy = false }
    let email = LinkedAccount.email(in: idToken)
    switch try? await account.linkApple(idToken: idToken, nonce: nonce.raw) {
    case .linked:
      keepLinked(email: email)
    case .inUse:
      await chooseSide(idToken: idToken, nonce: nonce.raw, email: email)
    case nil:
      problem = .failed
    }
  }

  private func keepLinked(email: String?) {
    let account = LinkedAccount(provider: .apple, email: email)
    LinkedAccount.keep(account)
    withAnimation { linked = account }
  }

  /// The Apple account is another user's already (spec/sync-protocol.md,
  /// Switching to an account in use): a side that holds nothing goes
  /// without asking, the device's first, as a new phone's first sign-in
  /// does; else the person chooses, seeing what each holds.
  private func chooseSide(idToken: String, nonce: String, email: String?) async {
    guard let held = try? await groupCalls.peekAccount(appleIDToken: idToken, nonce: nonce),
      let here = try? await database.read({ try Holdings.onDevice(in: $0) })
    else {
      problem = .failed
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
  /// own deleted, and the device catching up from the account.
  private func useAccount(_ choice: Choice) async {
    busy = true
    defer { busy = false }
    // Not to connect as the account's user meanwhile, and send it what
    // the device's own outbox holds.
    await userSocket?.stop()
    guard
      let before = try? await account.signInApple(idToken: choice.idToken, nonce: choice.nonce)
    else {
      problem = .failed
      await userSocket?.start()
      return
    }
    // The device's user, left behind: everything of it goes.
    try? await groupCalls.deleteAccount(signedInAs: before)
    await forgetDevice()
    keepLinked(email: choice.email)
    await userSocket?.startAfresh()
  }

  /// この端末のデータを使う: the account's user deleted, and the Apple
  /// account linked here instead.
  private func keepDevice(_ choice: Choice) async {
    busy = true
    defer { busy = false }
    do {
      try await groupCalls.takeAccount(appleIDToken: choice.idToken, nonce: choice.nonce)
      keepLinked(email: choice.email)
    } catch {
      problem = .failed
    }
  }

  /// ログアウト: the session ends, and the device goes on as someone new,
  /// holding nothing of the user; signing in again brings it all back.
  private func signOut() async {
    busy = true
    defer { busy = false }
    // What waits to be sent goes first, so signing in again finds it.
    await userSocket?.finishSending()
    await userSocket?.stop()
    do {
      try await account.signOut()
    } catch {
      problem = .notSignedOut
      await userSocket?.start()
      return
    }
    await forgetDevice()
    withAnimation { linked = nil }
    await userSocket?.startAfresh()
  }

  /// The device holding nothing of the user, as a new install does: its
  /// own settings stay.
  private func forgetDevice() async {
    await userSocket?.stop()
    try? await database.write { try LocalData.erase(in: $0) }
    LocalData.eraseFiles()
    WidgetCenter.shared.reloadAllTimelines()
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

  /// Deletes the account (spec/sync-protocol.md, Deleting an account):
  /// Apple asked once more first, for the code the server revokes Apple's
  /// tokens with; then the device holds nothing of the user, and goes on
  /// as someone new.
  private func deleteAccount() async {
    busy = true
    defer { busy = false }
    let code: String
    do {
      code = try await AppleCode.ask()
    } catch {
      if (error as? ASAuthorizationError)?.code != .canceled {
        problem = .notDeleted
      }
      return
    }
    do {
      try await groupCalls.deleteAccount(appleAuthorizationCode: code)
    } catch {
      problem = .notDeleted
      return
    }
    try? await account.forget()
    await forgetDevice()
    await userSocket?.startAfresh()
    withAnimation { linked = nil }
    deleted = true
  }
}

/// Sign in with Apple asked once more, for a fresh authorization code, as
/// deleting an account needs one to revoke Apple's tokens with.
@MainActor private final class AppleCode: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private var answer: CheckedContinuation<String, Error>?
  private var controller: ASAuthorizationController?
  /// The one asking now, kept until Apple answers, as the controller holds
  /// its delegate weakly.
  private static var asking: AppleCode?

  static func ask() async throws -> String {
    let asking = AppleCode()
    Self.asking = asking
    defer { Self.asking = nil }
    return try await withCheckedThrowingContinuation { continuation in
      asking.answer = continuation
      let controller = ASAuthorizationController(
        authorizationRequests: [ASAuthorizationAppleIDProvider().createRequest()])
      controller.delegate = asking
      controller.presentationContextProvider = asking
      asking.controller = controller
      controller.performRequests()
    }
  }

  func authorizationController(
    controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let data = credential.authorizationCode, let code = String(data: data, encoding: .utf8)
    else {
      answer?.resume(throwing: ASAuthorizationError(.failed))
      answer = nil
      return
    }
    answer?.resume(returning: code)
    answer = nil
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    answer?.resume(throwing: error)
    answer = nil
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }
}
