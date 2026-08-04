"use client";

import type { CSSProperties } from "react";
import SocialTrail from "./SocialTrail";
import SkillsCapabilityRing from "./SkillsCapabilityRing";
import ExperienceCareerReel from "./ExperienceCareerReel";
import { panelProject } from "@/lib/journey/projects";
import { profile, metrics, experience, skillGroups } from "@content/resume";

function customStyle(name: string, value: string | number): CSSProperties {
  return { [name]: value } as CSSProperties;
}

function MoreButton({ label, onMore }: { label: string; onMore: (label: string) => void }) {
  return (
    <button className="jrnMore" onClick={() => onMore(label)}>
      {label} →
    </button>
  );
}

export default function BoardContent({
  id,
  onMore,
}: {
  id: string;
  onMore: (label: string) => void;
}) {
  const site = panelProject(id);
  if (site) {
    const job = experience.find((entry) => entry.company === site.company);
    return (
      <div className="jrnProjectDossier">
        <div className="jrnDossierMeta">
          <span>CASE FILE</span>
          <b>{site.company}</b>
          <i>DELIVERED</i>
        </div>
        <div className="jrnEyebrow">{site.title}</div>
        <h2 className="jrnH">{site.project}</h2>
        <p className="jrnTitle">
          {site.company}
          {job ? ` · ${job.period}` : ""}
        </p>
        {job?.role && <p className="jrnRole">{job.role}</p>}
        <p className="jrnLead">{site.blurb}</p>
        {site.metric && (
          <div className="jrnMetrics">
            <div className="jrnMetric">
              <b>{site.metric.value}</b>
              <span>{site.metric.label}</span>
            </div>
          </div>
        )}
        {job?.stack?.length ? (
          <div className="jrnChips">
            {job.stack.slice(0, 8).map((stack: string) => <span key={stack}>{stack}</span>)}
          </div>
        ) : null}
        <p className="jrnReads">{site.reads}</p>
        <MoreButton label="See the full timeline" onMore={onMore} />
      </div>
    );
  }

  switch (id) {
    case "start":
      return (
        <div className="jrnFieldJournal">
          <div className="jrnJournalHero">
            <div className="jrnJournalIdentity">
              <div className="jrnEyebrow">The Root · Introduction</div>
              <h2 className="jrnH">{profile.name}</h2>
              <p className="jrnTitle">{profile.title}</p>
              <p className="jrnLead">{profile.summary}</p>
            </div>
            <div className="jrnJournalMap" aria-hidden="true">
              <span className="jrnJournalRoute"><i /><i /><i /><i /></span>
              <b>YOU ARE HERE</b>
              <em>Town Square</em>
            </div>
          </div>
          <div className="jrnMetrics">
            {metrics.map((metric, index) => (
              <div key={metric.label} className="jrnMetric" style={customStyle("--metric-delay", `${180 + index * 90}ms`)}>
                <b>{metric.value}</b>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
          <p className="jrnHint">Pick a signpost, or use The Trail menu, to run on.</p>
        </div>
      );

    case "thesis":
      return (
        <div className="jrnManifesto">
          <div className="jrnManifestoCue"><span>NOW PROJECTING</span><b>01 / THE ARC</b></div>
          <div className="jrnEyebrow">The arc</div>
          <blockquote className="jrnQuote">
            <span>Twelve years modernizing large-scale Rails monoliths and the microservices around them.</span>
            <span>Now pointed at the hardest layer: making software that <em>reasons</em>.</span>
            <span>From recommendation engines to <em>agentic developer workflows</em>, I ship AI that earns its place in production.</span>
          </blockquote>
          <p className="jrnSig">Ruby on Rails · Python · FastAPI · Anthropic Claude · MCP</p>
          <div className="jrnManifestoProgress" aria-hidden="true"><i /><i /><i /></div>
        </div>
      );

    case "experience":
      return (
        <div className="jrnCareerCinema">
          <div className="jrnCareerIntro">
            <div>
              <div className="jrnEyebrow">Experience · Career timeline</div>
              <h2 className="jrnH">A career told in shipped systems</h2>
            </div>
            <span><b>{experience.length}</b> career chapters</span>
          </div>
          <ExperienceCareerReel jobs={experience} />
          <MoreButton label="See the full timeline" onMore={onMore} />
        </div>
      );

    case "skills":
      return (
        <div className="jrnSystemsBlueprint">
          <div className="jrnBlueprintHero">
            <div>
              <div className="jrnEyebrow">Skills · Systems blueprint</div>
              <h2 className="jrnH">The architecture behind the work</h2>
            </div>
            <div className="jrnSystemPulse" aria-label="Core systems online"><i /><span>CORE SYSTEMS</span><b>ONLINE</b></div>
          </div>
          <SkillsCapabilityRing groups={skillGroups} />
        </div>
      );

    case "contact":
      return (
        <div className="jrnSignalRoom">
          <div className="jrnSignalHero">
            <span className="jrnSignalOrb" aria-hidden="true"><i /></span>
            <div>
              <div className="jrnEyebrow">Summit · Signal room</div>
              <h2 className="jrnH">Let’s build something</h2>
              <p className="jrnLead">{profile.openTo}</p>
            </div>
            <span className="jrnSignalLive"><i /> AVAILABLE FOR CONVERSATION</span>
          </div>
          <div className="jrnContact">
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
            <a href={`tel:${profile.phone.replace(/\s+/g, "")}`}>{profile.phone}</a>
            <span>{profile.location}</span>
          </div>
          <div className="jrnContactSocialHeading">Incoming and outgoing channels</div>
          <SocialTrail embedded showForm />
        </div>
      );

    default:
      return null;
  }
}
