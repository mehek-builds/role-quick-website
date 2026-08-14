import type { Metadata } from "next";

export const metadata: Metadata = { title: "Network" };

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
