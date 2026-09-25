# Musicolet feature list

Everything Musicolet (Android) does, grouped by area, with a note on how each feature maps to iOS and
this project. Compiled from Musicolet's feature pages and app; a few entries marked "verify" are ones
to double-check against the current Musicolet release.

**Legend**

| Column | Meaning |
| --- | --- |
| iOS | `JS` easy in React Native, `RN+` needs react-native-track-player or a small native hook, `Native` needs custom Swift (AVAudioEngine etc.), `N/A` Android-only concept, `iOS≈` iOS has a different equivalent |
| Status | `todo`, `wip`, `done`, `skip` |

---

## 1. Queues and playback control

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Multiple queues | Create several independent playing queues, switch between them, each remembers its position | JS | wip |
| Queue tabs | Queues shown as tabs on the player screen; swipe to switch | JS | wip |
| Add to queue / Play next | From any list: add to end, insert after current, add to a specific queue | JS | wip |
| Queue editing | Drag to reorder, swipe to remove, clear queue, remove duplicates | JS | wip |
| Undo queue changes | Undo last add/remove/clear | JS | wip |
| Save queue as playlist | Persist any queue as a named playlist | JS | wip |
| Shuffle | Shuffle queue, shuffle all, shuffle by album | JS | wip |
| Repeat modes | Off, repeat all, repeat one | JS | wip |
| Resume on launch | Restore last queue, track and position after app restart | JS | wip |
| Gapless playback | No silence between consecutive tracks | Native | wip |
| Crossfade | Fade between tracks with adjustable duration (verify) | Native | wip |
| Playback speed | 0.5x to 2x or wider, per session | RN+ | wip |
| Pitch control | Adjust pitch independently or linked with speed (verify) | Native | wip |
| Skip silence | Skip silent segments in tracks (verify) | Native | skip |
| Seek by fixed amount | Configurable skip forward/back (e.g. 10s / 30s) | RN+ | wip |
| Fast seek gestures | Long-press or swipe on player to seek | JS | wip |
| Swipe artwork for next / previous | Swipe the player's artwork sideways to change song | JS | wip |
| A-B repeat | Loop one stretch of a song between two marked points (A, then B, then off) | JS | wip |
| Volume in app | Volume slider inside the player | RN+ | wip |
| ReplayGain / volume leveling | Apply track or album gain tags (verify) | Native | wip |

## 2. Bookmarks and position memory

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Bookmarks | Save named positions inside long tracks (podcasts, audiobooks, mixes) | JS | wip |
| Bookmark list | Browse all bookmarks, jump to any | JS | wip |
| Resume position per track | Remember where you left off in long tracks | JS | wip |

## 3. Library browsing

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Folder browsing | Navigate storage as a folder tree, play a folder, add folder to queue | JS | wip |
| Songs / Albums / Artists / Album artists / Genres / Composers / Years | Standard grouped views | JS | wip |
| Playlists | Create, rename, reorder, delete; add from anywhere | JS | wip |
| Auto playlists | Recently added, most played, recently played, favorites | JS | wip |
| Favorites | Heart a track, favorites list | JS | wip |
| Sorting | Per-list sort by title, artist, album, date added, duration, track number, play count | JS | wip |
| Grid / list toggle | Switch layout per tab: albums, artists (round), album artists, genres, composers and years each remember list or a three-column grid | JS | wip |
| Custom tabs | Choose which tabs show and in what order | JS | wip |
| Multi-select | Long-press to select many items, then batch action | JS | wip |
| Find in list | Filter the open library list as you type (Musicolet's "Search in this list"): every word must match the title, artist, album or name, accents ignored | JS | wip |
| Search | Search tracks, albums, artists, folders, playlists, in a Spotify-style Search tab: a browse page (Discover albums not played for a month, Browse all tiles for the auto playlists and every genre), then one ranked list with filter pills; every word must match, accents ignored. Recent searches are the results opened, earlier queries complete what is typed | JS | wip |
| Track details | Full tag dump, file path, bitrate, sample rate, size | JS | wip |
| Album art from folder | Use `cover.jpg` / `folder.jpg` when embedded art is missing | JS | wip |
| Disc / track numbers | Show and sort by disc and track number | JS | wip |
| Hide short tracks | Exclude tracks under N seconds (ringtones, notifications) | JS | wip |
| Exclude folders | Blacklist folders from the library | JS | wip |
| Hidden tracks | Hide individual tracks without deleting | JS | wip |
| Rescan / custom scan folders | Choose scan roots, rescan on demand, don't depend on system media DB | JS | wip |
| Delete file from device | Remove the file, not just the DB entry | JS | wip |
| Share track | Share the audio file with another app | JS | wip |
| Set as ringtone | Android-only | N/A | skip |

## 4. Lyrics

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Embedded lyrics | Show USLT / lyrics tags from the file | Native | wip |
| .lrc synced lyrics | Load sidecar `.lrc`, highlight current line, tap line to seek | JS | wip |
| Lyrics editor | Edit / paste lyrics and save to tag or `.lrc` | Native | wip |
| Lyrics on player | Swipe up or toggle to show lyrics over album art | JS | wip |
| Split-screen lyrics | Lyrics beside controls in landscape or split view (landscape: lyrics on the left, a small artwork by the title) | JS | wip |
| Online lyrics search | For a song with no lyrics, Search online (lyrics view and the player's lyrics card) looks it up on LRCLIB and saves synced or plain lyrics as a `.lrc` beside it, with Undo. After a miss, Search for… takes typed words and lists matches to choose from. A song that has lyrics gets Search LRCLIB under them, and every song's menu has Lyrics from LRCLIB…: the matches to choose a replacement from, with Undo; embedded lyrics stay in the tags. Only when tapped, never on its own. Musicolet never goes online; this is Melodify's one exception | JS | wip |

## 5. Tag editor

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Edit tags | Title, artist, album, album artist, genre, year, track/disc number, composer, comment | Native | wip |
| Batch tag edit | Edit album-wide fields across many tracks | Native | wip |
| Album art edit | Set art from an image, remove art | Native | wip |
| Format coverage | MP3, M4A, FLAC, WAV and AIFF (the formats iOS plays); TagLib also handles OGG and Opus, which the app does not play | Native | wip |
| Auto-fix tags | Trim, capitalize, fill from filename pattern (verify) | Native | skip |

## 6. Audio effects

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Equalizer | Multi-band EQ with presets and custom presets | Native | wip |
| Bass boost | Dedicated bass boost slider | Native | wip |
| Virtualizer / surround | Stereo widening | Native | skip |
| Reverb | Reverb presets (verify) | Native | skip |
| Per-song EQ presets | Assign preset to track or album (verify) | Native | skip |

## 7. Sleep timer and automation

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Sleep timer | Stop after N minutes | JS | wip |
| Stop after current track | Finish the playing song, then stop | JS | wip |
| Stop after N tracks | Count-based timer | JS | wip |
| Fade out before stop | Lower volume over the last seconds | RN+ | wip |
| Shake to snooze / extend | Motion gesture to extend timer (verify) | JS | skip |

## 8. Controls outside the app

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Notification controls | Play, pause, next, previous, favorite from notification | iOS≈ Control Center / lock screen | wip |
| Lock screen controls and art | Now Playing info with art, seek | RN+ | done |
| Headset button actions | Single, double, triple click and long press mapped to actions. iOS turns the clicks into play/pause, next and previous itself and keeps long press for Siri; a headset's next cannot be told from the lock screen's, so there is nothing to remap | iOS≈ | skip |
| Bluetooth controls | AVRCP play/pause/next/prev, track info on car / headphones | RN+ | wip |
| Pause on unplug / resume on plug | Headphone jack and Bluetooth disconnect handling | RN+ | wip |
| Auto play on headphone connect | Start playing when headphones connect (verify): resumes only what an unplug paused, off by default | Native | wip |
| Home screen widgets | 4x1, 4x2 player widgets | iOS≈ WidgetKit (native) | skip |
| Android Auto | Car head unit UI | iOS≈ CarPlay (needs entitlement, not on free account) | skip |
| Lock screen shortcuts | Shortcuts / quick actions | iOS≈ Home screen quick actions (not under LiveContainer) | wip |

## 9. Appearance

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Themes | Light, dark, black (AMOLED) | JS | wip |
| Accent colors | Pick accent color | JS | wip |
| Follow system theme | Automatic light / dark | JS | wip |
| Player layouts | Multiple now-playing layouts (standard, edge-to-edge, compact), all in a Spotify-style player with scrolling cards for lyrics, the queue, bookmarks and song details | JS | wip |
| Quick access shortcuts | Choose which shortcut buttons show under the player's controls, and their order (lyrics, sleep timer and queue to start with); the rest go at the top of the player's ••• menu | JS | wip |
| Album art blur background | Blurred art behind the player | JS | wip |
| Font size / density | Compact vs comfortable lists | JS | wip |
| Keep screen on | Prevent sleep while player is open | JS | wip |
| Landscape support | Rotates on tablets / landscape | JS | wip |

## 10. Statistics and history

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Play counts | Per track, album, artist | JS | wip |
| Last played timestamp | Per track | JS | wip |
| Recently played list | Ordered history | JS | wip |
| Skip counts | Tracks skipped early (verify): next pressed before the song counted as a play | JS | wip |

## 11. Data management

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Backup | Export playlists, queues, favorites, play counts, bookmarks, settings to a file | JS | wip |
| Restore | Import that file, matching tracks by path or tags | JS | wip |
| Playlist import / export | M3U / M3U8 in and out | JS | wip |
| Auto backup | Periodic backup to a folder (verify) | JS | wip |
| Path remapping on restore | Handle moved music folders when restoring | JS | wip |

## 12. Design principles (kept)

| Principle | Notes |
| --- | --- |
| Offline only | No analytics, no accounts, nothing sent in the background. The one online lookup is lyrics from LRCLIB, and only when the user taps Search online |
| No ads, no tracking | – |
| Works without a media server or cloud | Files live on the phone |
| Fast on big libraries | Musicolet handles tens of thousands of tracks; target 10k+ here |
| Low battery use | No busy polling; rely on player events |

---

## Not applicable on iOS

- Set as ringtone
- Storage access framework / SD card handling
- Android Auto (CarPlay needs a paid entitlement)
- Home screen widgets in the Musicolet sense (iOS widgets can't control playback the same way)

## Musicolet features that need native Swift here

Equalizer, bass boost, gapless, crossfade, pitch, ReplayGain, tag editor, lyrics editor.
These all require replacing AVPlayer with an AVAudioEngine pipeline or adding a tag-writing library.
They are deliberately last on the roadmap.
