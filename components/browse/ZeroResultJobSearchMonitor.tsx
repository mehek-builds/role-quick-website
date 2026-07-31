"use client";

import { useEffect } from "react";
import { trackZeroResultJobSearch } from "@/lib/job-search-demand-client";

export function ZeroResultJobSearchMonitor({
  targetRole,
  location,
  sponsorOnly,
}: {
  targetRole: string;
  location?: string;
  sponsorOnly: boolean;
}) {
  useEffect(() => {
    trackZeroResultJobSearch({
      targetRole,
      location,
      sponsorOnly,
      surface: "public_board",
      totalResults: 0,
    });
  }, [location, sponsorOnly, targetRole]);

  return null;
}
