"use client";

import { motion } from "framer-motion";
import { useRecruiterMode } from "./RecruiterMode";

// The statement, as segments so highlighted phrases keep their accent styling.
const SEGMENTS: { t: string; hl?: boolean }[] = [
  { t: "Twelve years modernizing large-scale Rails monoliths and the microservices around them — now pointed at the hardest, most interesting layer: making software that " },
  { t: "reasons", hl: true },
  { t: ". From recommendation engines to " },
  { t: "agentic developer workflows", hl: true },
  { t: ", I ship AI that earns its place in production." },
];

// Flatten segments into words, preserving the highlight flag.
const WORDS = SEGMENTS.flatMap((seg) =>
  seg.t.split(/(\s+)/).filter(Boolean).map((w) => ({ w, hl: seg.hl })),
);

export default function Thesis() {
  const { enabled: recruiterMode } = useRecruiterMode();
  const recruiterWords = "Engineering leadership across architecture, delivery, and AI-native products — with Rails depth, Python fluency, and a bias toward systems that hold up in production.".split(/(\s+)/).filter(Boolean).map((w) => ({ w, hl: false }));
  const words = recruiterMode ? recruiterWords : WORDS;

  return (
    <section className="thesis" id="thesis">
      <div className="wrap">
        <motion.div
          className="eyebrow"
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6 }}
        >
          {recruiterMode ? "Recruiter brief" : "The arc"}
        </motion.div>

        <motion.blockquote
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          variants={{ show: { transition: { staggerChildren: 0.018 } } }}
        >
          {words.map((word, i) =>
            /^\s+$/.test(word.w) ? (
              <span key={i}> </span>
            ) : (
              <motion.span
                key={i}
                className={`word${word.hl ? " hl" : ""}`}
                variants={{
                  hidden: { opacity: 0, y: "0.4em" },
                  show: { opacity: 1, y: "0em" },
                }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
              >
                {word.w}
              </motion.span>
            ),
          )}
        </motion.blockquote>

        <motion.div
          className="sig"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          {recruiterMode ? "Architecture · delivery · mentoring · AI platforms" : "Ruby on Rails · Python · FastAPI · Anthropic Claude · MCP"}
        </motion.div>
      </div>
    </section>
  );
}
