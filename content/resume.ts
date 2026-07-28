// Typed views over the single source of truth (resume.json).
// The Python FastAPI backend reads the SAME resume.json for the chat grounding
// context, so résumé content lives in exactly one place.
import data from "./resume.json";

export type Metric = { value: string; label: string };
export type Job = {
  role: string;
  company: string;
  period: string;
  now?: boolean;
  summary: string;
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
  phone: string;
  summary: string;
  openTo: string;
  education: string;
  languages: string[];
};

export const profile = data.profile as Profile;
export const metrics = data.metrics as Metric[];
export const experience = data.experience as Job[];
export const skillGroups = data.skillGroups as SkillGroup[];
