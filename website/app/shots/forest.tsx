// Shot 3: lost in a forest on a stormy night, which fits "We're not out of
// the woods yet." Two figures sweep flashlights through the fog between pine
// silhouettes, and lightning flashes the whole frame white twice.
import { random } from "./random";

const P = "forest";

function pine(x: number, base: number, h: number) {
  const w = h * 0.34;
  const tiers = [0, 0.28, 0.52].map((t, i) => {
    const top = base - h + t * h;
    const half = w * (0.55 + i * 0.25);
    return `M ${x} ${top} L ${x + half} ${top + h * 0.42} L ${x - half} ${top + h * 0.42} Z`;
  });
  return `${tiers.join(" ")} M ${x - w * 0.06} ${base - h * 0.1} h ${w * 0.12} V ${base} h ${-w * 0.12} Z`;
}

function row(seed: number, count: number, base: number, minH: number, maxH: number) {
  const next = random(seed);
  return Array.from({ length: count }, (_, i) => {
    const x = (i / count) * 1700 - 50 + next() * 60;
    return pine(x, base + next() * 20, minH + next() * (maxH - minH));
  }).join(" ");
}

const FAR = row(3, 22, 600, 220, 320);
const MID = row(11, 14, 680, 320, 460);
// Only the frame edges get foreground trees, so the figures stay in view.
const NEAR = [pine(-30, 960, 860), pine(1630, 960, 820), pine(1500, 980, 560)].join(" ");

const fog = [
  { y: 560, rx: 520, ry: 60, o: 0.22, d: "18s" },
  { y: 640, rx: 640, ry: 70, o: 0.18, d: "24s" },
  { y: 720, rx: 560, ry: 60, o: 0.16, d: "20s" },
];

function Figure({ x, scale, hood = false }: { x: number; scale: number; hood?: boolean }) {
  return (
    <g transform={`translate(${x} 780) scale(${scale})`}>
      <path d="M -40 0 L -34 -130 C -38 -190 -24 -214 0 -218 C 24 -214 38 -190 34 -130 L 40 0 Z" fill="#04070b" />
      {hood
        ? <path d="M -34 -232 C -38 -290 38 -294 34 -232 C 30 -210 -30 -210 -34 -232 Z" fill="#04070b" />
        : <ellipse cx="0" cy="-246" rx="25" ry="30" fill="#04070b" />}
      <path d="M 26 -170 L 74 -150" stroke="#04070b" strokeWidth="16" strokeLinecap="round" />
      <rect x="70" y="-160" width="22" height="13" rx="3" fill="#1b2026" />
      <circle cx="94" cy="-153" r="6" fill="#fff4d0" />
    </g>
  );
}

export function ForestShot() {
  return (
    <svg className="shotArt" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${P}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05091a" />
          <stop offset=".6" stopColor="#0f1d38" />
          <stop offset="1" stopColor="#1a2c4a" />
        </linearGradient>
        <linearGradient id={`${P}-beam`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff2c8" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff2c8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${P}-moon`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#dfe8ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#dfe8ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${P}-fog`} x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="30" /></filter>
        <filter id={`${P}-beamBlur`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8" /></filter>
        <filter id={`${P}-bolt`} x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      <rect width="1600" height="900" fill={`url(#${P}-sky)`} />
      <circle cx="1240" cy="170" r="200" fill={`url(#${P}-moon)`} />
      <circle cx="1240" cy="170" r="46" fill="#cfdaf5" opacity=".55" />
      <g fill="#0b1426" opacity=".85">
        <ellipse cx="1180" cy="190" rx="260" ry="44" />
        <ellipse cx="1360" cy="150" rx="200" ry="36" />
        <ellipse cx="420" cy="120" rx="360" ry="54" />
      </g>

      {/* Lightning: the bolt and a flash across the sky. */}
      <g className="lightning">
        <rect width="1600" height="900" fill="#cfe0ff" opacity=".42" style={{ mixBlendMode: "screen" }} />
        <path d="M 980 0 L 940 120 L 990 130 L 920 290 L 970 300 L 880 470" stroke="#e8f0ff" strokeWidth="14" fill="none" filter={`url(#${P}-bolt)`} />
        <path d="M 980 0 L 940 120 L 990 130 L 920 290 L 970 300 L 880 470" stroke="#ffffff" strokeWidth="4" fill="none" />
      </g>

      <path d={FAR} fill="#1b2c44" />
      <g filter={`url(#${P}-fog)`}>
        {fog.map((f) => <ellipse key={f.y} className="fogDrift" cx="800" cy={f.y} rx={f.rx} ry={f.ry} fill="#9fb6d8" opacity={f.o} style={{ animationDuration: f.d }} />)}
      </g>
      <path d={MID} fill="#0d1828" />
      <path d="M 0 760 C 400 730 1200 730 1600 770 L 1600 900 L 0 900 Z" fill="#060b12" />

      {/* Flashlight beams sweeping through the fog. */}
      <g style={{ mixBlendMode: "screen" }} filter={`url(#${P}-beamBlur)`}>
        <g className="beam" style={{ transformOrigin: "456px 643px" }}>
          <polygon points="456,643 1320,440 1360,660" fill={`url(#${P}-beam)`} />
        </g>
        <g className="beam beamLate" style={{ transformOrigin: "592px 655px" }}>
          <polygon points="592,655 1420,540 1400,790" fill={`url(#${P}-beam)`} />
        </g>
      </g>

      <Figure x={380} scale={0.95} hood />
      <Figure x={520} scale={0.88} />

      <path d={NEAR} fill="#03060a" />
    </svg>
  );
}
