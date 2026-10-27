"use client";

import { useId, useState, type CSSProperties } from "react";
import { AmbientLights, Shots } from "./shots";

// Translations below are real Sotto output for these lines.
const heroCues = [
  { en: "Let's call it a day.", zh: "今天就到此為止吧" },
  { en: "Are you out of your mind?", zh: "你瘋啦？" },
  { en: "We're not out of the woods yet.", zh: "我們還沒脫離險境" },
  { en: "Cut me some slack.", zh: "饒了我吧" },
];

// Same defaults and ranges as the extension's settings.
const DEFAULT_FONT_SIZE = 30;
const DEFAULT_OPACITY = 0.22;

function isCompact() {
  return window.matchMedia("(max-width: 980px)").matches;
}

export function PlayerDemo() {
  // null leaves the default to CSS: open on wide screens, closed below 980px,
  // where the open panel would cover most of the frame.
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const panelId = useId();

  const cueStyle = {
    "--cue-scale": fontSize / DEFAULT_FONT_SIZE,
    "--cue-bg": `rgba(0, 0, 0, ${opacity})`,
  } as CSSProperties;

  return (
    <>
      <AmbientLights />
      <div className="player">
        <div className="scene" aria-hidden="true">
          <Shots />
        </div>
        <div className="playerTop" aria-hidden="true">
          <span className="playerBack">‹</span>
          <span className="playerTitle"><b>第 2 季・第 4 集</b>脫離險境</span>
        </div>

        <div className="cueStack" style={cueStyle} aria-live="off">
          {heroCues.map((cue, index) => (
            <div className="cue" key={cue.en} style={{ "--i": index } as CSSProperties} aria-hidden={index > 0}>
              <div className="cueCard">
                {translationEnabled && <p className="cueZh">{cue.zh}</p>}
                <p className="cueEn">{cue.en}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={`demoPanel${panelOpen === null ? " isDefault" : panelOpen ? " isOpen" : ""}`}>
          <button
            className="demoToggle"
            type="button"
            aria-expanded={panelOpen ?? undefined}
            aria-controls={panelId}
            onClick={() => setPanelOpen((open) => open === null ? isCompact() : !open)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="3.5" width="17" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="5" y="9" width="10" height="1.8" rx=".9" fill="currentColor" /><rect x="6.5" y="12" width="7" height="1.8" rx=".9" fill="#d9ff66" /></svg>
            LocalSubs
          </button>
          <div className="demoSheet" id={panelId} role="group" aria-label="LocalSubs 快速設定（示範）" hidden={panelOpen === false}>
            <div className="demoHead">
              <strong>LocalSubs</strong>
            </div>
            <label className="demoRow">
              <span>翻譯</span>
              <input
                className="demoSwitch"
                autoComplete="off"
                type="checkbox"
                checked={translationEnabled}
                onChange={(event) => setTranslationEnabled(event.target.checked)}
              />
            </label>
            <label className="demoRow demoStack">
              <span>字幕大小</span>
              <span className="demoRange">
                <input type="range" autoComplete="off" min={16} max={42} step={1} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
                <output>{fontSize}px</output>
              </span>
            </label>
            <label className="demoRow demoStack">
              <span>字幕背景透明度</span>
              <span className="demoRange">
                <input type="range" autoComplete="off" min={0} max={0.95} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
                <output>{Math.round(opacity * 100)}%</output>
              </span>
            </label>
          </div>
        </div>

        <div className="playerControls" aria-hidden="true">
          <span className="ctrlPlay">❚❚</span>
          <span>↺10</span>
          <span>↻10</span>
          <div className="progress"><i /><span className="progressHead" /></div>
          <time>18:24 / 42:08</time>
          <b className="ctrlCc">CC</b>
        </div>
      </div>
    </>
  );
}
