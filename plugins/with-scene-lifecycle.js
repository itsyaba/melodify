// iOS 27 ends at launch any app built with its SDK that has not adopted the UIScene lifecycle
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption, EXC_BREAKPOINT). Expo SDK 57's
// AppDelegate still makes its own window, so this plugin declares one window scene in Info.plist,
// moves the React Native start into a SceneDelegate, and forwards what iOS now sends the scene
// (URLs, quick actions, foreground and background) to the AppDelegate, where Expo's subscribers
// already listen.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const WINDOW_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

const SCENE_DELEGATE = `
/// The app's one window scene. React Native starts here, not in the AppDelegate: iOS 27 stops
/// apps that never adopt scenes. Added by plugins/with-scene-lifecycle.js.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var app: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene, let app, let factory = app.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Libraries that look for the app delegate's window (expo-updates) still find it.
    app.window = window

    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)

    // A cold launch from a home screen quick action arrives here, not in the launch options.
    if let item = connectionOptions.shortcutItem {
      app.application(UIApplication.shared, performActionFor: item) { _ in }
    }
  }

  func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let app else { return completionHandler(false) }
    app.application(UIApplication.shared, performActionFor: shortcutItem, completionHandler: completionHandler)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let app else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication {
        options[.sourceApplication] = source
      }
      _ = app.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = app?.application(UIApplication.shared, continue: userActivity) { _ in }
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    app?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    app?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    app?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    app?.applicationDidEnterBackground(UIApplication.shared)
  }
}
`;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });

  return withAppDelegate(config, (config) => {
    const src = config.modResults.contents;
    if (src.includes('class SceneDelegate')) return config;
    // Fail the prebuild, not the launch, if a new Expo template moves the window code.
    if (config.modResults.language !== 'swift' || !src.includes(WINDOW_BLOCK)) {
      throw new Error('with-scene-lifecycle: AppDelegate.swift no longer matches; update the plugin.');
    }
    config.modResults.contents = src.replace(WINDOW_BLOCK, '') + SCENE_DELEGATE;
    return config;
  });
};
