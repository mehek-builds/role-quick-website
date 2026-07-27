import type { Metadata } from "next";
import { Azeret_Mono, Hanken_Grotesk } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/product";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${PRODUCT_NAME}: tailored resume, filled application, real outreach`,
    template: `%s: ${PRODUCT_NAME}`,
  },
  description:
    `${PRODUCT_NAME} tailors your resume to the posting, fills out the entire application across Lever, Greenhouse, Ashby, Workday, and LinkedIn, and drafts personalized outreach to a real recruiter or alum. Review the job and edited resume side by side, answer only the extra questions, then submit from your dashboard.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${hankenGrotesk.variable} ${azeretMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
