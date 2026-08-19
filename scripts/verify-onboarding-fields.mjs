/* Everything the /start field picker claims about the board, re-measured against the board.
 *
 *   node --experimental-strip-types scripts/verify-onboarding-fields.mjs [apiUrl]
 *
 * Same rule and same reason as scripts/verify-board-suggestions.mjs, applied to the other list of
 * titles this product offers: a suggestion that lands on an empty page is worse than no
 * suggestion, because the reader concludes the board is broken rather than that we offered them a
 * word we do not carry. lib/onboarding-role-inference.ts now goes further than offering, though -
 * it ORDERS the offer by measured supply at the student's stage and prints supply numbers on the
 * screen - so there are three claims to check rather than one:
 *
 *   1. every offered title still returns work
 *   2. the per-stage numbers behind the ordering are still roughly right
 *   3. the board-wide stage numbers the screen shows a student are still roughly right
 *
 * and one guarantee the whole design rests on:
 *
 *   4. everything the board returns is recent, so "most live roles" already means "most recent
 *      live roles" and no separate recency signal is needed
 *
 * Its finding on the day it was written, and the reason several titles changed rather than only
 * being added: "Marketing Associate", "Growth Marketing Associate", "Product Marketing Associate"
 * and "Research Assistant" all returned ZERO. Three of the five titles behind the Marketing field
 * were dead, and nothing in the repo said so. It then rejected "UX Researcher" at four.
 *
 * Exits non-zero, so it can gate a deploy.
 */

const API = (process.argv[2] ?? "https://student-outreach-backend.vercel.app").replace(/\/+$/, "");
const { FIELDS, STAGE_BOARD_SUPPLY, THIN_STAGE_ROLES } = await import("../lib/onboarding-role-inference.ts");

/* Below this, a title is offered to a student who will see a page with almost nothing on it. Not
   zero: a title measured at one or two today is a title that rounds to zero on any week the board
   shifts, and the point of the check is to catch that before a student does. */
const THIN = 5;

/* How far a baked number may drift before it is wrong rather than stale. The board moves every
   week - it grew about 70% in the three weeks before these were taken - so an exact match would
   fail constantly and teach everyone to ignore it. What must not drift is the ORDER: a title
   recorded with internships that now has none, or one recorded with none that now has plenty. */
const DRIFT = 0.5;

/* The backend's own roleTypePattern words, mirrored. Measuring with anything else would rank the
   offer by one definition of "internship" and then filter the board by another. */
const STAGE_RE = {
  internship: /(^|[^a-z])(intern|internship|trainee)([^a-z]|$)/i,
  "co-op": /(^|[^a-z])(co-op|co op|coop)([^a-z]|$)/i,
  "new-grad": /(^|[^a-z])(new grad|new graduate|graduate|entry level|early career|university grad)([^a-z]|$)/i,
  apprenticeship: /(^|[^a-z])(apprentice|apprenticeship)([^a-z]|$)/i,
  fellowship: /(^|[^a-z])(fellow|fellowship)([^a-z]|$)/i,
};
const STAGE_WORDS = {
  "co-op": ["co-op", "co op", "coop"],
  "new-grad": ["new grad", "new graduate", "graduate", "entry level", "early career", "university grad"],
  apprenticeship: ["apprentice", "apprenticeship"],
  fellowship: ["fellow", "fellowship"],
  "part-time": ["part time", "part-time"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/* The board rate-limits, and a 429 is not a finding. Retried with backoff so a throttled run
   reports the board's numbers rather than reporting itself. */
async function get(params, attempt = 0) {
  const response = await fetch(`${API}/jobs/grouped?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(40_000),
  });
  if (response.status === 429 && attempt < 8) {
    await sleep(2000 * (attempt + 1));
    return get(params, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/* Measured once per distinct title rather than once per field. Business Analyst sits in three
   fields and Systems Engineer in two, and a title's count does not depend on who offered it. */
const offers = new Map();
for (const field of FIELDS) {
  for (const offer of field.titles) if (!offers.has(offer.title)) offers.set(offer.title, offer);
}
const fieldsFor = (title) => FIELDS.filter((f) => f.titles.some((o) => o.title === title)).map((f) => f.id).join(", ");

console.log(`Onboarding field titles against ${API}`);
console.log(`${FIELDS.length} fields, ${offers.size} distinct titles\n`);

const measured = new Map();
const queue = [...offers.keys()];
async function worker() {
  while (queue.length) {
    const title = queue.shift();
    try {
      const page = await get({ title, limit: "100" });
      const rows = page.jobs ?? [];
      const record = { live: page.total ?? 0, sampled: rows.length, stages: {} };
      /* Extrapolated from the sample, because the board holds more rows than one page for the
         bigger titles and the API cannot AND a stage onto a title query. Titles under 100 live
         roles are measured exactly, which is most of them. */
      for (const [stage, expression] of Object.entries(STAGE_RE)) {
        const matched = rows.filter((row) => expression.test(row.title)).length;
        const estimate = record.sampled ? Math.round((record.live * matched) / record.sampled) : 0;
        if (estimate > 0) record.stages[stage] = estimate;
      }
      /* part-time and contract are stated in the employment_type column as often as in the title,
         which is why the backend reads both - so these two come from the column, exactly. */
      for (const [stage, type] of [["part-time", "Part-time"], ["contract", "Contract"]]) {
        const total = (await get({ title, employment_type: type, limit: "1" })).total ?? 0;
        if (total > 0) record.stages[stage] = total;
        await sleep(80);
      }
      const ages = rows
        .map((row) => Math.round((Date.now() - Date.parse(row.posted_at)) / 86_400_000))
        .filter((n) => Number.isFinite(n));
      record.oldestDays = ages.length ? Math.max(...ages) : null;
      measured.set(title, record);
    } catch (error) {
      measured.set(title, { error: error.message });
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

let failures = 0;
const fail = (heading, lines) => {
  failures += 1;
  console.log(`  FAIL  ${heading}`);
  for (const line of lines) console.log(`          ${line}`);
};

/* ── 1. every offered title still returns work ───────────────────────────── */
const empty = [];
const thin = [];
for (const [title, record] of measured) {
  if (record.error) empty.push(`${title} [${record.error}]`);
  else if (record.live === 0) empty.push(`${title} (${fieldsFor(title)})`);
  else if (record.live < THIN) thin.push(`${title} ${record.live} (${fieldsFor(title)})`);
}
if (empty.length) fail(`${empty.length} offer an empty page:`, empty);
else console.log("  ok    every offered title returns at least one role");
if (thin.length) fail(`${thin.length} below ${THIN}, which rounds to nothing on a bad week:`, thin);
else console.log(`  ok    every offered title clears ${THIN}`);

/* A field whose whole list is thin is the worse failure, and the counts above can hide it: five
   titles at six apiece each pass on their own and add up to a field nobody should be offered. */
for (const field of FIELDS) {
  const total = field.titles.reduce((sum, offer) => sum + (measured.get(offer.title)?.live ?? 0), 0);
  if (total < THIN * field.titles.length) fail(`field "${field.label}" totals ${total} across ${field.titles.length} titles`, []);
}

/* ── 2. the per-stage numbers the ordering is built on ───────────────────── */
const drifted = [];
for (const [title, offer] of offers) {
  const record = measured.get(title);
  if (!record || record.error) continue;
  const stages = new Set([...Object.keys(offer.stages ?? {}), ...Object.keys(record.stages)]);
  for (const stage of stages) {
    const baked = offer.stages?.[stage] ?? 0;
    const now = record.stages[stage] ?? 0;
    /* Appearing and disappearing are the failures that change the ORDER, so they always report.
       A number that merely moved is only a failure once it moves further than DRIFT. */
    if ((baked === 0) !== (now === 0)) {
      drifted.push(`${title} ${stage}: recorded ${baked}, board says ${now}`);
    } else if (baked > 0 && Math.abs(now - baked) / baked > DRIFT) {
      drifted.push(`${title} ${stage}: recorded ${baked}, board says ${now}`);
    }
  }
  if (offer.live > 0 && Math.abs(record.live - offer.live) / offer.live > DRIFT) {
    drifted.push(`${title} live: recorded ${offer.live}, board says ${record.live}`);
  }
}
if (drifted.length) fail(`${drifted.length} measurement(s) drifted past ${DRIFT * 100}%:`, drifted);
else console.log("  ok    every per-title measurement is within tolerance");

/* ── 3. the board-wide stage numbers shown to a student ──────────────────── */
const boardWide = {};
for (const [stage, words] of Object.entries(STAGE_WORDS)) {
  const ids = new Set();
  for (const word of words) {
    const page = await get({ title: word, limit: "100" });
    const expression = stage === "part-time" ? /(^|[^a-z])(part.?time)([^a-z]|$)/i : STAGE_RE[stage];
    for (const row of page.jobs ?? []) if (expression.test(row.title)) ids.add(row.id);
    await sleep(150);
  }
  boardWide[stage] = ids.size;
}
boardWide.internship = (await get({ title: "Intern", limit: "1" })).total ?? 0;
boardWide.contract = (await get({ employment_type: "Contract", limit: "1" })).total ?? 0;

const stageDrift = [];
for (const [stage, baked] of Object.entries(STAGE_BOARD_SUPPLY)) {
  const now = boardWide[stage];
  if (now === undefined) continue;
  /* The number itself is only ever shown as "N live on the board right now", so what breaks a
     student's trust is not it being stale by a few - it is the THIN line moving under it. A stage
     that crosses that line has changed what the screen should say, not just what it says. */
  const crossed = (baked < THIN_STAGE_ROLES) !== (now < THIN_STAGE_ROLES);
  if (crossed) stageDrift.push(`${stage}: recorded ${baked}, board says ${now} - crosses the ${THIN_STAGE_ROLES}-role line`);
  else if (Math.abs(now - baked) / Math.max(baked, 1) > DRIFT) stageDrift.push(`${stage}: recorded ${baked}, board says ${now}`);
}
if (stageDrift.length) fail(`${stageDrift.length} board-wide stage number(s) drifted:`, stageDrift);
else console.log("  ok    every board-wide stage number is within tolerance");

/* ── 4. the freshness guarantee the whole design rests on ────────────────── */
/* The board applies a 14-day window, 90 days for internships (the backend's freshnessPredicate),
   which is why nothing here ranks by recency: "most live roles" already means "most recent live
   roles". If that ever stops being true this check fails, rather than the offer quietly starting
   to rank stale work first. */
const STALE_DAYS = 90;
const stale = [...measured].filter(([, r]) => !r.error && r.oldestDays !== null && r.oldestDays > STALE_DAYS);
if (stale.length) fail(`${stale.length} title(s) returned work older than ${STALE_DAYS} days:`, stale.map(([t, r]) => `${t}: oldest ${r.oldestDays} days`));
else console.log(`  ok    nothing the board returned is older than ${STALE_DAYS} days`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
