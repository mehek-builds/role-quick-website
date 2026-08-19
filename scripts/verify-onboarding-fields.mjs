/* Every title the /start field picker offers must actually return work.
 *
 *   node --experimental-strip-types scripts/verify-onboarding-fields.mjs [apiUrl]
 *
 * Same rule and same reason as scripts/verify-board-suggestions.mjs, applied to the other list of
 * titles this product offers: a suggestion that lands on an empty page is worse than no
 * suggestion, because the reader concludes the board is broken rather than that we offered them a
 * word we do not carry. The nineteen fields in lib/onboarding-role-inference.ts were built by
 * measuring against the live board on 2026-08-19, and the board changes under us - companies are
 * added weekly, and the whole list grew by roughly 70% in the three weeks before that measurement
 * - so this re-measures it. Exits non-zero, so it can gate a deploy.
 *
 * Its finding on the day it was written, and the reason several titles changed rather than only
 * being added: "Marketing Associate", "Growth Marketing Associate", "Product Marketing Associate"
 * and "Research Assistant" all returned ZERO. Three of the five titles behind the Marketing field
 * were dead, and nothing in the repo said so.
 */

const API = (process.argv[2] ?? "https://student-outreach-backend.vercel.app").replace(/\/+$/, "");
const { FIELDS } = await import("../lib/onboarding-role-inference.ts");

/* Below this, a title is offered to a student who will see a page with almost nothing on it. Not
   zero: a title measured at one or two today is a title that rounds to zero on any week the board
   shifts, and the point of the check is to catch that before a student does. */
const THIN = 5;

const count = async (title) => {
  const r = await fetch(`${API}/jobs/grouped?title=${encodeURIComponent(title)}&limit=1`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).total ?? 0;
};

/* Measured once per distinct title rather than once per field. Business Analyst sits in three
   fields and Systems Engineer in two, and a title's count does not depend on who offered it. */
const titles = [...new Set(FIELDS.flatMap((field) => field.titles))];
const fieldsFor = (title) => FIELDS.filter((f) => f.titles.includes(title)).map((f) => f.id).join(", ");

console.log(`Onboarding field titles against ${API}`);
console.log(`${FIELDS.length} fields, ${titles.length} distinct titles\n`);

const queue = [...titles];
const results = new Map();
async function worker() {
  while (queue.length) {
    const title = queue.shift();
    try {
      results.set(title, await count(title));
    } catch (e) {
      results.set(title, `error: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

let failures = 0;
const empty = [];
const thin = [];
for (const title of titles) {
  const n = results.get(title);
  if (typeof n !== "number") empty.push(`${title} [${n}]`);
  else if (n === 0) empty.push(`${title} (${fieldsFor(title)})`);
  else if (n < THIN) thin.push(`${title} ${n} (${fieldsFor(title)})`);
}

if (empty.length) {
  failures += 1;
  console.log(`  FAIL  ${empty.length} offer an empty page:`);
  for (const line of empty) console.log(`          ${line}`);
} else {
  console.log(`  ok    every offered title returns at least one role`);
}
if (thin.length) {
  failures += 1;
  console.log(`  FAIL  ${thin.length} below ${THIN}, which rounds to nothing on a bad week:`);
  for (const line of thin) console.log(`          ${line}`);
} else {
  console.log(`  ok    every offered title clears ${THIN}`);
}

/* A field whose whole list is thin is the worse failure, and the counts above can hide it: five
   titles at six apiece each pass on their own and add up to a field nobody should be offered. */
for (const field of FIELDS) {
  const total = field.titles.reduce((sum, title) => sum + (typeof results.get(title) === "number" ? results.get(title) : 0), 0);
  if (total < THIN * field.titles.length) {
    failures += 1;
    console.log(`  FAIL  field "${field.label}" totals ${total} across ${field.titles.length} titles`);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
