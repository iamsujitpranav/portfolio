// Typed views over the single source of truth (resume.json).
// The Python FastAPI backend reads the SAME resume.json for the chat grounding
// context, so résumé content lives in exactly one place.
import data from "./resume.json";

export type Metric = { value: string; label: string };
/** One distinct piece of work inside a role. A job with several of these is
 *  rendered as separate blocks rather than one paragraph — see Experience.tsx. */
export type Project = { name: string; summary: string };
export type Job = {
  role: string;
  company: string;
  period: string;
  now?: boolean;
  /** The role at a glance. When `projects` is present this is the lead-in. */
  summary: string;
  projects?: Project[];
  stack: string[];
};
export type SkillGroup = { title: string; skills: string[]; star?: string[] };
export type Profile = {
  name: string;
  title: string;
  yearsExperience: number;
  yearsAI: number;
  location: string;
  email: string;
  website: string;
  linkedin: string;
  github: string;
  phone: string;
  summary: string;
  openTo: string;
  education: string;
  languages: string[];
  dateOfBirth: string;
  hobbies: string[];
  maritalStatus: string;
};

export const profile = data.profile as Profile;
export const metrics = data.metrics as Metric[];
export const experience = data.experience as Job[];
export const skillGroups = data.skillGroups as SkillGroup[];
