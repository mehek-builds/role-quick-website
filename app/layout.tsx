import type { Metadata } from "next";
import { Azeret_Mono, Hanken_Grotesk } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/product";
import { TIKTOK_US_PIXEL_CODE } from "@/lib/tiktok-pixel";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";

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

const TIKTOK_PIXEL_SCRIPT = `
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${TIKTOK_US_PIXEL_CODE}');
  ttq.page();
}(window, document, 'ttq');
`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: TIKTOK_PIXEL_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg font-sans text-ink">
        {process.env.LITOS_MAINTENANCE_MODE === "1" ? <MaintenanceScreen /> : children}
      </body>
    </html>
  );
}
