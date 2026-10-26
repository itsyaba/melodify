# Musicolet feature list

Everything Musicolet (Android) does, grouped by area, with a note on how each feature maps to iOS and
Android in this project. Compiled from Musicolet's feature pages and app; a few entries marked "verify" are ones
to double-check against the current Musicolet release.

**Legend**

| Column | Meaning |
| --- | --- |
| iOS | `JS` easy in React Native, `RN+` needs react-native-track-player or a small native hook, `Native` needs custom Swift (AVAudioEngine etc.), `N/A` Android-only concept, `iOS≈` iOS has a different equivalent |
| Android | `same`: the shared JS runs unchanged, or the Kotlin twin of the Swift code does the same (`modules/melodify-audio/android`); otherwise how Android does it |
| Status | `todo`, `wip`, `done`, `skip`, for the feature on whichever platforms it exists on. Android arrived 2026-09-26 and has only run on an emulator, so nothing there is `done` yet |

---

## 1. Queues and playback control

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Multiple queues | Create several independent playing queues, switch between them, each remembers its position | JS | same | wip |
| Queue tabs | Queues shown as tabs on the player screen; swipe to switch | JS | same | wip |
| Add to queue / Play next | From any list: add to end, insert after current, add to a specific queue | JS | same | wip |
| Queue editing | Drag to reorder, swipe to remove, clear queue, remove duplicates | JS | same | wip |
| Undo queue changes | Undo last add/remove/clear | JS | same | wip |
| Save queue as playlist | Persist any queue as a named playlist | JS | same | wip |
| Shuffle | Shuffle queue, shuffle all, shuffle by album | JS | same | wip |
| Repeat modes | Off, repeat all, repeat one | JS | same | wip |
| Resume on launch | Restore last queue, track and position after app restart | JS | same | wip |
| Gapless playback | No silence between consecutive tracks | Native | Kotlin: one ExoPlayer playlist | wip |
| Crossfade | Fade between tracks with adjustable duration (verify) | Native | Kotlin | wip |
| Playback speed | 0.5x to 2x or wider, per session | RN+ | Kotlin | wip |
| Pitch control | Adjust pitch independently or linked with speed (verify) | Native | Kotlin | wip |
| Skip silence | Skip silent segments in tracks (verify) | Native | Kotlin: ExoPlayer silence skipping | wip |
| Seek by fixed amount | Configurable skip forward/back (e.g. 10s / 30s) | RN+ | same | wip |
| Fast seek gestures | Long-press or swipe on player to seek | JS | same | wip |
| Swipe artwork for next / previous | Swipe the player's artwork sideways to change song | JS | same | wip |
| A-B repeat | Loop one stretch of a song between two marked points (A, then B, then off) | JS | same | wip |
| Volume in app | Volume slider inside the player | RN+ | Kotlin | wip |
| ReplayGain / volume leveling | Apply track or album gain tags (verify) | Native | Kotlin | wip |

## 2. Bookmarks and position memory

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Bookmarks | Save named positions inside long tracks (podcasts, audiobooks, mixes) | JS | same | wip |
| Bookmark list | Browse all bookmarks, jump to any | JS | same | wip |
| Resume position per track | Remember where you left off in long tracks | JS | same | wip |

## 3. Library browsing

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Folder browsing | Navigate storage as a folder tree, play a folder, add folder to queue | JS | same, over the phone's storage | wip |
| Songs / Albums / Artists / Album artists / Genres / Composers / Years | Standard grouped views | JS | same | wip |
| Artists tab | Artists as a tab of their own: a rail of the ten played most with their rank, then every artist as round covers in a grid or rows with album and song counts, sort and find, and the alphabet down the right edge to jump by letter | JS | same | wip |
| Playlists | Create, rename, reorder, delete; add from anywhere | JS | same | wip |
| Auto playlists | Recently added, most played, recently played, favorites. Recently added picks its span on four cards (the last 7, 30 or 60 days, or all time) with a count on each, and dates a song by its file, or the scan that found it if earlier. Most played does the same over the last week, month, six months and year (from each play's date, kept since v4) and all time (the running totals, selected by default and after a Musicolet restore). A Musicolet restore dates its week, month and year counts into those spans, with each song's plays in the span beside it | JS | same | wip |
| Favorites | Heart a track, favorites list | JS | same | wip |
| Sorting | Per-list sort by title, artist, album, date added, duration, track number, play count. Every song list has it: the Songs tab, albums, artists and the other groups, playlists, folders, favorites, recently added, most played, recently played and hidden songs. A list with an order of its own (a playlist's, an album's track numbers, a span's ranking) offers it first and opens in it; each kind of list remembers its choice | JS | same | wip |
| Grid / list toggle | Switch layout per tab: albums, artists (round), album artists, genres, composers and years each remember list or a three-column grid | JS | same | wip |
| Custom tabs | Choose which tabs show and in what order. Home, Queue, Artists, Library and Search by default; Folders is a tab to switch on there; Home and Library always stay, and Settings is a gear on Home | JS | same | wip |
| Multi-select | Long-press to select many items, then batch action | JS | same | wip |
| Find in list | Filter the open library list as you type (Musicolet's "Search in this list"): every word must match the title, artist, album or name, accents ignored | JS | same | wip |
| Search | Search tracks, albums, artists, folders, playlists in a Musicolet-style Search tab: results grouped by kind under accent headers with counts, a few each until Show all, play or shuffle every song found; every word must match, accents ignored; recent searches. Home's search pill opens it. Home itself, all scrolling under soft lights in the accent: settings, search and favorites as round buttons over the weekday and time of day and the library's size; filter pills (All, Rediscover for albums not played for a month, the biggest genres); under All, big cards to swipe (the song on now over its blurred cover with play, pause, heart and next; All songs in the accent, with its three most played albums' covers fanned out like a hand of cards; Favorites on its gradient; Most played, Recently added and Bookmarks in their own colors), each with play, shuffle and more, then Your playlists (the twelve changed last, drawn as Spotify draws its mixes: the cover with the name on a bright band in the playlist's own color, and the artists it holds most of underneath; See all opens Library's playlists), then the last five songs played as rows with a play button, Rediscover's albums and the artists with the most songs; under any other pill, its albums as rows with a play button | JS | same | wip |
| Track details | Full tag dump, file path, bitrate, sample rate, size | JS | same | wip |
| Album art from folder | Use `cover.jpg` / `folder.jpg` when embedded art is missing | JS | same | wip |
| Disc / track numbers | Show and sort by disc and track number | JS | same | wip |
| Hide short tracks | Exclude tracks under N seconds (ringtones, notifications) | JS | same | wip |
| Exclude folders | Blacklist folders from the library | JS | same | wip |
| Hidden tracks | Hide individual tracks without deleting | JS | same | wip |
| Rescan / custom scan folders | Choose scan roots, rescan on demand, don't depend on system media DB | JS | the whole storage; Android/, .nomedia and excluded folders skipped | wip |
| Import from Files | Settings › Import and scan copies songs, or a whole folder with its subfolders, covers and lyrics, in from the Files app (On My iPhone, iCloud Drive, USB drives), then scans. Importing a folder again copies only what is new. Android reads storage directly, so Musicolet has no such step | iOS≈ | N/A: the music is read where it is | wip |
| Welcome pages | The first launch opens a photo with the name on it, then four dark pages over the app, each a glowing picture and a line: what Melodify is, what it does, adding music (import and scan, their progress shown on a lock-screen notification), and the theme and accent, with a Musicolet backup restore. An install that already has songs skips them; Settings › Help › Welcome tour opens them again | JS | same, asking for storage access instead of importing | wip |
| Delete file from device | Remove the file, not just the DB entry | JS | same (All files access) | wip |
| Share track | Share the audio file with another app | JS | same, share sheet via FileProvider | wip |
| Open with | Play a song another app hands over (a file manager's Open with): it plays next, at once, and the queue is otherwise kept; a song no scan has seen is scanned in first | N/A | Kotlin: the content:// URI resolved to its path | wip |
| Set as ringtone | Android-only | N/A | possible (WRITE_SETTINGS) | skip |

## 4. Lyrics

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Embedded lyrics | Show USLT / lyrics tags from the file | Native | Kotlin: TagLib | wip |
| .lrc synced lyrics | Load sidecar `.lrc`, highlight current line, tap line to seek | JS | same | wip |
| Lyrics editor | Edit / paste lyrics and save to tag or `.lrc` | Native | Kotlin: TagLib | wip |
| Lyrics on player | Swipe up or toggle to show lyrics over album art. With synced lyrics, the line being sung also shows under the artwork as Spotify does, rising in as each line starts; a tap opens the whole lyrics, and Settings › Appearance › Current lyric under the artwork turns it off | JS | same | wip |
| Split-screen lyrics | Lyrics beside controls in landscape or split view (landscape: lyrics on the left, a small artwork by the title) | JS | same | wip |
| Online lyrics search | For a song with no lyrics, Search online (lyrics view and the player's lyrics card) looks it up on LRCLIB and saves synced or plain lyrics as a `.lrc` beside it, with Undo. After a miss, Search for… takes typed words and lists matches to choose from. A song that has lyrics gets Search LRCLIB under them, and every song's menu has Lyrics from LRCLIB…: the matches to choose a replacement from, with Undo; embedded lyrics stay in the tags. Only when tapped, never on its own. Musicolet never goes online; this is Melodify's one exception | JS | same | wip |

## 5. Tag editor

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Edit tags | Title, artist, album, album artist, genre, year, track/disc number, composer, comment | Native | Kotlin: TagLib | wip |
| Batch tag edit | Edit album-wide fields across many tracks | Native | Kotlin: TagLib | wip |
| Album art edit | Set art from an image, remove art | Native | Kotlin: TagLib | wip |
| Format coverage | MP3, M4A, FLAC, WAV and AIFF (the formats iOS plays); TagLib also handles OGG and Opus, which the app does not play | Native | plays Ogg and Opus too | wip |
| Auto-fix tags | Trim, capitalize, fill from filename pattern (verify) | Native | same | skip |

## 6. Audio effects

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Equalizer | Multi-band EQ with presets and custom presets | Native | Kotlin: audio processor | wip |
| Bass boost | Dedicated bass boost slider | Native | Kotlin: audio processor | wip |
| Virtualizer / surround | Stereo widening | Native | same | skip |
| Reverb | Reverb presets (verify) | Native | same | skip |
| Per-song EQ presets | Assign preset to track or album (verify) | Native | same | skip |

## 7. Sleep timer and automation

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Sleep timer | Stop after N minutes | JS | same | wip |
| Stop after current track | Finish the playing song, then stop | JS | same | wip |
| Stop after N tracks | Count-based timer | JS | same | wip |
| Fade out before stop | Lower volume over the last seconds | RN+ | same | wip |
| Shake to snooze / extend | Motion gesture to extend timer (verify) | JS | same | skip |

## 8. Controls outside the app

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Notification controls | Play, pause, next, previous, favorite from notification | iOS≈ Control Center / lock screen | Kotlin: Media3 notification, with a heart | wip |
| Lock screen controls and art | Now Playing info with art, seek | RN+ | Kotlin: Media3 session | done on iOS, wip on Android |
| Headset button actions | Single, double, triple click and long press mapped to actions. iOS turns the clicks into play/pause, next and previous itself and keeps long press for Siri; a headset's next cannot be told from the lock screen's, so there is nothing to remap | iOS≈ | Kotlin: 1, 2, 3 clicks, mapped in Settings | wip |
| Bluetooth controls | AVRCP play/pause/next/prev, track info on car / headphones | RN+ | Kotlin: Media3 session | wip |
| Pause on unplug / resume on plug | Headphone jack and Bluetooth disconnect handling | RN+ | Kotlin: becoming noisy, device callback | wip |
| Auto play on headphone connect | Start playing when headphones connect (verify): resumes only what an unplug paused, off by default | Native | Kotlin | wip |
| Home screen widgets | 4x1, 4x2 player widgets | iOS≈ WidgetKit (native) | Kotlin: 4x1 widget | wip |
| Android Auto | Car head unit UI | iOS≈ CarPlay (needs entitlement, not on free account) | possible, not done | skip |
| Lock screen shortcuts | Shortcuts / quick actions | iOS≈ Home screen quick actions (not under LiveContainer) | Kotlin: launcher shortcuts | wip |

## 9. Appearance

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Themes | Light, dark, black (AMOLED) | JS | same, colors swapped by hand | wip |
| Accent colors | Pick accent color | JS | same, plus the wallpaper (Android 12+) | wip |
| Follow system theme | Automatic light / dark | JS | same | wip |
| Player layouts | Multiple now-playing layouts (standard, edge-to-edge, compact), all in a Spotify-style player with scrolling cards for lyrics, the queue, bookmarks and song details | JS | same | wip |
| Quick access shortcuts | Choose which shortcut buttons show under the player's controls, and their order (lyrics, sleep timer and queue to start with); the rest go at the top of the player's ••• menu | JS | same | wip |
| Album art blur background | Blurred art behind the player | JS | same | wip |
| Font size / density | Compact vs comfortable lists | JS | same | wip |
| Keep screen on | Prevent sleep while player is open | JS | same | wip |
| Landscape support | Rotates on tablets / landscape | JS | same | wip |

## 10. Statistics and history

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Play counts | Per track, album, artist | JS | same | wip |
| Last played timestamp | Per track | JS | same | wip |
| Recently played list | Ordered history | JS | same | wip |
| Skip counts | Tracks skipped early (verify): next pressed before the song counted as a play | JS | same | wip |
| Recap | Melodify's own, not Musicolet's: a month's or a year's listening as story cards over a dark sweep — minutes against the span before, top artist and song with their runners-up, a 24-hour clock with the peak hour, days with music and the longest streak, songs heard for the first time, a persona (Devotee, Night Owl, Explorer…) with the top genres, and a share of the lot as text. The cards turn themselves over on a timer, with the bars across the top filling as they go and a finger held down holding one; each slides in with parallax, its parts rising one after another, the numbers counting up, the clock's bars growing in turn and the glows drifting behind. The span's five most played songs play while it runs, with a mute button, and the queue is handed back as it was on the way out. It opens by itself on the last day of a month (and for three days after) and from 17 December through 7 January, once per span and only with at least 20 plays in it; Settings › Your recap opens any of the four spans any time | JS | same | wip |

## 11. Data management

| Feature | Description | iOS | Android | Status |
| --- | --- | --- | --- | --- |
| Backup | Export playlists, queues, favorites, play counts, bookmarks, settings to a file. The file is a Musicolet backup (its zip, encryption and checksums), so Musicolet on Android restores it; Melodify's own data rides along inside, and what only Musicolet uses (its settings, play counts per week, month and year) is kept from the last Musicolet backup restored | JS | same | wip |
| Restore | Import that file, matching tracks by path or tags. Restores Musicolet's own backups too: songs with their play counts, last played and resume points, favorites, playlists, all queues in play order, excluded folders and search history | JS | same | wip |
| Playlist import / export | M3U / M3U8 in and out | JS | same | wip |
| Auto backup | Periodic backup to a folder (verify) | JS | same | wip |
| Path remapping on restore | Handle moved music folders when restoring | JS | same | wip |

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

## On Android

The Android build (2026-09-26) runs the same JS, with a Kotlin twin of the audio module. It has what
iOS cannot offer here: headset click mapping, a home screen widget, the notification's heart, skip
silence, Ogg and Opus, the wallpaper accent, and reading the music where it already is. Not done yet:
SD cards (only the primary storage is scanned), Android Auto, set as ringtone.

## Musicolet features that need native Swift here

Equalizer, bass boost, gapless, crossfade, pitch, ReplayGain, tag editor, lyrics editor.
These all require replacing AVPlayer with an AVAudioEngine pipeline or adding a tag-writing library.
They are deliberately last on the roadmap.
