"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Job } from "@content/resume";

const wrap = (index: number, total: number) => (index + total) % total;

export default function ExperienceCareerReel({ jobs }: { jobs: Job[] }) {
  const [active, setActive] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const total = jobs.length;
  const job = jobs[active];
  if (!job) return null;

  const move = (direction: -1 | 1) => setActive((current) => wrap(current + direction, total));
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStart.current = event.clientX;
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    const movement = event.clientX - pointerStart.current;
    if (Math.abs(movement) > 48) move(movement < 0 ? 1 : -1);
    pointerStart.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : total - 1);
    }
  };

  return (
    <section className="jrnExperienceReel" aria-label="Career chapter archive" aria-roledescription="carousel" tabIndex={0} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { pointerStart.current = null; }} style={{ "--career-count": total } as CSSProperties}>
      <div className="jrnExperienceReadout">
        <span><i /> CAREER ARCHIVE // SHIPPED SYSTEMS</span>
        <b>CHAPTER {String(active + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</b>
      </div>

      <div className="jrnExperienceTimeline" role="tablist" aria-label="Career chapters">
        {jobs.map((entry, index) => (
          <button type="button" role="tab" aria-selected={index === active} className="jrnExperienceChapter"
            data-active={index === active ? "1" : undefined} key={`${entry.company}-${entry.period}`}
            onClick={() => setActive(index)} title={`${entry.company} · ${entry.period}`}>
            <span>{String(index + 1).padStart(2, "0")}</span><i /><small>{entry.period.split(" - ")[0]}</small>
          </button>
        ))}
      </div>

      <article className="jrnExperienceFrame" key={`${job.company}-${active}`}>
        <aside className="jrnExperienceSlate" aria-hidden="true">
          <span>CHAPTER</span><b>{String(active + 1).padStart(2, "0")}</b><i /><em>{job.now ? "LIVE" : "ARCHIVED"}</em>
        </aside>

        <div className="jrnExperienceStory">
          <header className="jrnExperienceHead">
            <div><span className="jrnExperienceCompany">{job.company}</span><h3>{job.role}</h3></div>
            <div className="jrnExperiencePeriod">{job.now && <i>NOW</i>}<span>{job.period}</span></div>
          </header>

          <div className="jrnExperienceBody" data-lenis-prevent>
            <p className="jrnExperienceSummary">{job.summary}</p>
            {job.projects?.length ? (
              <div className="jrnExperienceProjects">
                <div className="jrnExperienceSectionLabel">Selected systems</div>
                {job.projects.map((project, index) => (
                  <div className="jrnExperienceProject" key={project.name}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><h4>{project.name}</h4><p>{project.summary}</p></div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="jrnExperienceStack">
              <div className="jrnExperienceSectionLabel">Production stack</div>
              <div className="jrnChips">{job.stack.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          </div>
        </div>
      </article>

      <div className="jrnExperienceControls">
        <button type="button" onClick={() => move(-1)} aria-label="Previous career chapter">← PREV</button>
        <p><i /> {job.company} <span>· use ← → to navigate</span></p>
        <button type="button" onClick={() => move(1)} aria-label="Next career chapter">NEXT →</button>
      </div>
      <span className="jrnSrOnly" aria-live="polite">Chapter {active + 1} of {total}: {job.role} at {job.company}</span>
    </section>
  );
}
