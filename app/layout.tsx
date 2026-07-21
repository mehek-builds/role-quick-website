import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/product";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PRODUCT_NAME}: tailored resume, filled application, real outreach`,
  description:
    `${PRODUCT_NAME} tailors your resume to the posting, fills out the entire application across Lever, Greenhouse, Ashby, Workday, and LinkedIn, and drafts a personalized outreach email to a real recruiter or alum. One open tab, three things done for you. You always get the final say.`,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
