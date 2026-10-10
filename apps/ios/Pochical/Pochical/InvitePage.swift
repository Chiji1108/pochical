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
                // As iOS's images, a long press shares or saves it.
                .contextMenu {
                  let image = Image(uiImage: qr)
                  ShareLink(
                    item: image, preview: SharePreview("「\(group.name)」への招待", image: image)
                  ) {
                    Label("共有", systemImage: "square.and.arrow.up")
                  }
                  Button("写真に保存", systemImage: "square.and.arrow.down") {
                    UIImageWriteToSavedPhotosAlbum(qr, nil, nil, nil)
                  }
                }
            } else if failed {
              Image(systemName: "wifi.exclamationmark")
                .font(.largeTitle)
                .foregroundStyle(colors.textTertiary)
            } else {
              ProgressView()
            }
          }
          .frame(width: 200, height: 200)
          Text(failed ? "リンクを読み込めませんでした" : "この画面を相手に読み取ってもらいます")
            .font(.caption)
            .foregroundStyle(colors.textTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(EdgeInsets(top: 24, leading: 16, bottom: 20, trailing: 16))
        .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xxl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
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
          .tint(colors.accentDefault)
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

/// The link as a QR code, black on white with the white margin of four
/// modules readers expect, large enough to share and save sharp; shown
/// scaled unsmoothed.
private func qrCode(of link: URL) -> UIImage? {
  let filter = CIFilter.qrCodeGenerator()
  filter.message = Data(link.absoluteString.utf8)
  filter.correctionLevel = "M"
  let module: CGFloat = 16
  guard let code = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: module, y: module))
  else { return nil }
  let framed = code.composited(
    over: CIImage(color: .white).cropped(to: code.extent.insetBy(dx: -3 * module, dy: -3 * module)))
  guard let drawn = CIContext().createCGImage(framed, from: framed.extent) else { return nil }
  return UIImage(cgImage: drawn)
}
