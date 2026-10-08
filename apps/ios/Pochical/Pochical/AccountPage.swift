import AuthenticationServices
import PochicalDesign
import PochicalKit
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
          Label("Apple", systemImage: "apple.logo")
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

/// アカウント (/design's AccountPage): before signing in, what it keeps and
/// the way in; after, which account it is. Signing in is optional, so the
/// page never pushes it beyond saying what it keeps safe.
struct AccountPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.account) private var account
  @Binding var linked: LinkedAccount?
  /// The nonce the sign-in under way was asked with.
  @State private var nonce = SignInNonce()
  @State private var busy = false
  @State private var problem: Problem?

  enum Problem: String, Identifiable {
    case inUse = "このAppleアカウントは、ほかの端末のデータですでに使われています。"
    case failed = "ログインできませんでした。時間をおいてもう一度お試しください。"
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
            Label("Apple", systemImage: "apple.logo")
          }
        } header: {
          Text("ログイン中")
        } footer: {
          Text("シフトとグループはこのアカウントに保存され、ほかの端末でも同じデータを使えます。")
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
      Text("はじめてなら、この端末のデータがそのまま引き継がれます。ログインしなくても、この端末ではそのまま使えます。")
    }
  }

  /// Links Apple's account to this user, keeping everything the device
  /// holds; one the person cancelled says nothing.
  private func signedIn(_ result: Result<ASAuthorization, Error>) async {
    guard case .success(let authorization) = result else { return }
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
      let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8)
    else {
      problem = .failed
      return
    }
    busy = true
    defer { busy = false }
    switch try? await account.linkApple(idToken: idToken, nonce: nonce.raw) {
    case .linked:
      let account = LinkedAccount(provider: .apple, email: LinkedAccount.email(in: idToken))
      LinkedAccount.keep(account)
      withAnimation { linked = account }
    case .inUse:
      problem = .inUse
    case nil:
      problem = .failed
    }
  }
}
