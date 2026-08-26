import { WEB_VERSION } from "../../../lib/product";
import { websiteReleaseIdentity } from "../../../lib/release-identity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const identity = websiteReleaseIdentity({
    version: WEB_VERSION,
    revision: process.env.LITOS_WEB_REVISION,
    buildTime: process.env.BUILD_TIME,
  });

  return Response.json(identity, {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Litos-Revision": identity.revision,
    },
  });
}
