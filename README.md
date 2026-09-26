# Melodify

An offline-first music player for iPhone and Android, inspired by [Musicolet](https://krosbits.in/musicolet/).
Built with Expo / React Native: sideloaded with a free Apple account on iOS, installed as an APK on Android.
No accounts, no streaming, no ads: it plays the files you put on the phone.

See [FEATURES.md](./FEATURES.md) for the full Musicolet feature list and where each one stands on iOS
and Android, and [ROADMAP.md](./ROADMAP.md) for the phased plan. Scope is the whole list.

## Why this exists

Musicolet has no iOS version and none of the App Store alternatives offer its combination of
multiple queues, folder browsing, bookmarks and an offline-only design. This project rebuilds
that feature set for iPhone, one feature at a time, starting with the ones that are easy in JS.
The same app runs on Android too (since 2026-09-26): one JS program, with the audio module written
twice, once per platform, and the features each platform allows (see *Android* below).

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Expo SDK 57, React Native 0.86, TypeScript | New Architecture enabled |
| Navigation | expo-router | file-based routes |
| Playback, iOS | `modules/melodify-audio/ios` (Swift Expo Module, AVAudioEngine) | background audio, lock screen, remote commands, EQ, gapless, crossfade |
| Playback, Android | `modules/melodify-audio/android` (Kotlin Expo Module, Media3 ExoPlayer) | the same contract: two ExoPlayer decks, a media notification through a MediaSessionService, EQ as an audio processor |
| Library index | expo-sqlite | tracks, albums, artists, folders, play counts, bookmarks, queues |
| File access | expo-file-system | iOS: the app's own `Documents/` folder. Android: the phone's shared storage (`/storage/emulated/0`), with All files access |
| Tag reading | iOS: AVAsset metadata. Android: TagLib, built with the NDK | read during a scan, and at launch for anything a scan left unread; filename-based guesses stand in until then, and on builds without the reader |
| Tag writing | TagLib 2.1.1, vendored into `melodify-audio` | behind a small C API shared by both platforms; used under the MPL 1.1 (see `modules/melodify-audio/ios/Vendor/`) |

Expo Go is not used. The audio engine is a native module, so development happens in a custom dev client.
The UI, queue and database layers program against `src/player/engine.ts`. `src/player/index.ts` picks the
native module on iOS and Android and falls back to a timer-driven fake engine everywhere else, including on
a build made before the module existed: the library still browses, it just stays silent. Settings names which
engine the running build ended up with (`native-swift` or `native-kotlin`).

## How music gets onto the phone

**From the phone.** Settings › Import and scan › *Import a folder* or *Import songs* opens the Files
picker (On My iPhone, iCloud Drive, a USB drive, a server). A folder is copied into `Documents/`
under its own name, subfolders, covers and `.lrc` files included; songs picked one by one go to
`Documents/Imported/`. A scan follows. Importing the same folder again copies only files not there
yet, and leaves the ones already imported alone (their tags may have been edited in the app).
Download an iCloud Drive folder in Files first; songs still in the cloud are counted and skipped.
As a LiveContainer guest, the picker's Open button does nothing until *Fix File Picker* is turned on
for Melodify (hold its card in LiveContainer › Settings › Fixes). The legacy variant forces copies
and cannot pick folders.

**Over USB**, which is faster for a whole library:

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

## Android

The same app, built for Android from the same JS. What differs, and why:

**The music is where it already is.** On Android Melodify reads the phone's shared storage
(`/storage/emulated/0`) directly, as Musicolet does, so there is no import step. On first launch the
welcome pages (and Settings › Scan music) ask for **All files access**, which lets it scan every
folder, save `.lrc` lyrics beside songs, edit tags, delete files and keep backups in
`Melodify/Backups`. *Music only* (the media permission) is the fallback: songs play, but lyrics
files, tag editing, deleting and backups need All files access. The scan skips `Android/`, hidden
folders, and folders with a `.nomedia` file (Settings can switch that off). Library paths are
relative to the storage root, so they are exactly Musicolet's: a Musicolet backup restores with
every song matched by path, and a Melodify backup restores in Musicolet.

To copy music on: connect the phone over USB, choose *File transfer*, copy into `Music/` (or
anywhere), then Scan now. From Linux: `adb push ~/Music /sdcard/`.

**Android-only features.**

- Headset and Bluetooth button clicks: one, two and three presses each mapped to play/pause, next,
  previous, skip forward or back, or nothing (Settings › Playback), Musicolet's defaults to start.
  iOS decides what those clicks mean itself.
- The media notification with a favorite heart beside previous, play and next; it also drives the
  lock screen, Bluetooth, cars and watches.
- A home screen widget (4×1): cover, title, artist, previous, play/pause, next.
- *Open with Melodify* from a file manager, the downloads list or a chat app: the song plays next,
  straight away, without touching the rest of the queue; one no scan has seen yet is scanned in.
- Skip silence (Settings › Playback).
- Ogg Vorbis and Opus playback, which iOS cannot decode.
- The accent can follow the wallpaper (Material You, Android 12 and later).
- Launcher shortcuts (hold the icon): Resume, Shuffle all, Favorites, Search, as the iOS quick actions.
- The system share sheet for songs, backups and playlists, and the system's media index kept in step
  when files are deleted or retagged.

**iOS-only features.** The Files-app import (Android needs none), the LiveContainer notes, and USB
through ifuse.

**Building.** `.github/workflows/android-build.yml` builds a release APK on a Linux runner for every
push that changes the app, JS included (the APK carries its JS), for arm64 phones; run it by hand
(Actions › Android build › Run workflow) for every ABI, 32-bit phones and the emulator too. It is signed
with the key in the repository secrets, so each APK installs over the last one and keeps the
library; the key itself is kept outside the repository (`~/.android/melodify-release.jks`, with its
passwords beside it). Locally, with the Android SDK and NDK:

```sh
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64   # emulator, dev client
cd android && ./gradlew assembleRelease                                     # standalone APK
adb install -r app/build/outputs/apk/release/app-release.apk
```

A debug build is a dev client like the iOS one: `npm start`, then open it and it loads from Metro
(`adb reverse tcp:8081 tcp:8081` over USB). A release build has the JS inside and needs nothing else.

## Supported formats

On iOS decoding goes through Core Audio (`AVAudioFile` inside `melodify-audio`), so the supported
formats are the ones iOS decodes natively:

- MP3, AAC / M4A, ALAC, FLAC, WAV, AIFF

Ogg Vorbis and Opus are **not** supported on iOS. They would need a custom decoder in native code.
Check your library before syncing.

On Android ExoPlayer uses the phone's own decoders: MP3, AAC / M4A, FLAC, WAV, **Ogg Vorbis, Opus**,
Matroska audio and AMR. AIFF and CAF are not read there.

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
npm test                          # unit tests (Node's built-in runner, no extra deps; database
                                  # code runs against the real schema in node:sqlite)
node --import ./scripts/test-hooks.mjs scripts/bench-library.ts 10000
                                  # times the library queries on a synthetic 10k-song library
npx expo export --platform ios    # full Metro bundle to Hermes bytecode
npx expo export --platform android  # the same for Android
```

## Project layout

```
src/
  app/          expo-router routes only
    _layout      root Stack: the (tabs) group, plus /player as a modal over the tab bar
    (tabs)/      NativeTabs: Home, Queue, Folders, Library, Search, and the mini player
                 in the tab bar's bottom accessory. Home, Library and Search share one stack
                 layout, (home,library,search), which also holds settings/ (the gear on Home)
  screens/      screen bodies rendered by the routes
  components/   shared UI: track-list (tap, long-press menu, multi-select), reorderable-list
                (drag and swipe), track-actions (queue and playlist menus), menus (action
                sheets, prompts), toast (with undo), chips, list-toolbar, rows, mini-player
  backup/       Musicolet-format backups, restore matching (moved folders), M3U, the file side
  db/           schema + migrations, typed queries, playlists, settings, a serial write chain
  scan/         Documents/ walker, filename-based tag guesses, native tag reading (+ tests)
  tags/         tag editor fields and writes through TagLib, lyrics saving
  lyrics/       .lrc parsing, loading from sidecar files and tags, the LRCLIB lookup (+ tests)
  player/       engine interface, native + fake engines, queue store (several queues,
                mirrored to SQLite), pure queue operations (+ tests)
  hooks/        useLibraryQuery (refreshes when the library changes), selection, stored choices
  utils/        events, formatting
  theme.ts      color / spacing / type tokens (iOS semantic colors), themes and accents,
                useTheme / makeStyles
  prefs.ts      user preferences, one JSON object in the settings table
modules/
  melodify-audio/  one Expo Module, two implementations of the same functions and events:
    ios/           Swift: AVAudioEngine playback (two decks for gapless and crossfade, EQ, speed and
                   pitch), AVAsset tag reading, TagLib tag writing (Vendor/, TagWriter/)
    android/       Kotlin: Media3 ExoPlayer playback (two decks, EQ as an audio processor), the media
                   session and notification, the widget, launcher shortcuts, shared-storage access;
                   TagLib from ios/Vendor built with the NDK (CMakeLists.txt) for reading and writing
.github/workflows/ios-build.yml       unsigned IPA build
.github/workflows/android-build.yml   signed release APK
assets/         icons, splash
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md), and [TESTING.md](./TESTING.md) for the phone checklist of
everything written but not yet tried on the device. Phase 0 (foundation) is done as of 2026-09-20: the app is on the
phone, scanning and browsing a real library. In Phase 1, playback, the lock screen and the player
screens work on the device as of 2026-09-23; tag reading, interruption handling and restoring the
queue on launch are written and waiting for a device test. Phase 2 (multiple queues, queue editing
with undo, playlists, grouped library views, multi-select, search), Phase 3 (bookmarks, sleep timer,
lyrics, play counts, favorites, song details, hiding and deleting) and Phase 4 (themes, accents,
player layouts, custom tabs, density, rotation) and Phase 5 (backup in Musicolet's format both ways,
restore onto a moved library, M3U import and export, automatic backups), Phase 6 (gapless, crossfade,
equalizer, speed and pitch, ReplayGain) and Phase 7 (tag, artwork and lyrics editing) are written and
waiting for the same.

## License

MIT
