"use client";

import Reveal from "./Reveal";
import { profile } from "@content/resume";

const DETAILS = [
  { label: "Date of birth", value: profile.dateOfBirth },
  { label: "Languages", value: profile.languages.join(", ") },
  { label: "Hobbies", value: profile.hobbies.join(", ") },
  { label: "Marital status", value: profile.maritalStatus },
];

export default function PersonalDetails() {
  return (
    <section id="personal">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">04 · personal details</div>
        </Reveal>
        <Reveal delay={0.05} className="sectionhead">
          <h2>
            A little more <span className="accentword">context</span>.
          </h2>
          <p className="sub">Personal details for a complete résumé profile.</p>
        </Reveal>
        <Reveal delay={0.1} variant="scale">
          <dl className="personalGrid">
            {DETAILS.map((detail) => (
              <div className="personalItem" key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
