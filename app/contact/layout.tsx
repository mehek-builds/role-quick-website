import type { Metadata } from "next";

/* The page itself is a client component, which cannot export metadata, so the
   title lives here. Without it /contact inherited the root default and the tab
   read like the homepage. No brand suffix: layout.tsx templates it. */
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Write to Litos about something not working, a refund, billing, or your data.",
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
