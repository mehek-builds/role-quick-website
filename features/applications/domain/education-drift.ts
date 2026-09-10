import type { ResumeSpec } from "@/lib/api";

/**
 * The education fields a stored packet froze, checked against the profile as it stands now.
 *
 * WHY THIS EXISTS. A packet is rendered once and stored: the PDF that reaches an employer is the
 * blob written at build time (backend submissionRunner.ts buildPacket downloads
 * `generated_resumes.resume_object_key` and uploads those exact bytes), and nothing re-derives it
 * from the profile at send time. So a packet built in June and sent in August prints whatever the
 * profile said in June. On a real account that produced a resume claiming a May 2027 graduation
 * while the profile said May 2028, which is not a display nit: graduation year is what decides
 * whether a student is eligible for an internship at all, and it goes to a third party under her
 * name.
 *
 * WHY THESE THREE FIELDS AND NOT MORE. school, degree and grad_date are the three the backend
 * itself compares with exact string equality when it validates a spec
 * (volley-backend src/engine/resumeValidate.ts, `education school/degree/graduation date differs
 * from uploaded resume`), and it compares them against `profiles.parsed_json` - which is exactly
 * what GET /profile serves for these three keys. So the comparison here is the backend's own rule
 * applied against the backend's own source, and any difference it reports is real drift rather
 * than two stores that were never meant to agree.
 *
 * GPA IS DELIBERATELY EXCLUDED, even though a packet does print one. The packet's gpa is written
 * from `profiles.parsed_json`, but GET /profile overrides gpa, gpa_scale and major from
 * `application_profile` (the store autofill actually types from - see the source-of-truth note on
 * serveProfileJson). Those two are allowed to differ from the moment a packet is born, so
 * comparing them here would flag packets that never drifted at all. Whether the printed GPA and
 * the GPA of record should agree is a separate question, and a backend one.
 */
export type EducationDriftField = {
  /** The key as the profile and the spec both name it. */
  field: "school" | "degree" | "grad_date";
  /** Plain-English name for the line on the resume, for a message a student can act on. */
  label: string;
  /** What the stored packet will print, and send. */
  packet: string;
  /** What the profile says today. */
  profile: string;
};

/** Only the keys this module reads. Anything else GET /profile returns is irrelevant here. */
export type EducationProfile = {
  school?: unknown;
  degree?: unknown;
  grad_date?: unknown;
  grad_year?: unknown;
};

const LABELS: Record<EducationDriftField["field"], string> = {
  school: "School",
  degree: "Degree",
  grad_date: "Graduation date",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The profile's graduation date, with the same fallback the backend applies when it builds a
 * CandidateEducation: `grad_date` when there is one, otherwise the bare `grad_year` as a string.
 * Without the fallback an account whose profile carries only a year would read as "profile has no
 * graduation date", and this function would report drift on every packet it has.
 */
export function profileGradDate(profile: EducationProfile): string {
  const explicit = text(profile.grad_date);
  if (explicit) return explicit;
  const year = profile.grad_year;
  if (typeof year === "number" && Number.isFinite(year)) return String(year);
  return text(year);
}

/**
 * Which education lines this packet would print that the profile no longer agrees with.
 *
 * FAILS CLOSED, in the sense that matters: a profile field that is BLANK reports no drift. Blank
 * means "not on record" rather than "the packet is wrong", and treating an unset field as a
 * contradiction would put a warning on every packet of every account that never filled that box.
 * A packet field that is blank against a populated profile field IS drift, because the resume is
 * then silently omitting something the student has since put on record.
 */
export function educationDrift(
  spec: Pick<ResumeSpec, "school" | "degree" | "grad_date">,
  profile: EducationProfile | null | undefined,
): EducationDriftField[] {
  if (!profile) return [];
  const current: Record<EducationDriftField["field"], string> = {
    school: text(profile.school),
    degree: text(profile.degree),
    grad_date: profileGradDate(profile),
  };
  const drift: EducationDriftField[] = [];
  for (const field of ["school", "degree", "grad_date"] as const) {
    const profileValue = current[field];
    if (!profileValue) continue;
    const packetValue = text(spec[field]);
    if (packetValue === profileValue) continue;
    drift.push({ field, label: LABELS[field], packet: packetValue, profile: profileValue });
  }
  return drift;
}

/**
 * One sentence naming what disagrees, for a banner and for the refusal the unattended send raises.
 *
 * It quotes BOTH values. "Your resume is out of date" tells a student nothing she can check; "this
 * resume says May 2027, your profile says May 2028" tells her which one is wrong, and she is the
 * only one who knows.
 */
export function educationDriftMessage(drift: EducationDriftField[]): string | null {
  if (drift.length === 0) return null;
  const parts = drift.map((item) =>
    `${item.label.toLowerCase()} reads "${item.packet || "(blank)"}" but your profile says "${item.profile}"`,
  );
  return `This resume was built before you last changed your profile: ${parts.join("; ")}. Fix the education line below and save before sending it.`;
}

/**
 * Rewrite the packet's education fields to the values the profile now holds, for the one-click
 * repair the drift banner offers.
 *
 * WHY LITOS DOES THIS, NOT THE STUDENT. The backend refuses to send a packet whose school, degree
 * or graduation date disagrees with `profiles.parsed_json` (resumeValidate.ts), so the resume MUST
 * end up carrying exactly the profile's values before it can go out. Asking the student to retype
 * into the resume what the profile already records is friction with no decision in it: the profile
 * is the authority the send is validated against, so the only correct destination for these three
 * fields is the profile's own text. When the profile itself is what is wrong, she fixes it in
 * settings and the resume then reconciles to the corrected profile the same way.
 *
 * ONLY THE DRIFTING FIELDS MOVE, and only toward a profile value that exists. This reuses
 * `educationDrift`, so a field the profile leaves blank is never copied over a populated resume
 * line (that direction is not drift), and a field that already agrees is left untouched. A spec
 * with no drift is returned unchanged, so a caller can apply this unconditionally.
 */
export function reconcileEducationFromProfile<
  T extends Pick<ResumeSpec, "school" | "degree" | "grad_date">,
>(spec: T, profile: EducationProfile | null | undefined): T {
  const drift = educationDrift(spec, profile);
  if (drift.length === 0) return spec;
  const next: T = { ...spec };
  for (const item of drift) {
    if (item.field === "school") next.school = item.profile;
    else if (item.field === "degree") next.degree = item.profile;
    else next.grad_date = item.profile;
  }
  return next;
}
