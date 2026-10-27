// Seeded generator so server and client render the same SVG.
export function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export type Building = { x: number; width: number; height: number };

export function skyline(seed: number, minHeight: number, maxHeight: number, minWidth = 60, widthRange = 110): Building[] {
  const next = random(seed);
  const buildings: Building[] = [];
  for (let x = -20; x < 1620; ) {
    const width = minWidth + next() * widthRange;
    buildings.push({ x, width, height: minHeight + next() * (maxHeight - minHeight) });
    x += width + next() * 8;
  }
  return buildings;
}
