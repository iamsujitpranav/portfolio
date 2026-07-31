"use client";

import type { CSSProperties } from "react";

export type DisplayVisualTheme =
  | "town"
  | "projector"
  | "career"
  | "blueprint"
  | "signal"
  | "project"
  | "social"
  | "terminal";

const PARTICLES = Array.from({ length: 12 }, (_, index) => index);
const SIGNALS = Array.from({ length: 5 }, (_, index) => index);

export default function DisplayAtmosphere({ theme }: { theme: DisplayVisualTheme }) {
  if (theme === "town") {
    return (
      <div className="jrnAtmosphere jrnAtmosphereTown" aria-hidden="true">
        <svg viewBox="0 0 1000 680" preserveAspectRatio="none">
          <path className="jrnMapContour c1" d="M-40 490C130 280 270 620 470 380S770 180 1040 350" />
          <path className="jrnMapContour c2" d="M-20 550C190 320 310 670 520 430S820 240 1030 410" />
          <path className="jrnMapRoute" d="M80 590C205 530 280 480 350 390S480 310 570 335 720 265 915 115" />
          <circle className="jrnMapPulse" cx="915" cy="115" r="7" />
        </svg>
        <span className="jrnCompassRose">N</span>
        <span className="jrnJournalStamp">FIELD NOTE 01</span>
      </div>
    );
  }

  if (theme === "projector") {
    return (
      <div className="jrnAtmosphere jrnAtmosphereProjector" aria-hidden="true">
        <span className="jrnProjectorLens" />
        <span className="jrnProjectorCone" />
        <span className="jrnFilmStrip">
          <i /><i /><i /><i /><i /><i />
        </span>
        {PARTICLES.map((particle) => (
          <i
            className="jrnProjectorDust"
            key={particle}
            style={{
              "--dust-x": `${4 + particle * 8}%`,
              "--dust-y": `${12 + particle * 5.8}%`,
              "--dust-duration": `${4 + particle * 0.17}s`,
              "--dust-delay": `${particle * -0.41}s`,
            } as CSSProperties}
          />
        ))}
      </div>
    );
  }

  if (theme === "career") {
    return (
      <div className="jrnAtmosphere jrnAtmosphereCareer" aria-hidden="true">
        <span className="jrnReel reelA"><i /><i /><i /></span>
        <span className="jrnReel reelB"><i /><i /><i /></span>
        <span className="jrnCareerBeam" />
        <span className="jrnFrameCounter">REC • CAREER CUT</span>
      </div>
    );
  }

  if (theme === "blueprint") {
    return (
      <div className="jrnAtmosphere jrnAtmosphereBlueprint" aria-hidden="true">
        <svg viewBox="0 0 1000 680" preserveAspectRatio="none">
          <path className="jrnCircuitPath p1" d="M20 120H210L285 205H480L555 115H780L850 185H1010" />
          <path className="jrnCircuitPath p2" d="M-10 570H180L245 505H430L515 595H730L805 520H1010" />
          <path className="jrnCircuitPath p3" d="M610 -10V120L680 190V365L590 450V690" />
          {[["210", "120"], ["285", "205"], ["555", "115"], ["850", "185"], ["245", "505"], ["515", "595"], ["805", "520"], ["680", "365"]].map(([cx, cy]) => (
            <circle className="jrnCircuitNode" cx={cx} cy={cy} r="5" key={`${cx}-${cy}`} />
          ))}
        </svg>
        <span className="jrnBlueprintReadout">SYSTEM MAP // LIVE</span>
      </div>
    );
  }

  if (theme === "signal" || theme === "social") {
    return (
      <div className="jrnAtmosphere jrnAtmosphereSignal" aria-hidden="true">
        <span className="jrnRadar">
          <i className="jrnRadarSweep" />
          {SIGNALS.map((signal) => (
            <b
              key={signal}
              style={{
                "--signal-x": `${18 + signal * 14}%`,
                "--signal-y": `${23 + signal * 9}%`,
                "--signal-duration": `${1.4 + signal * 0.22}s`,
              } as CSSProperties}
            />
          ))}
        </span>
        <span className="jrnSignalWave"><i /><i /><i /><i /><i /></span>
        <span className="jrnSignalStatus">SIGNAL LOCKED</span>
      </div>
    );
  }

  if (theme === "terminal") {
    return (
      <div className="jrnAtmosphere jrnAtmosphereTerminal" aria-hidden="true">
        {PARTICLES.map((particle) => (
          <span
            key={particle}
            style={{
              "--code-x": `${particle * 8.7}%`,
              "--code-duration": `${5 + particle * 0.3}s`,
              "--code-delay": `${particle * -0.55}s`,
            } as CSSProperties}
          >
            01<br />10<br />AI<br />01
          </span>
        ))}
        <i className="jrnTerminalScan" />
      </div>
    );
  }

  return (
    <div className="jrnAtmosphere jrnAtmosphereProject" aria-hidden="true">
      <span className="jrnGear gearA"><i /><i /><i /><i /><i /><i /></span>
      <span className="jrnGear gearB"><i /><i /><i /><i /><i /><i /></span>
      <span className="jrnDraftLine lineA" />
      <span className="jrnDraftLine lineB" />
      <span className="jrnProjectStamp">ENGINEERED · SHIPPED</span>
    </div>
  );
}
