/* Every suggestion the board offers must actually return work.
 *
 *   node --experimental-strip-types scripts/verify-board-suggestions.mjs [apiUrl]
 *
 * A suggestion that lands on an empty page is worse than no suggestion: the
 * reader concludes the board is broken, rather than that we offered a word we
 * do not carry. The curated title list was built by measuring against the live
 * board, and the board changes under us — companies are added weekly — so this
 * re-measures it. Exits non-zero, so it can gate a deploy.
 */

const API = (process.argv[2] ?? "https://student-outreach-backend.vercel.app").replace(/\/+$/, "");
const { JOB_TITLES, OTHER } = await import("../lib/job-titles.ts");

const count = async (field, value) => {
  const r = await fetch(`${API}/jobs/grouped?${field}=${encodeURIComponent(value)}&limit=1`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).total ?? 0;
};

console.log(`Board suggestions against ${API}\n`);
let failures = 0;

console.log(`1. all ${JOB_TITLES.length} offered job titles return results`);
const queue = [...JOB_TITLES];
const empty = [];
const thin = [];
async function worker() {
  while (queue.length) {
    const title = queue.shift();
    try {
      const n = await count("title", title);
      if (n === 0) empty.push(title);
      else if (n < 3) thin.push(`${title} (${n})`);
    } catch (e) {
      empty.push(`${title} [${e.message}]`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

if (empty.length) {
  failures += 1;
  console.log(`  FAIL  ${empty.length} offer an empty page: ${empty.join(", ")}`);
} else {
  console.log(`  ok    every title returns at least one role`);
}
if (thin.length) console.log(`  note  thin but not empty: ${thin.join(", ")}`);

console.log("\n2. the company and city suggestions come from the board itself");
const facets = await (await fetch(`${API}/jobs/facets`, { signal: AbortSignal.timeout(30_000) })).json();
for (const [field, key] of [["company", "companies"], ["location", "locations"]]) {
  const list = facets[key] ?? [];
  const ok = list.length === 50;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${key}: ${list.length} offered`);
  if (!ok) failures += 1;
  /* Spot-check the ends of the list: the last entries are the ones most likely
     to have decayed to nothing as the board shifts. */
  for (const value of [list[0], list.at(-1)].filter(Boolean)) {
    const n = await count(field, value);
    console.log(`  ${n > 0 ? "ok  " : "FAIL"}  ${field}="${value}" returns ${n}`);
    if (n === 0) failures += 1;
  }
}

console.log("\n3. Other is a signpost, not a search term");
const other = await count("title", OTHER);
console.log(`  note  title="${OTHER}" would return ${other} — which is why the page treats it as no filter`);

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
