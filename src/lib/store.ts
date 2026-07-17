"use client";

import { useCallback, useEffect, useState } from "react";
import type { Application } from "./types";
import { SAMPLE_APPLICATIONS } from "./sampleData";

const STORAGE_KEY = "jobapp.applications.v1";
const SEED_KEY = "jobapp.seeded.v1";

function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function load(): Application[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Application[];
    // First run: seed with sample data so the app isn't empty.
    if (!window.localStorage.getItem(SEED_KEY)) {
      window.localStorage.setItem(SEED_KEY, "1");
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(SAMPLE_APPLICATIONS),
      );
      return SAMPLE_APPLICATIONS;
    }
    return [];
  } catch {
    return [];
  }
}

export type NewApplication = Omit<
  Application,
  "id" | "createdAt" | "updatedAt"
>;

export function useApplications() {
  const [apps, setApps] = useState<Application[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setApps(load());
    setReady(true);
  }, []);

  // Persist on every change (after initial load).
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
    } catch {
      /* ignore quota errors */
    }
  }, [apps, ready]);

  const add = useCallback((data: NewApplication) => {
    const now = Date.now();
    const app: Application = {
      ...data,
      id: uid(),
      createdAt: now,
      updatedAt: now,
    };
    setApps((prev) => [app, ...prev]);
    return app;
  }, []);

  const update = useCallback((id: string, data: Partial<NewApplication>) => {
    setApps((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, ...data, updatedAt: Date.now() } : a,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setApps((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const replaceAll = useCallback((next: Application[]) => {
    setApps(next);
  }, []);

  return { apps, ready, add, update, remove, replaceAll };
}
