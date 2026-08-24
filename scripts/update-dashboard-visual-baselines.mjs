import assert from "node:assert/strict";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const artifactDir = path.join(process.cwd(), "test-results", "dashboard-visual-regressions");
const baselineDir = path.join(process.cwd(), "tests", "visual-baselines", "dashboard");
const manifestPath = path.join(baselineDir, "manifest.json");

const screenshotNames = (await readdir(artifactDir))
  .filter((name) => name.endsWith(".png"))
  .sort();

assert.ok(
  screenshotNames.length >= 68,
  `refusing to approve an incomplete visual run with only ${screenshotNames.length} screenshots`,
);

await rm(baselineDir, { recursive: true, force: true });
await mkdir(baselineDir, { recursive: true });

const manifest = {};
for (const name of screenshotNames) {
  const source = path.join(artifactDir, name);
  const metadata = await sharp(source).metadata();
  assert.ok(metadata.width && metadata.height, `${name} has no readable dimensions`);
  manifest[name] = { width: metadata.width, height: metadata.height };
  await sharp(source)
    .resize(256, 256, { fit: "fill" })
    .blur(0.6)
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(baselineDir, name));
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Approved ${screenshotNames.length} dashboard visual baselines.\n`);
