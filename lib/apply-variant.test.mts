import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyBankVariant, bulletOverlap } from "./apply-variant.ts";
import type { ResumeSpec } from "./api.ts";

function spec(bullets: string[], org = "Traeco", extra: Partial<ResumeSpec> = {}): ResumeSpec {
  return {
    school: "USC",
    degree: "BS Computer Science",
    grad_date: "May 2028",
    coursework: "",
    experience: [{ type: "job", org, title: "Intern", date_range: "Jun 2025 - Aug 2025", bullets }],
    skills: [],
    ...extra,
  } as ResumeSpec;
}

const bulletsOf = (r: { spec: ResumeSpec }) => r.spec.experience[0].bullets;

describe("applyBankVariant", () => {
  test("swaps the phrasing of the same accomplishment instead of printing both", () => {
    const aws = "Containerized six services with Docker and deployed them on AWS, cutting release time by 35%";
    const k8s = "Containerized six services with Docker and deployed them on Kubernetes, cutting release time by 35%";
    const r = applyBankVariant(spec([aws]), { org: "Traeco", variant: k8s });
    assert.equal(r.outcome.kind, "replaced");
    assert.deepEqual(bulletsOf(r), [k8s]);
  });

  test("REPLACES THE MOST SIMILAR BULLET, not the first one over the line", () => {
    // Reproduced in review: findIndex took the 0.462 invoice bullet over the 0.818 payroll one,
    // deleting a distinct accomplishment AND leaving the near-duplicate it existed to remove.
    const invoice = "Automated invoice reconciliation in Excel for 40 vendors, cutting close time by two days";
    const payroll = "Automated payroll reconciliation in Excel for 12 entities, cutting close time by three days";
    const variant = "Automated payroll reconciliation with Alteryx for 12 entities, cutting close time by three days";
    const r = applyBankVariant(spec([invoice, payroll]), { org: "Traeco", variant });
    assert.ok(bulletsOf(r).includes(invoice), "the distinct accomplishment must survive");
    assert.ok(!bulletsOf(r).includes(payroll), "the actual near-duplicate is the one replaced");
  });

  test("APPENDS rather than guessing when two bullets are equally plausible", () => {
    const a = "Led a team of four engineers building the payments service";
    const b = "Led a team of four engineers building the payments platform";
    const variant = "Led a team of four engineers building the payments API";
    const r = applyBankVariant(spec([a, b]), { org: "Traeco", variant });
    assert.equal(r.outcome.kind, "appended");
    assert.equal(bulletsOf(r).length, 3, "nothing is deleted when we cannot tell which was meant");
  });

  test("does NOT overwrite a distinct accomplishment that merely shares vocabulary", () => {
    // Scored 0.333 under the old 0.3 threshold and would have been silently destroyed.
    const existing = "Led a team of four engineers building the payments service";
    const variant = "Led a team of three analysts building the reporting service";
    const r = applyBankVariant(spec([existing]), { org: "Traeco", variant });
    assert.equal(r.outcome.kind, "appended");
    assert.ok(bulletsOf(r).includes(existing));
  });

  test("names the words the resume stops carrying, rather than silently trading them", () => {
    // The student chose this wording, so the swap happens; what it costs is reported so the trade
    // is visible and undoable rather than silent.
    const existing = "Built a React dashboard for the operations team using TypeScript";
    const variant = "Built a React dashboard for the analytics team using Kubernetes";
    const r = applyBankVariant(spec([existing]), { org: "Traeco", variant });
    assert.equal(r.outcome.kind, "replaced");
    assert.ok(
      r.outcome.kind === "replaced" && r.outcome.dropped.includes("typescript"),
      "losing TypeScript from the page has to be stated",
    );
  });

  test("reports no loss when the words survive elsewhere on the resume", () => {
    const existing = "Shipped the billing service in Python";
    const variant = "Shipped the billing service in Python on Kubernetes";
    const r = applyBankVariant(spec([existing], "Traeco", { skills: ["Python"] }), {
      org: "Traeco",
      variant,
    });
    assert.equal(r.outcome.kind, "replaced");
    assert.deepEqual(r.outcome.kind === "replaced" ? r.outcome.dropped : null, []);
  });

  test("never attaches a bullet to a role that is not on this resume", () => {
    const r = applyBankVariant(spec(["Something"], "Traeco"), { org: "Litos", variant: "New bullet" });
    assert.equal(r.outcome.kind, "role_not_on_resume");
    assert.deepEqual(bulletsOf(r), ["Something"], "the resume is untouched");
  });

  test("declines rather than guessing between two roles at the same employer", () => {
    const two: ResumeSpec = {
      ...spec(["A"]),
      experience: [
        { type: "job", org: "Traeco", title: "Intern", date_range: "2025", bullets: ["A"] },
        { type: "job", org: "Traeco", title: "Engineer", date_range: "2026", bullets: ["B"] },
      ],
    } as ResumeSpec;
    const r = applyBankVariant(two, { org: "Traeco", variant: "New" });
    assert.equal(r.outcome.kind, "ambiguous_role");
  });

  test("reports an exact duplicate rather than silently doing nothing", () => {
    const b = "Ran Docker tests nightly";
    const r = applyBankVariant(spec([b]), { org: "Traeco", variant: b });
    assert.equal(r.outcome.kind, "already_present");
    assert.equal(bulletsOf(r).length, 1);
  });

  test("a replaced bullet is always named, so the UI can show what it removed", () => {
    const aws = "Containerized six services with Docker and deployed them on AWS, cutting release time by 35%";
    const k8s = "Containerized six services with Docker and deployed them on Kubernetes, cutting release time by 35%";
    const r = applyBankVariant(spec([aws]), { org: "Traeco", variant: k8s });
    assert.equal(r.outcome.kind === "replaced" && r.outcome.removed, aws);
  });

  test("never loses a bullet: count is unchanged on swap and grows by one on append", () => {
    const before = ["One thing entirely", "Another separate matter"];
    const r = applyBankVariant(spec(before), { org: "Traeco", variant: "A third unrelated item" });
    assert.equal(bulletsOf(r).length, before.length + 1);
  });

  test("two phrasings of one deploy bullet score as the same accomplishment", () => {
    const aws = "Containerized six services with Docker and deployed them on AWS, cutting release time by 35%";
    const k8s = "Containerized six services with Docker and deployed them on Kubernetes, cutting release time by 35%";
    assert.ok(bulletOverlap(aws, k8s) >= 0.5);
  });

  test("two unrelated bullets score near zero", () => {
    const a = "Built a TypeScript and React dashboard backed by a PostgreSQL database";
    const b = "Provisioned infrastructure with Terraform across two environments";
    assert.ok(bulletOverlap(a, b) < 0.2);
  });

  test("empty input does not divide by zero", () => {
    assert.equal(bulletOverlap("", "anything at all here"), 0);
  });
});
