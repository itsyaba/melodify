# Cadence

An offline-first music player for iPhone, inspired by [Musicolet](https://krosbits.in/musicolet/) on Android.
Built with Expo / React Native, sideloaded with SideStore. No accounts, no streaming, no ads: it plays the files you put on the phone.

See [FEATURES.md](./FEATURES.md) for the full Musicolet feature list and where each one stands on iOS.

## Why this exists

Musicolet has no iOS version and none of the App Store alternatives offer its combination of
multiple queues, folder browsing, bookmarks and an offline-only design. This project rebuilds
that feature set for iPhone, one feature at a time, starting with the ones that are easy in JS.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Expo SDK 57, React Native 0.86, TypeScript | New Architecture enabled |
| Navigation | expo-router | file-based routes |
| Playback | react-native-track-player | background audio, lock screen, Control Center, headphone controls |
| Library index | expo-sqlite (or op-sqlite) | tracks, albums, artists, folders, play counts, bookmarks, queues |
| File access | expo-file-system | reads the app's own `Documents/` folder |
| Tag reading | native module (AVFoundation metadata) or music-metadata in JS | decided during the scan work |

Expo Go is not used. Track player is a native module, so development happens in a custom dev client.

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

Until the dev client exists, `npm start` is only useful for the web target and for type checking:

```sh
npm run typecheck
```

## Project layout (planned)

```
app/            expo-router routes: library, folders, queue, player, settings
src/
  db/           SQLite schema, migrations, queries
  player/       track-player setup, queue manager, remote command handlers
  scan/         Documents/ walker, tag extraction, art cache
  ui/           shared components, theme tokens
assets/         icons, splash
```

## Roadmap

Ordered by value divided by effort. Details and status in [FEATURES.md](./FEATURES.md).

1. Scan `Documents/`, index into SQLite, list tracks / albums / artists / folders
2. Playback with lock screen and Control Center controls
3. Multiple queues, play next, add to queue, save queue as playlist
4. Folder browsing
5. Bookmarks, resume position, sleep timer
6. Embedded and `.lrc` lyrics
7. Play counts, recently added, most played, search
8. Backup and restore
9. Playback speed
10. Later, native work: equalizer, gapless, crossfade, tag editor

## License

MIT
