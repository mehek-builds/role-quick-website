#!/usr/bin/env node
/* Sync the calibration card's role feed with the Litos internship tracker.
 *
 * Reads window.TRACKER_DATA from the tracker app's data.js (default:
 * ~/Documents/dubai-internship-tracker/data.js, override with
 * TRACKER_DATA_JS=/path). Keeps OPEN entries with a mappable field and
 * region, converts them into rolesFeed entries carrying the tracker's own
 * verified dates (Guardrails: no invented freshness), dedupes against the
 * hand-curated list by company, prefers hard deadlines, caps at 10, and
 * rewrites the section between the BEGIN/END TRACKER SYNC markers in
 * lib/rolesFeed.ts.
 *
 * Run manually whenever the tracker updates:
 *   node scripts/sync-roles-feed.mjs
 * Then: npm test && npm run build, review the diff, commit, deploy.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TRACKER =
  process.env.TRACKER_DATA_JS ??
  join(homedir(), "Documents/dubai-internship-tracker/data.js");
const FEED = fileURLToPath(new URL("../lib/rolesFeed.ts", import.meta.url));
const CAP = 10;

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(TRACKER, "utf8"), sandbox);
const data = sandbox.window.TRACKER_DATA;
if (!data?.jobs?.length) throw new Error("tracker data empty: " + TRACKER);

const FIELD_RULES = [
  [/(design|\bux\b|\bui\b)/i, "design"],
  [/(data|analytics|analyst|machine ?learning|\bml\b|scientist)/i, "data"],
  [/product/i, "product"],
  [/(market|growth|brand|content|social)/i, "marketing"],
  [/(finance|trading|quant|invest|consult|business)/i, "finance"],
  [/(engineer|developer|software|\bswe\b|full.?stack|backend|frontend|devops|infra)/i, "swe"],
];
const MENA =
  /(united arab emirates|\buae\b|dubai|abu dhabi|saudi|qatar|kuwait|bahrain|oman|egypt|jordan)/i;

const clean = (s) =>
  String(s ?? "")
    .replace(/—/g, "-")
    .replace(/"/g, '\\"')
    .trim();

function fieldOf(job) {
  const hay = `${job.role} ${job.sector ?? ""}`;
  for (const [re, f] of FIELD_RULES) if (re.test(hay)) return f;
  return null;
}
function regionsOf(job) {
  const hay = `${job.country ?? ""} ${job.location ?? ""}`;
  if (/united states/i.test(hay)) return '["us"]';
  if (/united kingdom|london/i.test(hay)) return '["uk"]';
  if (MENA.test(hay)) return '["mena"]';
  if (/remote/i.test(hay)) return '"global"';
  return null;
}
function statusOf(job) {
  const d = String(job.deadline ?? "");
  if (d && !/rolling/i.test(d)) {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) {
      if (dt.getTime() < Date.now()) return null; // deadline already passed
      const label = dt
        .toLocaleDateString("en-US", { month: "short", day: "numeric" })
        .toUpperCase();
      return { status: `CLOSES ${label}`, deadline: true };
    }
  }
  return { status: "ROLLING", deadline: false };
}
function verifiedOf(job) {
  if (!job.verified) return null;
  const dt = new Date(job.verified);
  if (Number.isNaN(dt.getTime())) return null;
  return dt
    .toLocaleDateString("en-US", { month: "short", year: "numeric" })
    .toUpperCase();
}

const feedSrc = readFileSync(FEED, "utf8");
const BEGIN = feedSrc.indexOf("/* BEGIN TRACKER SYNC");
const beginLineEnd = feedSrc.indexOf("*/", BEGIN) + 2;
const END = feedSrc.indexOf("  /* END TRACKER SYNC */");
if (BEGIN === -1 || END === -1) throw new Error("markers missing in rolesFeed.ts");
const curatedCompanies = new Set(
  [...feedSrc.slice(0, BEGIN).matchAll(/company: "([^"]+)"/g)].map((m) => m[1].toLowerCase()),
);

const picked = [];
for (const job of data.jobs) {
  if (!/open/i.test(String(job.status ?? ""))) continue;
  if (!job.url || !job.company || !job.role) continue;
  if (curatedCompanies.has(String(job.company).toLowerCase())) continue;
  const field = fieldOf(job);
  const regions = regionsOf(job);
  const st = statusOf(job);
  if (!field || !regions || !st) continue;
  const isIntern = /intern/i.test(`${job.duration ?? ""} ${job.role}`);
  picked.push({
    company: clean(job.company),
    role: clean(job.role),
    hunts: isIntern ? '["intern", "asap"]' : '["fulltime", "asap"]',
    field,
    regions,
    ...st,
    verified: verifiedOf(job),
    href: clean(job.url),
  });
}
/* hard deadlines first, then most recently verified */
picked.sort((a, b) => Number(b.deadline) - Number(a.deadline));
const final = picked.slice(0, CAP);

const entries = final
  .map((e) => {
    const lines = [
      "  {",
      `    company: "${e.company}",`,
      `    role: "${e.role}",`,
      `    hunts: ${e.hunts},`,
      `    fields: ["${e.field}"],`,
      `    regions: ${e.regions},`,
      `    status: "${e.status}",`,
    ];
    if (e.deadline) lines.push("    deadline: true,");
    if (e.verified) lines.push(`    verified: "${e.verified}",`);
    lines.push(`    href: "${e.href}",`, "  },");
    return lines.join("\n");
  })
  .join("\n");

const out =
  feedSrc.slice(0, beginLineEnd) +
  "\n" +
  (entries ? entries + "\n" : "") +
  feedSrc.slice(END);
writeFileSync(FEED, out);
console.log(
  `synced ${final.length} tracker roles (of ${data.jobs.length} tracked, ` +
    `${picked.length} eligible) into lib/rolesFeed.ts`,
);
for (const e of final) console.log(`  ${e.company} · ${e.role} · ${e.status}`);
