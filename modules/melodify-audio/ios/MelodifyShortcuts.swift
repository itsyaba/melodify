import ExpoModulesCore
import UIKit

/// Where a home screen quick action lands before JS is listening, and how it is announced after.
internal final class MelodifyShortcutCenter {
  static let shared = MelodifyShortcutCenter()
  static let received = Notification.Name("MelodifyShortcutReceived")

  /// The action the app was launched with, until JS takes it.
  private(set) var pending: String?
  private let lock = NSLock()

  func receive(_ type: String) {
    lock.lock()
    pending = type
    lock.unlock()
    NotificationCenter.default.post(name: Self.received, object: nil, userInfo: ["type": type])
  }

  /// Hands over the pending action once; later calls get nil.
  func takePending() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let type = pending
    pending = nil
    return type
  }
}

/**
 Home screen quick actions (holding the app icon). The app delegate is where iOS delivers them: at
 launch in the launch options, and while running through `performActionFor`. This subscriber is
 registered in expo-module.config.json, so ExpoAppDelegate forwards both here.
 */
public class MelodifyShortcutSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
      MelodifyShortcutCenter.shared.receive(item.type)
    }
    return true
  }

  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    MelodifyShortcutCenter.shared.receive(shortcutItem.type)
    completionHandler(true)
  }
}

/// Mirrors `QuickAction` in src/utils/quick-actions.ts.
internal struct ShortcutRecord: Record {
  @Field var type: String = ""
  @Field var title: String = ""
  @Field var subtitle: String? = nil
  /// An SF Symbol name.
  @Field var symbol: String? = nil
}

internal enum MelodifyShortcuts {
  /// Replaces the app's dynamic quick actions. Main thread: it is UIApplication state.
  static func set(_ items: [ShortcutRecord]) {
    let shortcuts = items.map { item in
      UIApplicationShortcutItem(
        type: item.type,
        localizedTitle: item.title,
        localizedSubtitle: item.subtitle,
        icon: item.symbol.map { UIApplicationShortcutIcon(systemImageName: $0) },
        userInfo: nil
      )
    }
    DispatchQueue.main.async {
      UIApplication.shared.shortcutItems = shortcuts
    }
  }
}
