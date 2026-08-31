@AGENTS.md

## Deploy Configuration

- **Platform:** Railway
- **Primary service:** litos-web
- **Production branch:** main
- **Custom domains:** trylitos.com, www.trylitos.com
- **Production API:** https://student-outreach-backend.vercel.app until api.trylitos.com DNS is configured and verified
- **Build:** Dockerfile, `npm run build`
- **Runtime:** Node 22, standalone Next.js server on Railway's `PORT`
- **Health check:** `/`
- **Required public variables:** `NEXT_PUBLIC_API_URL=https://student-outreach-backend.vercel.app`, `NEXT_PUBLIC_SITE_URL=https://trylitos.com`
- **Rollback:** redeploy the previous successful Railway deployment, then restore the previous DNS records if the custom-domain cutover itself is unhealthy
