import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

import { compareNormalizedDashboardVisuals, normalizeDashboardVisual } from "./e2e/dashboard-visual-comparator.mjs";
import { dashboardVisualBaselineDirectory } from "./e2e/dashboard-visual-paths.mjs";

const [packageSource, browserSource, updaterSource, comparatorSource, pathsSource, workflowSource] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("e2e/dashboard-visual-regressions.spec.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/update-dashboard-visual-baselines.mjs", import.meta.url), "utf8"),
  readFile(new URL("e2e/dashboard-visual-comparator.mjs", import.meta.url), "utf8"),
  readFile(new URL("e2e/dashboard-visual-paths.mjs", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
]);

test("visual baseline approval runs only after a successful browser process", () => {
  const scripts = JSON.parse(packageSource).scripts;
  assert.match(
    scripts["update:dashboard-visual-baselines"],
    /^npm run build && DASHBOARD_VISUAL_BASELINE_MODE=capture node --test tests\/e2e\/dashboard-visual-regressions\.spec\.mjs && node scripts\/update-dashboard-visual-baselines\.mjs$/,
  );
  assert.match(browserSource, /if \(CAPTURE_VISUAL_BASELINES\) return;/);
  assert.doesNotMatch(browserSource, /if \(CAPTURE_VISUAL_BASELINES\)[\s\S]{0,300}(?:writeFile|toFile)/);
  assert.match(updaterSource, /screenshotNames\.length >= 70/);
});

test("visual evidence uses an approved baseline from the rendering platform", async () => {
  assert.match(dashboardVisualBaselineDirectory("/fixture", "darwin"), /dashboard\/darwin$/);
  assert.match(dashboardVisualBaselineDirectory("/fixture", "linux"), /dashboard\/linux$/);
  assert.throws(() => dashboardVisualBaselineDirectory("/fixture", "win32"), /do not support win32/);
  assert.match(browserSource, /dashboardVisualBaselineDirectory\(\)/);
  assert.match(updaterSource, /dashboardVisualBaselineDirectory\(process\.cwd\(\), captureMetadata\.platform\)/);
  assert.match(pathsSource, /platform = process\.platform/);
  assert.match(pathsSource, /platform !== "darwin" && platform !== "linux"/);
  assert.doesNotMatch(pathsSource, /DASHBOARD_VISUAL_BASELINE_PLATFORM/);
  assert.doesNotMatch(workflowSource, /DASHBOARD_VISUAL_BASELINE_PLATFORM/);
  assert.match(browserSource, /normalizedVisualBuffer\(currentPath\),\s*normalizedVisualBuffer\(baselinePath\)/);
  assert.match(updaterSource, /await rm\(baselineDir, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(updaterSource, /await rm\(baselineRoot/);
  assert.match(updaterSource, /approvedScreenshots\.push\(\{ name, source \}\)[\s\S]+await rm\(baselineDir/);
  assert.match(updaterSource, /capture artifacts and approved baselines must be separate directories/);
  assert.match(updaterSource, /await copyFile\(source, path\.join\(baselineDir, name\)\)/);

  const manifest = JSON.parse(await readFile(new URL("visual-baselines/dashboard/manifest.json", import.meta.url), "utf8"));
  const manifestNames = Object.keys(manifest).sort();
  const approvedNames = async (platform) => (await readdir(new URL(`visual-baselines/dashboard/${platform}/`, import.meta.url)))
    .filter((name) => name.endsWith(".png"))
    .sort();
  const [macNames, linuxNames] = await Promise.all([
    approvedNames("darwin"),
    approvedNames("linux"),
  ]);
  assert.deepEqual(macNames, manifestNames);
  assert.deepEqual(linuxNames, macNames, "macOS and Linux must approve the same visual evidence set");

  for (const platform of ["darwin", "linux"]) {
    const capture = JSON.parse(await readFile(new URL(`visual-baselines/dashboard/${platform}/capture-platform.json`, import.meta.url), "utf8"));
    assert.equal(capture.platform, platform);
    for (const name of manifestNames) {
      const baseline = await readFile(new URL(`visual-baselines/dashboard/${platform}/${name}`, import.meta.url));
      const metadata = await sharp(baseline).metadata();
      assert.deepEqual({ width: metadata.width, height: metadata.height }, manifest[name], `${platform}/${name} lost its raw viewport dimensions`);
    }
  }
});

test("visual comparison catches both broad drift and a localized missing control", () => {
  assert.match(comparatorSource, /resize\(256, 256/);
  assert.match(browserSource, /compareNormalizedDashboardVisuals\(current, baseline\)/);
  assert.match(browserSource, /assert\.deepEqual\(screenshotNames, baselineNames/);
  assert.match(browserSource, /changed viewport dimensions/);
  assert.match(browserSource, /await document\.fonts\.ready/);
  assert.match(browserSource, /waitForStableGeometry\(officialDialog, "Official transcript upload stage"\)/);

  const baseline = Buffer.alloc(256 * 256 * 3, 246);
  const missingControl = Buffer.from(baseline);
  for (let y = 106; y < 117; y += 1) {
    for (let x = 112; x < 136; x += 1) {
      const offset = (y * 256 + x) * 3;
      missingControl[offset] = 65;
      missingControl[offset + 1] = 105;
      missingControl[offset + 2] = 225;
    }
  }
  const localized = compareNormalizedDashboardVisuals(missingControl, baseline);
  assert.equal(localized.failed, true, `localized missing control was not detected: ${JSON.stringify(localized)}`);

  const identical = compareNormalizedDashboardVisuals(baseline, baseline);
  assert.equal(identical.failed, false, `identical evidence was rejected: ${JSON.stringify(identical)}`);
});

test("visual comparison rejects removing the real low-contrast Saving import control", async () => {
  const approved = await readFile(new URL("visual-fixtures/dashboard/network-320-commit-locked.png", import.meta.url));
  const { data: fullResolution, info } = await sharp(approved)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual({ width: info.width, height: info.height, channels: info.channels }, { width: 320, height: 780, channels: 3 });

  const eraseRegion = async (top) => {
    const removedControl = Buffer.from(fullResolution);
    for (let y = top; y < top + 48; y += 1) {
      for (let x = 56; x < 214; x += 1) {
        const offset = (y * info.width + x) * 3;
        removedControl[offset] = 253;
        removedControl[offset + 1] = 248;
        removedControl[offset + 2] = 245;
      }
    }
    return normalizeDashboardVisual(removedControl, info);
  };

  const baseline = await normalizeDashboardVisual(fullResolution, info);
  const wholeControlRemoved = await eraseRegion(558);
  const result = compareNormalizedDashboardVisuals(wholeControlRemoved, baseline);
  assert.equal(result.failed, true, `whole real control removal was not detected: ${JSON.stringify(result)}`);
  assert.ok(result.maxLocalCluster >= 15, `the missing control did not form a material connected region: ${JSON.stringify(result)}`);
});
