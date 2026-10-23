import UIKit

extension UIApplication {
  /// What UIKit presents over, as an alert or a sign-in's web sheet: the
  /// topmost screen of the key window of the scene in use; nil while no
  /// scene is in the foreground.
  var topViewController: UIViewController? {
    let scene = connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = scene?.keyWindow?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}
