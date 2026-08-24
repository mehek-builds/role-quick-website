import assert from "node:assert/strict";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import {
  DASHBOARD_VISUAL_CAPTURE_METADATA,
  dashboardVisualArtifactDirectory,
  dashboardVisualBaselineDirectory,
  dashboardVisualBaselineRoot,
} from "../tests/e2e/dashboard-visual-paths.mjs";

const artifactDir = dashboardVisualArtifactDirectory();
const captureMetadata = JSON.parse(await readFile(path.join(artifactDir, DASHBOARD_VISUAL_CAPTURE_METADATA), "utf8"));
assert.ok(captureMetadata.platform === "darwin" || captureMetadata.platform === "linux", "capture metadata names an unsupported platform");
assert.equal(typeof captureMetadata.arch, "string", "capture metadata must name its architecture");
assert.equal(typeof captureMetadata.playwright, "string", "capture metadata must name its Playwright version");
assert.equal(typeof captureMetadata.browser, "string", "capture metadata must name its browser version");

const baselineRoot = dashboardVisualBaselineRoot();
const baselineDir = dashboardVisualBaselineDirectory(process.cwd(), captureMetadata.platform);
const manifestPath = path.join(baselineRoot, "manifest.json");

const isWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};
assert.ok(
  !isWithin(baselineDir, artifactDir) && !isWithin(artifactDir, baselineDir),
  "capture artifacts and approved baselines must be separate directories",
);

const screenshotNames = (await readdir(artifactDir))
  .filter((name) => name.endsWith(".png"))
  .sort();

assert.ok(
  screenshotNames.length >= 70,
  `refusing to approve an incomplete visual run with only ${screenshotNames.length} screenshots`,
);

const approvedScreenshots = [];
const manifest = {};
for (const name of screenshotNames) {
  const source = path.join(artifactDir, name);
  const metadata = await sharp(source).metadata();
  assert.ok(metadata.width && metadata.height, `${name} has no readable dimensions`);
  manifest[name] = { width: metadata.width, height: metadata.height };
  approvedScreenshots.push({ name, source });
}

await mkdir(baselineRoot, { recursive: true });
await rm(baselineDir, { recursive: true, force: true });
await mkdir(baselineDir, { recursive: true });

for (const { name, source } of approvedScreenshots) {
  await copyFile(source, path.join(baselineDir, name));
}

await copyFile(
  path.join(artifactDir, DASHBOARD_VISUAL_CAPTURE_METADATA),
  path.join(baselineDir, DASHBOARD_VISUAL_CAPTURE_METADATA),
);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Approved ${screenshotNames.length} ${captureMetadata.platform} dashboard visual baselines.\n`);
