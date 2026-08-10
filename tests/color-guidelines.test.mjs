import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(file));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(file);
  }
  return files;
}

const CONTRACT_EXCLUDED_FILES = new Set([
  "app/opengraph-image.tsx",
  "components/FlowDemo.tsx",
  "components/HeroBackdrop.tsx",
  "components/Mockups.tsx",
  "components/OutreachDemo.tsx",
  "components/PacketDemo.tsx",
  "components/PacketViewer.tsx",
  "components/RealCaptures.tsx",
]);

const RAW_COLOR_EXCLUDED_FILES = new Set([
  ...CONTRACT_EXCLUDED_FILES,
  "components/MobileSendLink.tsx",
  "components/try/TrySimulator.tsx",
]);

function contractExcluded(file) {
  const name = relative(file);
  return name.startsWith("app/qa/")
    || name.startsWith("components/cinema/paperRollEngine")
    || CONTRACT_EXCLUDED_FILES.has(name);
}

function rawColorExcluded(file) {
  return contractExcluded(file) || RAW_COLOR_EXCLUDED_FILES.has(relative(file));
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => channel(Number.parseInt(value, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function token(css, name) {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[a-f\\d]{6})`, "i"));
  assert.ok(match, `missing --color-${name}`);
  return match[1];
}

test("action text and control boundaries meet WCAG contrast contracts", async () => {
  const css = await readFile(path.join(ROOT, "app/globals.css"), "utf8");
  const action = token(css, "action");
  const actionInk = token(css, "action-ink");
  const controlBorder = token(css, "control-border");
  const surface = token(css, "surface");
  const danger = token(css, "danger");

  assert.ok(contrast(action, actionInk) >= 4.5, "primary action label must reach 4.5:1");
  assert.ok(contrast(danger, surface) >= 4.5, "destructive action label must reach 4.5:1");
  assert.ok(contrast(controlBorder, surface) >= 3, "control boundary must reach 3:1");
  assert.match(css, /--color-action:\s*var\(--color-action\)/);
  assert.match(css, /--color-action-ink:\s*var\(--color-action-ink\)/);
  assert.match(css, /--color-control-border:\s*var\(--color-control-border\)/);
  assert.match(css, /\.rq-field\s*{[^}]*var\(--color-control-border\)/s);
  assert.match(css, /\.rq-field:hover[^}]*var\(--color-muted\)/);
});

test("shared buttons use accessible action tokens and a narrow danger variant", async () => {
  const source = await readFile(path.join(ROOT, "components/app/Button.tsx"), "utf8");
  const mobileSendLink = await readFile(path.join(ROOT, "components/MobileSendLink.tsx"), "utf8");
  assert.match(source, /primary:\s*"[^"]*bg-action[^"]*text-action-ink/);
  assert.match(source, /danger:\s*"[^"]*bg-danger[^"]*text-white/);
  assert.match(source, /secondary:\s*"[^"]*border-control-border/);
  assert.match(mobileSendLink, /Copy install link[\s\S]*?border-control-border|border-control-border[\s\S]*?Copy install link/);
});

test("production UI does not use low-contrast brand blue for small action text", async () => {
  const files = [
    ...await sourceFiles(path.join(ROOT, "app")),
    ...await sourceFiles(path.join(ROOT, "components")),
  ].filter((file) => !contractExcluded(file));
  const failures = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const scannable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[\t ]*\/\/.*$/gm, "");
    const classAttribute = /\bclassName=(?:"([^"]*)"|{`([\s\S]*?)`}|{\s*"([^"]*)"\s*})/g;
    for (const match of scannable.matchAll(classAttribute)) {
      const classes = match[1] ?? match[2] ?? match[3] ?? "";
      const line = scannable.slice(0, match.index).split("\n").length;
      if (/\bbg-brand(?:\/\d+)?\b/.test(classes) && /\btext-white\b/.test(classes)) {
        failures.push(`${relative(file)}:${line} uses brand fill with white text`);
      }
      if (/\btext-brand\b(?!-ink)/.test(classes)) {
        failures.push(`${relative(file)}:${line} uses brand blue for interactive text`);
      }
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

test("production UI uses tokens instead of arbitrary color literals", async () => {
  const files = [
    ...await sourceFiles(path.join(ROOT, "app")),
    ...await sourceFiles(path.join(ROOT, "components")),
  ].filter((file) => !rawColorExcluded(file));
  const failures = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    source.split("\n").forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (/(?:bg|text|border|ring|accent)-\[#[a-f\d]{3,8}\]|(?:color|background(?:Color)?|borderColor):\s*["']#[a-f\d]{3,8}/i.test(code)) {
        failures.push(`${relative(file)}:${index + 1} contains a raw UI color`);
      }
    });
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

test("production form controls use the accessible resting boundary", async () => {
  const files = [
    ...await sourceFiles(path.join(ROOT, "app")),
    ...await sourceFiles(path.join(ROOT, "components")),
  ].filter((file) => !contractExcluded(file));
  const failures = [];
  const control = /<(input|select|textarea)\b[\s\S]*?\bclassName=(?:"([^"]*)"|{`([^`]*)`}|{\s*"([^"]*)"\s*})/g;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const scannable = source
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
      .replace(/^[\t ]*\/\/.*$/gm, (comment) => " ".repeat(comment.length));
    for (const match of scannable.matchAll(control)) {
      const classes = match[2] ?? match[3] ?? match[4] ?? "";
      const nativeShape = /\btype=["'](?:checkbox|radio|range|file|hidden)["']/.test(match[0]);
      const customBoundary = /(?:^|\s)border(?:\s|$)/.test(classes);
      const accessibleBoundary = /\b(?:rq-field|border-control-border)\b/.test(classes);
      if (!/\bborder-border\b/.test(classes) && (!customBoundary || accessibleBoundary || nativeShape)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${relative(file)}:${line} must use rq-field or border-control-border`);
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});

const FAINT_DECORATION_ALLOWLIST = new Map([
  ["app/for-career-centres/page.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["app/not-found.tsx", [/font-mono.*uppercase.*text-faint/, /NO MATCH/]],
  ["app/cookies/page.tsx", [/text-label text-faint/]],
  ["app/error.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["app/contact/page.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["app/security/page.tsx", [/text-label text-faint/]],
  ["app/status/page.tsx", [/text-label text-faint/]],
  ["app/litos-vs-simplify/page.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["app/try/page.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["app/dashboard/not-found.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["app/dashboard/jobs/page.tsx", [/font-mono.*uppercase.*text-faint/, /pay && type.*text-faint/]],
  ["app/dashboard/page.tsx", [/aria-hidden.*text-faint/, /pay && type.*text-faint/]],
  ["app/browse-jobs/page.tsx", [/pay && type.*text-faint/, /font-mono.*uppercase.*text-faint/, /gap-.*text-faint/]],
  ["app/page.tsx", [/group-open:rotate-45/]],
  ["components/start/ui.tsx", [/font-mono.*uppercase.*text-faint/]],
  ["components/app/ui.tsx", [/const shared = .*text-faint/]],
  ["components/app/ApplicationPacket.tsx", [/font-mono.*uppercase.*text-faint/, />·<|>·<\/span>/]],
]);

test("faint text is limited to audited decoration and redundant labels", async () => {
  const files = [
    ...await sourceFiles(path.join(ROOT, "app")),
    ...await sourceFiles(path.join(ROOT, "components")),
  ].filter((file) => !contractExcluded(file));
  const failures = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const scannable = source
      .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
      .replace(/^[\t ]*\/\/.*$/gm, (comment) => " ".repeat(comment.length));
    const name = relative(file);
    const allowed = FAINT_DECORATION_ALLOWLIST.get(name) ?? [];
    let allowedCount = 0;

    scannable.split("\n").forEach((line, index) => {
      const renderedFaint = line
        .replaceAll("placeholder:text-faint", "")
        .replaceAll("disabled:text-faint", "");
      if (!/\btext-faint\b/.test(renderedFaint)) return;
      if (allowed.some((pattern) => pattern.test(renderedFaint))) {
        allowedCount += 1;
        return;
      }
      failures.push(`${name}:${index + 1} uses faint text for unaudited content`);
    });

    if (allowedCount > allowed.length) {
      failures.push(`${name} has more faint decorations than its audited allowlist`);
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});
