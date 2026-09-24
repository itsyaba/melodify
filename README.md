# Melodify

An offline-first music player for iPhone, inspired by [Musicolet](https://krosbits.in/musicolet/) on Android.
Built with Expo / React Native, sideloaded with a free Apple account. No accounts, no streaming, no ads: it plays the files you put on the phone.

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
| Playback | `modules/melodify-audio` (Swift Expo Module, AVAudioEngine) | background audio, lock screen, remote commands, later EQ / gapless / crossfade |
| Library index | expo-sqlite | tracks, albums, artists, folders, play counts, bookmarks, queues |
| File access | expo-file-system | reads the app's own `Documents/` folder |
| Tag reading | AVAsset metadata inside `melodify-audio` | read during a scan, and at launch for anything a scan left unread; filename-based guesses stand in until then, and on builds without the reader |

Expo Go is not used. The audio engine is a native module, so development happens in a custom dev client.
The UI, queue and database layers program against `src/player/engine.ts`. `src/player/index.ts` picks the
Swift module on iOS and falls back to a timer-driven fake engine everywhere else, including on an IPA
built before the module existed: the library still browses, it just stays silent. Settings names which
engine the running build ended up with.

## How music gets onto the phone

`app.json` sets `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`, so the app's
`Documents/` folder is writable over USB. Where that folder lives depends on how the app was installed.

**As a normal app** (SideStore, or any route that registers the bundle id with installd), it also
appears in the Files app under "On My iPhone / Melodify":

```sh
mkdir -p ~/mnt/melodify
ifuse --documents dev.yeab.melodify ~/mnt/melodify
rsync -rt --no-perms --no-owner --no-group --info=progress2 ~/Music/ ~/mnt/melodify/
fusermount -u ~/mnt/melodify
```

**As a LiveContainer guest** (the current setup). A guest runs inside LiveContainer's process and is
never registered with installd, so house arrest cannot find it by bundle id —
`ifuse --documents dev.yeab.melodify` fails with `ApplicationLookupFailed`. Mount LiveContainer
instead; each guest owns a real container underneath it:

```sh
mkdir -p ~/mnt/lc
ifuse --documents com.kdt.livecontainer.<TEAMID> ~/mnt/lc
# containers are keyed by uuid; LCContainerInfo.plist says which bundle each one belongs to
for d in ~/mnt/lc/Data/Application/*/; do
  echo "$d -> $(strings "$d/LCContainerInfo.plist" | grep -E '^[a-z]+\.[a-zA-Z0-9.]+$' | head -1)"
done
rsync -rt --no-perms --no-owner --no-group --info=progress2 \
  ~/Music/ ~/mnt/lc/Data/Application/<uuid>/Documents/
fusermount -u ~/mnt/lc
```

Use `-rt`, not `-a`: AFC has no unix permissions or ownership, but it does preserve mtimes, which the
scanner relies on to keep rescans incremental. Unmount before scanning.

The app scans `Documents/` recursively and indexes what it finds. Folder structure is preserved for folder browsing.

## Supported formats

Decoding goes through Core Audio (`AVAudioFile` inside `melodify-audio`), so the supported formats
are the ones iOS decodes natively:

- MP3, AAC / M4A, ALAC, FLAC, WAV, AIFF

Ogg Vorbis and Opus are **not** supported. They would need a custom decoder in native code.
Check your library before syncing.

## Development workflow (no Mac)

This project is developed on Linux. There is no Xcode and no simulator, so the loop is:

1. **Build a dev client in CI.** A GitHub Actions macOS runner (or EAS Build) runs `expo prebuild` and
   `xcodebuild` with code signing disabled, then zips `Payload/` into an unsigned `.ipa`.
2. **Sign and install.** Background audio and file sharing are plain Info.plist keys, not paid
   entitlements, so a free Apple account is enough. The current route is LiveContainer, which is
   itself signed with the free account and runs the unsigned IPA as a guest; it already declares
   the `audio` background mode and `UIFileSharingEnabled`, which guests inherit. SideStore also
   works and gives a real app install.
3. **Iterate on JS over WiFi.** Run `npm start`, open the dev client, and Metro hot-reloads.
   Only steps 1 and 2 repeat when a new native module is added.
   Under LiveContainer the Local Network permission belongs to **LiveContainer**, not Melodify, so
   enable it there and force-quit the host before the dev client can reach Metro.
4. **Refresh every 7 days.** Free-account signatures expire weekly.

Free accounts allow 3 sideloaded apps at a time. As a LiveContainer guest Melodify does not count
against that limit; LiveContainer itself does.

## Getting started

```sh
npm install
npm start
```

The dev client is installed on the phone; `npm start` and it hot-reloads over WiFi.
What can be verified on Linux without the device:

```sh
npm run typecheck                 # TypeScript
npm test                          # unit tests (Node's built-in runner, no extra deps)
npx expo export --platform ios    # full Metro bundle to Hermes bytecode
```

## Project layout

```
src/
  app/          expo-router routes only
    _layout      root Stack: the (tabs) group, plus /player as a modal over the tab bar
    (tabs)/      NativeTabs: Library, Folders, Queue, Settings, Search, and the mini player
                 in the tab bar's bottom accessory
  screens/      screen bodies rendered by the routes
  components/   shared UI: track-list (tap, long-press menu, multi-select), reorderable-list
                (drag and swipe), track-actions (queue and playlist menus), menus (action
                sheets, prompts), toast (with undo), chips, list-toolbar, rows, mini-player
  db/           schema + migrations, typed queries, playlists, settings, a serial write chain
  scan/         Documents/ walker, filename-based tag guesses, native tag reading (+ tests)
  player/       engine interface, native + fake engines, queue store (several queues,
                mirrored to SQLite), pure queue operations (+ tests)
  hooks/        useLibraryQuery (refreshes when the library changes), selection, stored choices
  utils/        events, formatting
  theme.ts      color / spacing / type tokens (iOS semantic colors), themes and accents,
                useTheme / makeStyles
  prefs.ts      user preferences, one JSON object in the settings table
modules/
  melodify-audio/  Swift Expo Module: AVAudioEngine playback
.github/workflows/ios-build.yml   unsigned IPA build
assets/         icons, splash
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md). Phase 0 (foundation) is done as of 2026-09-20: the app is on the
phone, scanning and browsing a real library. In Phase 1, playback, the lock screen and the player
screens work on the device as of 2026-09-23; tag reading, interruption handling and restoring the
queue on launch are written and waiting for a device test. Phase 2 (multiple queues, queue editing
with undo, playlists, grouped library views, multi-select, search), Phase 3 (bookmarks, sleep timer,
lyrics, play counts, favorites, song details, hiding and deleting) and Phase 4 (themes, accents,
player layouts, custom tabs, density, rotation) are written and waiting for the same.

## License

MIT
