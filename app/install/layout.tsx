import type { Metadata } from "next";

/* install is a client route, and a client component cannot export metadata, so the
   title lives here. Without it the tab fell back to the root layout's marketing
   title on every logged-in screen (audit finding 41). */
export const metadata: Metadata = {
  title: "Add to Chrome",
  description: "Opening the Chrome Web Store.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
