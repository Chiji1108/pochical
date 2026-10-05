import CoreImage.CIFilterBuiltins
import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// メンバーを招待 (/design's InvitePage): the group's link as a QR code to
/// be read off the screen, to send or copy, and to remake, which stops the
/// old link and QR code at once.
struct InvitePage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  let group: GroupRow
  @State private var link: URL?
  @State private var failed = false
  @State private var confirmingRemake = false
  @State private var remakeFailed = false
  @State private var copied = false

  var body: some View {
    ScrollView {
      VStack(spacing: 12) {
        VStack(spacing: 12) {
          Group {
            if let link, let qr = qrCode(of: link) {
              Image(uiImage: qr)
                .interpolation(.none)
                .resizable()
                .accessibilityLabel("招待のQRコード")
            } else if failed {
              Image(systemName: "wifi.exclamationmark")
                .font(.largeTitle)
                .foregroundStyle(colors.textTertiary)
            } else {
              ProgressView()
            }
          }
          .frame(width: 180, height: 180)
          Text(failed ? "リンクを読み込めませんでした" : "この画面を相手に読み取ってもらいます")
            .font(.footnote)
            .foregroundStyle(colors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.separator))
        .padding(.bottom, 8)

        if let link {
          ShareLink(item: link) {
            Label("招待リンクを送る", systemImage: "paperplane")
              .font(.headline)
              .frame(maxWidth: .infinity, minHeight: Metrics.control)
          }
          .buttonStyle(.borderedProminent)
          .buttonBorderShape(.capsule)
          .tint(colors.accentFill)
          .foregroundStyle(colors.accentOnFill)
          Button {
            UIPasteboard.general.url = link
            copied = true
          } label: {
            Label(copied ? "コピーしました" : "リンクをコピー", systemImage: copied ? "checkmark" : "doc.on.doc")
              .frame(maxWidth: .infinity, minHeight: Metrics.control)
          }
          .buttonStyle(.bordered)
          .buttonBorderShape(.capsule)
          .tint(colors.textPrimary)
        }
        Text("リンクを知っている人は、だれでも「\(group.name)」に参加できます。送る相手に気をつけてください。")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 4)
        if link != nil {
          Button("招待リンクを作り直す") { confirmingRemake = true }
            .foregroundStyle(colors.accentDefault)
            .padding(.top, 8)
        }
      }
      .padding(16)
    }
    .background(colors.backgroundBase)
    .navigationTitle("メンバーを招待")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .task { await load() }
    .alert("招待リンクを作り直しますか？", isPresented: $confirmingRemake) {
      Button("作り直す", role: .destructive) {
        Task { await load(remaking: true) }
      }
      Button("キャンセル", role: .cancel) {}
    } message: {
      Text("今のリンクとQRコードでは、もう参加できなくなります。今いるメンバーはそのままです。")
    }
    .alert("招待リンクを作り直せませんでした", isPresented: $remakeFailed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("今のリンクはそのまま使えます。通信できる場所で、もう一度お試しください。")
    }
  }

  private func load(remaking: Bool = false) async {
    failed = false
    copied = false
    do {
      let code =
        remaking
        ? try await groupCalls.remakeInviteCode(of: group.id)
        : try await groupCalls.inviteCode(of: group.id)
      link = inviteLink(code: code)
    } catch {
      failed = link == nil
      remakeFailed = remaking
    }
  }
}

/// The link as a QR code, one pixel a module, to be scaled up unsmoothed.
private func qrCode(of link: URL) -> UIImage? {
  let filter = CIFilter.qrCodeGenerator()
  filter.message = Data(link.absoluteString.utf8)
  filter.correctionLevel = "M"
  guard let image = filter.outputImage,
    let drawn = CIContext().createCGImage(image, from: image.extent)
  else { return nil }
  return UIImage(cgImage: drawn)
}
