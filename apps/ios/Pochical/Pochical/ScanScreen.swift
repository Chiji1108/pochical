@preconcurrency import AVFoundation
import CoreImage
import PhotosUI
import PochicalDesign
import PochicalKit
import SwiftUI

/// QRコードで参加 (/design's ScanPage): the camera reads a group's QR code
/// in the frame, or 写真から読み取る reads one from a picture, and an
/// invitation's opens its join screen. Anything else says what it was and
/// lets the person try again: the camera keeps looking, as camera apps do.
struct ScanScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  /// Called with the invitation read.
  let onInvite: (OpenedInvite) -> Void
  @State private var photo: PhotosPickerItem?
  @State private var problem: String?
  /// Whether the camera may be used, known once the person has answered:
  /// the camera starts only then, or it would run without its picture.
  @State private var camera = AVCaptureDevice.authorizationStatus(for: .video)

  var body: some View {
    // Read here: the photo picker's label is drawn off the main actor.
    let mediaFill = colors.mediaFill
    return ZStack {
      colors.mediaBackground.ignoresSafeArea()
      if camera == .authorized {
        QRCamera { read($0, fromPhoto: false) }
          .ignoresSafeArea()
          .overlay(colors.mediaDim.opacity(0.5).ignoresSafeArea().allowsHitTesting(false))
      }
      VStack(spacing: 20) {
        HStack(spacing: 12) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
            .labelStyle(.iconOnly)
            .buttonStyle(BarButton())
          Text("QRコードで参加").font(.headline)
          Spacer()
        }
        if let problem {
          Label(problem, systemImage: "exclamationmark.circle")
            .font(.subheadline)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(colors.mediaFill, in: RoundedRectangle(cornerRadius: Radius.lg))
            .transition(.opacity)
        }
        Spacer()
        Frame()
          .frame(width: 220, height: 220)
        Text(
          camera == .denied || camera == .restricted
            ? "カメラを使うには、設定でポチカルにカメラを許可してください"
            : "グループの招待QRコードを枠に合わせてください"
        )
        .multilineTextAlignment(.center)
        Spacer()
        PhotosPicker(selection: $photo, matching: .images) {
          Label("写真から読み取る", systemImage: "photo")
            .font(.body.weight(.semibold))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(mediaFill, in: Capsule())
        }
        .buttonStyle(.plain)
      }
      .padding(16)
      .foregroundStyle(colors.mediaText)
    }
    .task {
      if camera == .notDetermined {
        _ = await AVCaptureDevice.requestAccess(for: .video)
        camera = AVCaptureDevice.authorizationStatus(for: .video)
      }
    }
    .onChange(of: photo) { _, item in
      guard let item else { return }
      Task {
        let data = try? await item.loadTransferable(type: Data.self)
        let found = data.flatMap(qrMessages(in:)) ?? []
        photo = nil
        guard let message = found.first else {
          show("写真にQRコードが見つかりませんでした")
          return
        }
        read(message, fromPhoto: true)
      }
    }
  }

  /// What a code said: an invitation opens, anything else is told.
  private func read(_ message: String, fromPhoto: Bool) {
    if let url = URL(string: message), let code = openedInviteCode(of: url) {
      onInvite(OpenedInvite(code: code))
      return
    }
    show("ポチカルの招待QRコードではありません")
  }

  private func show(_ text: String) {
    withAnimation { problem = text }
  }
}

/// Four corner marks, where the code goes.
private struct Frame: View {
  @Environment(\.themeColors) private var colors

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: Radius.md).fill(colors.mediaFillFaint)
      // Each corner the top-left's turned a quarter more, in its place.
      ForEach(
        Array([Alignment.topLeading, .topTrailing, .bottomTrailing, .bottomLeading].enumerated()),
        id: \.offset
      ) { turns, place in
        Corner()
          .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
          .frame(width: 32, height: 32)
          .rotationEffect(.degrees(Double(turns) * 90))
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: place)
      }
    }
    .accessibilityHidden(true)
  }

}

/// A corner mark: down the left and along the top.
private struct Corner: Shape {
  nonisolated func path(in rect: CGRect) -> Path {
    Path { path in
      path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
      path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    }
  }
}

/// The messages of the QR codes in a picture.
private func qrMessages(in data: Data) -> [String]? {
  guard let image = CIImage(data: data),
    let detector = CIDetector(
      ofType: CIDetectorTypeQRCode, context: nil,
      options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
  else { return nil }
  return detector.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
}

/// The back camera's picture, reporting each QR code it reads; without a
/// camera, as in the simulator, nothing.
private struct QRCamera: UIViewRepresentable {
  let onRead: (String) -> Void

  func makeUIView(context: Context) -> PreviewView {
    let view = PreviewView()
    let session = context.coordinator.session
    view.previewLayer.session = session
    view.previewLayer.videoGravity = .resizeAspectFill
    guard let camera = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input)
    else { return view }
    session.addInput(input)
    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else { return view }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
    output.metadataObjectTypes = [.qr]
    DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
    return view
  }

  func updateUIView(_ view: PreviewView, context: Context) {
    context.coordinator.onRead = onRead
  }

  static func dismantleUIView(_ view: PreviewView, coordinator: Coordinator) {
    let session = coordinator.session
    DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(onRead: onRead)
  }

  final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    let session = AVCaptureSession()
    var onRead: (String) -> Void
    /// The last message read, so one code held in view is reported once.
    private var last: String?

    init(onRead: @escaping (String) -> Void) {
      self.onRead = onRead
    }

    func metadataOutput(
      _ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject],
      from connection: AVCaptureConnection
    ) {
      guard let code = objects.first as? AVMetadataMachineReadableCodeObject,
        let message = code.stringValue, message != last
      else { return }
      last = message
      onRead(message)
    }
  }

  final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer {
      // The layer is the class above, by layerClass.
      layer as! AVCaptureVideoPreviewLayer
    }
  }
}
