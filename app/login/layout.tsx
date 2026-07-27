import type { Metadata } from "next";

/* login is a client route, and a client component cannot export metadata, so the
   title lives here. Without it the tab fell back to the root layout's marketing
   title on every logged-in screen (audit finding 41). */
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Litos and pick up where you left off.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
