"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import Reveal from "./Reveal";
import { experience } from "@content/resume";

export default function Experience() {
  const wrapRef = useRef<HTMLDivElement>(null);
  // The accent rail fills as this block scrolls through the viewport.
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start 70%", "end 65%"],
  });
  const scaleY = useSpring(scrollYProgress, { stiffness: 90, damping: 30, restDelta: 0.001 });

  return (
    <section id="work">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">02 · selected experience</div>
        </Reveal>
        <Reveal delay={0.05} className="sectionhead">
          <h2>
            Eleven years, one <span className="accentword">throughline</span>.
          </h2>
          <p className="sub">
            Rails at the core the whole way — and, increasingly, AI systems built to earn their keep in
            production.
          </p>
        </Reveal>

        <div className="tlwrap" ref={wrapRef}>
          <div className="tlrail">
            <motion.div className="fill" style={{ scaleY }} />
          </div>
          <div className="tl">
            {experience.map((job, i) => (
              <Reveal key={`${job.company}-${i}`} delay={Math.min(i * 0.02, 0.12)} amount={0.25}>
                <div className={`job${job.now ? " now" : ""}`}>
                  <div className="when">
                    {job.now && (
                      <span className="nowtag">
                        <i /> NOW
                      </span>
                    )}
                    {job.period}
                  </div>
                  <div>
                    <h3>{job.role}</h3>
                    <div className="co">{job.company}</div>
                    <p>{job.summary}</p>
                    <div className="stack">
                      {job.stack.map((s) => (
                        <span className="chip" key={s}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
