# Melodify, agent notes

Offline music player for iPhone and Android, cloning Musicolet. Expo SDK 57, TypeScript, expo-router, expo-sqlite.
Read README.md (workflow), FEATURES.md (scope, status per feature), ROADMAP.md (phase order).

## Rules
- `src/app` holds routes only. Screen bodies live in `src/screens`, shared UI in `src/components`.
- Never build playback on react-native-track-player. The engine is `modules/melodify-audio` behind `src/player/engine.ts`.
  Add new engine features to the interface and FakeEngine first, then Swift (`ios/`) and Kotlin (`android/`).
  The two native halves export the same function and event names; one that only one platform has is
  declared optional in `MelodifyAudioModule.ts` and called with `?.`.
- One JS program for both platforms. Branch on `Platform.OS` only for what the platform differs in, and keep
  pure modules (anything a test imports) free of `react-native` imports.
- Music paths go through `src/storage.ts` (`musicUri`, `musicFile`, `musicDirectory`, `artFileUri`), never
  `Paths.document`: the music folder is Documents/ on iOS and shared storage on Android.
- Icons are SF Symbol names through `@/components/symbol`; Android draws them from Material Icons via
  `src/components/material-icons.ts`. A new symbol gets a row there (a test checks the names exist).
- Schema changes are appended migrations in `src/db/schema.ts`; never edit a shipped one.
- Every color goes through `src/theme.ts` tokens, read in components with `useTheme()` or a
  `makeStyles` hook so theme changes apply live. Never capture `colors` in a plain StyleSheet.
- No network calls, analytics, or online lookups. The app is offline by design. The one exception is
  `src/lyrics/online.ts` (LRCLIB), which runs only when the user taps Search online on a song with
  no lyrics. Ask before adding any other.
- Keep FEATURES.md status columns current when a feature lands.

## Verify before committing
```sh
npm run typecheck && npm test && npx expo export --platform ios --output-dir /tmp/melodify-export \
  && npx expo export --platform android --output-dir /tmp/melodify-export-android
```
There is no Mac. Native iOS changes are compiled by `.github/workflows/ios-build.yml`; install the IPA with SideStore.
Android builds locally (SDK, NDK 27.1 and an emulator are installed): `npx expo prebuild --platform android --no-install`,
then `cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64` for the emulator AVD `melodify_test`.
`.github/workflows/android-build.yml` builds the signed release APK; the key is `~/.android/melodify-release.jks`
(passwords in `melodify-release.txt` beside it) and in the repo secrets. Never lose or replace it: an APK signed
with another key cannot install over the old one.

## Known tooling quirks
- npm 12 breaks `create-expo-app` and `npx expo install` (EALLOWSCRIPTS). Add packages with `npx expo install --` to
  resolve versions into package.json, then run `npm install` yourself.
- Expo SDK 57's `expo-modules-jsi` only compiles with Xcode 27's Swift (ownership annotations on
  constructors, strict-concurrency `sending` rules). CI therefore runs on GitHub's preview `xcode-27`
  runner label. Do not pin an older Xcode; patching the vendored Swift sources was tried and is a dead end.
- Android: expo-file-system refuses to create a file that does not exist yet outside the app's folders
  (it asks `File.canWrite()`). The module swaps in `SharedStoragePermissions`, which asks the parent folder.
- Android: NativeTabs has no bottom accessory, so Android uses JS tabs (`src/components/android-tab-bar.tsx`)
  with the mini player above the bar. `Alert.prompt` is iOS-only; `promptText` uses `PromptHost` there.
- Android: a module that does not pin `ndkVersion` makes Gradle download a second NDK (1 GB+). Pin it to
  `rootProject.ext.ndkVersion`, as `modules/melodify-audio/android/build.gradle` does.
- Typed routes live in `.expo/types/router.d.ts`, which only the dev server regenerates
  (`expo export` does not). After adding or renaming a route, run
  `CI=1 timeout 45 npx expo start --offline` once, or typecheck fails on the new paths.
