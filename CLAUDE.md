# Melodify, agent notes

Offline iPhone music player cloning Musicolet. Expo SDK 57, TypeScript, expo-router, expo-sqlite.
Read README.md (workflow), FEATURES.md (scope, status per feature), ROADMAP.md (phase order).

## Rules
- `src/app` holds routes only. Screen bodies live in `src/screens`, shared UI in `src/components`.
- Never build playback on react-native-track-player. The engine is `modules/melodify-audio` behind `src/player/engine.ts`.
  Add new engine features to the interface and FakeEngine first, then Swift.
- Schema changes are appended migrations in `src/db/schema.ts`; never edit a shipped one.
- Every color goes through `src/theme.ts` tokens, read in components with `useTheme()` or a
  `makeStyles` hook so theme changes apply live. Never capture `colors` in a plain StyleSheet.
- No network calls, analytics, or online lookups. The app is offline by design.
- Keep FEATURES.md status columns current when a feature lands.

## Verify before committing
```sh
npm run typecheck && npm test && npx expo export --platform ios --output-dir /tmp/melodify-export
```
There is no Mac. Native changes are compiled by `.github/workflows/ios-build.yml`; install the IPA with SideStore.

## Known tooling quirks
- npm 12 breaks `create-expo-app` and `npx expo install` (EALLOWSCRIPTS). Add packages with `npx expo install --` to
  resolve versions into package.json, then run `npm install` yourself.
- Expo SDK 57's `expo-modules-jsi` only compiles with Xcode 27's Swift (ownership annotations on
  constructors, strict-concurrency `sending` rules). CI therefore runs on GitHub's preview `xcode-27`
  runner label. Do not pin an older Xcode; patching the vendored Swift sources was tried and is a dead end.
- Typed routes live in `.expo/types/router.d.ts`, which only the dev server regenerates
  (`expo export` does not). After adding or renaming a route, run
  `CI=1 timeout 45 npx expo start --offline` once, or typecheck fails on the new paths.
