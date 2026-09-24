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
`.ipa`, then signed and installed on the phone (currently as a LiveContainer guest; SideStore also
works). JS changes are hot-reloaded into that dev client over WiFi.
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
- [x] Push to GitHub, run the workflow (first green build 2026-09-16, xcode-27 runner, 4.5 min)
- [x] First device install, 2026-09-20. Installed as a LiveContainer guest rather than via
      SideStore: LiveContainer is signed with the free account and already declares the `audio`
      background mode and `UIFileSharingEnabled`, so guests get a real, ifuse-mountable container.
- [x] rsync test library, verify scan and folder browsing on the phone (2026-09-20, 78-file subset)

### Phase 1. Play music

The three open items below are written (module 0.4.0) and pass typecheck, tests and the bundle
export, but stay unchecked until a CI build of them has been exercised on the phone.

- [x] `melodify-audio` Swift module v1: single player node, play / pause / seek / next, session config
      (2026-09-23: plays on device under LiveContainer, iOS 26.6.1; pause, seek and next all exercised)
- [x] Now Playing info + remote commands (lock screen, Control Center, headset, Bluetooth)
      (2026-09-23: lock screen shows the track and its buttons drive playback. Bluetooth and headset
      use the same MPRemoteCommandCenter handlers but have not been tried on real hardware)
- [ ] Interruptions, pause on unplug
      (written: pauses on unplug and on interruption, resumes after one only if iOS allows it and
      it was playing; restarts the engine when a new output changes the hardware format.
      To try: pull headphones mid-song, take a call, connect and disconnect Bluetooth)
- [x] Player screen: art, title, seek bar, controls (2026-09-23)
- [x] Mini player above tab bar (2026-09-23, in the iOS 26 tab bar bottom accessory)
- [ ] Tag reading via AVAsset in the module, art extraction and cache
      (written: a tagging pass after indexing, 50 files per bridge call; embedded art is cached
      in `Documents/.artcache/` by content hash and beats folder art. To try: rescan the real
      library and check FLAC files in particular, whose Vorbis comments are matched by key)
- [ ] Resume last queue and position on launch
      (written: the queue is mirrored to `queue_tracks`, position saved on pause, on track change,
      every 5 s while playing and on leaving the app; restored paused before the first screen)

### Phase 2. Musicolet core

All of Phase 2 is written and passes typecheck, tests and the bundle export; none of it has been
on the phone yet, so every item stays unchecked. It is JS only: no module change, no new native
dependency, so the Phase 1 IPA (module 0.4.0) runs it as it is.

- [ ] Multiple queues with tabs, per-queue position
      (written: up to 20 queues as tabs on the Queue screen; each keeps its list, current track,
      position and repeat mode. Viewing a tab does not switch playback; tapping a song in it does.
      Tabs are tapped, not swiped, and live on the Queue tab rather than the player)
- [ ] Add to queue / play next / add to specific queue from every list
      (written: long press on any song, album, artist, genre, year, folder, playlist or search
      result, and the player's ⋯ button)
- [ ] Drag reorder, swipe remove, clear, undo
      (written: PanResponder drag handles with edge autoscroll, swipe either way to remove, and a
      30-step undo stack offered as a toast after each edit. To try: long drags that autoscroll,
      and that a drag never scrolls the list underneath)
- [ ] Save queue as playlist; playlists CRUD
      (written: create, rename, delete, add, remove, reorder; duplicates allowed)
- [ ] Shuffle (queue, all, by album), repeat modes
      (written: shuffling reorders the queue with the current song on top, as Musicolet does;
      repeat off / queue / song per queue)
- [ ] Folder browsing with play-folder and add-folder
      (written: play and shuffle take in every subfolder; long press a folder for the queue items)
- [ ] Albums / Artists / Album artists / Genres / Composers / Years views, sort options
      (written: eight library views, sort remembered per view)
- [ ] Multi-select and batch actions
      (written: Select in the header or from a long press; batch play, queue, playlist, remove)
- [ ] Search tab with recent searches
      (written: songs, albums, artists, folders and playlists; twelve recent searches)

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
