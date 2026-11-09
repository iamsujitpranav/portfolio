"use client";

import React from "react";
import type { ResumeData } from "@/lib/resumeTypes";

export default function ResumePreview({ data }: { data: ResumeData }) {
  const {
    profile = {} as ResumeData["profile"],
    metrics = [],
    highlights = [],
    experience = [],
    sideProjects = [],
    skillGroups = [],
  } = data || {};

  const cleanUrl = (url: string) => url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "";
  const handle = (url: string) => cleanUrl(url).split("/").slice(1).join("/") || cleanUrl(url);

  return (
    <div className="resPreviewSheet">
      {/* Header */}
      <header className="resHead">
        <h1 className="resName">{profile.name || "Your Name"}</h1>
        <div className="resTitle">{profile.title || "Your Title"}</div>

        <div className="resContactRow">
          {profile.location && (
            <span className="resContactItem">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {profile.location}
            </span>
          )}
          {profile.email && (
            <span className="resContactItem">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
            </span>
          )}
          {profile.phone && (
            <span className="resContactItem">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {profile.phone}
            </span>
          )}
        </div>

        <div className="resContactRow">
          {profile.website && (
            <span className="resContactItem">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <a href={profile.website} target="_blank" rel="noopener noreferrer">
                {cleanUrl(profile.website)}
              </a>
            </span>
          )}
          {profile.linkedin && (
            <span className="resContactItem">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
              <a href={profile.linkedin} target="_blank" rel="noopener noreferrer">
                {handle(profile.linkedin)}
              </a>
            </span>
          )}
          {profile.github && (
            <span className="resContactItem">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
              </svg>
              <a href={profile.github} target="_blank" rel="noopener noreferrer">
                {handle(profile.github)}
              </a>
            </span>
          )}
        </div>

        {profile.openTo && <div className="resOpenTo">{profile.openTo}</div>}
      </header>

      {/* Professional Summary */}
      {profile.summary && (
        <section className="resSection">
          <h2 className="resSectionTitle">PROFESSIONAL SUMMARY</h2>
          <p className="resBody">{profile.summary}</p>
        </section>
      )}

      {/* Technical Skills */}
      {skillGroups.length > 0 && (
        <section className="resSection">
          <h2 className="resSectionTitle">TECHNICAL SKILLS</h2>
          <div className="resSkillsList">
            {skillGroups.map((group, idx) => {
              const allSkills = [...(group.star || []), ...(group.skills || [])];
              return (
                <div key={idx} className="resSkillLine">
                  <span className="resSkillGroupTitle">{group.title}:</span>{" "}
                  <span className="resSkillItems">{allSkills.join(", ")}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Leadership Highlights */}
      {highlights.length > 0 && (
        <section className="resSection">
          <h2 className="resSectionTitle">LEADERSHIP HIGHLIGHTS</h2>
          <ul className="resBulletList">
            {highlights.map((h, idx) => (
              <li key={idx} className="resBulletItem">
                <span className="resBulletHead">{h.title}:</span> {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Professional Experience */}
      {experience.length > 0 && (
        <section className="resSection">
          <h2 className="resSectionTitle">PROFESSIONAL EXPERIENCE</h2>
          {experience.map((job, idx) => (
            <article key={idx} className="resJob">
              <div className="resJobRole">{job.role}</div>
              <div className="resJobMeta">
                {job.company} | {job.period}
              </div>
              <p className="resBody">{job.summary}</p>

              {job.projects && job.projects.length > 0 && (
                <ul className="resBulletList">
                  {job.projects.map((proj, pIdx) => (
                    <li key={pIdx} className="resBulletItem">
                      <span className="resBulletHead">{proj.name}:</span> {proj.summary}
                    </li>
                  ))}
                </ul>
              )}

              {job.stack && job.stack.length > 0 && (
                <div className="resTechLine">
                  <span className="resTechLabel">Technologies:</span> {job.stack.join(", ")}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {/* Side Projects */}
      {sideProjects.length > 0 && (
        <section className="resSection">
          <h2 className="resSectionTitle">PROJECTS</h2>
          {sideProjects.map((proj, idx) => (
            <article key={idx} className="resJob">
              <ul className="resBulletList">
                <li className="resBulletItem">
                  <span className="resBulletHead">{proj.name}:</span> {proj.summary}
                </li>
              </ul>
              {proj.stack && proj.stack.length > 0 && (
                <div className="resTechLine">
                  <span className="resTechLabel">Technologies:</span> {proj.stack.join(", ")}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {/* Education */}
      {profile.education && (
        <section className="resSection">
          <h2 className="resSectionTitle">EDUCATION</h2>
          <p className="resBody">{profile.education}</p>
        </section>
      )}

      {/* Languages */}
      {profile.languages && profile.languages.length > 0 && (
        <section className="resSection">
          <h2 className="resSectionTitle">LANGUAGES</h2>
          <p className="resBody">{profile.languages.join(", ")}</p>
        </section>
      )}

      {/* Personal Details */}
      {(profile.dateOfBirth || profile.hobbies?.length || profile.maritalStatus) && (
        <section className="resSection">
          <h2 className="resSectionTitle">PERSONAL DETAILS</h2>
          {profile.dateOfBirth && (
            <p className="resPersonalLine">
              <b>Date of Birth:</b> {profile.dateOfBirth}
            </p>
          )}
          {profile.hobbies && profile.hobbies.length > 0 && (
            <p className="resPersonalLine">
              <b>Hobbies:</b> {profile.hobbies.join(", ")}
            </p>
          )}
          {profile.maritalStatus && (
            <p className="resPersonalLine">
              <b>Marital Status:</b> {profile.maritalStatus}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
