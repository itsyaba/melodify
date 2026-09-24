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
| Gapless playback | No silence between consecutive tracks | Native | todo |
| Crossfade | Fade between tracks with adjustable duration (verify) | Native | todo |
| Playback speed | 0.5x to 2x or wider, per session | RN+ | todo |
| Pitch control | Adjust pitch independently or linked with speed (verify) | Native | todo |
| Skip silence | Skip silent segments in tracks (verify) | Native | skip |
| Seek by fixed amount | Configurable skip forward/back (e.g. 10s / 30s) | RN+ | wip |
| Fast seek gestures | Long-press or swipe on player to seek | JS | wip |
| Volume in app | Volume slider inside the player | RN+ | todo |
| ReplayGain / volume leveling | Apply track or album gain tags (verify) | Native | skip |

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
| Grid / list toggle | Switch layout per tab | JS | wip |
| Custom tabs | Choose which tabs show and in what order | JS | wip |
| Multi-select | Long-press to select many items, then batch action | JS | wip |
| Search | Search tracks, albums, artists, folders, playlists; recent searches | JS | wip |
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
| Lyrics editor | Edit / paste lyrics and save to tag or `.lrc` | Native | todo |
| Lyrics on player | Swipe up or toggle to show lyrics over album art | JS | wip |
| Split-screen lyrics | Lyrics beside controls in landscape or split view | JS | todo |
| No online lyrics | Musicolet never fetches lyrics from the internet (kept as a design rule) | – | – |

## 5. Tag editor

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Edit tags | Title, artist, album, album artist, genre, year, track/disc number, composer, comment | Native | todo |
| Batch tag edit | Edit album-wide fields across many tracks | Native | todo |
| Album art edit | Set art from an image, remove art | Native | todo |
| Format coverage | MP3, M4A, FLAC, OGG, Opus, WAV tags | Native | todo |
| Auto-fix tags | Trim, capitalize, fill from filename pattern (verify) | Native | skip |

## 6. Audio effects

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Equalizer | Multi-band EQ with presets and custom presets | Native | todo |
| Bass boost | Dedicated bass boost slider | Native | todo |
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
| Headset button actions | Single, double, triple click and long press mapped to actions | RN+ (limited on iOS) | todo |
| Bluetooth controls | AVRCP play/pause/next/prev, track info on car / headphones | RN+ | wip |
| Pause on unplug / resume on plug | Headphone jack and Bluetooth disconnect handling | RN+ | wip |
| Auto play on headphone connect | Start playing when headphones connect (verify) | Native | skip |
| Home screen widgets | 4x1, 4x2 player widgets | iOS≈ WidgetKit (native) | skip |
| Android Auto | Car head unit UI | iOS≈ CarPlay (needs entitlement, not on free account) | skip |
| Lock screen shortcuts | Shortcuts / quick actions | iOS≈ Home screen quick actions | todo |

## 9. Appearance

| Feature | Description | iOS | Status |
| --- | --- | --- | --- |
| Themes | Light, dark, black (AMOLED) | JS | wip |
| Accent colors | Pick accent color | JS | wip |
| Follow system theme | Automatic light / dark | JS | wip |
| Player layouts | Multiple now-playing layouts | JS | wip |
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
| Skip counts | Tracks skipped early (verify) | JS | skip |

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
| Offline only | No network permission, no analytics, no online lookups |
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
