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
      in the background (for ReplayGain). Settings › Import and scan shows the progress.

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
- [ ] **Settings › Import and scan › Library health** shows Tags, Lengths and Artwork, each with a
      bar. After a minute all but Artwork should say Complete.
- [ ] **Scan now** ends on a "Library up to date" card saying "tags read for N", with no "could not
      be read" line. **If anything fails, send the small grey text on that card**: it names the
      first file and the reason, which is the clue to the bug. "Read all tags again" (under Library
      health) forces a full re-read if the bars stay short.
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
- [ ] **Tabs and library views:** hide and reorder tabs (Home and Library stay); hide and reorder
      views. Grid/list toggle (see section 11). Compact density fits more rows.
- [ ] **Keep screen on** while the player is open (when switched on).
- [ ] **Rotation:** set to "Rotate freely"; the player turns side by side in landscape.

## 6. Phase 5: backup and restore

- [ ] **Back up now** (Settings › Backup and restore): a `.zip` appears in the list and in
      `Documents/Melodify/Backups/` (check over ifuse or Files). Share works. Older `.json` backups
      still list and restore.
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
      They stay pinned under the Library title while the list scrolls (see section 16).
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

## 12. Home, the tab bar, Settings and Search

JS only: no new IPA needed, but reload the app once (shake › Reload, or `r` in the Metro terminal),
since the tabs themselves changed.

- [ ] **Tab bar:** Home, Queue, Folders, Library in the bar, and the round Search button on its own.
      No Settings tab. The app opens on Home. If Settings › Tabs had been changed before, that order
      stays, with Home added in front.
- [ ] **Home** itself was redone on 2026-09-26: see section 17.
- [ ] **Gear** opens Settings inside Home, with a back button; Import and scan, Backup and restore
      and the rest open from there and come back. Settings › Tabs and views says Home and Library
      always stay.
- [ ] **Search tab** (Musicolet style): a grey field at the top. Tapping the Search button, or
      tapping it again while on it, puts the cursor there. Nothing typed: RECENT SEARCHES with
      CLEAR, each with ✕; tap one to search it again. None yet: "Search your library".
- [ ] **Results** appear as you type, grouped: SONGS, ALBUMS, ARTISTS, PLAYLISTS, FOLDERS, each
      header in the accent with its count, and sticking to the top while its group scrolls. Five
      songs and three of the rest show; SHOW ALL 23 SONGS opens the whole group. Every word must
      match somewhere ("fun we are young" finds We Are Young by fun.; "beyonce" finds Beyoncé).
      Nothing found: "No results".
- [ ] **Rows:** songs show art, title, artist · album, length and ⋯; a tap plays the songs found
      from there (first tap, even with the keyboard up); the playing one is in the accent. Shuffle
      and play on the SONGS header play every song found. Albums, artists and playlists open inside
      the Search tab; folders in the Folders tab. ⋯ or a long press gives each row's menu. A search
      is remembered when you press Search on the keyboard or open a result.
- [ ] **Shortcut:** holding the app icon › Search opens the Search tab with the keyboard up.
- [ ] **White text on colour** shows, in light and dark: the Browse all tile names, the album and
      artist on Discover cards, the chosen Library pill, and the labels of Settings › Scan now, the
      Restore button and the lyrics editor's Stamp line button (all were invisible before).

## 13. Menus as Spotify's sheet

JS only: a Metro refresh picks it up.

- [ ] **Song menu** (⋯ or a long press on any song, in Library, Search, an album, a playlist, the
      queue, the player's •••): a sheet slides up over a dimmed page, with a grab handle, the song's
      cover, title and "artist • album", a line, then rows with an icon each: Play next, Add to
      queue, Add to another queue, Add to playlist, Add to favorites (heart), Go to album / artist /
      folder, Select, Details, Edit tags, Edit lyrics, Lyrics from LRCLIB, Share file, Hide, and
      Delete file in red. A long list scrolls inside the sheet.
- [ ] **Closing:** tap the dimmed page, or pull the sheet down by its handle or header; a short pull
      springs back. Nothing runs.
- [ ] **Items that open more:** Add to another queue and Add to playlist open a second sheet; New
      playlist, Rename and the sleep timer's Custom ask with a prompt; Delete asks to confirm. All
      appear after the first sheet has gone, never stuck behind it.
- [ ] **Album, artist and playlist menus** show the cover (round for an artist) and a line under
      the name; folder menus the path.
- [ ] **Sort menus and settings pickers** mark the current choice with an accent check.
- [ ] **In the player:** its ••• sheet opens over the player, and its own items (lyrics, sleep, A–B,
      bookmarks, speed and sound, queue) carry their icons.
- [ ] **Search with the keyboard up:** ⋯ on a result closes the keyboard and the sheet shows whole.
- [ ] **Light theme:** white sheet, dark text; dark and black themes: the sheet a step lighter than
      the page. Rotating while a sheet is open keeps it working.

## 13. Import from the Files app

JS only: reload the app. **In LiveContainer, first turn on Fix File Picker for Melodify** (hold its
card › Settings › Fixes; the plain one, not "legacy"). Without it the picker's Open button does
nothing, and Import and scan says so under its buttons. Put a small test folder somewhere the Files app sees first: On My iPhone
(outside Melodify's own folder), iCloud Drive, or a USB stick. Something like `Test Album/` with
three songs, a `cover.jpg`, an `.lrc` for one song, and a subfolder `CD2/` with one more song.

- [ ] **Where it is:** Settings shows *Import and scan* where *Scan library* was, with the song count.
      The page is described in section 14; *Import a folder* and *Import songs* are the two coloured
      tiles under *Add music*.
- [ ] **Empty library:** on a fresh install (or with every folder excluded), Library › Songs and
      Albums say "No songs yet" with an *Import music* button that opens Import and scan. The
      Folders tab's empty root points there too.
- [ ] **Import a folder:** pick `Test Album`. A card near the top says "Looking through Test Album",
      then "Importing Test Album", "1 of 4 songs" with a filling bar, the song name, and *Stop*. Then
      a scan card runs by itself, and a toast says "Imported 4 songs". Folders shows `Test Album/` with `CD2/` inside; the
      album has its cover; the song with the `.lrc` shows those lyrics.
- [ ] **Again:** import the same folder a second time. Nothing is copied: "All 4 songs were already
      imported". Add one more song to the folder in Files and import again: "Imported 1 song
      (4 already there)".
- [ ] **Stop:** import a big folder and tap *Stop* partway. The toast says "Stopped after
      importing N songs"; those N are in the library after the scan, none half-copied. Importing
      the folder again copies the rest.
- [ ] **Leave while it runs:** start a folder import, go back to Settings and Home. The toast still
      comes when it ends; going back into Import and scan shows where it got to.
- [ ] **iCloud:** in iCloud Drive, a folder whose songs are not downloaded (cloud icon). Either they
      are copied (iOS downloads them), or they are counted as "not downloaded from iCloud" with a
      note to download the folder first. Say which happened.
- [ ] **Import songs:** pick three songs at once (hold one, then tap others, or Select in the
      picker). They land in Folders › `Imported/`, and the toast counts them. Pick the same three
      again: "All 3 songs were already imported". FLAC files must be pickable, not greyed out.
- [ ] **Not playable:** if the picker lets you choose an `.ogg` or a PDF, the toast says "not playable"
      and nothing of it is copied.
- [ ] **Melodify's own folder:** pick On My iPhone › Melodify (or LiveContainer's guest folder)
      itself or a folder in it. The toast says it was already there and scanned instead; nothing
      is duplicated.
- [ ] **Cancel** either picker: nothing happens, no toast.

## 14. The Spotify-style Import and scan page

JS only: reload the app. Try it in the dark and light themes, and with a different accent.

- [ ] **Top:** no stock iOS header. The accent colour washes down from behind the status bar and
      fades out around *Add music*. A back chevron top left; swiping from the left edge also goes
      back. Pull the page down: the colour reaches the top, no hard edge.
- [ ] **Scrolling:** as the page goes up, the colour in the bar fades and "Import and scan" fades
      in, centred, with a thin line under the bar. Scrolling back down reverses it.
- [ ] **Hero:** "IMPORT AND SCAN" small above a big bold count ("1,234 songs", with a thousands
      separator), then "86 albums · 210 artists · 74 hr · 12.4 GB". The count matches Library ›
      Songs. An empty library says "No music yet" and points to the tiles below.
- [ ] **Scan now** is an accent pill with a circular arrow. While a scan runs it reads "Scanning…"
      with a spinner, and it, the tiles and the tag re-read are dimmed.
- [ ] **Cards:** while scanning, a card goes "Looking for music" (files found), "Updating the
      library", then "Reading tags and artwork" with a bar that fills (N of M songs). It ends as
      "Library up to date" with what changed ("12 added · 3 updated · tags read for 15"), or
      "Nothing new since the last scan". Leave and reopen the page mid-scan: the card is still there.
- [ ] **Add music:** two tiles side by side, purple *Import a folder* with a tilted folder and green
      *Import songs* with a tilted note, white text. A grey note under them, then a *Copy over
      USB* card (and *Using LiveContainer?* when running there).
- [ ] **Library health:** Tags, Lengths, Artwork, each with an icon, a thin accent bar and either
      "N not read yet / unknown / without" or a check and "Complete". Then *Read all tags again*,
      which asks first; tapping it while a scan runs says to wait.

## 15. Musicolet backups

Needs the 0.10.0 build (Settings › Audio engine says 0.10.0) to be quick: it does the decryption,
checksums and compression natively. On an older build the same works, in JS, but a big library
takes most of a minute and the app is frozen meanwhile. Copy a Musicolet backup `.zip` somewhere
Files sees (or into the music folder over USB). Note roughly how long each step takes.

- [ ] **Restore a Musicolet backup:** Settings › Backup and restore › Choose a backup file…, pick
      the zip. The screen says "Musicolet backup" under the date, then counts songs, favorites,
      playlists and queues. "Found N of M": songs whose Android folders sit elsewhere on the iPhone
      show under Folders that moved; tap a Not found folder to point it.
- [ ] **After Restore:** the 8 playlists with their songs in Musicolet's order; favorites; play
      counts (Library › sort by most played); the 20 queues, each on its current song at its
      position; Queue L playing (was the active one). Compare Queue L's order and current song with
      Musicolet's: if they differ, the shuffle order was read the wrong way round.
- [ ] **Search** shows Musicolet's recent searches. Melodify's own settings (theme, tabs) did not
      change.
- [ ] **Automatic backups** on 0.10.0 are `.zip` too; on an older build they stay `.json`.
- [ ] **Back up now** afterwards, then on the Android phone: copy that zip over, Musicolet ›
      Settings › Backup › Restore, pick it. Musicolet should accept it and show the playlists,
      favorites, queues and play counts; its own settings and equalizer come back as they were.
      Note anything it rejects or loses, and whether songs added only on the iPhone show up.
- [ ] **Back in Melodify:** restore a Melodify zip that Musicolet has not touched: bookmarks and
      Melodify's settings come back too (they travel in `melodify.json`).

## 16. Queue, Folders and Library headers; dragging in the queue

JS only: no new IPA needed. These three tabs draw their own header now, like Home: a big title
with Select and ⋯ on the same row, opaque from the status bar down.

- [ ] **Scrolling:** scroll each of Queue, Folders and Library far down and back. The title stays
      put and big; rows vanish cleanly at the header's bottom edge and never show behind the
      title, the buttons or the status bar. The queue tabs (Queue) and the view pills (Library)
      stay pinned under the title.
- [ ] **Header buttons:** Select switches to multi-select; the row then shows Select All, ⋯ and
      Done, and Select All becomes Deselect All once everything is picked. On Library, Select is
      only on Songs, and leaves when you switch to Albums. Folders' ⋯ opens the folder menu.
- [ ] **Still native:** tapping the tab again scrolls its list back to the top, and the tab bar
      shrinks as you scroll down. A tap on the status bar scrolls up too. Opening an album, artist
      or subfolder slides the stack's header in, with the back chevron.
- [ ] **Queue from the player:** the queue button there opens the queue as a sheet, with the
      stack's small "Queue" header, Select and ⋯ in it, and the tabs at the top of the list.
- [ ] **Drag:** hold a row's handle and drag it up and down past several rows, including far
      enough that the list scrolls by itself both ways. The rows you pass slide aside smoothly
      and every one stays visible (before this, a blank band opened as long as the drag). On
      release the row glides into the gap, then the queue reorders without a flash back to the
      old order. A playlist's Reorder and remove slides the same way, though there the row can
      still blink back for a moment while the new order saves.

## 17. Home, redone so it is not Spotify's

JS only: no new IPA needed. Try it in a dark theme and in Light, and with a second accent.

- [ ] **Header:** the weekday in small grey capitals over the part of the day in big bold type
      ("SATURDAY / Evening"; Morning from 5, Afternoon from 12, Evening from 17, Night from 21).
      After midnight it still says the night before (1 a.m. on Sunday is SATURDAY / Night). To the
      right a grey Search pill and a round gear. A faint wash of the accent sits behind the top,
      the status bar included, with no seam under the clock; scrolling, the page goes under an
      opaque strip there, never behind the clock.
- [ ] **Search pill** switches to the Search tab with the keyboard up. **Gear** opens Settings
      inside Home, with a back button.
- [ ] **Your lists:** wide cards for Favorites, Recently added, Most played, Recently played and
      Bookmarks that scroll sideways and stop with a card at the left edge. Each has its name, a
      line about it, and "12 songs · 48 min" at the foot (Bookmarks counts bookmarks; an empty
      list says Nothing yet). On the right the list's top cover with a black record half out
      from behind it, grooves faint and the centre label in the accent; an empty list shows its
      icon on an accent square instead. Tap opens the list inside Home; hold an auto playlist for
      Play, Shuffle and the queue items.
- [ ] **Counts stay current:** play a song past half way, go back to Home: Recently played and Most
      played have it (Home reads them again whenever it comes back into view).
- [ ] **Albums:** chips under the heading, Rediscover first (albums with art not played for a
      month, in a new order at each launch or library change) and then the ten genres with the most songs. The
      chosen chip is filled. Big covers two and a bit across, each with a round dark play button
      in its bottom-left corner, the album and artist underneath. Tap a cover to open the album;
      tap the play button to play it from the first song without leaving Home; hold for its menu.
      Switching chips starts the row back at its first album and never shows the last genre's
      albums under the new chip. On a genre, the › by the heading opens that genre; on
      Rediscover there is no ›. Hold a genre chip for Play, Shuffle and the rest on the whole
      genre. With every album played lately and no genres, the whole Albums shelf is gone.
- [ ] **Recently played:** the last five songs, each on its own rounded card: cover, title and
      artist, a round play button. Tap plays the whole recently played list from that song. The
      song playing now has its title in the accent and a waveform in its button. Hold for the
      song's menu. The › opens the full list. Before anything was ever played the shelf is
      Recently added instead.
- [ ] **Empty library** (or everything hidden): only the header and "No music yet" with an Import
      music button, which opens Import and scan.
- [ ] **Still native:** tapping Home in the tab bar again scrolls back to the top, the tab bar
      shrinks as you scroll down, and a tap on the status bar scrolls up too.
- [ ] **Import and scan** still shows its two coloured import tiles as before.

## 18. Welcome pages (onboarding)

Redesigned after the Panora reference: a photo first, then four dark pages. JS only, no new IPA
needed (the Outfit font and the photo ship in the JS bundle). An install that already has songs is
never shown the pages by itself, so open them from **Settings › Help › Welcome tour**. To see a real
first launch, install fresh (or clear Melodify's data in LiveContainer) and open the app.

- [ ] **First launch:** a fresh install opens straight onto the photo (the misty green valley with
      the little house), with no flash of Home first. "Melodify" in a large rounded typeface over
      the fog with "Your music, offline." under it, rising into place as the photo settles in; a
      white *Get started* pill at the bottom. The status bar is white.
- [ ] **The pages:** *Get started* fades the photo into near-black pages. Each has one picture
      glowing in the accent, a centred white title, a grey line, four small dots (the accent one
      slides as you swipe) and a white *Continue* pill. A glass *Skip* pill sits top right. Swipe
      left and right, or tap *Continue*; the picture drifts a little slower than its page.
- [ ] **1. Melodify:** a player card with the valley as its cover, "Northern Valley", an accent
      seek bar and play controls, with an accent waveform running out behind it on both sides.
- [ ] **2. Built like Musicolet:** a peak of glowing accent bars with a dotted trail up to a round
      queue badge in radar rings; six round badges (folders, bookmarks, lyrics, equalizer, tags,
      sleep) float gently around it, the far two dimmer. With Reduce Motion on they stay still.
- [ ] **3. Add your music:** the top of a phone showing the lock screen (today's date and time over
      the valley) with a glowing Melodify notification on it. iPhone: glass *Import folder* and
      *Import songs* pills, and "Copied over USB? *Scan the folder*". Import a small folder: the
      notification turns into "Importing Test Album · 1 of 4 songs" with a bar, then "Reading tags
      and artwork", then "4 songs ready to play · 1 album · 1 artist"; the toast shows over the
      pages. In LiveContainer a grey line says to turn on Fix File Picker first. Android: *Allow
      all files* and *Music only* (then *Scan the phone* once allowed).
- [ ] **4. Make it yours:** four tiny app screens (System split light and dark, Light, Dark, Black)
      scattered like a collage with faded photo tiles at the edges. Tap one: it grows, gets an
      accent border and a glow, and the app's theme changes. Below, a row of accent dots (13 on
      Android 12+, with Wallpaper): tapping one repaints every glow, the dots, the link and the
      button at once. The button is an accent pill, *Start Melodify*, and *Skip* is gone.
- [ ] **Restore from here:** "Coming from Musicolet? *Restore a backup*" opens the file picker;
      cancelling it leaves the pages up. Choosing a Musicolet or Melodify backup closes the pages
      and opens the Restore screen for it. With no songs yet it asks to add music first.
- [ ] **Closing:** *Skip* or *Start Melodify* fades the pages out onto Home. Force-quit and reopen:
      they do not come back. *Welcome tour* in Settings fades them in again, from the photo.
- [ ] **Android back:** steps back a page, from page 1 to the photo, and from the photo closes them.
- [ ] **Small phone** (SE-sized): the pictures shrink to fit; no text or button overlaps.

## 19. Android (new, 2026-09-26)

The whole app on Android. Everything below was written for it; the notes in *italics* say what the
Android 16 emulator already showed (a phone still has to confirm it: the emulator has no headset,
no Bluetooth and only a test library).

Install: GitHub › Actions › "Android build", newest green run, artifact `Melodify-Release-android`.
Unzip, then open `Melodify-Release.apk` on the phone (allow installing from the browser or Files when
asked), or `adb install -r Melodify-Release.apk`. Later builds install over it and keep the library.

- [ ] **Right engine.** Settings › Audio engine reads `melodify-audio 0.11.0 (native-kotlin)`.
      *Emulator: yes.*
- [ ] **Welcome pages ask for access, not an import.** Add your music shows *Allow all files* and
      *Music only*. Allow all files opens Android's All files access page: turn it on, come back,
      and a scan starts by itself. Back on the first page closes the pages; on the others it steps
      back one. *Emulator: the page opened, and coming back started the scan.*
- [ ] **The scan finds the music where it is**, in every folder, but not in `Android/`, hidden
      folders, or folders with a `.nomedia` file (Settings › Library › Skip folders with a .nomedia
      file switches that off). The Folders tab starts at the storage root: Music, Download…
      *Emulator: 10 of 12 test files, the `.nomedia` and `Android/` ones left out.*
- [ ] **Without access a scan is refused**, with a message, instead of emptying the library.
- [ ] **Tags, lengths and artwork** read by TagLib, Ogg, Opus and FLAC included; a song named with
      emoji or Amharic plays and shows its tags. *Emulator: yes, embedded covers included.*
- [ ] **Playback in the background.** Start a song, go home, lock the phone: it keeps playing, and
      the notification shows the cover, title, artist, previous, play/pause, next and a heart.
      The heart fills for a favorite and toggles it; the app's heart follows. *Emulator: the
      notification and its buttons work; the heart set the favorite, a few seconds late there.*
- [ ] **Lock screen and Bluetooth** (car, earbuds, watch) show the song and drive the queue.
- [ ] **Headset clicks.** One click plays or pauses, two go to the next song, three to the previous
      (after a short pause while it waits for more clicks). Settings › Playback › Headset and
      Bluetooth button changes each. *Emulator, with the headset-hook key: one, two and three work.*
- [ ] **Unplug pauses**, a call pauses and the end of the call resumes, another app's music pauses
      for good. With Resume when headphones reconnect on, plugging back in resumes what an unplug
      paused.
- [ ] **Gapless**: the Gapless Album test files (see §0) run on with no click; **crossfade** overlaps
      the end with the next song's start; the **equalizer**, bass boost, speed and pitch audibly
      work; **ReplayGain** evens out loud and quiet songs; **Skip silence** leaves out gaps.
      *Emulator: the equalizer and 1.25× ran without a hitch, but it has no speaker to listen with.*
- [ ] **Tag editor, artwork from the photo picker, lyrics editor, Delete file** (needs All files
      access). Other apps see the new tags (the system's media index is told). *Emulator: a new
      title was written into a FLAC and ffprobe read it back.*
- [ ] **Share file** opens Android's share sheet with the song (and a backup, a playlist).
- [ ] **Backups** go to `Melodify/Backups` in the phone's storage (*emulator: an automatic one was
      written as a Musicolet zip, so the Kotlin codec passed its checks*). A Musicolet backup from the same
      phone restores with every song found by path; a Melodify backup restores in Musicolet.
- [ ] **Home screen widget**: hold the home screen › Widgets › Melodify. It shows the song and
      its cover; previous, play/pause and next work. With the app closed it shows "Tap to open".
      *Emulator: added, showed the song and cover; pause and next worked.*
- [ ] **Open with Melodify**: in Files (or any file manager), tap a song and pick Melodify. It plays
      next, at once, and the queue keeps the rest. A song copied in since the last scan is scanned
      first ("Adding it to the library…"). *Emulator: a MediaStore link opened the player on the
      song, playing.*
- [ ] **Swipe Melodify away from recents** while a song plays: the music carries on, with the
      notification. Paused, the app just goes. *Emulator: carried on playing (this crashed before
      the review fix).*
- [ ] **Launcher shortcuts**: hold the icon for Resume, Shuffle all, Favorites and Search.
      *Emulator: all four registered; Search opened the Search tab.*
- [ ] **Wallpaper accent** (Android 12+): Settings › Accent color › Wallpaper follows it.
- [ ] **Look**: the tab bar with the mini player above it, Material icons, dark mode and the black
      theme, status bar icons readable in both, sheets and prompts (rename a playlist) that close
      with back. *Emulator: all of it, dark mode switching live with the system.*

## What to send back

For anything that fails: the item's name, what you did, what happened instead, and any toast or
Scan screen text. The Settings › Audio engine line tells which build it was.
