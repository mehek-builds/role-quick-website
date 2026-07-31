"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/app/Button";
import TargetingCard from "@/components/app/TargetingCard";
import { Card, Chip, PageHeader } from "@/components/app/ui";

export default function ProfilePage() {
  const [qaMode, setQaMode] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setQaMode(window.location.hostname === "localhost" && new URLSearchParams(window.location.search).has("qa")));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Job search" sub="Tell Litos which jobs to look for." />

      {qaMode ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-ink">What you&apos;re going after</h2>
              <p className="mt-1 text-sm text-muted">Internships and new-grad roles · Summer 2027</p>
            </div>
            <Button type="button">Save changes</Button>
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

      <Card className="divide-y divide-border">
        <SettingsLink href="/dashboard/resume" title="Resume" detail="Resume and work history" />
        <SettingsLink href="/dashboard/settings#application-details" title="Application details" detail="Contact, links, and form answers" />
      </Card>
    </div>
  );
}

function SettingsLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-alt">
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{detail}</span>
      </span>
      <span aria-hidden="true" className="text-muted">→</span>
    </Link>
  );
}
