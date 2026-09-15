# Cadence

An offline-first music player for iPhone, inspired by [Musicolet](https://krosbits.in/musicolet/) on Android.
Built with Expo / React Native, sideloaded with SideStore. No accounts, no streaming, no ads: it plays the files you put on the phone.

See [FEATURES.md](./FEATURES.md) for the full Musicolet feature list and where each one stands on iOS,
and [ROADMAP.md](./ROADMAP.md) for the phased plan. Scope is the whole list.

## Why this exists

Musicolet has no iOS version and none of the App Store alternatives offer its combination of
multiple queues, folder browsing, bookmarks and an offline-only design. This project rebuilds
that feature set for iPhone, one feature at a time, starting with the ones that are easy in JS.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Expo SDK 57, React Native 0.86, TypeScript | New Architecture enabled |
| Navigation | expo-router | file-based routes |
| Playback | `modules/cadence-audio` (Swift Expo Module, AVAudioEngine) | background audio, lock screen, remote commands, later EQ / gapless / crossfade |
| Library index | expo-sqlite | tracks, albums, artists, folders, play counts, bookmarks, queues |
| File access | expo-file-system | reads the app's own `Documents/` folder |
| Tag reading | AVAsset metadata inside `cadence-audio` | filename-based guesses until the module lands |

Expo Go is not used. The audio engine is a native module, so development happens in a custom dev client.
The UI, queue and database layers program against `src/player/engine.ts`; a timer-driven fake engine
stands in until the Swift module exists, so everything above the engine can be built first.

## How music gets onto the phone

`app.json` sets `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`, so the app's
`Documents/` folder appears in the Files app under "On My iPhone / Cadence" and is writable over USB.

From Linux, with `ifuse` and the app installed:

```sh
mkdir -p ~/mnt/cadence
ifuse --documents dev.yeab.cadence ~/mnt/cadence
rsync -avh --progress ~/Music/ ~/mnt/cadence/
fusermount -u ~/mnt/cadence
```

The app scans `Documents/` recursively and indexes what it finds. Folder structure is preserved for folder browsing.

## Supported formats

Playback goes through AVPlayer, so the supported formats are the ones iOS decodes natively:

- MP3, AAC / M4A, ALAC, FLAC, WAV, AIFF

Ogg Vorbis and Opus are **not** supported. They would need a custom decoder in native code.
Check your library before syncing.

## Development workflow (no Mac)

This project is developed on Linux. There is no Xcode and no simulator, so the loop is:

1. **Build a dev client in CI.** A GitHub Actions macOS runner (or EAS Build) runs `expo prebuild` and
   `xcodebuild` with code signing disabled, then zips `Payload/` into an unsigned `.ipa`.
2. **Sign and install with SideStore** using the free Apple account. Background audio and file sharing
   are plain Info.plist keys, not paid entitlements, so the free account is enough.
3. **Iterate on JS over WiFi.** Run `npm start`, open the dev client, and Metro hot-reloads.
   Only steps 1 and 2 repeat when a new native module is added.
4. **Refresh every 7 days.** Free-account builds expire weekly. SideStore handles the refresh.

Free accounts allow 3 sideloaded apps at a time. Cadence counts as one.

## Getting started

```sh
npm install
npm start
```

Until the dev client exists there is no device to run on. What can be verified on Linux:

```sh
npm run typecheck                 # TypeScript
npm test                          # unit tests (Node's built-in runner, no extra deps)
npx expo export --platform ios    # full Metro bundle to Hermes bytecode
```

## Project layout

```
src/
  app/          expo-router routes only (NativeTabs: Library, Folders, Queue, Settings, Search)
  screens/      screen bodies rendered by the routes
  components/   shared UI: track-row, list-row, artwork, segmented, empty-state
  db/           schema + migrations, typed queries
  scan/         Documents/ walker, filename-based tag guesses (+ tests)
  player/       engine interface, fake engine, in-memory queue store
  hooks/        useLibraryQuery: DB query that refreshes when the library changes
  utils/        events, formatting
  theme.ts      color / spacing / type tokens (iOS semantic colors)
modules/
  cadence-audio/  Swift Expo Module (Phase 1)
.github/workflows/ios-build.yml   unsigned IPA build
assets/         icons, splash
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md). Phase 0 (foundation) is in progress.

## License

MIT
