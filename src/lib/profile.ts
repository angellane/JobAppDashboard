"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "jobapp.profile.v1";
export const RESUME_FILE_KEY = "resume";

/** A reusable answer to a question application forms commonly ask. */
export interface CommonAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface ResumeMeta {
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
}

/**
 * The applicant profile — the source of truth the (future) auto-apply agent
 * uses to fill out applications. `resumeText` is the extracted CV text.
 */
export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  workAuthorization: string; // e.g. "US Citizen", "F-1 / needs CPT"
  needsSponsorship: "" | "yes" | "no";
  school: string;
  degree: string;
  gradDate: string;
  gpa: string;
  skills: string;
  answers: CommonAnswer[];
  resume: ResumeMeta | null;
  resumeText: string; // extracted text, editable by the user
  updatedAt: number;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function emptyProfile(): Profile {
  return {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    workAuthorization: "",
    needsSponsorship: "",
    school: "",
    degree: "",
    gradDate: "",
    gpa: "",
    skills: "",
    answers: [
      { id: uid(), question: "Why are you interested in this role?", answer: "" },
      { id: uid(), question: "Earliest start date / availability", answer: "" },
      { id: uid(), question: "Are you willing to relocate?", answer: "" },
    ],
    resume: null,
    resumeText: "",
    updatedAt: Date.now(),
  };
}

function load(): Profile {
  if (typeof window === "undefined") return emptyProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    return { ...emptyProfile(), ...(JSON.parse(raw) as Profile) };
  } catch {
    return emptyProfile();
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, [profile, ready]);

  const patch = useCallback((data: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...data, updatedAt: Date.now() }));
  }, []);

  const addAnswer = useCallback(() => {
    setProfile((p) => ({
      ...p,
      answers: [...p.answers, { id: uid(), question: "", answer: "" }],
      updatedAt: Date.now(),
    }));
  }, []);

  const updateAnswer = useCallback(
    (id: string, data: Partial<CommonAnswer>) => {
      setProfile((p) => ({
        ...p,
        answers: p.answers.map((a) => (a.id === id ? { ...a, ...data } : a)),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeAnswer = useCallback((id: string) => {
    setProfile((p) => ({
      ...p,
      answers: p.answers.filter((a) => a.id !== id),
      updatedAt: Date.now(),
    }));
  }, []);

  return { profile, ready, patch, addAnswer, updateAnswer, removeAnswer };
}

/**
 * Best-effort heuristic extraction of contact details from raw CV text.
 * A stopgap until Phase 2's LLM extraction — pulls the obvious fields so the
 * user doesn't retype them.
 */
export function extractFromText(text: string): Partial<Profile> {
  const out: Partial<Profile> = {};
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) out.email = email[0];

  const phone = text.match(
    /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
  );
  if (phone) out.phone = phone[0].trim();

  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  if (linkedin) out.linkedin = linkedin[0];

  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i);
  if (github) out.github = github[0];

  return out;
}
