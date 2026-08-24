import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeSource = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const applicationsSource = await readFile(new URL("../app/dashboard/applications/page.tsx", import.meta.url), "utf8");

test("Home retires delayed resume work when its route unmounts", () => {
  assert.match(homeSource, /const homeMountedRef = useRef\(true\);/);
  assert.match(homeSource, /useLayoutEffect\(\(\) => \{\s*homeMountedRef\.current = true;/);
  assert.match(homeSource, /return \(\) => \{\s*homeMountedRef\.current = false;\s*\};/);

  const prepare = homeSource.slice(
    homeSource.indexOf("async function preparePacket("),
    homeSource.indexOf("function reviewHrefFor("),
  );
  assert.match(prepare, /const requestIsCurrent = \(\) => homeMountedRef\.current;/);
  assert.ok(
    (prepare.match(/if \(!requestIsCurrent\(\)\) return;/g) ?? []).length >= 3,
    "Home must retire both awaited responses and the denial catch after unmount",
  );
  assert.match(
    prepare,
    /catch \(reason\) \{\s*if \(!requestIsCurrent\(\)\) return;\s*if \(isStructuredUpgradeDenial/,
  );
});

test("Applications retires delayed tailoring and cover letter work when its route unmounts", () => {
  assert.match(applicationsSource, /const applicationsMountedRef = useRef\(true\);/);
  assert.match(applicationsSource, /useLayoutEffect\(\(\) => \{\s*applicationsMountedRef\.current = true;/);
  assert.match(applicationsSource, /return \(\) => \{\s*applicationsMountedRef\.current = false;\s*\};/);

  const createApplication = applicationsSource.slice(
    applicationsSource.indexOf("async function createApplication("),
    applicationsSource.indexOf("async function generateCoverLetter("),
  );
  assert.match(createApplication, /const requestIsCurrent = \(\) => applicationsMountedRef\.current;/);
  assert.match(
    createApplication,
    /catch \(reason\) \{\s*if \(!requestMayPublish\(\)\) return;\s*if \(isStructuredUpgradeDenial/,
  );
  assert.match(createApplication, /finally \{\s*if \(requestOwnsLifecycle\(\)\) setCreating\(null\);\s*\}/);

  const generateCoverLetter = applicationsSource.slice(
    applicationsSource.indexOf("async function generateCoverLetter("),
    applicationsSource.indexOf("async function saveCanonicalCoverLetter("),
  );
  assert.match(generateCoverLetter, /const requestIsCurrent = \(\) => applicationsMountedRef\.current;/);
  assert.match(
    generateCoverLetter,
    /catch \(reason\) \{\s*if \(!requestMayPublish\(\)\) return;\s*if \(isStructuredUpgradeDenial/,
  );
  assert.match(generateCoverLetter, /finally \{\s*if \(requestOwnsLifecycle\(\)\) setCoverLetterBusy\(false\);\s*\}/);
});
