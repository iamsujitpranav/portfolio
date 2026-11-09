"use client";

import React, { useState } from "react";
import type { Highlight, Job, Metric, Profile, Project, ResumeData, SideProject, SkillGroup } from "@/lib/resumeTypes";

type SectionTab = "profile" | "experience" | "skills" | "highlights" | "metrics" | "sideProjects";

export default function ResumeEditor({
  data,
  onChange,
}: {
  data: ResumeData;
  onChange: (updated: ResumeData) => void;
}) {
  const [activeTab, setActiveTab] = useState<SectionTab>("profile");

  const profile = data.profile || ({} as Profile);
  const metrics = data.metrics || [];
  const highlights = data.highlights || [];
  const experience = data.experience || [];
  const sideProjects = data.sideProjects || [];
  const skillGroups = data.skillGroups || [];

  const updateProfile = (field: keyof Profile, value: unknown) => {
    onChange({
      ...data,
      profile: {
        ...profile,
        [field]: value,
      },
    });
  };

  // -------------------------------------------------------------------------
  // Metrics Handlers
  // -------------------------------------------------------------------------
  const updateMetric = (index: number, key: keyof Metric, value: string) => {
    const next = [...metrics];
    next[index] = { ...next[index], [key]: value };
    onChange({ ...data, metrics: next });
  };

  const addMetric = () => {
    onChange({
      ...data,
      metrics: [...metrics, { value: "10+", label: "metric label" }],
    });
  };

  const removeMetric = (index: number) => {
    onChange({
      ...data,
      metrics: metrics.filter((_, i) => i !== index),
    });
  };

  // -------------------------------------------------------------------------
  // Highlights Handlers
  // -------------------------------------------------------------------------
  const updateHighlight = (index: number, key: keyof Highlight, value: string) => {
    const next = [...highlights];
    next[index] = { ...next[index], [key]: value };
    onChange({ ...data, highlights: next });
  };

  const addHighlight = () => {
    onChange({
      ...data,
      highlights: [...highlights, { title: "New highlight", text: "Highlight description..." }],
    });
  };

  const removeHighlight = (index: number) => {
    onChange({
      ...data,
      highlights: highlights.filter((_, i) => i !== index),
    });
  };

  // -------------------------------------------------------------------------
  // Experience Handlers
  // -------------------------------------------------------------------------
  const updateJob = (index: number, patch: Partial<Job>) => {
    const next = [...experience];
    next[index] = { ...next[index], ...patch };
    onChange({ ...data, experience: next });
  };

  const addJob = () => {
    onChange({
      ...data,
      experience: [
        {
          role: "Role Title",
          company: "Company Name",
          period: "Month Year - present",
          now: true,
          summary: "Role overview and impact...",
          projects: [],
          stack: ["Technology 1", "Technology 2"],
        },
        ...experience,
      ],
    });
  };

  const removeJob = (index: number) => {
    onChange({
      ...data,
      experience: experience.filter((_, i) => i !== index),
    });
  };

  const addJobProject = (jobIndex: number) => {
    const job = experience[jobIndex];
    const projects = job.projects || [];
    updateJob(jobIndex, {
      projects: [...projects, { name: "New Project", summary: "Project details..." }],
    });
  };

  const updateJobProject = (jobIndex: number, projectIndex: number, key: keyof Project, value: string) => {
    const job = experience[jobIndex];
    const projects = [...(job.projects || [])];
    projects[projectIndex] = { ...projects[projectIndex], [key]: value };
    updateJob(jobIndex, { projects });
  };

  const removeJobProject = (jobIndex: number, projectIndex: number) => {
    const job = experience[jobIndex];
    updateJob(jobIndex, {
      projects: (job.projects || []).filter((_, i) => i !== projectIndex),
    });
  };

  // -------------------------------------------------------------------------
  // Side Projects Handlers
  // -------------------------------------------------------------------------
  const updateSideProject = (index: number, patch: Partial<SideProject>) => {
    const next = [...sideProjects];
    next[index] = { ...next[index], ...patch };
    onChange({ ...data, sideProjects: next });
  };

  const addSideProject = () => {
    onChange({
      ...data,
      sideProjects: [
        ...sideProjects,
        { name: "Project Name", summary: "Summary of what this project does...", stack: ["Next.js", "Python"] },
      ],
    });
  };

  const removeSideProject = (index: number) => {
    onChange({
      ...data,
      sideProjects: sideProjects.filter((_, i) => i !== index),
    });
  };

  // -------------------------------------------------------------------------
  // Skills Handlers
  // -------------------------------------------------------------------------
  const updateSkillGroup = (index: number, patch: Partial<SkillGroup>) => {
    const next = [...skillGroups];
    next[index] = { ...next[index], ...patch };
    onChange({ ...data, skillGroups: next });
  };

  const addSkillGroup = () => {
    onChange({
      ...data,
      skillGroups: [
        ...skillGroups,
        { title: "New Category", star: ["Core Skill 1"], skills: ["Skill 2", "Skill 3"] },
      ],
    });
  };

  const removeSkillGroup = (index: number) => {
    onChange({
      ...data,
      skillGroups: skillGroups.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="resEditorWrap">
      {/* Navigation tabs */}
      <div className="resEditorTabs" role="tablist">
        <button
          type="button"
          className={`resEditorTab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          type="button"
          className={`resEditorTab ${activeTab === "experience" ? "active" : ""}`}
          onClick={() => setActiveTab("experience")}
        >
          Experience ({experience.length})
        </button>
        <button
          type="button"
          className={`resEditorTab ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => setActiveTab("skills")}
        >
          Skills ({skillGroups.length})
        </button>
        <button
          type="button"
          className={`resEditorTab ${activeTab === "highlights" ? "active" : ""}`}
          onClick={() => setActiveTab("highlights")}
        >
          Highlights ({highlights.length})
        </button>
        <button
          type="button"
          className={`resEditorTab ${activeTab === "metrics" ? "active" : ""}`}
          onClick={() => setActiveTab("metrics")}
        >
          Metrics ({metrics.length})
        </button>
        <button
          type="button"
          className={`resEditorTab ${activeTab === "sideProjects" ? "active" : ""}`}
          onClick={() => setActiveTab("sideProjects")}
        >
          Projects ({sideProjects.length})
        </button>
      </div>

      {/* Tab Panels */}
      <div className="resEditorPanel">
        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <div className="resFormSection">
            <h3 className="resFormTitle">Personal & Contact Info</h3>
            <div className="resGrid2">
              <label className="admField">
                <span>Full Name</span>
                <input
                  type="text"
                  value={profile.name || ""}
                  onChange={(e) => updateProfile("name", e.target.value)}
                />
              </label>
              <label className="admField">
                <span>Title</span>
                <input
                  type="text"
                  value={profile.title || ""}
                  onChange={(e) => updateProfile("title", e.target.value)}
                />
              </label>
            </div>

            <div className="resGrid2">
              <label className="admField">
                <span>Years of Experience</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={profile.yearsExperience ?? 0}
                  onChange={(e) => updateProfile("yearsExperience", parseInt(e.target.value, 10) || 0)}
                />
              </label>
              <label className="admField">
                <span>Years in AI / ML</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={profile.yearsAI ?? 0}
                  onChange={(e) => updateProfile("yearsAI", parseInt(e.target.value, 10) || 0)}
                />
              </label>
            </div>

            <div className="resGrid3">
              <label className="admField">
                <span>Location</span>
                <input
                  type="text"
                  value={profile.location || ""}
                  onChange={(e) => updateProfile("location", e.target.value)}
                />
              </label>
              <label className="admField">
                <span>Email</span>
                <input
                  type="email"
                  value={profile.email || ""}
                  onChange={(e) => updateProfile("email", e.target.value)}
                />
              </label>
              <label className="admField">
                <span>Phone</span>
                <input
                  type="tel"
                  value={profile.phone || ""}
                  onChange={(e) => updateProfile("phone", e.target.value)}
                />
              </label>
            </div>

            <div className="resGrid3">
              <label className="admField">
                <span>Website</span>
                <input
                  type="url"
                  value={profile.website || ""}
                  onChange={(e) => updateProfile("website", e.target.value)}
                />
              </label>
              <label className="admField">
                <span>LinkedIn</span>
                <input
                  type="url"
                  value={profile.linkedin || ""}
                  onChange={(e) => updateProfile("linkedin", e.target.value)}
                />
              </label>
              <label className="admField">
                <span>GitHub</span>
                <input
                  type="url"
                  value={profile.github || ""}
                  onChange={(e) => updateProfile("github", e.target.value)}
                />
              </label>
            </div>

            <label className="admField">
              <span>Open To / Availability Notice</span>
              <input
                type="text"
                value={profile.openTo || ""}
                onChange={(e) => updateProfile("openTo", e.target.value)}
              />
            </label>

            <label className="admField">
              <span>Professional Summary</span>
              <textarea
                rows={5}
                className="resTextarea"
                value={profile.summary || ""}
                onChange={(e) => updateProfile("summary", e.target.value)}
              />
            </label>

            <label className="admField">
              <span>Education</span>
              <textarea
                rows={2}
                className="resTextarea"
                value={profile.education || ""}
                onChange={(e) => updateProfile("education", e.target.value)}
              />
            </label>

            <div className="resGrid3">
              <label className="admField">
                <span>Languages (comma-separated)</span>
                <input
                  type="text"
                  value={(profile.languages || []).join(", ")}
                  onChange={(e) =>
                    updateProfile(
                      "languages",
                      e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    )
                  }
                />
              </label>
              <label className="admField">
                <span>Date of Birth</span>
                <input
                  type="text"
                  value={profile.dateOfBirth || ""}
                  onChange={(e) => updateProfile("dateOfBirth", e.target.value)}
                />
              </label>
              <label className="admField">
                <span>Marital Status</span>
                <input
                  type="text"
                  value={profile.maritalStatus || ""}
                  onChange={(e) => updateProfile("maritalStatus", e.target.value)}
                />
              </label>
            </div>

            <label className="admField">
              <span>Hobbies (comma-separated)</span>
              <input
                type="text"
                value={(profile.hobbies || []).join(", ")}
                onChange={(e) =>
                  updateProfile(
                    "hobbies",
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  )
                }
              />
            </label>
          </div>
        )}

        {/* EXPERIENCE TAB */}
        {activeTab === "experience" && (
          <div className="resFormSection">
            <div className="resSectionHeader">
              <h3 className="resFormTitle">Professional Experience</h3>
              <button type="button" onClick={addJob} className="admSmallBtn primary">
                + Add Role
              </button>
            </div>

            {experience.map((job, jIdx) => (
              <div key={jIdx} className="resCardItem">
                <div className="resCardHeader">
                  <span className="resCardOrder">#{jIdx + 1}</span>
                  <strong>{job.role || "Untitled Role"}</strong>
                  <span className="resCardSub">{job.company}</span>
                  <button
                    type="button"
                    onClick={() => removeJob(jIdx)}
                    className="admDangerBtn"
                    title="Remove job"
                  >
                    Delete
                  </button>
                </div>

                <div className="resGrid3">
                  <label className="admField">
                    <span>Role Title</span>
                    <input
                      type="text"
                      value={job.role}
                      onChange={(e) => updateJob(jIdx, { role: e.target.value })}
                    />
                  </label>
                  <label className="admField">
                    <span>Company</span>
                    <input
                      type="text"
                      value={job.company}
                      onChange={(e) => updateJob(jIdx, { company: e.target.value })}
                    />
                  </label>
                  <label className="admField">
                    <span>Period (e.g. Oct 2025 - present)</span>
                    <input
                      type="text"
                      value={job.period}
                      onChange={(e) => updateJob(jIdx, { period: e.target.value })}
                    />
                  </label>
                </div>

                <label className="resCheckboxField">
                  <input
                    type="checkbox"
                    checked={!!job.now}
                    onChange={(e) => updateJob(jIdx, { now: e.target.checked })}
                  />
                  <span>Currently working here (Now)</span>
                </label>

                <label className="admField">
                  <span>Role Summary</span>
                  <textarea
                    rows={3}
                    className="resTextarea"
                    value={job.summary}
                    onChange={(e) => updateJob(jIdx, { summary: e.target.value })}
                  />
                </label>

                <label className="admField">
                  <span>Technologies / Stack (comma-separated)</span>
                  <input
                    type="text"
                    value={(job.stack || []).join(", ")}
                    onChange={(e) =>
                      updateJob(jIdx, {
                        stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </label>

                {/* Sub-projects within role */}
                <div className="resSubProjects">
                  <div className="resSubHeader">
                    <span className="resSubTitle">Products / Key Projects</span>
                    <button
                      type="button"
                      onClick={() => addJobProject(jIdx)}
                      className="admSmallBtn"
                    >
                      + Add Project
                    </button>
                  </div>

                  {(job.projects || []).map((proj, pIdx) => (
                    <div key={pIdx} className="resSubCard">
                      <div className="resSubCardHeader">
                        <span>Project #{pIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeJobProject(jIdx, pIdx)}
                          className="admDangerBtn small"
                        >
                          ✕
                        </button>
                      </div>
                      <label className="admField">
                        <span>Project Name</span>
                        <input
                          type="text"
                          value={proj.name}
                          onChange={(e) => updateJobProject(jIdx, pIdx, "name", e.target.value)}
                        />
                      </label>
                      <label className="admField">
                        <span>Project Summary</span>
                        <textarea
                          rows={2}
                          className="resTextarea"
                          value={proj.summary}
                          onChange={(e) => updateJobProject(jIdx, pIdx, "summary", e.target.value)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SKILLS TAB */}
        {activeTab === "skills" && (
          <div className="resFormSection">
            <div className="resSectionHeader">
              <h3 className="resFormTitle">Technical Skill Groups</h3>
              <button type="button" onClick={addSkillGroup} className="admSmallBtn primary">
                + Add Skill Group
              </button>
            </div>

            {skillGroups.map((group, idx) => (
              <div key={idx} className="resCardItem">
                <div className="resCardHeader">
                  <strong>{group.title || "Untitled Group"}</strong>
                  <button
                    type="button"
                    onClick={() => removeSkillGroup(idx)}
                    className="admDangerBtn"
                  >
                    Delete Group
                  </button>
                </div>

                <label className="admField">
                  <span>Group Title</span>
                  <input
                    type="text"
                    value={group.title}
                    onChange={(e) => updateSkillGroup(idx, { title: e.target.value })}
                  />
                </label>

                <label className="admField">
                  <span>Starred / Core Skills (comma-separated, emphasized)</span>
                  <input
                    type="text"
                    value={(group.star || []).join(", ")}
                    onChange={(e) =>
                      updateSkillGroup(idx, {
                        star: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </label>

                <label className="admField">
                  <span>Regular Skills (comma-separated)</span>
                  <input
                    type="text"
                    value={(group.skills || []).join(", ")}
                    onChange={(e) =>
                      updateSkillGroup(idx, {
                        skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {/* HIGHLIGHTS TAB */}
        {activeTab === "highlights" && (
          <div className="resFormSection">
            <div className="resSectionHeader">
              <h3 className="resFormTitle">Leadership Highlights</h3>
              <button type="button" onClick={addHighlight} className="admSmallBtn primary">
                + Add Highlight
              </button>
            </div>

            {highlights.map((h, idx) => (
              <div key={idx} className="resCardItem">
                <div className="resCardHeader">
                  <strong>Highlight #{idx + 1}</strong>
                  <button
                    type="button"
                    onClick={() => removeHighlight(idx)}
                    className="admDangerBtn"
                  >
                    Delete
                  </button>
                </div>
                <label className="admField">
                  <span>Highlight Title</span>
                  <input
                    type="text"
                    value={h.title}
                    onChange={(e) => updateHighlight(idx, "title", e.target.value)}
                  />
                </label>
                <label className="admField">
                  <span>Description / Proof Point</span>
                  <textarea
                    rows={2}
                    className="resTextarea"
                    value={h.text}
                    onChange={(e) => updateHighlight(idx, "text", e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {/* METRICS TAB */}
        {activeTab === "metrics" && (
          <div className="resFormSection">
            <div className="resSectionHeader">
              <h3 className="resFormTitle">Key Proof Metrics</h3>
              <button type="button" onClick={addMetric} className="admSmallBtn primary">
                + Add Metric
              </button>
            </div>

            {metrics.map((m, idx) => (
              <div key={idx} className="resMetricRow">
                <label className="admField">
                  <span>Value (e.g. 12+, 80%↓)</span>
                  <input
                    type="text"
                    value={m.value}
                    onChange={(e) => updateMetric(idx, "value", e.target.value)}
                  />
                </label>
                <label className="admField resFlexGrow">
                  <span>Label (e.g. years engineering)</span>
                  <input
                    type="text"
                    value={m.label}
                    onChange={(e) => updateMetric(idx, "label", e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeMetric(idx)}
                  className="admDangerBtn"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {/* SIDE PROJECTS TAB */}
        {activeTab === "sideProjects" && (
          <div className="resFormSection">
            <div className="resSectionHeader">
              <h3 className="resFormTitle">Projects / Side Projects</h3>
              <button type="button" onClick={addSideProject} className="admSmallBtn primary">
                + Add Project
              </button>
            </div>

            {sideProjects.map((p, idx) => (
              <div key={idx} className="resCardItem">
                <div className="resCardHeader">
                  <strong>{p.name || "Untitled Project"}</strong>
                  <button
                    type="button"
                    onClick={() => removeSideProject(idx)}
                    className="admDangerBtn"
                  >
                    Delete
                  </button>
                </div>
                <label className="admField">
                  <span>Project Name</span>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updateSideProject(idx, { name: e.target.value })}
                  />
                </label>
                <label className="admField">
                  <span>Summary</span>
                  <textarea
                    rows={3}
                    className="resTextarea"
                    value={p.summary}
                    onChange={(e) => updateSideProject(idx, { summary: e.target.value })}
                  />
                </label>
                <label className="admField">
                  <span>Technologies / Stack (comma-separated)</span>
                  <input
                    type="text"
                    value={(p.stack || []).join(", ")}
                    onChange={(e) =>
                      updateSideProject(idx, {
                        stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
