import SwiftUI
import UIKit

/// The root navigation candidates: `-root swiftui` (a NavigationStack over
/// the TabView, each tab with its own NavigationStack) and `-root uikit`
/// (a UINavigationController whose root hosts the TabView).
@MainActor @Observable final class RootModel {
  static let shared = RootModel()
  var tab = "A"
  var rootPath: [Int] = []
  @ObservationIgnored var push: () -> Void = {}
  @ObservationIgnored weak var nav: UINavigationController?
  @ObservationIgnored var environment: EnvironmentValues?

  func openChat() {
    log("OPEN chat root=\(Args.value("-root") ?? "-")")
    if Args.value("-root") == "uikit" { push() } else { rootPath.append(1) }
  }
}

struct Tabs: View {
  @Bindable var root = RootModel.shared
  @State private var aPath: [String] = []

  var body: some View {
    TabView(selection: $root.tab) {
      Tab("A", systemImage: "calendar", value: "A") {
        if Args.has("-plainInner") {
          NavigationStack { tabA }
        } else {
          NavigationStack(path: $aPath) { tabA }
        }
      }
      Tab("B", systemImage: "person", value: "B") {
        NavigationStack {
          List { Button("Chat from B") { root.openChat() } }.navigationTitle("Tab B")
        }
      }
    }
    .onAppear {
      if Args.has("-autoInner") { aPath = ["inner"] }
      if Args.has("-autoChat") {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { root.openChat() }
      }
    }
  }

  private var tabA: some View {
          List {
            Button("Chat") { root.openChat() }
            Button("Root page") {
              RootModel.shared.nav?.pushViewController(UIHostingController(rootView: AnyView(RootTestPage().environment(\.self, RootModel.shared.environment ?? EnvironmentValues()))), animated: true)
            }
            NavigationLink("Inner", value: "inner")
            Text("aPath=\(aPath.joined(separator: ","))")
          }
          .navigationTitle("Tab A")
          .toolbar { ToolbarItem(placement: .primaryAction) { Button("TA") {} } }
          .navigationDestination(for: String.self) { value in
            Text("inner \(value)").navigationTitle("Inner")
              .toolbar { ToolbarItem(placement: .primaryAction) { Button("TI") {} } }
          }
  }
}

struct SwiftUIRoot: View {
  @Bindable var root = RootModel.shared

  var body: some View {
    NavigationStack(path: $root.rootPath) {
      Tabs()
        .toolbarVisibility(.hidden, for: .navigationBar)
        .navigationDestination(for: Int.self) { _ in ProbeScreen() }
    }
  }
}

struct UIKitRoot: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> UINavigationController {
    let tabs = UIHostingController(rootView: Tabs())
    let nav = RootNavigation(rootViewController: tabs)
    RootModel.shared.nav = nav
    RootModel.shared.push = { [weak nav] in
      let chat = UIHostingController(rootView: ProbeScreen())
      nav?.pushViewController(chat, animated: true)
    }
    return nav
  }

  func updateUIViewController(_ controller: UINavigationController, context: Context) {
    RootModel.shared.environment = context.environment
  }
}

/// The bar shows for pushed screens alone: the tabs bring their own.
final class RootNavigation: UINavigationController, UINavigationControllerDelegate {
  override func viewDidLoad() {
    super.viewDidLoad()
    delegate = self
    setNavigationBarHidden(true, animated: false)
  }

  func navigationController(
    _ navigationController: UINavigationController, willShow viewController: UIViewController,
    animated: Bool
  ) {
    let atRoot = viewController === viewControllers.first
    setNavigationBarHidden(atRoot, animated: animated)
    log("NAV willShow root=\(atRoot) count=\(viewControllers.count)")
  }
}

/// A page pushed on the UIKit root: do SwiftUI's own pushes and dismiss
/// work in it without a NavigationStack?
struct RootTestPage: View {
  @State private var presented = false
  @Environment(\.dismiss) private var dismiss
  var body: some View {
    List {
      NavigationLink("Linked") { Text("linked page").navigationTitle("Linked") }
      Button("Presented") { presented = true }
      Button("Dismiss") { dismiss() }
    }
    .navigationTitle("Root page")
    .navigationDestination(isPresented: $presented) {
      Text("presented page").navigationTitle("Presented")
    }
  }
}
