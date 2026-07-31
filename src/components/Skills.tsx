"use client";

import Reveal, { RevealGroup, RevealItem } from "./Reveal";
import TiltCard from "./TiltCard";
import { skillGroups } from "@content/resume";
import { useRecruiterMode } from "./RecruiterMode";

export default function Skills() {
  const { enabled: recruiterMode } = useRecruiterMode();

  return (
    <section id="skills">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">03 · the stack</div>
        </Reveal>
        <Reveal delay={0.05} className="sectionhead">
          <h2>
            {recruiterMode ? <>Core stack for <span className="accentword">high-leverage teams</span>.</> : <>Tools I reach for, <span className="accentword">by default</span>.</>}
          </h2>
          <p className="sub">{recruiterMode ? "The capabilities most relevant to engineering leadership and AI platform roles." : "Starred items are where I go deepest."}</p>
        </Reveal>

        <RevealGroup className="matrix" stagger={0.06}>
          {skillGroups.map((group, i) => (
            <RevealItem key={group.title} variant="scale">
              <TiltCard className="cell">
                <div className="h">
                  <span className="idx">/{String(i + 1).padStart(2, "0")}</span> {group.title}
                </div>
                <ul>
                  {(group.star ?? []).map((s) => (
                    <li className="star" key={s}>
                      ★ {s}
                    </li>
                  ))}
                  {group.skills.slice(0, recruiterMode ? 5 : undefined).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </TiltCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
