// Illustrated rooftop-at-dusk frame for the hero player. Building and window
// layouts come from a fixed seed so server and client render the same SVG.

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

type Building = { x: number; width: number; height: number };

function skyline(seed: number, minHeight: number, maxHeight: number): Building[] {
  const next = random(seed);
  const buildings: Building[] = [];
  for (let x = -20; x < 1620; ) {
    const width = 60 + next() * 110;
    buildings.push({ x, width, height: minHeight + next() * (maxHeight - minHeight) });
    x += width + next() * 8;
  }
  return buildings;
}

const horizon = 720;
const farCity = skyline(7, 80, 230);
const nearCity = skyline(23, 90, 290);

const windows = (() => {
  const next = random(91);
  const lit: { x: number; y: number; opacity: number; twinkle: boolean }[] = [];
  for (const building of nearCity) {
    for (let y = horizon - building.height + 24; y < horizon - 20; y += 26) {
      for (let x = building.x + 12; x < building.x + building.width - 16; x += 22) {
        if (next() < 0.32) lit.push({ x, y, opacity: 0.35 + next() * 0.6, twinkle: next() < 0.08 });
      }
    }
  }
  return lit;
})();

const bulbs = Array.from({ length: 13 }, (_, index) => {
  const t = index / 12;
  return { x: 40 + t * 760, y: 70 + Math.sin(t * Math.PI) * 120 };
});

const bokeh = [
  { x: 180, y: 300, r: 46, color: "#ffcf86", opacity: 0.22 },
  { x: 1380, y: 220, r: 64, color: "#ff9d6b", opacity: 0.16 },
  { x: 1480, y: 520, r: 38, color: "#ffe2a8", opacity: 0.2 },
  { x: 90, y: 620, r: 30, color: "#ffb37a", opacity: 0.18 },
  { x: 980, y: 140, r: 28, color: "#ffd9a0", opacity: 0.14 },
];

export function SceneArt({ idPrefix = "scene" }: { idPrefix?: string }) {
  return (
    <svg className="sceneArt" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${idPrefix}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#151c33" />
          <stop offset=".3" stopColor="#4b3a5e" />
          <stop offset=".48" stopColor="#c7654a" />
          <stop offset=".64" stopColor="#f2a057" />
        </linearGradient>
        <radialGradient id={`${idPrefix}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1c9" />
          <stop offset=".18" stopColor="#ffd48a" stopOpacity=".95" />
          <stop offset=".5" stopColor="#ff9e5e" stopOpacity=".35" />
          <stop offset="1" stopColor="#ff9e5e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${idPrefix}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb878" stopOpacity="0" />
          <stop offset="1" stopColor="#ffb878" stopOpacity=".35" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-rim`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb469" />
          <stop offset=".35" stopColor="#ffb469" stopOpacity="0" />
        </linearGradient>
        <filter id={`${idPrefix}-soft`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id={`${idPrefix}-glow`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5" /></filter>
      </defs>

      <rect width="1600" height="1000" fill={`url(#${idPrefix}-sky)`} />
      <circle className="sceneSun" cx="1290" cy="560" r="300" fill={`url(#${idPrefix}-sun)`} />

      <g fill="#6a4a63" opacity=".75">
        {farCity.map((b) => <rect key={b.x} x={b.x} y={horizon - b.height} width={b.width} height={b.height + 10} />)}
      </g>
      <rect y={horizon - 260} width="1600" height="270" fill={`url(#${idPrefix}-haze)`} />

      <g fill="#2a1f2e">
        {nearCity.map((b) => <rect key={b.x} x={b.x} y={horizon - b.height + 40} width={b.width} height={b.height} />)}
      </g>
      <g fill="#ffcf7a">
        {windows.map((w) => (
          <rect key={`${w.x}-${w.y}`} className={w.twinkle ? "sceneTwinkle" : undefined} x={w.x} y={w.y + 40} width="9" height="12" opacity={w.opacity} />
        ))}
      </g>

      <path d={`M 20 60 ${bulbs.map((b) => `L ${b.x} ${b.y}`).join(" ")} L 830 60`} fill="none" stroke="#1a1418" strokeWidth="3" />
      <g>
        {bulbs.map((b) => (
          <g key={b.x}>
            <circle cx={b.x} cy={b.y + 10} r="16" fill="#ffd28a" opacity=".5" filter={`url(#${idPrefix}-glow)`} />
            <circle cx={b.x} cy={b.y + 10} r="6" fill="#fff0c4" />
          </g>
        ))}
      </g>

      <rect y="800" width="1600" height="200" fill="#0f0b10" />
      <rect y="792" width="1600" height="12" fill="#2b2026" />
      <rect y="792" width="1600" height="3" fill="#ffb469" opacity=".35" />

      <g className="sceneFigures">
        <g transform="translate(1170 800)">
          <path d="M -92 0 C -96 -110 -70 -180 0 -186 C 70 -180 96 -110 92 0 Z" fill="#0b080c" />
          <circle cx="0" cy="-232" r="52" fill="#0b080c" />
          <path d="M -92 0 C -96 -110 -70 -180 0 -186 C 70 -180 96 -110 92 0 Z" fill="none" stroke={`url(#${idPrefix}-rim)`} strokeWidth="5" opacity=".7" />
          <circle cx="0" cy="-232" r="52" fill="none" stroke={`url(#${idPrefix}-rim)`} strokeWidth="5" opacity=".7" />
        </g>
        <g transform="translate(1410 800) rotate(-4)">
          <path d="M -80 0 C -84 -96 -60 -160 0 -166 C 60 -160 84 -96 80 0 Z" fill="#0b080c" />
          <circle cx="0" cy="-208" r="46" fill="#0b080c" />
          <circle cx="-8" cy="-256" r="20" fill="#0b080c" />
          <path d="M -80 0 C -84 -96 -60 -160 0 -166 C 60 -160 84 -96 80 0 Z" fill="none" stroke={`url(#${idPrefix}-rim)`} strokeWidth="5" opacity=".7" />
          <circle cx="0" cy="-208" r="46" fill="none" stroke={`url(#${idPrefix}-rim)`} strokeWidth="5" opacity=".7" />
        </g>
      </g>

      <g filter={`url(#${idPrefix}-soft)`}>
        {bokeh.map((b) => <circle key={b.x} className="sceneBokeh" cx={b.x} cy={b.y} r={b.r} fill={b.color} opacity={b.opacity} />)}
      </g>
    </svg>
  );
}
