"use client";

import { useState } from "react";

const VIDEO_ID = "koS5BPONwW0";
const TITLE = "LocalSubs 實際使用錄影";

// The YouTube player costs about a megabyte of script and sets third-party
// cookies, so the card shows a local thumbnail and loads the privacy-enhanced
// player only when someone presses play.
export function DemoVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="stepVideo">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&playsinline=1`}
          title={TITLE}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`播放：${TITLE}`}>
          <img src="/demo-video.webp" alt="" width="960" height="540" loading="lazy" decoding="async" />
          <span className="stepVideoPlay" aria-hidden="true" />
          <span className="stepVideoLabel">看實際使用錄影</span>
        </button>
      )}
    </div>
  );
}
