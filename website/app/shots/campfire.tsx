// Shot 4: a campfire at dawn. The fire flickers and throws sparks, and its
// warm light catches the two figures sitting on either side.
import type { CSSProperties } from "react";
import { random } from "./random";

const P = "campfire";
// Off-centre so the subtitles in the middle of the frame never cover it.
const FIRE = { x: 500, y: 735 };

const stars = (() => {
  const next = random(71);
  return Array.from({ length: 34 }, () => ({ x: next() * 1600, y: next() * 300, r: 0.8 + next() * 1.8, o: 0.2 + next() * 0.6 }));
})();

const embers = (() => {
  const next = random(13);
  return Array.from({ length: 18 }, (_, i) => ({
    x: FIRE.x - 50 + next() * 100,
    drift: Math.round(-60 + next() * 120),
    dur: (2.2 + next() * 2).toFixed(2),
    delay: -(next() * 4).toFixed(2),
    r: 1.6 + next() * 2.6,
    key: i,
  }));
})();

const trees = (() => {
  const next = random(5);
  return Array.from({ length: 22 }, () => {
    const x = next() * 1600;
    const h = 60 + next() * 90;
    return { x, h, y: 640 + Math.sin(x / 260) * 18 };
  });
})();

const FLAMES = [
  { d: "M -70 0 C -80 -60 -40 -110 -20 -190 C 0 -120 40 -100 30 -40 C 60 -70 70 -20 70 0 Z", fill: "flameOuter", dur: "1.1s" },
  { d: "M -46 0 C -54 -50 -24 -90 -6 -150 C 10 -96 36 -80 30 -30 C 48 -52 50 -18 46 0 Z", fill: "flameMid", dur: ".8s" },
  { d: "M -24 0 C -30 -34 -12 -60 0 -96 C 10 -60 26 -44 22 0 Z", fill: "flameCore", dur: ".6s" },
];

function Sitter({ x, facing }: { x: number; facing: 1 | -1 }) {
  const rim = facing === 1 ? "M 46 -40 C 60 -110 50 -170 20 -196" : "M -46 -40 C -60 -110 -50 -170 -20 -196";
  const headRim = facing === 1 ? "M 30 -236 A 36 40 0 0 0 4 -270" : "M -30 -236 A 36 40 0 0 1 -4 -270";
  return (
    <g transform={`translate(${x} 800)`}>
      <path d="M -70 0 C -74 -60 -64 -130 -30 -186 C -10 -204 10 -204 30 -186 C 64 -130 74 -60 70 0 Z" fill="#0a0705" />
      <ellipse cx={facing * 8} cy="-236" rx="36" ry="40" fill="#0a0705" />
      <g className="fireFlicker">
        <path d={rim} stroke="#ff9a3c" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".85" />
        <path d={headRim} stroke="#ffb45a" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".85" transform={`translate(${facing * 8} 0)`} />
      </g>
    </g>
  );
}

export function CampfireShot() {
  return (
    <svg className="shotArt" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${P}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141d33" />
          <stop offset=".45" stopColor="#3c4766" />
          <stop offset=".72" stopColor="#c98d63" />
          <stop offset=".8" stopColor="#e9b37a" />
        </linearGradient>
        <radialGradient id={`${P}-glow`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffb04a" stopOpacity=".85" />
          <stop offset=".4" stopColor="#ff7a1e" stopOpacity=".35" />
          <stop offset="1" stopColor="#ff7a1e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${P}-flameOuter`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#e2471f" />
          <stop offset=".6" stopColor="#ff8a2a" />
          <stop offset="1" stopColor="#ff8a2a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${P}-flameMid`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff9d2e" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${P}-flameCore`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff2c4" />
          <stop offset="1" stopColor="#ffe08a" stopOpacity=".4" />
        </linearGradient>
        <filter id={`${P}-soft`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
        <filter id={`${P}-smoke`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="18" /></filter>
      </defs>

      <rect width="1600" height="900" fill={`url(#${P}-sky)`} />
      <g fill="#fff6e0">{stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />)}</g>

      <path d="M 0 560 L 180 470 L 360 540 L 560 430 L 760 520 L 980 440 L 1180 530 L 1400 450 L 1600 520 L 1600 640 L 0 640 Z" fill="#6c6f86" opacity=".7" />
      <path d="M 0 610 L 220 540 L 430 600 L 640 530 L 880 610 L 1100 550 L 1340 615 L 1600 560 L 1600 700 L 0 700 Z" fill="#3a3f56" />
      <g fill="#1f2333">
        {trees.map((t, i) => <path key={i} d={`M ${t.x} ${t.y - t.h} L ${t.x - t.h * 0.28} ${t.y} L ${t.x + t.h * 0.28} ${t.y} Z`} />)}
      </g>
      <path d="M 0 690 C 400 660 1200 660 1600 690 L 1600 900 L 0 900 Z" fill="#120d0a" />

      {/* Firelight on the ground and in the air. */}
      <g className="fireFlicker" style={{ mixBlendMode: "screen" }}>
        <circle cx={FIRE.x} cy={FIRE.y - 60} r="460" fill={`url(#${P}-glow)`} />
        <ellipse cx={FIRE.x} cy={FIRE.y + 20} rx="520" ry="90" fill={`url(#${P}-glow)`} />
      </g>

      {/* Smoke drifting up. */}
      <g filter={`url(#${P}-smoke)`}>
        {[0, 1, 2].map((i) => <ellipse key={i} className="smoke" cx={FIRE.x + i * 20} cy={FIRE.y - 160} rx="46" ry="36" fill="#c9c2bb" style={{ animationDelay: `${-i * 2}s` }} />)}
      </g>

      {/* Logs and flames. */}
      <g transform={`translate(${FIRE.x} ${FIRE.y}) scale(1.25)`}>
        <rect x="-110" y="-12" width="220" height="26" rx="12" fill="#2a160c" transform="rotate(12)" />
        <rect x="-110" y="-12" width="220" height="26" rx="12" fill="#22120a" transform="rotate(-14)" />
        <g filter={`url(#${P}-soft)`} style={{ mixBlendMode: "screen" }}>
          {FLAMES.map((f) => (
            <path key={f.fill} className="flame" d={f.d} fill={`url(#${P}-${f.fill})`} style={{ animationDuration: f.dur }} />
          ))}
        </g>
      </g>

      {/* Sparks. */}
      <g>
        {embers.map((e) => (
          <circle
            key={e.key}
            className="ember"
            cx={e.x}
            cy={FIRE.y - 90}
            r={e.r}
            fill="#ffc86b"
            style={{ animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`, "--drift": `${e.drift}px` } as CSSProperties}
          />
        ))}
      </g>

      <Sitter x={250} facing={1} />
      <Sitter x={750} facing={-1} />
    </svg>
  );
}
