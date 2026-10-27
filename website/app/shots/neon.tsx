// Shot 2: a Taiwanese street on a rainy night. Vertical shop signs stack up
// both sides toward the far end, the wet road mirrors them, and the two walk
// away under one umbrella. One pink sign flickers.
import { random } from "./random";

const P = "neon";
const FONT = "\"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", sans-serif";
const VP = { x: 800, y: 470 };

type Sign = { side: -1 | 1; x: number; s: number; chars: string; panel: string; ink: string; glow: string; flicker?: boolean };

// Lightbox signs: x is where the sign meets the facade, s its perspective scale.
const SIGNS: Sign[] = [
  { side: -1, x: 70, s: 1, chars: "藥局", panel: "#fff3c4", ink: "#d7261e", glow: "#ffcf5a" },
  { side: -1, x: 270, s: 0.66, chars: "拉麵", panel: "#2a0b1f", ink: "#ffe1f0", glow: "#ff3fa0", flicker: true },
  { side: -1, x: 400, s: 0.46, chars: "牙科", panel: "#e9f6ff", ink: "#1a5fd6", glow: "#bfe2ff" },
  { side: -1, x: 488, s: 0.34, chars: "小吃", panel: "#ffd9a0", ink: "#b3200f", glow: "#ffae4a" },
  { side: -1, x: 550, s: 0.25, chars: "旅社", panel: "#ff4f9a", ink: "#fff3f8", glow: "#ff4f9a" },
  { side: 1, x: 1530, s: 1, chars: "冰店", panel: "#0c2a33", ink: "#d9fbff", glow: "#3fe0ff" },
  { side: 1, x: 1330, s: 0.66, chars: "眼鏡", panel: "#f2fbff", ink: "#0a7c8f", glow: "#9feaff" },
  { side: 1, x: 1200, s: 0.46, chars: "珍奶", panel: "#163a5c", ink: "#e6f4ff", glow: "#4aa8ff" },
  { side: 1, x: 1112, s: 0.34, chars: "書局", panel: "#fff7d6", ink: "#1d5a2e", glow: "#fff0a8" },
  { side: 1, x: 1050, s: 0.25, chars: "網咖", panel: "#3fe0ff", ink: "#05232b", glow: "#3fe0ff" },
];

// Facade lines converge on the vanishing point.
function facadeTop(x: number, side: -1 | 1) {
  const near = side === -1 ? 0 : 1600;
  const t = (x - near) / (VP.x - near);
  return -60 + t * (VP.y - 170 - -60);
}

function facadeBottom(x: number, side: -1 | 1) {
  const near = side === -1 ? 0 : 1600;
  const t = (x - near) / (VP.x - near);
  return 900 + t * (VP.y + 50 - 900);
}

// Windows on the upper floors, drawn as quads that follow the facade's
// perspective so rows converge on the vanishing point.
function facadeY(x: number, side: -1 | 1, frac: number) {
  const top = facadeTop(x, side);
  return top + frac * (facadeBottom(x, side) - top);
}

const windows = (() => {
  const next = random(33);
  const quads: { d: string; o: number }[] = [];
  for (const side of [-1, 1] as const) {
    const near = side === -1 ? 0 : 1600;
    const far = side === -1 ? 640 : 960;
    for (let floor = 0; floor < 3; floor++) {
      const a = 0.1 + floor * 0.17;
      const b = a + 0.09;
      for (let k = 0; k < 11; k++) {
        if (next() > 0.5) continue;
        const t0 = Math.pow(k / 11, 0.7);
        const t1 = Math.pow((k + 0.55) / 11, 0.7);
        const x0 = near + (far - near) * t0;
        const x1 = near + (far - near) * t1;
        quads.push({
          d: `M ${x0} ${facadeY(x0, side, a)} L ${x1} ${facadeY(x1, side, a)} L ${x1} ${facadeY(x1, side, b)} L ${x0} ${facadeY(x0, side, b)} Z`,
          o: 0.18 + next() * 0.4,
        });
      }
    }
  }
  return quads;
})();

const floorLines = [0.08, 0.25, 0.42, 0.59].flatMap((frac) =>
  ([-1, 1] as const).map((side) => {
    const near = side === -1 ? 0 : 1600;
    const far = side === -1 ? 640 : 960;
    return `M ${near} ${facadeY(near, side, frac)} L ${far} ${facadeY(far, side, frac)}`;
  }),
);

const rain = (() => {
  const next = random(47);
  return Array.from({ length: 70 }, () => ({ x: next() * 1700 - 50, y: next() * 900, len: 18 + next() * 26, o: 0.12 + next() * 0.22 }));
})();

function SignBox({ sign }: { sign: Sign }) {
  const w = 120 * sign.s;
  const h = 300 * sign.s;
  const left = sign.side === -1 ? sign.x : sign.x - w;
  const top = facadeTop(sign.x, sign.side) + 150 * sign.s;
  const fontSize = 92 * sign.s;
  const chars = [...sign.chars];
  const body = (
    <g>
      <rect x={left - w * 0.35} y={top} width={w * 1.7} height={h} rx={12 * sign.s} fill={sign.glow} opacity=".55" filter={`url(#${P}-halo)`} style={{ mixBlendMode: "screen" }} />
      <rect x={left} y={top} width={w} height={h} rx={8 * sign.s} fill={sign.panel} stroke="#0a0710" strokeWidth={6 * sign.s} />
      <g fontFamily={FONT} fontWeight="800" fontSize={fontSize} textAnchor="middle" fill={sign.ink}>
        {chars.map((c, i) => <text key={i} x={left + w / 2} y={top + h * (0.38 + i * 0.42)}>{c}</text>)}
      </g>
    </g>
  );
  return sign.flicker ? <g className="neonFlicker">{body}</g> : body;
}

function Reflection({ sign }: { sign: Sign }) {
  const w = 120 * sign.s;
  const left = sign.side === -1 ? sign.x : sign.x - w;
  const y = facadeBottom(sign.x, sign.side) - 40 * sign.s;
  const rect = <rect x={left} y={y} width={w} height={260 * sign.s + 60} fill={sign.glow} opacity=".42" />;
  return sign.flicker ? <g className="neonFlicker">{rect}</g> : rect;
}

export function NeonShot() {
  return (
    <svg className="shotArt" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${P}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0717" />
          <stop offset="1" stopColor="#2a1640" />
        </linearGradient>
        <linearGradient id={`${P}-road`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1230" />
          <stop offset="1" stopColor="#06040b" />
        </linearGradient>
        <filter id={`${P}-halo`} x="-60%" y="-30%" width="220%" height="160%"><feGaussianBlur stdDeviation="22" /></filter>
        <filter id={`${P}-reflect`} x="-50%" y="-20%" width="200%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".03 .004" numOctaves="1" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="40" xChannelSelector="R" yChannelSelector="G" result="w" />
          <feGaussianBlur in="w" stdDeviation="8 16" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill={`url(#${P}-sky)`} />

      {/* Far end of the street. */}
      <path d={`M 640 ${VP.y - 170} H 960 V ${VP.y + 50} H 640 Z`} fill="#140b26" />
      <g fill="#ffd28a" opacity=".5">
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={656 + i * 58} y={VP.y - 140} width="30" height="22" />)}
        {[0, 1, 2, 3].map((i) => <rect key={i} x={680 + i * 62} y={VP.y - 90} width="30" height="22" />)}
      </g>
      <circle cx={VP.x - 40} cy={VP.y + 20} r="7" fill="#ff3b3b" />
      <circle cx={VP.x + 40} cy={VP.y + 20} r="7" fill="#ff3b3b" />

      {/* Facades with arcades at street level. */}
      <path d={`M 0 -60 L 640 ${VP.y - 170} L 640 ${VP.y + 50} L 0 900 Z`} fill="#140c24" />
      <path d={`M 1600 -60 L 960 ${VP.y - 170} L 960 ${VP.y + 50} L 1600 900 Z`} fill="#110a20" />
      <g fill="#ffcf8a">
        {windows.map((w, i) => <path key={i} d={w.d} opacity={w.o} />)}
      </g>
      <g stroke="#26183a" strokeWidth="4">
        {floorLines.map((d) => <path key={d} d={d} />)}
      </g>
      <path d={`M 0 640 L 640 ${VP.y + 10}`} stroke="#2b1c40" strokeWidth="10" />
      <path d={`M 1600 640 L 960 ${VP.y + 10}`} stroke="#2b1c40" strokeWidth="10" />
      <path d={`M 0 640 L 640 ${VP.y + 10} L 640 ${VP.y + 50} L 0 900 Z`} fill="#ffb35c" opacity=".18" />
      <path d={`M 1600 640 L 960 ${VP.y + 10} L 960 ${VP.y + 50} L 1600 900 Z`} fill="#9fd8ff" opacity=".12" />

      {/* Overhead wires. */}
      <g stroke="#06030c" strokeWidth="2.5" fill="none" opacity=".8">
        <path d="M 0 90 Q 800 220 1600 70" />
        <path d="M 0 150 Q 760 260 1600 130" />
        <path d="M 120 0 Q 640 240 1600 200" />
      </g>

      {/* Wet road. */}
      <path d={`M 0 900 L 640 ${VP.y + 50} L 960 ${VP.y + 50} L 1600 900 Z`} fill={`url(#${P}-road)`} />
      <g stroke="#e8e2f5" strokeOpacity=".22" strokeWidth="6" strokeDasharray="40 50">
        <path d={`M ${VP.x} ${VP.y + 52} L ${VP.x} 900`} />
      </g>
      <g filter={`url(#${P}-reflect)`} style={{ mixBlendMode: "screen" }}>
        {SIGNS.map((s) => <Reflection key={s.chars} sign={s} />)}
      </g>

      {SIGNS.slice().sort((a, b) => a.s - b.s).map((s) => <SignBox key={s.chars} sign={s} />)}

      {/* Two under one umbrella, walking away. */}
      <g transform="translate(400 880) scale(.92)">
        <g className="walkerBob">
          <path d="M -88 0 L -76 -150 C -80 -196 -66 -214 -46 -218 L -12 -218 C 4 -214 10 -196 8 -150 L 14 0 Z" fill="#05030a" />
          <ellipse cx="-30" cy="-246" rx="25" ry="30" fill="#05030a" />
          <path d="M -6 0 L 4 -140 C 0 -186 14 -206 34 -210 L 64 -210 C 82 -206 88 -186 84 -140 L 92 0 Z" fill="#05030a" />
          <ellipse cx="48" cy="-238" rx="23" ry="28" fill="#05030a" />
          <path d="M 48 -262 C 70 -258 74 -220 64 -196" stroke="#05030a" strokeWidth="18" fill="none" strokeLinecap="round" />
          <line x1="8" y1="-180" x2="8" y2="-330" stroke="#05030a" strokeWidth="5" />
          <path d="M -160 -300 Q 8 -420 176 -300 Q 134 -316 92 -300 Q 50 -318 8 -300 Q -34 -318 -76 -300 Q -118 -316 -160 -300 Z" fill="#0a0612" />
          <path d="M -160 -300 Q 8 -420 176 -300" stroke="#ff4fa3" strokeWidth="4" fill="none" opacity=".8" className="neonFlicker" />
          <path d="M 8 -362 Q 120 -350 176 -300" stroke="#3fe0ff" strokeWidth="4" fill="none" opacity=".8" />
          <path d="M -76 -150 C -80 -196 -66 -214 -46 -218" stroke="#ff4fa3" strokeWidth="3" fill="none" opacity=".7" className="neonFlicker" />
          <path d="M 84 -140 C 88 -186 82 -206 64 -210" stroke="#3fe0ff" strokeWidth="3" fill="none" opacity=".7" />
        </g>
      </g>

      {/* Light rain. */}
      <g className="rainFall" stroke="#d9d2ff" strokeWidth="2" strokeLinecap="round">
        {rain.map((r, i) => <line key={i} x1={r.x} y1={r.y} x2={r.x - r.len * 0.18} y2={r.y + r.len} opacity={r.o} />)}
        {rain.map((r, i) => <line key={`b${i}`} x1={r.x} y1={r.y - 900} x2={r.x - r.len * 0.18} y2={r.y - 900 + r.len} opacity={r.o} />)}
      </g>
    </svg>
  );
}
