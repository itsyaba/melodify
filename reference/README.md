# UI reference

Screenshots of Spotify and Musicolet, collected on 2026-09-25 as visual reference for Melodify's UI.
They're third-party images for internal design reference only. Never ship them in the app bundle.

## spotify/ (265)

| Folder | What | Source |
| --- | --- | --- |
| `appstore/` | Current iPhone (`iphone-*`) and iPad (`ipad-*`) listing screenshots in marketing frames. This is the most up-to-date iOS UI. | apps.apple.com/us/app/id324684580 |
| `playstore/` | Current Android listing: `phone-*`, `tablet-*`, `chromebook-*`. | play.google.com, `com.spotify.music` |
| `ios-flows/<flow>/` | Real iPhone screen recordings, split into frames, in order. Flows: `listening` (now playing, lyrics), `general-browsing` (home, library, tabs, mini player), `creating-a-playlist`, `searching`, `discovering-content`, `settings`. | pageflows.com/ios/products/spotify |
| `ios-screens/` | Single iPhone screens (home, library, playlists, search, context menus, settings), not in flow order. Signup, login and splash screens removed. | pageflows.com |
| `newsroom/` | Official feature images: queue and listening controls, lyrics sharing, listening stats, mixing, lossless settings, iPad layout. | newsroom.spotify.com |
| `other-devices/` | Wear OS and Android Auto. Only useful for small-screen and car layouts. | Play Store |

Some Pageflows captures are older app versions (for example the "Your Playlists" tab bar). If something
conflicts, `appstore/` and `newsroom/` show the current design.

## musicolet/ (74)

| Folder | What | Source |
| --- | --- | --- |
| `playstore/` | Current listing graphics: multiple queues, per-device equalizers, synced lyrics, multi-select, tag editor. | play.google.com, `in.krosbits.musicolet` |
| `playstore-archive/` | Older listing screenshots (2019, 2020, 2022), mostly plain phone screens: widgets, folders, tag editor, queues, notifications. | web.archive.org snapshots of the listing |
| `official-site/` | Screenshots from the developer's site (`*-old.png` are older versions). | krosbits.in/musicolet |
| `articles/` | Full-resolution real-device screenshots from reviews: now playing, queues list, album grid, equalizer, tag editor, player menu, sleep timer, lyrics editor, widget settings. | makeuseof.com, androidpolice.com, maketecheasier.com, weobserved.com |

Musicolet is Android only, so every Musicolet image here is Android UI. Use it for layout, information
density, and feature placement, and follow iOS conventions for controls and navigation chrome.
