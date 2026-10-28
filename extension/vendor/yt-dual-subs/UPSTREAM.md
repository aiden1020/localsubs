# yt-dual-subs (vendored)

- Upstream: https://github.com/Gythiro/yt-dual-subs
- Commit: `5657c8a18ca30c84b5d4662bca58e3e9214ffdff` (v3.7.0, 2026-09-12)
- License: MIT, Copyright (c) 2026 Gythiro. The full text is in
  `THIRD_PARTY_NOTICES.md` at the repository root.

## What is vendored

| File | Upstream path | Shipped as |
| --- | --- | --- |
| `inject.js` | `inject.js` | `youtube-capture.js`, a MAIN-world content script on `www.youtube.com` at `document_start` |

`inject.js` is the upstream caption-capture layer. It hooks `fetch`,
`XMLHttpRequest`, and Resource Timing to capture the player's own
`/api/timedtext` URL. That URL carries a valid proof-of-origin (`pot`) token.
The script reuses the URL to fetch the whole track as json3, follows pot
rotation and SPA video changes, and selects a caption track on Shorts, where
the player has no CC button. It posts `cues` / `nocues` / `trackwarn` messages
to the LocalSubs content script.

The build copies the file verbatim into `dist/extension/youtube-capture.js`.
It is not bundled or minified, so the shipped file can be diffed against this
copy.

## LocalSubs changes

`localsubs.patch` is the exact `diff -u` from upstream `inject.js` to this
copy. Every change is marked `LOCALSUBS PATCH` in the source, except deletions:

1. Added a provenance header.
2. Renamed the double-injection guard (`__ytdsInjected` to
   `__localsubsYtCaptureInjected`) and the message tags (`ytds-inject` /
   `ytds-content` to `localsubs-yt-capture` / `localsubs-yt-content`), so an
   installed yt-dual-subs and LocalSubs never answer each other.
3. Removed every request for YouTube's machine translation (`tlang`):
   `wantTlang` is always `false`, and `buildUrl` never sets `tlang`. LocalSubs
   translates the original track on the device.
4. Deleted `produceExport` and its `export-request` message. It always fetched
   a YouTube `tlang` translation for SRT export.
5. Deleted the read-aloud volume ducking and playback-rate code and its
   `ttsDuck` message. LocalSubs has no read-aloud.
6. `parseJson3` also posts each cue's segments with their absolute start
   times (`words: [[ms, text], ...]`). LocalSubs rebuilds auto-generated
   captions from this word stream, because their sentence ends fall inside
   YouTube's rolling caption events.

The only network request left is the same-origin re-fetch of the
player-captured timedtext URL, with `fmt=json3` and without `tlang`.

## Adapted, not vendored

Upstream `content.js` is a 5,600-line single file that also holds its own
translation engines, read-aloud, and settings, so it is not vendored. These
small pieces were re-implemented in LocalSubs, with credit in the source
comments:

- `extension/src/content/track-cues.js`: `computeCueEnds` and
  `activeCueIdxAt` (as `findActiveCue`). Its auto-generated caption
  segmentation and cue timeline are LocalSubs' own.
- `extension/src/content/youtube-cues.js`: `videoIdFromLocation` /
  `isVideoPage`.
- `extension/src/content/youtube-platform.js`: the active-player lookup,
  `readNativeCaption` (the DOM caption fallback), `ensureCaptionsOn`, and
  `yt-navigate-finish` plus location-poll navigation handling.

## Syncing a newer upstream

```bash
git clone https://github.com/Gythiro/yt-dual-subs /tmp/yt-dual-subs
git -C /tmp/yt-dual-subs log --oneline 5657c8a..HEAD -- inject.js
cp /tmp/yt-dual-subs/inject.js /tmp/inject.js
patch /tmp/inject.js extension/vendor/yt-dual-subs/localsubs.patch
```

Review the upstream changes for new network requests, new message types, and
new `tlang` paths. Then copy the result here, regenerate `localsubs.patch`, and
update the commit above.
