export type Metric = { value: string; label: string };

export type Project = { name: string; summary: string };

export type Job = {
  role: string;
  company: string;
  period: string;
  now?: boolean;
  summary: string;
  projects?: Project[];
  stack: string[];
};

export type Highlight = { title: string; text: string };

export type SideProject = { name: string; summary: string; stack: string[] };

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

export type ResumeData = {
  profile: Profile;
  metrics: Metric[];
  highlights: Highlight[];
  experience: Job[];
  sideProjects: SideProject[];
  skillGroups: SkillGroup[];
};

export type ResumeVersionSummary = {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type ResumeVersionDetail = {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  updatedAt: string;
  data: ResumeData;
};
