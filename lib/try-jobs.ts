/* Daily jobs feed for /try (Mehek, 2026-07-08: cycle through the top ~10 recent
   big-tech intern roles instead of a fixed dropdown). Source of truth is
   `public/try-jobs.json`, meant to be regenerated daily by a refresh task.
   Read server-side (page + api route) from the filesystem so the file can be
   swapped without a rebuild. */

import { promises as fs } from "fs";
import path from "path";

export type TryJob = {
  id: string;
  company: string;
  title: string;
  location: string;
  ats: string;
  applyUrl: string;
  jd: string;
};

/* Client view. The JD text IS shipped now (Mehek, 2026-07-08: people read the
   posting while cycling through roles); it's public posting text, not secret. */
export type TryJobCard = TryJob;

/* Read the feed fresh each call (no module cache): the file is tiny, and the
   daily refresh task must be able to swap public/try-jobs.json and have it take
   effect without waiting on a redeploy / process restart. */
export async function loadFeed(): Promise<{ refreshed: string; jobs: TryJob[] }> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "public", "try-jobs.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    return { refreshed: parsed.refreshed ?? "", jobs: parsed.jobs ?? [] };
  } catch {
    return { refreshed: "", jobs: [] };
  }
}

export async function getJobCards(): Promise<TryJobCard[]> {
  const { jobs } = await loadFeed();
  return jobs;
}

export async function findJob(id: string): Promise<TryJob | undefined> {
  const { jobs } = await loadFeed();
  return jobs.find((j) => j.id === id);
}
