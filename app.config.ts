import type { ConfigContext, ExpoConfig } from 'expo/config';

// The iOS Debug build (the dev client) gets its own bundle ID and home screen name, so SideStore
// installs it beside Release instead of over it. ios-build.yml sets MELODIFY_DEV_CLIENT for Debug.
// `name` stays Melodify: prebuild names the Xcode project and scheme after it.
export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.MELODIFY_DEV_CLIENT !== '1') return config as ExpoConfig;
  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: 'dev.yeab.melodify.dev',
      infoPlist: { ...config.ios?.infoPlist, CFBundleDisplayName: 'Melodify Dev' },
    },
  } as ExpoConfig;
};
