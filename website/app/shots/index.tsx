import type { CSSProperties, ReactNode } from "react";
import { CampfireShot } from "./campfire";
import { DuskShot } from "./dusk";
import { ForestShot } from "./forest";
import { NeonShot } from "./neon";

// Four shots play in turn over one --cue-cycle, one per subtitle. Each shot
// and its ambient light share the same delay, so the glow around the player
// changes color and flickers in step with the picture.
const SHOTS: { key: string; art: ReactNode }[] = [
  { key: "dusk", art: <DuskShot /> },
  { key: "neon", art: <NeonShot /> },
  { key: "forest", art: <ForestShot /> },
  { key: "campfire", art: <CampfireShot /> },
];

export function Shots() {
  return (
    <>
      {SHOTS.map((shot, index) => (
        <div key={shot.key} className={`shot shot-${shot.key}`} style={{ "--i": index } as CSSProperties}>
          {shot.art}
        </div>
      ))}
      <div className="grain" />
    </>
  );
}

export function AmbientLights() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="shot ambientShot ambient-dusk" style={{ "--i": 0 } as CSSProperties}>
        <span className="glow glowLeft" />
        <span className="glow glowRight" />
      </div>
      <div className="shot ambientShot ambient-neon" style={{ "--i": 1 } as CSSProperties}>
        <span className="glow glowLeft neonFlicker" />
        <span className="glow glowRight" />
      </div>
      <div className="shot ambientShot ambient-forest" style={{ "--i": 2 } as CSSProperties}>
        <span className="glow glowLeft" />
        <span className="glow glowRight" />
        <span className="glow glowLeft glowFlash lightning" />
        <span className="glow glowRight glowFlash lightning" />
      </div>
      <div className="shot ambientShot ambient-campfire" style={{ "--i": 3 } as CSSProperties}>
        <span className="glow glowLeft fireFlicker" />
        <span className="glow glowRight fireFlicker" />
      </div>
    </div>
  );
}
