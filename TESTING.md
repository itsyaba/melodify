# Phone test checklist

Everything written since the last device session, in the order worth testing. Each item says how
to try it and what should happen. Tick the box when it behaves; when it doesn't, write what you saw
under it (a screenshot of the Scan screen or a toast helps) and leave it unticked. The ROADMAP's
definition of done needs each phase exercised on the phone before its rows turn `done`.

## 0. Setup

- [ ] **Install the newest build.** GitHub › Actions › "iOS unsigned build", newest green run on
      `main`, artifact `Melodify-Debug-unsigned`. Install it the usual way (LiveContainer or SideStore).
- [ ] **Right engine.** Settings › Audio engine should read `melodify-audio 0.9.1 (native-swift)` or
      newer. If it says "Fake engine", the IPA is too old and nothing below will play.
- [ ] **Launch once and wait a minute.** The first launch of 0.7.0+ reads every song's tags once more
      in the background (for ReplayGain). Settings › Scan library shows the progress.

Handy test files, made on the computer with ffmpeg and copied over with the music:

```sh
# Two tracks that should join without a gap: one steady tone cut in two at an exact sample, so
# any click or pause you hear between them is the player's.
mkdir -p Gapless
ffmpeg -f lavfi -i "sine=frequency=440:duration=20" -ar 44100 -c:a flac tone.flac
ffmpeg -i tone.flac -af atrim=end_sample=441000 "Gapless/01 First half.flac"
ffmpeg -i tone.flac -af atrim=start_sample=441000,asetpts=N/SR/TB "Gapless/02 Second half.flac"
# ReplayGain tags, if you have rsgain installed:  rsgain easy ~/Music
```

## 1. First: tags, artwork and lengths (the open bug)

On 2026-09-24 the library showed no art and no lengths. Launch now reads any unread tags, and the
Scan screen shows the first failure.

- [ ] **After launch, songs show lengths and artwork** (in Songs and Albums). Songs with no art of
      their own show the Melodify cover, never a grey square.
- [ ] **Settings › Scan library › Scan now** finishes with "Tags read" above 0 and no "Unreadable
      tags". **If anything fails, send the grey line under the counts**: it names the first file and
      the reason, which is the clue to the bug.
- [ ] **FLAC files** in particular show title, artist, album and track numbers from their tags.
- [ ] **Lock screen art** matches the app, including the Melodify cover for art-less songs.

## 2. Phase 1 leftovers

- [ ] **Pull the headphones mid-song:** playback pauses at once, nothing leaks through the speaker.
- [ ] **Take a call (or set a timer alarm) while playing:** music pauses; after hanging up it resumes
      by itself. If you paused before the call, it stays paused.
- [ ] **Bluetooth:** connect, play, then switch the headphones off: pauses. Play/pause/next on the
      headphones work. Connecting mid-song does not leave the app "playing" silence.
- [ ] **Resume on launch:** play a song to 1:30, force-quit the app, reopen: the same song is cued
      at about 1:30, paused, with the same queue.

## 3. Phase 2: queues and library

- [ ] **Queue tabs:** Queue tab › "+" makes Queue 2. Add songs to it (long press a song › Add to
      another queue…). Tap its tab: you see it without playback changing. Tap a song in it: it plays
      and Queue 2 becomes the playing queue. Switch back: Queue 1 resumes where it was left.
- [ ] **Tab menu** (long press a tab): rename, move left/right, shuffle by album, remove duplicates,
      save as playlist, clear, delete.
- [ ] **Play next / add to queue** from a song, an album, an artist, a folder, a playlist and a
      search result (long press each). A toast confirms with Undo.
- [ ] **Drag to reorder** by the handle, including a long drag that scrolls the list; the list under
      your finger must not scroll on its own.
- [ ] **Swipe a queue row away**, either direction; Undo in the toast brings it back. Several edits
      in a row undo one at a time.
- [ ] **Playlists:** create, rename, add songs, reorder and remove (playlist › ⋯ › Reorder and
      remove), delete. The same song twice in one playlist is allowed.
- [ ] **Shuffle and repeat:** the player's shuffle puts the current song on top and mixes the rest;
      repeat cycles off / queue / song.
- [ ] **Folders tab:** browse; long press a folder › Play / Shuffle take in every subfolder.
- [ ] **Library views:** Songs, Albums, Artists, Album artists, Genres, Composers, Years, Playlists;
      each remembers its sort after a relaunch.
- [ ] **Multi-select:** Select (header) › pick several › ⋯ › play, queue, add to playlist, hide.
- [ ] **Search** finds songs, albums, artists, folders and playlists; recent searches stay listed.

## 4. Phase 3: companion features

- [ ] **Bookmarks:** player › bookmark button saves the spot (name optional). Hold it for this song's
      bookmarks; Library › Playlists › Bookmarks lists all. Tapping one plays from there.
- [ ] **Long songs resume:** a song of 10 min or more, left at 12:00 and played again later, starts
      at 12:00 (Settings › Playback › Remember position).
- [ ] **Sleep timer** (moon): 15 minutes fades over the last 30 s then pauses. "End of this song" and
      "After a number of songs…" stop at the right song, with the next one cued, paused.
- [ ] **Lyrics** (speech bubble): a song with a `.lrc` beside it shows synced lines that follow the
      song; tapping a line seeks there. Embedded lyrics show too.
- [ ] **Play counts:** a song played past half (or 4 min) counts; Recently played, Most played and
      Recently added (Playlists view) fill up.
- [ ] **Favorites:** heart in the player and in menus; the Favorites auto playlist lists them.
- [ ] **Song details:** long press › Details shows tags, file info, plays and skips.
- [ ] **Hide short songs** (Settings) hides songs under 30 s; **Hidden songs** and **Excluded
      folders** (Folders › long press a folder) take songs out of the library and bring them back.
- [ ] **Delete file…** removes the song from the phone and from every list; **Share file…** opens
      the share sheet with the audio file.
- [ ] **Seeking:** skip buttons use the Settings interval; hold previous/next to scan; double-tap the
      left or right of the artwork to skip.

## 5. Phase 4: appearance

- [ ] **Theme and accent** (Settings › Appearance) change everything at once, no restart: light, dark,
      black, match system; all 12 accents.
- [ ] **Player layouts:** standard, edge-to-edge artwork, compact with Up next. Blurred artwork
      behind the player can be switched off.
- [ ] **Tabs and library views:** hide and reorder tabs (Library and Settings stay); hide and reorder
      views. Albums grid/list toggle. Compact density fits more rows.
- [ ] **Keep screen on** while the player is open (when switched on).
- [ ] **Rotation:** set to "Rotate freely"; the player turns side by side in landscape.

## 6. Phase 5: backup and restore

- [ ] **Back up now** (Settings › Backup and restore): a file appears in the list and in
      `Documents/Melodify/Backups/` (check over ifuse or Files). Share works.
- [ ] **Restore onto the same library:** change some things (delete a playlist, favorite a song),
      restore the backup: the screen shows "Found N of N", and after Restore the playlist and old
      favorites are back, queues restored, playback stopped. A "Saved before a restore" backup appears.
- [ ] **Restore after moving the music:** move a folder on the computer (for example everything
      into `Music/`), rescan, restore: the Folders that moved section names the move and the songs
      are found. For a folder still "Not found", tap it and type its new path.
- [ ] **M3U export:** playlist › ⋯ › Export as M3U writes `Documents/Melodify/Playlists/<name>.m3u8`;
      the file opens in a desktop player with the music folder beside it.
- [ ] **M3U import:** put a `.m3u` made on the computer anywhere in the music folder; Settings ›
      Backup and restore › Import a playlist file… lists it; importing says how many songs it found.
- [ ] **Automatic backups:** set Daily; background the app the next day: an `auto-…` backup appears.

## 7. Phase 6: the audio engine (module 0.7.0+)

- [ ] **Gapless:** play the Gapless test pair (or a live album): no click or pause between tracks,
      and the app and lock screen move on to the second track by themselves.
- [ ] **Gapless across formats:** an MP3 followed by a FLAC: at most a tiny gap, never a stop.
- [ ] **Crossfade** (Settings › Playback): at 6 s the end of one song fades under the next. Pressing
      next still cuts straight over. Pausing mid-fade finishes the fade and pauses.
- [ ] **Speed** (player › sliders button › Speed and Sound): 1.5× plays faster at the same pitch;
      the lock screen's progress bar keeps up with the song.
- [ ] **Pitch:** +3 semitones raises the pitch without changing speed; "Pitch follows speed" makes
      1.5× sound higher, like a record.
- [ ] **Equalizer:** switch on, try Bass boost and Treble boost presets; drag single bands while
      listening (you hear it as you drag). Save your own preset, hold its chip to delete it. With the
      equalizer off, volume is exactly as before 0.7.0 (no quieter).
- [ ] **ReplayGain** (Settings › Playback): with tagged files, Track mode evens loud and quiet songs
      out; Album mode keeps an album's own dynamics. Untagged songs play as before.
- [ ] **Volume slider in the player** (Settings › Playback) changes the level; the sleep timer's
      fade still works with it and puts it back afterwards.
- [ ] **Resume when headphones reconnect** (off by default): with it on, pull the headphones (it
      pauses), plug them back in: it carries on. Plugging in after pausing by hand does nothing.
- [ ] **Sleep timer "after N songs" with gapless on:** the last song still stops at its end.

## 8. Phase 7: tag editing (module 0.8.0+)

- [ ] **Edit tags…** (long press a song): change the title and artist, Save. The list, the player
      and the lock screen show the new tags at once, and a rescan keeps them.
- [ ] **Edit while playing:** edit the playing song; it stops for a moment and carries on from the
      same spot.
- [ ] **Album edit:** an album › ⋯ › Edit album tags…: fields the songs disagree on say "Different
      values" and are left alone; set the genre and year for all of them.
- [ ] **Artwork:** Choose an image… (from Files) › Save: new art in the app and on the lock screen.
      Remove artwork: the folder's cover (or the Melodify cover) shows instead.
- [ ] **Formats:** try the above on an MP3, an M4A and a FLAC.
- [ ] **Edit lyrics…:** paste lyrics, Save › In the song's tags; the lyrics view shows them. Try
      As a .lrc file too; the file appears beside the song.
- [ ] **Stamp line:** while the song plays, put the cursor on a line and tap "Stamp line at the
      current time" a few times along with the song; after saving, those lines highlight in sync.
- [ ] **Song details** end with "Every tag in the file".

## 9. Phase 8

- [ ] **Quick actions** (real install through SideStore only; under LiveContainer they are left
      off on purpose): hold the app icon: Resume "song", Shuffle all, Favorites, Search all work.
- [ ] **Skip counts:** press next early in a song a few times; its details show Skips.
- [ ] **Landscape lyrics:** rotate with lyrics shown: lyrics on the left, a small artwork by the title.
- [ ] **Big library feel:** with your whole library, Songs, Albums and Artists open without a
      noticeable wait, and launch is not slower than before.

## What to send back

For anything that fails: the item's name, what you did, what happened instead, and any toast or
Scan screen text. The Settings › Audio engine line tells which build it was.
