import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = await readFile(new URL("../app/dashboard/documents/page.tsx", import.meta.url), "utf8");

test("Documents exposes one keyboard-operable tab interface", () => {
  assert.match(documents, /role="tablist"\s+aria-label="Document sections"/);
  assert.match(documents, /role="tab"[\s\S]{0,180}?id=\{`documents-tab-\$\{value\}`\}/);
  assert.match(documents, /aria-selected=\{tab === value\}/);
  assert.match(documents, /aria-controls="documents-panel"/);
  assert.match(documents, /tabIndex=\{tab === value \? 0 : -1\}/);
  assert.match(documents, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(documents, /id="documents-panel"[\s\S]{0,100}?role="tabpanel"[\s\S]{0,220}?aria-labelledby=\{tab === null \? undefined : `documents-tab-\$\{tab\}`\}/);
  assert.doesNotMatch(documents, /aria-current=\{tab ===/);
  assert.match(documents, /const \[tab, setTab\] = useState<Tab \| null>\(null\)/);
  assert.match(documents, /tab === null && <ShimmerRows rows=\{3\} \/>/);
  assert.doesNotMatch(documents, /useState<Tab>\("base-resume"\)/);
});

test("Documents exposes a truthful narrow-screen overflow cue", () => {
  assert.match(documents, /const \[documentsTabsViewport, setDocumentsTabsViewport\] = useState<HTMLDivElement \| null>\(null\)/);
  assert.match(documents, /ref=\{setDocumentsTabsViewport\}/);
  assert.match(documents, /viewport\.scrollWidth - viewport\.clientWidth - viewport\.scrollLeft/);
  assert.match(documents, /viewport\.addEventListener\("scroll", updateOverflowCue, \{ passive: true \}\)/);
  assert.match(documents, /new ResizeObserver\(updateOverflowCue\)/);
  assert.match(documents, /\{showDocumentsTabOverflowCue && \(/);
  const cue = documents.slice(
    documents.indexOf("{showDocumentsTabOverflowCue && ("),
    documents.indexOf("<MotionPanel", documents.indexOf("{showDocumentsTabOverflowCue && (")),
  );
  assert.doesNotMatch(cue, /sm:hidden/);
});

test("Documents scrolls a deep-linked selected tab into its overflow viewport", () => {
  assert.match(documents, /const selected = tabRefs\.current\[tab\]/);
  assert.match(documents, /selected\.scrollIntoView\(\{[\s\S]{0,180}?inline: "center"/);
  assert.match(documents, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
  assert.match(documents, /const hasLeftOverflow = viewport\.scrollLeft > 2/);
  assert.match(documents, /const hasRightOverflow = viewport\.scrollWidth - viewport\.clientWidth - viewport\.scrollLeft > 2/);
  assert.match(documents, /const safeRight = viewportRect\.right - \(hasRightOverflow \? 48 : 0\)/);
  assert.match(documents, /\[scroll-padding-inline-end:3rem\]/);
  assert.match(documents, /setDocumentsTabsViewportWidth\(viewport\.clientWidth\)/);
  assert.match(documents, /\}, \[documentsTabsViewport, documentsTabsViewportWidth, tab\]\);/);
});
