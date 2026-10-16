# custom-userscripts

Personal userscripts, maintained here as the single source of truth. Built for **wBlock** on iOS / iPadOS / macOS Safari (Greasemonkey-compatible engine), but any userscript manager will run them.

## Scripts

| Script | Runs on | What it does |
|---|---|---|
| [`youtube-mobile-lite.user.js`](./youtube-mobile-lite.user.js) | `m.youtube.com` | Rebuilt mobile YouTube: clean video feeds, native player, no Shorts — plus custom **History** (continue watching) and **Watch Later** tabs |
| [`auto-pip-yt.js`](./auto-pip-yt.js) | `youtube.com` | Auto picture-in-picture when scrolling away from the video |

## Install in wBlock (iOS / iPadOS)

1. Open the **wBlock** app → **Userscripts** → **Add** → add **from URL**:
   `https://raw.githubusercontent.com/AQJK/custom-userscripts/main/youtube-mobile-lite.user.js`
2. Make sure the script is toggled on (and scoped to `m.youtube.com` if you use per-site limits).
3. Safari → **Settings** → **Extensions** → enable **wBlock Scripts** (plus the content blockers). For Private Browsing, enable it there too.
4. Open `https://m.youtube.com` in Safari. The script only runs on the **mobile** site — turn off *Request Desktop Website* for youtube.com if Safari serves the desktop page.

## Updating a script

1. Edit the `.user.js` file here.
2. **Bump `@version`** in the `==UserScript==` metadata header — managers use it to detect updates.
3. Push to `main`. Both the `@downloadURL` and `@updateURL` headers point at this repo's raw URL, so wBlock (or any GM manager) re-downloads from here instead of the original GreasyFork listing.

## youtube-mobile-lite — what's customized

Based on GreasyFork script 600230 *"YouTube Mobile Lite: Simplified Home & Native Player"* v0.1.18 by hxueh (MIT). My fork adds:

- **Three-tab home** — Recommended, History, Watch Later. The Subscriptions tab is removed; old `/feed/subscriptions` links land on Recommended.
- **History tab** (`/feed/history`) — watch history as a "continue watching" feed. Partially watched videos show a red watched-progress bar and open at the saved position.
- **Watch Later tab** (`/feed/watch-later`) — the Watch Later playlist (`WL`) as a feed; cards open the WL queue in the player with autoplay-next.
- **Sticky, larger tab bar** — the tab row stays pinned under the header while scrolling, with bigger tap targets for mobile.
- **Autoplay + auto-fullscreen** — videos start playing as soon as they load and jump straight into fullscreen; if Safari refuses without a user gesture, the first tap on the player plays and enters fullscreen in one gesture.
- **`?t=` resume support** — the native player seeks to YouTube-style `t` timestamps (`95`, `95s`, `1h2m3s`).
- History and Watch Later require a signed-in YouTube account.

The fork is pinned to this repo (`@downloadURL`/`@updateURL`), so upstream GreasyFork updates will never overwrite it. Re-sync with upstream manually when wanted: https://greasyfork.org/scripts/600230
