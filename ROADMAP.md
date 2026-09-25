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

The build to test with is the newest green CI run: module 0.6.0 as of 2026-09-24. It carries
everything Phases 1 to 4 need (the tag reader, `readLyrics`, keep-awake and screen orientation), so the
notes below that name 0.4.0 or 0.5.0 give the minimum, not the build to install.

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
      in `Documents/.artcache/` by content hash and beats folder art. Rows left unread, or read
      without a duration, are read again at launch and on every scan. 2026-09-24: the device
      library showed no art or lengths at all; cause not yet confirmed on the phone.
      To try: relaunch, then check the Scan screen and FLAC files in particular, whose Vorbis
      comments are matched by key)
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
      (written: songs, albums, artists, folders and playlists; twelve recent searches. Redone
      2026-09-25 in Spotify's layout: its own header, the library read into memory when a search
      starts, matches ranked in JS word by word. Tapping the tab used to open the Library page: the
      shared (library,search) layout listed `index` first, and a stack starts on its first listed
      screen whatever `unstable_settings` says, so the Search tab now lists `search` first.
      Later that day the browse page became the Home tab and Search was redone in Musicolet's
      style: matches grouped by kind, a few each until Show all)

### Phase 3. Companion features

Written, and passing typecheck, tests and the bundle export; not yet on the phone. Embedded lyrics
need module 0.5.0 (one new function, `readLyrics`); everything else is JS and runs on the 0.4.0
build, where lyrics fall back to `.lrc` files only.

- [ ] Bookmarks and per-track resume position
      (written: bookmark button in the player, hold it for this song's bookmarks; a Bookmarks list
      under Playlists. Songs of 10 min or more resume where they were left, adjustable in Settings)
- [ ] Sleep timer: minutes, after track, after N tracks, fade out
      (written: moon button in the player; the minutes timer fades over its last 30 s. The songs
      timer counts natural track ends and leaves the next song cued, paused)
- [ ] Embedded lyrics and `.lrc` synced lyrics with tap-to-seek
      (written: lyrics button in the player; `.lrc` first, then embedded USLT / iTunes / Vorbis
      LYRICS through AVAsset. The line being sung is highlighted and followed; tap one to seek)
- [ ] Play counts, last played, recently added / most played / recently played auto playlists
      (written: a play counts at half the song or four minutes in; auto playlists under Playlists)
- [ ] Favorites
      (written: heart in the player, in every track menu and batch menu; the lock screen's like
      command is handled but not yet enabled in the module)
- [ ] Track details screen
- [ ] Hide short tracks, exclude folders, hidden tracks
      (written: excluding a folder hides its songs and skips it in scans, but keeps the rows, so
      including it again restores play counts and playlist places)
- [ ] Delete file, share file
- [ ] Skip-by-N-seconds, seek gestures
      (written: skip buttons with the interval from Settings, hold previous / next to seek, double-tap
      either side of the artwork to skip)

### Phase 4. Appearance

Written, and passing typecheck, tests and the bundle export; not yet on the phone. Keep screen on
and the rotation setting use expo-keep-awake and expo-screen-orientation, so they need a build that
includes them; on an older one they do nothing, since both are loaded behind a guard.

- [ ] Light / dark / black themes, accent colors, follow system
      (written: `Appearance.setColorScheme` forces light or dark, and the palette swaps the tokens
      that differ; every component reads colors through `useTheme` / `makeStyles`, so a change
      applies at once. Twelve accents, all iOS system colors)
- [ ] Multiple player layouts, blurred art background
      (written: standard, edge-to-edge artwork, and compact with the next six songs; a side-by-side
      layout in landscape. The blur is `Image` `blurRadius` under a scrim)
- [ ] Custom tabs and tab order, grid / list toggle, density
      (written: Settings › Tabs and library views; Home and Library cannot be switched off, and
      Settings is a gear on Home since 2026-09-25 (prefs version 2 moves an untouched old bar to
      Home, Queue, Folders, Library, Search).
      Albums, artists, genres, composers and years have a grid. Compact density shrinks rows)
- [ ] Keep screen on, landscape
      (written: keep awake only while the player is open; rotation free, portrait or landscape)

### Phase 5. Data

Written, and passing typecheck, tests (the restore runs against the real schema in Node's SQLite)
and the bundle export; not yet on the phone. JS only: it runs on the 0.6.0 build.

- [ ] Backup and restore to a JSON file in `Documents/`
      (written: Settings › Backup and restore. Files go to `Documents/Melodify/Backups/`; a restore
      replaces playlists, queues, bookmarks, excluded folders and settings, and writes play counts,
      favorites, hidden flags and resume points onto the songs it finds. The current state is saved
      as a before-restore backup first. Any JSON file can be restored through the Files picker)
- [ ] Path remapping on restore
      (written: songs are matched by path, then folder by folder by file name, then by title,
      artist and length. The restore screen shows the folder moves it found, and a folder whose
      songs were not found can be pointed at its new place by hand)
- [ ] M3U import / export
      (written: a playlist's menu exports it to `Documents/Melodify/Playlists/` with relative paths;
      Settings exports all, and imports any .m3u / .m3u8 in the music folder or picked in Files.
      Absolute and Windows paths from a computer are matched by their trailing folders)
- [ ] Auto backup
      (written: off, daily or weekly, default weekly, at launch and when the app goes to the
      background; the last five are kept)

### Phase 6. Audio engine v2

Written: module 0.7.0 plus the queue and UI around it. Passes typecheck, tests and the bundle
export, and the module compiles in CI; not yet on the phone. Everything here needs the 0.7.0 IPA;
on an older one the new calls are skipped and playback carries on as before, with gaps.

- [ ] Gapless via A/B player nodes
      (written: the queue arms the next song with `setNext`. Same format and same ReplayGain: scheduled
      on the same node in the last 3 s, sample-accurate. Otherwise the second node is started for
      the exact moment the first runs dry, on the render clock (at 1x; at other speeds it starts
      on the first's completion, slightly late). Pausing or seeking takes the arming back. Nothing
      is armed before the sleep timer's last song or a song that resumes mid-way.
      Settings › Playback › Gapless playback. To try: a live or classical album that runs on)
- [ ] Crossfade with adjustable duration
      (written: 1 to 12 s in Settings › Playback, equal-power ramps across the two nodes, on songs
      that end by themselves only; pressing next still cuts)
- [ ] Equalizer (10-band), presets, custom presets, bass boost
      (written: the player's sliders button opens Speed and Sound. 31 Hz to 16 kHz, ±12 dB,
      14 presets, your own saved by name (hold one to delete it), pre-amp, and a low-shelf bass boost)
- [ ] Playback speed and pitch
      (written: 0.5× to 2× and ±12 semitones, or pitch following the speed. Kept across launches.
      The lock screen's progress follows the speed)
- [ ] ReplayGain from tags
      (written: read from ID3 TXXX, iTunes free-form atoms and Vorbis comments; migration v2 makes
      the 0.7.0 reader read the library once more for them. Track or album mode, pre-amp, clipping
      kept off with the peak. Can raise a song by up to 6 dB)
- [x] ~~Headset click mapping~~ Not possible on iOS: the system turns single, double and triple
      clicks into play/pause, next and previous before the app sees them, keeps long press for
      Siri, and a headset's next arrives exactly like the lock screen's. The defaults already
      match Musicolet's.
- [ ] In-app volume slider (from the Musicolet list): Settings › Playback › Volume slider in the
      player. The sleep timer's fade now multiplies into it instead of resetting it.

### Phase 7. Tag editing

Written: module 0.8.0 and the screens. Passes typecheck, tests and the bundle export, and the
module (TagLib included) compiles in CI; not yet on the phone. The C side was also built and run on
Linux against real MP3, M4A, FLAC, WAV and AIFF files, checked with ffprobe.

- [ ] TagLib in the Swift module
      (written: TagLib 2.1.1 vendored under `modules/melodify-audio/ios/Vendor/`, behind a small C
      API in `TagWriter/` that Swift calls directly)
- [ ] Tag editor screen, batch album edit, album art set / remove
      (written: "Edit tags…" in every song's menu and the multi-select menu, "Edit album tags…" in
      an album's menu. Several songs show the fields they share; the ones they disagree on are left
      alone unless typed over. Artwork from any image in Files, converted to JPEG when it is not
      JPEG or PNG; removing it falls back to the folder's cover. The playing song is stopped and
      picked up again where it was while its file is written. Song details list every tag in the file)
- [ ] Lyrics editor writing to tag or `.lrc`
      (written: "Edit lyrics…" in a song's menu. Lyrics from a `.lrc` go back to it; others save to
      the tags or a new `.lrc`. While the song plays, "Stamp line" puts the current time on the
      cursor's line, for turning plain lyrics into synced ones)

### Phase 8. Polish and stretch
- [ ] Home screen quick actions
      (written: module 0.9.0. Hold the icon for Resume (naming the song), Shuffle all, Favorites
      and Search. Only on a real install (SideStore): under LiveContainer the icon is
      LiveContainer's, so the app leaves its quick actions alone)
- [x] Performance pass at 10k+ tracks (2026-09-25)
      `scripts/bench-library.ts` times the real queries on a synthetic library in Node's SQLite.
      At 10k songs every grouped view, folder, search and auto playlist answers in under 20 ms;
      whole-library lists take 80 to 150 ms, nearly all of it turning rows into JS objects rather
      than sorting (indexes would not help). Restoring a 10k queue at launch went from 217 to
      144 ms by no longer copying every row. Lists only re-render on a track change, never on the
      position tick. Scales linearly: 20k songs is about twice all of that.
- [ ] Optional: Ogg / Opus decoder, WidgetKit widget
      (not started. A widget is an app extension, which a free account under LiveContainer cannot
      install, and Ogg needs a bundled decoder feeding the engine)
- [ ] Split-screen lyrics (from the Musicolet list): in landscape, lyrics take the artwork's side
      and a small artwork stays by the title
- [ ] Skip counts (from the Musicolet list): pressing next before a song counts as played adds a
      skip, shown in song details
- [ ] Resume on reconnect (from the Musicolet list): Settings › Playback, off by default. Only a
      song that an unplug paused carries on; plugging in never starts music paused on purpose
- [ ] Equalizer bands stay active at 0 dB when it is off (module 0.9.1), so the unit's gain,
      which carries the ReplayGain headroom, is always applied
- [ ] Now Playing redesign (2026-09-25): Spotify's layout, Musicolet's features. A header naming
      the playing queue (tap to switch queues), artwork that swipes to the next or previous song,
      a + / ✓ favorite button by the title (hold for playlists), a round play button, shuffle and
      repeat marked with a dot, and seconds-skip buttons in their place for long songs. Under it a
      row of quick-access shortcuts (Settings › Appearance › Player shortcuts), pills for whatever
      is changing playback, and cards: lyrics, next in queue, bookmarks, about this song. A–B
      repeat is new. The queue also opens as a sheet from the player. JS only, no new build needed.
      Later the same day the shortcut row went from six to three (lyrics, sleep timer, queue), as
      Spotify keeps it; the rest open the ••• menu, above the song's own items
- [ ] Library redesign (2026-09-25): Spotify's library, Musicolet's lists. Accent pills for the
      views; a sort row with find and a grid toggle; the count and length with shuffle and a round
      play button; bigger covers, artists drawn round; a ⋯ on every row (song rows everywhere, not
      only in the library); a three-column grid for albums, artists, genres, composers and years;
      Spotify-style shortcut cards for Favorites, the auto playlists, Bookmarks and New playlist.
      Find in list is new. JS only, no new build needed
- [ ] Online lyrics (2026-09-25): a song with no `.lrc` and no embedded lyrics gets Search online
      in the lyrics view and the lyrics card. It asks LRCLIB (free, no key) for an exact match on
      title, artist and length, then searches, then searches again without "(feat. …)" or
      "- Remastered" and with only the first artist. Synced lyrics of the same length win. What
      it finds is saved as a `.lrc` beside the song, so each song goes online once; a toast offers
      Undo. Never runs on its own. JS only, no new build needed. Second pass after "always none"
      on the phone: the title alone (held to the song's length) for artists the scanner guessed
      from a folder, "Artist - Title" titles as free text, first artist split on , & x too, one
      retry when LRCLIB is busy (its 503s are common), and after a miss the message names what
      was searched and Search for… lists matches for typed words. Then for songs that have
      lyrics too: Search LRCLIB under them and Lyrics from LRCLIB… in every song's menu list
      LRCLIB's matches (the song's length and synced first, then the nearest lengths); the pick
      replaces the `.lrc`, which Undo writes back, or sits beside embedded lyrics, which stay

## Definition of done per phase

1. Every feature row for the phase is `done` in FEATURES.md.
2. Type check and unit tests pass.
3. A CI build was installed on the phone and the features were exercised by hand with the real library.
