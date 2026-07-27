import assert from "node:assert/strict";
import { describe, test } from "node:test";

/* The duplicate case: two entries at one employer whose duty line reads identically. The policy
 * pass dedupes bullets WITHIN one entry, so this is the only shape that reaches the metrics ask.
 *
 * A plain `find` matched the first answer for both bullets, so one number was written twice and the
 * other silently dropped: a number attached to work it does not describe, on a resume the student is
 * about to approve. This mirrors applyMetrics' matching, which is what the fix changed. */
function apply(experience, gaps, answers) {
  const pending = new Map();
  const key = (org, bullet) => `${org} ${bullet}`;
  gaps.forEach((gap, i) => {
    const value = (answers[i] ?? "").trim();
    if (!value) return;
    const k = key(gap.org, gap.bullet);
    pending.set(k, [...(pending.get(k) ?? []), value]);
  });
  return experience.map((entry) => ({
    ...entry,
    bullets: entry.bullets.map((bullet) => {
      const value = pending.get(key(entry.org, bullet))?.shift();
      return value ? `${bullet.replace(/\.\s*$/, "")} (${value}).` : bullet;
    }),
  }));
}

describe("metric answers are consumed one per occurrence", () => {
  test("two identical bullets at one employer get their own answers, in order", () => {
    const experience = [
      { org: "Acme", bullets: ["Managed the intake desk."] },
      { org: "Acme", bullets: ["Managed the intake desk."] },
    ];
    const gaps = [
      { org: "Acme", bullet: "Managed the intake desk." },
      { org: "Acme", bullet: "Managed the intake desk." },
    ];
    const out = apply(experience, gaps, ["12 a week", "30 a week"]);
    assert.equal(out[0].bullets[0], "Managed the intake desk (12 a week).");
    assert.equal(
      out[1].bullets[0],
      "Managed the intake desk (30 a week).",
      "the second answer must not be dropped, nor the first reused",
    );
  });

  test("an unanswered gap leaves its bullet exactly as it was", () => {
    const experience = [{ org: "Acme", bullets: ["Managed the intake desk.", "Filed reports."] }];
    const gaps = [
      { org: "Acme", bullet: "Managed the intake desk." },
      { org: "Acme", bullet: "Filed reports." },
    ];
    const out = apply(experience, gaps, ["12 a week", "   "]);
    assert.equal(out[0].bullets[0], "Managed the intake desk (12 a week).");
    assert.equal(out[0].bullets[1], "Filed reports.");
  });

  test("a bullet nobody was asked about is untouched", () => {
    const experience = [{ org: "Acme", bullets: ["Cut latency 40%."] }];
    const out = apply(experience, [], []);
    assert.equal(out[0].bullets[0], "Cut latency 40%.");
  });
});
