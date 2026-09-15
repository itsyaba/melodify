# Roadmap

Goal: every feature in [FEATURES.md](./FEATURES.md). Timeline is open (3 to 12 months). Phases are ordered so
that each one ships something usable on the phone, and so that expensive native work starts early enough
not to block the end.

## Architecture decision: own the audio engine

Because equalizer, gapless, crossfade, pitch and ReplayGain are all in scope, playback is **not** built on
react-native-track-player. Instead there is a Swift Expo Module, `modules/melodify-audio`, wrapping:

- `AVAudioEngine` with two `AVAudioPlayerNode`s (A/B for gapless and crossfade), `AVAudioUnitEQ`,
  `AVAudioUnitTimePitch`
- `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` for lock screen, Control Center, headset and Bluetooth
- `AVAudioSession` for interruptions, route changes (unplug / Bluetooth disconnect)
- `AVAudioFile` for decoding. Formats are whatever Core Audio decodes: MP3, AAC, ALAC, FLAC, WAV, AIFF.
  Ogg Vorbis / Opus would need a bundled decoder and are out of scope until everything else ships.

The JS side sees a small interface (`src/player/engine.ts`) so the whole UI, queue and DB layer can be
built and tested before the native module exists. A fake in-memory engine implements the same interface
for the web target during development.

Tag **reading** starts in Swift via `AVAsset` metadata (fast, covers ID3 / iTunes / Vorbis comments in
FLAC). Tag **writing** later uses TagLib compiled into the module.

## Dev loop reminder

No Mac. Native code is compiled in GitHub Actions (`.github/workflows/ios-build.yml`) into an unsigned
`.ipa`, signed and installed with SideStore. JS changes are hot-reloaded into that dev client over WiFi.
Every phase that touches `modules/` or `app.json` plugins needs a new CI build.

## Phases

### Phase 0. Foundation (this week)
- [x] Expo SDK 57 scaffold, TypeScript, git
- [x] README, FEATURES, ROADMAP
- [x] expo-router with NativeTabs: Library, Folders, Queue, Search, Settings
- [x] SQLite schema and migrations (`src/db`)
- [x] `Documents/` scanner: walk folders, insert tracks by path, incremental rescan (`src/scan`)
- [x] Theme tokens, list components
- [x] CI workflow producing an unsigned dev-client IPA
- [ ] Push to GitHub, run the workflow, first SideStore install
- [ ] rsync test library, verify scan and folder browsing on the phone

### Phase 1. Play music
- [ ] `melodify-audio` Swift module v1: single player node, play / pause / seek / next, session config
- [ ] Now Playing info + remote commands (lock screen, Control Center, headset, Bluetooth)
- [ ] Interruptions, pause on unplug
- [ ] Player screen: art, title, seek bar, controls
- [ ] Mini player above tab bar
- [ ] Tag reading via AVAsset in the module, art extraction and cache
- [ ] Resume last queue and position on launch

### Phase 2. Musicolet core
- [ ] Multiple queues with tabs, per-queue position
- [ ] Add to queue / play next / add to specific queue from every list
- [ ] Drag reorder, swipe remove, clear, undo
- [ ] Save queue as playlist; playlists CRUD
- [ ] Shuffle (queue, all, by album), repeat modes
- [ ] Folder browsing with play-folder and add-folder
- [ ] Albums / Artists / Album artists / Genres / Composers / Years views, sort options
- [ ] Multi-select and batch actions
- [ ] Search tab with recent searches

### Phase 3. Companion features
- [ ] Bookmarks and per-track resume position
- [ ] Sleep timer: minutes, after track, after N tracks, fade out
- [ ] Embedded lyrics and `.lrc` synced lyrics with tap-to-seek
- [ ] Play counts, last played, recently added / most played / recently played auto playlists
- [ ] Favorites
- [ ] Track details screen
- [ ] Hide short tracks, exclude folders, hidden tracks
- [ ] Delete file, share file
- [ ] Skip-by-N-seconds, seek gestures

### Phase 4. Appearance
- [ ] Light / dark / black themes, accent colors, follow system
- [ ] Multiple player layouts, blurred art background
- [ ] Custom tabs and tab order, grid / list toggle, density
- [ ] Keep screen on, landscape

### Phase 5. Data
- [ ] Backup and restore to a JSON file in `Documents/`
- [ ] Path remapping on restore
- [ ] M3U import / export
- [ ] Auto backup

### Phase 6. Audio engine v2
- [ ] Gapless via A/B player nodes
- [ ] Crossfade with adjustable duration
- [ ] Equalizer (10-band), presets, custom presets, bass boost
- [ ] Playback speed and pitch
- [ ] ReplayGain from tags
- [ ] Headset click mapping (single / double / triple / long)

### Phase 7. Tag editing
- [ ] TagLib in the Swift module
- [ ] Tag editor screen, batch album edit, album art set / remove
- [ ] Lyrics editor writing to tag or `.lrc`

### Phase 8. Polish and stretch
- [ ] Home screen quick actions
- [ ] Performance pass at 10k+ tracks
- [ ] Optional: Ogg / Opus decoder, WidgetKit widget

## Definition of done per phase

1. Every feature row for the phase is `done` in FEATURES.md.
2. Type check and unit tests pass.
3. A CI build was installed on the phone and the features were exercised by hand with the real library.
