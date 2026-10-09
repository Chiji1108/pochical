import AuthenticationServices
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

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
  @Environment(\.account) private var account
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.userSocket) private var userSocket
  @Dependency(\.defaultDatabase) private var database
  @Binding var linked: LinkedAccount?
  @State private var confirmingDelete = false
  @State private var confirmingSignOut = false
  @State private var deleted = false
  @State private var busy = false
  @State private var problem: Problem?

  enum Problem: String, Identifiable {
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
    // Then the device starts over as a new one does, with はじめの設定.
    .alert("アカウントを削除しました", isPresented: $deleted) {
      Button("OK", role: .cancel) { FirstRun.again() }
    }
    .alert("ログアウトしますか？", isPresented: $confirmingSignOut) {
      Button("キャンセル", role: .cancel) {}
      Button("ログアウト", role: .destructive) { Task { await signOut() } }
    } message: {
      Text("この端末からデータが消えます。もう一度ログインすれば、同じデータを使えます。")
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
      AppleSignInButton { account, _ in
        withAnimation { linked = account }
      }
      .settingsOnPage()
    } footer: {
      Text("はじめてなら、この端末のデータがそのまま引き継がれます。すでにアカウントがあれば、そのデータを開きます。ログインしなくても、この端末ではそのまま使えます。")
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
    await forgetDevice(database: database, userSocket: userSocket)
    withAnimation { linked = nil }
    await userSocket?.startAfresh()
    // The device starts over as a new one does, with はじめの設定.
    FirstRun.again()
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
    await forgetDevice(database: database, userSocket: userSocket)
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
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first {
      return window
    }
    // Asked only while the app shows the account page, so a scene is there.
    guard let scene = scenes.first else { preconditionFailure("No window scene to present in") }
    return ASPresentationAnchor(windowScene: scene)
  }
}
