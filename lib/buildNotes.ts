/* The build's own diagnostics, said in words a student can act on.
 *
 * WHY THIS EXISTS. /start rendered the validator's issue strings verbatim, so the note a student got
 * on the screen where they approve their resume read:
 *
 *     bullet not action-verb-first ("Maintained"): "Maintained a caseload of 12-21 individua"
 *
 * Three things wrong with that, all measured on real resumes on 2026-07-27. "action-verb-first" is
 * internal vocabulary, and DESIGN.md's plain-language bar is that a twelve-year-old should not have
 * to guess what a word means. The quotation was chopped mid-word. And nothing in the sentence says
 * what to do about it, on a screen that can edit the bullet in place.
 *
 * The translation lives HERE and not in the backend on purpose. Those strings are also the retry
 * feedback the tailored path feeds back to the model and the text the resume tests assert on, so
 * they are an internal contract; this is the display boundary, which is where wording for a human
 * belongs. An unrecognised note falls through unchanged rather than being swallowed, because a note
 * the student cannot read still beats a note they never see.
 */
export function humanizeBuildNote(raw: string): string {
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [
      /^bullet not action-verb-first \("([^"]+)"\): "(.+)"$/,
      (m) =>
        `One bullet opens with "${m[1]}", which describes holding something rather than doing it. Rewrite it to start with the action you took: ${m[2]}`,
    ],
    [
      /^coursework contains a course not listed on the uploaded resume$/,
      () => "The coursework line has a course that is not on the resume you uploaded. Check it before you approve this.",
    ],
    [
      /^dropped unsupported bullet in (.+)$/,
      (m) => `We left out a bullet from ${m[1]}, because the resume you uploaded does not say it.`,
    ],
    [
      /^dropped entry "(.+)" \(not in experience bank\)$/,
      (m) => `We left ${m[1]} off, because it is not in your experience yet.`,
    ],
    [
      /^dropped "(.+)" entirely, nothing on it could be supported by your resume$/,
      (m) => `We left ${m[1]} off entirely, because nothing listed under it appears on the resume you uploaded.`,
    ],
    [
      /^dropped ungrounded skills: (.+)$/,
      (m) => `We left these skills off, because they are not on the resume you uploaded: ${m[1]}.`,
    ],
    [/^em dash in bullet: "(.+)"$/, (m) => `One bullet uses an em dash, which we never print: ${m[1]}`],
    [
      /^bullet exceeds (\d+) chars: "(.+)"$/,
      (m) => `One bullet runs past ${m[1]} characters and will wrap awkwardly on the page: ${m[2]}`,
    ],
    [
      /^grounding: metric "([^"]+)" in a (.+?) bullet is not in the experience bank \("(.+)"\)$/,
      (m) => `The number "${m[1]}" in a ${m[2]} bullet is not on the resume you uploaded. Check it: ${m[3]}`,
    ],
    [
      /^grounding: (.+?) "(.+?)" in a (.+?) bullet is not in the experience bank(?: \("(.*)"\))?$/,
      (m) =>
        `A ${m[1]} in a ${m[3]} bullet ("${m[2]}") is not on the resume you uploaded. Check it${m[4] ? `: ${m[4]}` : "."}`,
    ],
    [
      /^dropped bullet with ungrounded (.+?) in (.+)$/,
      (m) => `We left out a bullet from ${m[2]}, because the number in it (${m[1]}) is not on the resume you uploaded.`,
    ],
    [
      /^reset title "(.+?)" -> "(.+?)" for (.+)$/,
      (m) => `We put your title at ${m[3]} back to "${m[2]}", the one your resume gives.`,
    ],
    [
      /^reset date "(.+?)" -> "(.+?)" for (.+)$/,
      (m) => `We put the dates at ${m[3]} back to "${m[2]}", the ones your resume gives.`,
    ],
    [
      /^(\d+) entries selected \(max (\d+)\)$/,
      (m) => `${m[1]} roles were picked and only ${m[2]} fit on a page.`,
    ],
    [
      /^education must render (.+)$/,
      (m) => `Your education should sit ${m[1].replace(/^at the top for a currently enrolled student$/, "at the top, since you are still enrolled").replace(/^after experience for this candidate$/, "below your experience")}.`,
    ],
    [
      /^dropped ungrounded skill: (.+)$/,
      (m) => `We left the skill ${m[1]} off, because it is not on the resume you uploaded.`,
    ],
    [
      /^education (school|degree|graduation date) differs from uploaded resume$/,
      (m) => `The ${m[1] === "graduation date" ? "graduation date" : m[1]} here does not match the resume you uploaded.`,
    ],
    [/^no experience entries selected$/, () => "Nothing was selected for this resume. Try building it again."],
    [/^(.+): no bullets selected$/, (m) => `${m[1]} came through with no bullets.`],
  ];

  for (const [re, say] of patterns) {
    const match = raw.match(re);
    if (match) return say(match);
  }
  return raw;
}
