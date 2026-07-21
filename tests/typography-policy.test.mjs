import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bannedTemplateFonts = [
  "Arial",
  "Geist",
  "Helvetica",
  "Inter",
  "Lato",
  "Montserrat",
  "Nunito",
  "Open Sans",
  "Poppins",
  "Roboto",
];

test("the product uses the distinctive Litos type pair", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const activeTypography = `${layout}\n${globals}`;

  assert.match(layout, /Hanken_Grotesk/);
  assert.match(layout, /Azeret_Mono/);
  assert.match(globals, /--font-sans: var\(--font-hanken-grotesk\)/);
  assert.match(globals, /--font-mono: var\(--font-azeret-mono\)/);

  for (const font of bannedTemplateFonts) {
    assert.doesNotMatch(activeTypography, new RegExp(`\\b${font}\\b`, "i"));
  }
});
