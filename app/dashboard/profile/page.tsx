"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, getApplicationProfile, type ApplicationProfile, type ParsedProfile } from "@/lib/api";
import TargetingCard from "@/components/app/TargetingCard";
import { Card, Chip, ErrorNote, ShimmerRows } from "@/components/app/ui";

type ProfileSummary = Pick<ParsedProfile, "full_name" | "school" | "grad_year" | "skills" | "target_roles">;

const QA_PROFILE: ProfileSummary = {
  full_name: "Alex Rivera",
  school: "University of Southern California",
  grad_year: 2027,
  skills: ["React", "TypeScript", "Python", "APIs", "Product"],
  target_roles: ["Software Engineer", "Product Engineer"],
};

const QA_APPLICATION_PROFILE: ApplicationProfile = {
  phone: "+1 213 555 0142",
  address_city: "Los Angeles",
  address_state: "CA",
  linkedin_url: "https://linkedin.com/in/alexrivera",
  github_url: "https://github.com/alexrivera",
  work_authorized: true,
  needs_sponsorship: false,
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [applicationProfile, setApplicationProfile] = useState<ApplicationProfile | null>(null);
  const [qaMode, setQaMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isQa = window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("qa");
    if (isQa) {
      queueMicrotask(() => {
        setQaMode(true);
        setProfile(QA_PROFILE);
        setApplicationProfile(QA_APPLICATION_PROFILE);
      });
      return;
    }
    let cancelled = false;
    Promise.all([
      api<ProfileSummary>("/profile"),
      getApplicationProfile(),
    ])
      .then(([profileResult, applicationResult]) => {
        if (cancelled) return;
        setProfile(profileResult);
        setApplicationProfile(applicationResult);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load your profile.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const completedFields = useMemo(() => {
    if (!applicationProfile) return 0;
    const values = [applicationProfile.phone, applicationProfile.address_city, applicationProfile.address_state, applicationProfile.linkedin_url, applicationProfile.github_url, applicationProfile.work_authorized, applicationProfile.needs_sponsorship];
    return values.filter((value) => value !== null && value !== undefined && value !== "").length;
  }, [applicationProfile]);

  if (error && !profile) return <ErrorNote message={error} />;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand-ink">Profile</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.025em] text-ink">What Litos applies with.</h1>
        <p className="mt-2 text-sm text-muted">Resume, targeting, and application answers.</p>
      </div>

      {!profile || !applicationProfile ? (
        <ShimmerRows rows={3} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Resume</p>
                <h2 className="mt-2 text-lg font-medium text-ink">{profile.full_name || "Base resume"}</h2>
                <p className="mt-1 text-sm text-muted">{profile.school}{profile.grad_year ? ` · ${profile.grad_year}` : ""}</p>
              </div>
              <Chip label="On file" kind="ready" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {profile.skills.slice(0, 5).map((skill) => <Chip key={skill} label={skill} />)}
            </div>
            <Link href="/dashboard/resume" className="mt-6 inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink">Edit resume</Link>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Application details</p>
                <h2 className="mt-2 text-lg font-medium text-ink">Reusable answers.</h2>
                <p className="mt-1 text-sm text-muted">Contact, eligibility, links, and defaults.</p>
              </div>
              <span className="font-mono text-xs text-faint">{completedFields}/7 CORE</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <ProfileFact label="Phone" value={applicationProfile.phone ? "Added" : "Missing"} />
              <ProfileFact label="Location" value={applicationProfile.address_city ? "Added" : "Missing"} />
              <ProfileFact label="LinkedIn" value={applicationProfile.linkedin_url ? "Added" : "Missing"} />
              <ProfileFact label="Work status" value={applicationProfile.work_authorized === null || applicationProfile.work_authorized === undefined ? "Missing" : "Added"} />
            </div>
            <Link href="/dashboard/settings#application-details" className="mt-6 inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink">Edit details</Link>
          </Card>
        </div>
      )}

      {qaMode ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">Job targeting</p>
              <h2 className="mt-2 text-lg font-medium text-ink">Software engineering.</h2>
              <p className="mt-1 text-sm text-muted">Internships and new-grad roles · Summer 2027</p>
            </div>
            <button type="button" className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white">Save changes</button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Chip label="Software Engineer" kind="ready" />
            <Chip label="Product Engineer" kind="ready" />
            <Chip label="Internship" />
            <Chip label="New grad" />
          </div>
        </Card>
      ) : (
        <TargetingCard />
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-6">
        <Link href="/dashboard/outreach" className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-ink">Outreach</Link>
        <Link href="/dashboard/settings" className="rounded-full border border-border px-4 py-2 text-sm text-muted hover:text-ink">Account and connections</Link>
      </div>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-surface-alt px-3 py-2.5">
      <p className="text-xs text-faint">{label}</p>
      <p className={`mt-0.5 font-mono text-[11px] uppercase ${value === "Added" ? "text-positive" : "text-warn"}`}>{value}</p>
    </div>
  );
}
