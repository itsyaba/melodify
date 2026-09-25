# Phone test checklist

Everything written since the last device session, in the order worth testing. Each item says how
to try it and what should happen. Tick the box when it behaves; when it doesn't, write what you saw
under it (a screenshot of the Scan screen or a toast helps) and leave it unticked. The ROADMAP's
definition of done needs each phase exercised on the phone before its rows turn `done`.

## 0. Setup

- [ ] **Install the newest build.** GitHub › Actions › "iOS unsigned build", newest green run on
      `main`, artifact `Melodify-Debug-unsigned`. Install it the usual way (LiveContainer or SideStore).
- [ ] **Right engine.** Settings › Audio engine should read `melodify-audio 0.9.2 (native-swift)` or
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
- [ ] **Settings › Scan library** now opens with counts: songs, tags not read yet, without a
      length, without artwork. After a minute all but the art-less should be 0.
- [ ] **Scan now** finishes with "Tags read" above 0 and no "Unreadable tags". **If anything
      fails, send the grey line under the counts**: it names the first file and the reason, which is
      the clue to the bug. "Read every song's tags again" forces a full re-read if counts stay high.
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
- [ ] **Search** finds songs, albums, artists, folders and playlists; recent searches stay listed
      (see section 12 for the new page).

## 4. Phase 3: companion features

- [ ] **Bookmarks:** player › ••• › Bookmarks… › Bookmark this spot saves it (name optional); the
      same sheet lists this song's bookmarks. Library › Playlists › Bookmarks lists all. Tapping
      one plays from there.
- [ ] **Long songs resume:** a song of 10 min or more, left at 12:00 and played again later, starts
      at 12:00 (Settings › Playback › Remember position).
- [ ] **Sleep timer** (moon): 15 minutes fades over the last 30 s then pauses. "End of this song" and
      "After a number of songs…" stop at the right song, with the next one cued, paused.
- [ ] **Lyrics** (speech bubble): a song with a `.lrc` beside it shows synced lines that follow the
      song; tapping a line seeks there. Embedded lyrics show too.
- [ ] **Play counts:** a song played past half (or 4 min) counts; Recently played, Most played and
      Recently added (Playlists view) fill up.
- [ ] **Favorites:** the + / ✓ button by the player's title, and in menus; the Favorites auto
      playlist lists them.
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
      views. Grid/list toggle (see section 11). Compact density fits more rows.
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
- [ ] **Gapless across formats:** an MP3 followed by a FLAC: no gap at 1× speed, at most a tiny one
      at other speeds, never a stop. Same with ReplayGain on Track mode (songs of different gain).
- [ ] **Gapless on Bluetooth:** the Gapless pair through AirPods or a speaker joins cleanly too.
- [ ] **Pause in the last seconds of a song** (and play again): it carries on and moves to the next
      song normally; seeking back from there works too.
- [ ] **Crossfade** (Settings › Playback): at 6 s the end of one song fades under the next. Pressing
      next still cuts straight over. Pausing mid-fade finishes the fade and pauses.
- [ ] **Speed** (player › ••• › Speed and sound): 1.5× plays faster at the same pitch;
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
      pauses), plug them back in: it carries on. Pausing by hand, then unplugging and plugging back
      in, does nothing.
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

## 10. The Spotify-style player

JS only: the current build picks it up through Metro, no new IPA needed. Try it in a dark theme
first, then once in light.

- [ ] **Looks right:** the artwork's colours wash the background, darker towards the bottom; big
      rounded artwork with a shadow; bold title and artist on the left, a + button on the right;
      thin white seek bar; white round play button. Nothing is cut off on a small phone.
- [ ] **Header:** the chevron closes the player (so does pulling it down). The middle says
      "Playing from queue" and "Queue 1 · 3 of 24"; tapping it lists the queues, and picking another
      one switches to it. ••• opens the song's menu.
- [ ] **Swipe the artwork** left: next song, the art slides out and the new one in. Right: previous
      song (always the previous one, not the start of this one). At the ends of a queue with repeat
      off it only springs back. The page does not scroll while you swipe. Double-tapping the left or
      right half still skips seconds.
- [ ] **Title and artist** go to the album and the artist (the player closes first).
- [ ] **+ / ✓:** tap to add to favorites (turns into an accent check), tap again to remove. Hold it
      for Add to playlist.
- [ ] **Shuffle and repeat** sit either side of the transport; repeat turns accent-coloured with a
      dot under it, and shows a 1 for repeat song.
- [ ] **Long songs** (10 min or more, Settings › Remember position): shuffle and repeat swap for
      skip back / forward by the Settings interval; ••• then offers shuffle and repeat instead.
- [ ] **Shortcut row** under the controls: three now, lyrics, sleep timer and queue (it was six;
      an unchanged row of six is trimmed on the first launch of this version, a row you chose
      stays). Each lights up in the accent while its thing is on. The ••• menu opens with the
      rest: A–B repeat…, Bookmarks…, Speed and sound, saying what is on (e.g. "Speed and sound:
      1.5×"), then the song's own items. Settings › Appearance › Player shortcuts switches them
      on and off and reorders them (details, add to playlist and share are there too).
- [ ] **A–B repeat:** ••• › A–B repeat… › Set A here, then again › Set B a few seconds later:
      from then on the song jumps back to A whenever it reaches B, and the seek bar shows the
      stretch in the accent; the pill under the title opens the same sheet (Turn off). As a
      shortcut (Settings › Player shortcuts) the loop button sets A, then B, then turns it off,
      with a toast each time, and holding it opens the sheet. Next song: the loop ends. B within
      a second of A is refused.
- [ ] **Pills** appear under the title only while something is on: the sleep timer counting
      down, the A–B stretch, a speed other than 1×, a pitch shift, the equalizer. Tapping one opens
      its control.
- [ ] **Scroll down:** the first card peeks out at the bottom. Lyrics shows a few lines from where
      the song is (Show puts the full lyrics in place of the artwork and scrolls back up), or Add
      when there are none. Next in queue lists the next five songs (tap one to play it), chips to
      switch queues when there are several, and Open, which shows the queue as a sheet over the
      player. Bookmarks appears once the song has some; tapping one seeks there. About this song
      lists the tags, the file, plays and skips; Details opens song details.
- [ ] **Hearting the song** does not make the lyrics card blink or the cards jump.
- [ ] **Search online** (needs internet): on a well-known song with no `.lrc` and no embedded
      lyrics, tap Search online in the lyrics card or the lyrics view. "Searching LRCLIB…", then
      the lyrics appear (synced ones follow the song) and a toast says they were saved. Both the
      card and the view show the same search. A `.lrc` now sits beside the song in Files. Undo
      removes it and brings the button back. In Airplane Mode: "Could not reach LRCLIB" and Try
      again. A classical piece: usually "listed as instrumental". With a `.lrc` copied beside a
      song but not yet rescanned, it refuses and says to rescan, leaving your file alone.
- [ ] **When it finds nothing** it says what it searched for ("Nothing on LRCLIB for “Title” by
      Artist"). If that title or artist looks wrong, the tags are the problem. **Search for…**
      opens a prompt filled with the artist and title; edit the words, tap Search, and a list of
      matches appears (length and Synced shown). Picking one saves it like the automatic search.
      If a song you expected fails, write down the exact message here.
- [ ] **Replacing lyrics:** on a song whose lyrics show, scroll to the end of them: Search LRCLIB
      under "From the .lrc file" (or "From the file’s tags"). A toast says "Searching LRCLIB…",
      then a sheet "Replace the lyrics with" lists matches (length, Synced) and Other words….
      Picking one replaces them at once; the toast's Undo puts the old ones back (the old `.lrc`
      text, or the embedded ones, which were never touched). Also from any song's ••• menu,
      in the library too: Lyrics from LRCLIB…. A song with none gets the best match saved
      straight away, as with Search online.
- [ ] **Compact layout** keeps Up next in the top part and has no queue card below. **Edge** runs
      the artwork edge to edge. **Landscape** puts the controls beside the artwork, with the header.
- [ ] **Blur off** (Settings › Appearance) gives a plain background; everything stays readable.

## 11. The Spotify-style library

JS only, like the player: no new IPA needed. Try it in dark first, then light, and once with
compact density (Settings › Appearance).

- [ ] **Pills:** the chosen view's pill is filled with the accent, white text; the others grey.
      Nothing sits under the status bar or the large title.
- [ ] **Sort row:** "⇅ Title" (or whatever the sort is) on the left opens Sort by and changes the
      order; the magnifier and, on Albums, Artists, Album artists, Genres, Composers and Years, the
      grid button sit on the right.
- [ ] **Count row:** "1234 songs · 72:42:10" under it. On Songs, a shuffle button and a round accent
      play button at its right end play the list shuffled or from the top. The same round play
      button now shows on an artist, genre, folder and the auto playlists too.
- [ ] **Find:** tap the magnifier; a field opens with the keyboard. Typing filters the list at once
      ("beatles help" finds Help! by the Beatles; "beyonce" finds Beyoncé), and the count reads
      "12 of 1234 songs". Tapping a result plays it on the first tap, with the keyboard up. Play and
      shuffle play only what is found. Scrolling closes the keyboard. Cancel clears it and brings the
      sort row back. Nothing found shows "No matches". Switching views starts with no filter.
- [ ] **Rows:** albums, artists and playlists have bigger covers than songs; artists are round.
      Every row ends in ⋯, which opens the same menu a long press does. Song rows show the length
      and then ⋯, in the library and in album, artist, playlist and folder lists and Search. In
      Select mode the ⋯ gives way to the check circles.
- [ ] **Grid:** on Albums the grid button gives three columns (more on an iPad or in landscape)
      with the title and artist under each cover. Artists, Album artists, Genres, Composers and
      Years have the same button; artists come out as round tiles with centred names. Each view
      remembers its own choice after a restart. Finding still works in the grid, and toggling the
      grid keeps the filter.
- [ ] **Playlists:** two-per-row cards at the top: Favorites (accent cover, white heart), Recently
      added, Most played, Recently played, Bookmarks, New playlist. Each opens its list; holding an
      auto playlist gives its menu; New playlist asks for a name. Your playlists follow, with ⋯ for
      Rename and Delete.

## 12. The Spotify-style Search tab

JS only: no new IPA needed, but reload the app once (shake › Reload, or `r` in the Metro terminal):
the fix is in how the tab's screens are set up, which a hot refresh does not redo. Before it,
tapping the Search tab opened the Library page.

- [ ] **Opens:** tapping the Search tab (the magnifier on its own at the right of the tab bar)
      shows a large "Search" title and a big white field, "What do you want to listen to?" in dark
      text, white in light themes too, where a thin edge and a soft shadow set it off the page. Scroll down: the title goes, the field stays pinned under the status
      bar with the page sliding beneath it.
- [ ] **Discover something new:** a row of tall album covers with the album and artist on them,
      albums not played for a month, in a new order each time. Tap opens the album; hold for its
      menu. Missing when every album was played lately.
- [ ] **Browse all:** coloured tiles two a row: Favorites, Recently added, Most played, Recently
      played, Bookmarks, then each genre, biggest first. Each has a tilted cover in the corner (the
      song that tops it, or an icon while it is empty) and opens its list. A genre keeps its colour.
- [ ] **Search mode:** tap the field: it moves to the top with the keyboard up and Cancel beside
      it. With nothing typed: "Recent searches", the songs, albums, artists and playlists you opened
      from Search, newest first, each with ✕ to forget it, and "Clear recent searches" (clears the
      typed searches too). With none yet: "Play what you love". Cancel returns to the browse page.
- [ ] **Typing** shows results at once, one list, best match first, each row saying what it is
      ("Song · fun.", "Album · …", "Artist · 12 songs", "Playlist · …", "Folder · …"). Every word must
      match somewhere: "fun we are young" finds We Are Young by fun.; "beyonce" finds Beyoncé.
      Pills (Top, Songs, Artists, Albums, Playlists, Folders) show once two kinds match and narrow
      the list; Top holds the best 50. Nothing found: "Couldn’t find “…”".
- [ ] **Rows:** a song plays on the first tap, even with the keyboard up, and then the next songs
      found; its title takes the accent while it plays. ⋯ opens its menu; ⊕ adds it to favorites (✓
      in the accent, with a toast), tapping ✓ removes it. Albums, artists and playlists open their
      page inside the Search tab (back returns to the results); folders open in the Folders tab.
- [ ] **Suggestions:** after searching "fun we are young" once (press Search on the keyboard, or
      open a result), typing "we are" lists it above the results with ↖; tapping fills the field.
- [ ] **Shortcut:** holding the app icon › Search opens straight into search mode with the keyboard.
- [ ] **White text on colour** shows, in light and dark: the Browse all tile names, the album and
      artist on Discover cards, the chosen Library pill, and the labels of Settings › Scan now, the
      Restore button and the lyrics editor's Stamp line button (all were invisible before).

## What to send back

For anything that fails: the item's name, what you did, what happened instead, and any toast or
Scan screen text. The Settings › Audio engine line tells which build it was.
