import SwiftUI

enum Args {
  static let all = ProcessInfo.processInfo.arguments
  static func has(_ flag: String) -> Bool { all.contains(flag) }
  static func value(_ key: String) -> String? {
    guard let at = all.firstIndex(of: key), at + 1 < all.count else { return nil }
    return all[at + 1]
  }
  static var mode: String { value("-mode") ?? "B" }
  static var motion: Animation {
    switch value("-motion") ?? "slow" {
    case "smooth": .smooth(duration: 0.35)
    case "spring": .spring(duration: 0.5, bounce: 0)
    default: .linear(duration: 1.2)
    }
  }
}

func log(_ words: String) {
  print(String(format: "%.4f ", CACurrentMediaTime()) + words)
  fflush(stdout)
}

@main struct ProbeApp: App {
  var body: some Scene {
    WindowGroup { Root() }
  }
}

struct Root: View {
  @State private var path: [Int] = Args.has("-push") ? [1] : []
  var body: some View {
    if Args.has("-tabs") {
      TabView {
        Tab("A", systemImage: "calendar") { stack }
        Tab("B", systemImage: "person") { Text("B") }
      }
    } else {
      stack
    }
  }

  private var stack: some View {
    NavigationStack(path: $path) {
      List { NavigationLink("Chat", value: 1) }
        .navigationTitle("Probe")
        .navigationDestination(for: Int.self) { _ in
          ProbeScreen().toolbarVisibility(Args.has("-hideTabBar") ? .hidden : .automatic, for: .tabBar)
        }
    }
  }
}

@Observable final class ComposerModel {
  var quote = false
  var text = ""
  var focus = false
  var width: CGFloat?
}

struct ComposerShape: Equatable {
  var quote: Bool
  var lines: Int
}

struct ProbeScreen: View {
  @State private var model = ComposerModel()
  @Environment(\.scenePhase) private var scenePhase
  var body: some View {
    ProbeStage(model: model, phase: "\(scenePhase)")
      .ignoresSafeArea()
      .navigationTitle("Probe")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarVisibility(.visible, for: .navigationBar)
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button("Q") { model.quote.toggle() }
        }
      }
  }
}

struct ComposerView: View {
  @Bindable var model: ComposerModel
  @FocusState private var focused: Bool

  var body: some View {
    let shape = ComposerShape(
      quote: model.quote, lines: model.text.count)
    VStack(spacing: 0) {
      if model.quote {
        Color(red: 0, green: 0, blue: 1).frame(height: 56).transition(.identity)
      }
      TextField("", text: $model.text, axis: .vertical)
        .lineLimit(1...5)
        .focused($focused)
        .foregroundStyle(.white)
        .padding(.horizontal, 40)
        .padding(.vertical, 12)
    }
    .frame(width: Args.has("-width") ? model.width : nil)
    .background(Color(red: 0, green: 0, blue: 1))
    .clipped()
    .overlay(alignment: .topLeading) { Color(red: 0, green: 1, blue: 1).frame(width: 20, height: 4).offset(x: 20) }
    .overlay(alignment: .bottomLeading) { Color(red: 0, green: 1, blue: 1).frame(width: 20, height: 4).offset(x: 60) }
    .frame(minHeight: Args.has("-top") ? 0 : nil, maxHeight: Args.has("-top") ? .infinity : nil, alignment: .top)
    .animation(Args.has("-noSwiftUIAnimation") ? nil : Args.motion, value: shape)
    .onChange(of: model.focus) { _, now in focused = now }
  }
}

struct ProbeStage: UIViewControllerRepresentable {
  let model: ComposerModel
  let phase: String
  func makeUIViewController(context: Context) -> ProbeController { ProbeController(model: model) }
  func updateUIViewController(_ controller: ProbeController, context: Context) {
    log("UPDATE phase=\(phase)")
    if Args.has("-reroot") { controller.composer.rootView = ComposerView(model: model) }
  }
}
