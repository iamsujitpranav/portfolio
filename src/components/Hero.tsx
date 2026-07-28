"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import Reveal from "./Reveal";
import Magnetic from "./Magnetic";
import CountUp from "./CountUp";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { profile, metrics } from "@content/resume";

// WebGL must be client-only.
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

const ROLES = [
  "Engineering Lead",
  "AI Systems Builder",
  "Ruby on Rails · 11 yrs",
  "LLM · RAG · MCP",
  "Monolith → Microservices",
];

// Two display lines; the second is accented.
const LINES = [
  { text: "SUJIT PRANAV", accent: false },
  { text: "REDDY", accent: true },
];

export default function Hero() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (reduce) return; // static role rendered below; no typing animation
    let ri = 0;
    let ci = 0;
    let del = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = ROLES[ri];
      setTyped(word.slice(0, ci));
      if (!del && ci < word.length) { ci++; timer = setTimeout(tick, 55); }
      else if (!del && ci === word.length) { del = true; timer = setTimeout(tick, 1500); }
      else if (del && ci > 0) { ci--; timer = setTimeout(tick, 26); }
      else { del = false; ri = (ri + 1) % ROLES.length; timer = setTimeout(tick, 340); }
    };
    timer = setTimeout(tick, 1100);
    return () => clearTimeout(timer);
  }, [reduce]);

  let li = 0; // running letter index across lines for stagger

  return (
    <section className="hero" id="top">
      <HeroCanvas />
      <div className="wrap heroInner">
        <motion.div
          className="tag"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {"//"} <span className="k">engineering_lead</span> · {profile.yearsExperience}+ yrs · {profile.location}
        </motion.div>

        <h1 aria-label={LINES.map((l) => l.text).join(" ")}>
          {LINES.map((line, lineIdx) => (
            <span className="line" key={lineIdx}>
              {line.text.split("").map((ch) => {
                const delay = 0.18 + li * 0.028;
                li++;
                return (
                  <motion.span
                    key={li}
                    className={line.accent ? "accentword" : undefined}
                    style={{ display: "inline-block", whiteSpace: "pre" }}
                    initial={{ y: "110%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    transition={{ duration: 0.7, delay, ease: [0.2, 0.75, 0.2, 1] }}
                  >
                    {ch}
                  </motion.span>
                );
              })}
            </span>
          ))}
        </h1>

        <div className="typedline" aria-live="polite">
          <span className="lead">{"> "}</span>
          {reduce ? ROLES[0] : typed}
          <span className="cursor" />
        </div>

        <Reveal delay={0.05}>
          <p className="lede">
            I build <b>scalable SaaS platforms</b> and modernize applications across both monoliths and microservices — and for the
            last <b>{profile.yearsAI}+ years</b>, I&apos;ve shipped <b>AI-native systems</b>: LLM integrations,
            RAG, agentic workflows with MCP, semantic search, and recommendation engines in production.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="cta-row">
            <Magnetic strength={0.35}>
              <a className="btn primary" href="#ask" data-cursor>◈ Ask my résumé anything</a>
            </Magnetic>
            <Magnetic strength={0.35}>
              <a className="btn" href="#work" data-cursor>View experience →</a>
            </Magnetic>
            <Magnetic strength={0.35}>
              <a className="btn" href={`mailto:${profile.email}`} data-cursor>Get in touch</a>
            </Magnetic>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="metrics">
            {metrics.map((m) => (
              <div className="metric" key={m.label}>
                <CountUp value={m.value} />
                <div className="l">{m.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <div className="scrollcue" aria-hidden="true">
        <span>scroll</span>
        <span className="track" />
      </div>
    </section>
  );
}
