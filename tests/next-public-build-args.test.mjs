import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/* THE BUG THIS EXISTS TO STOP RECURRING.
 *
 * `NEXT_PUBLIC_*` is inlined by Next.js at BUILD time, and Railway runs that
 * build inside the Dockerfile's build stage. A stage only receives the
 * `--build-arg`s it declares with ARG. The build stage declared none, so every
 * Railway service variable was passed to a stage that consumed nothing and
 * `npm run build` saw all of them undefined.
 *
 * Nothing failed. Variables with a code default silently shipped the default,
 * so lib/config.ts was the real production configuration while looking like a
 * fallback. Variables WITHOUT one shipped undefined: measured on the live
 * bundle 2026-09-03, the deployed chunk read
 * `let u=t.default.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,s=...;if(u&&s)`, both
 * undefined, so `posthog.init` was never called and production had produced no
 * analytics at all since the move to Railway. The Railway variable was set and
 * correct the entire time.
 *
 * A grep of the source cannot catch that, because the source is right: it reads
 * the variable it should read. The defect is the gap between what the code
 * reads and what the build stage forwards, so that gap is what this measures.
 * Adding a NEXT_PUBLIC_* to app code and forgetting the Dockerfile now fails
 * here, at `npm test`, rather than shipping a silently dead feature. */

const root = fileURLToPath(new URL("..", import.meta.url));

/* Only directories whose code Next.js actually compiles. scripts/ is excluded
   on purpose: those are node CLI tools that read the variable from a real
   environment at run time and are never bundled, so they need no build arg. */
const BUNDLED_ROOTS = ["app", "components", "features", "lib"];
const BUNDLED_FILES = ["instrumentation-client.ts", "next.config.ts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts"]);

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    /* Test files are skipped so that a test ASSERTING a variable is absent, as
       tests/posthog.test.mjs does for the misspelled NEXT_PUBLIC_POSTHOG_KEY,
       cannot demand a build arg for a name nothing reads. */
    if (entry.includes(".test.")) continue;
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) found.push(full);
  }
  return found;
}

function readVariablesFromSource() {
  const files = [
    ...BUNDLED_ROOTS.flatMap((dir) => sourceFiles(path.join(root, dir))),
    ...BUNDLED_FILES.map((file) => path.join(root, file)),
  ];
  const found = new Map();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const [, name] of source.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
      if (!found.has(name)) found.set(name, path.relative(root, file));
    }
  }
  return found;
}

const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
const dockerfileLines = dockerfile.split("\n");

/* The stage Railway builds in. Its ARGs are the only ones that reach
   `npm run build`; an ARG in the dependencies or runtime stage does nothing. */
function buildStageLines() {
  const start = dockerfileLines.findIndex((line) => /^FROM\s.+\sAS\s+build\s*$/.test(line));
  assert.notEqual(start, -1, "Dockerfile has no stage named `build`.");
  const after = dockerfileLines.findIndex((line, index) => index > start && /^FROM\s/.test(line));
  return dockerfileLines.slice(start, after === -1 ? dockerfileLines.length : after);
}

const buildStage = buildStageLines();

const declaredArgs = buildStage
  .map((line) => line.match(/^ARG\s+(NEXT_PUBLIC_[A-Z0-9_]+)/))
  .filter(Boolean)
  .map((match) => match[1]);

test("every NEXT_PUBLIC_* the bundle reads is declared as a build ARG", () => {
  const used = readVariablesFromSource();
  assert.ok(used.size > 0, "found no NEXT_PUBLIC_* references at all; the scan is broken, not the Dockerfile");

  const declared = new Set(declaredArgs);
  const missing = [...used].filter(([name]) => !declared.has(name));

  assert.deepEqual(
    missing.map(([name]) => name),
    [],
    missing
      .map(
        ([name, file]) =>
          `${file} reads ${name}, but the Dockerfile build stage declares no \`ARG ${name}\`. ` +
          `Railway would pass it as a build arg no stage consumes, so the build would see it undefined ` +
          `and Next.js would inline nothing.`,
      )
      .join("\n"),
  );
});

/* WHY THE SECOND LIST EXISTS AND WHY IT HAS TO MATCH.
 *
 * A declared-but-unpassed ARG expands to the EMPTY STRING, not to nothing, so
 * the obvious `ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL` sets the variable
 * to "" on any build that does not pass that arg. `??` is nullish-only, so ""
 * defeats the very defaults that exist to catch a missing variable. Measured
 * locally on 2026-09-04, same commit, same command:
 *
 *   NEXT_PUBLIC_API_URL unset -> API_URL "https://api.trylitos.com"
 *   NEXT_PUBLIC_API_URL=""    -> API_URL ""      and zero occurrences of
 *                                api.trylitos.com anywhere in .next/static
 *
 * The Dockerfile therefore drops empty values before building. That loop is a
 * SECOND list of names, and a name added to the ARG block but not to the loop
 * keeps the trap armed for exactly that variable while looking wired up. So the
 * two lists are pinned equal rather than each being checked alone. */
test("the empty-value guard covers exactly the declared build ARGs", () => {
  const runIndex = buildStage.findIndex((line) => /^RUN\s+set\s+-eu/.test(line));
  assert.notEqual(runIndex, -1, "the build stage no longer strips empty NEXT_PUBLIC_* values before building");

  const lastArgIndex = buildStage.reduce(
    (last, line, index) => (/^ARG\s+NEXT_PUBLIC_/.test(line) ? index : last),
    -1,
  );
  assert.ok(
    lastArgIndex < runIndex,
    "an ARG is declared after the build RUN, where it cannot affect the build",
  );

  const runBlock = [];
  for (let index = runIndex; index < buildStage.length; index += 1) {
    runBlock.push(buildStage[index]);
    if (!buildStage[index].trimEnd().endsWith("\\")) break;
  }
  const guarded = runBlock.join("\n").match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];

  assert.deepEqual(
    [...new Set(guarded)].sort(),
    [...new Set(declaredArgs)].sort(),
    "the Dockerfile's ARG list and its empty-value guard list have drifted apart; " +
      "a variable in one but not the other is either not forwarded to the build, " +
      "or forwarded as an empty string that silently defeats its code default",
  );
});

/* The build stage must not hand a NEXT_PUBLIC_* straight to ENV, which is the
   spelling this file exists to argue against. Checked as shape rather than
   left to review, because the failure it causes is invisible: a build that
   exits 0 and a site whose API base is the empty string. */
test("no NEXT_PUBLIC_* is exported through a bare ENV assignment", () => {
  const offenders = buildStage.filter((line) => /^ENV\s+NEXT_PUBLIC_/.test(line));
  assert.deepEqual(
    offenders,
    [],
    "`ENV NEXT_PUBLIC_X=$NEXT_PUBLIC_X` sets X to \"\" when the build arg is not passed, and \"\" " +
      "passes straight through the `??` defaults in lib/config.ts. Let the RUN guard drop empties instead.",
  );
});
