/**
 * CHANGING THE TEST REMOVES THE SCORES THAT NO LONGER APPLY.
 *
 * THE DEFECT THIS CLOSES. Nothing on the gaps screen used to remove anything. The save patch is
 * built by iterating everything the student has typed, and every setState was an additive spread,
 * so a value that stopped being VISIBLE went on being SENT. Choosing "Both", filling 1520 and 34,
 * then changing the answer to "None" posted all three:
 *
 *   {"standardized_test_type":"None","sat_score":"1520","act_score":"34"}
 *
 * The API stored it, because the three were independent optional fields with no cross-field check,
 * and the resolver then did exactly what it should with what it was given: it told one employer, on
 * one form, that she had taken no standardized test and that her SAT was 1520. A contradiction
 * Litos generated itself, out of a student changing her mind mid-step.
 *
 * IN ITS OWN FILE so it can be driven by a test. The defect was in what the state machine DID, and
 * a component that only a regex can reach is one a test can only describe, not exercise. The step
 * imports this and owns nothing but the rendering.
 *
 * THIS IS THE EXPERIENCE, NOT THE GUARANTEE. It lives in one component, and the extension, a
 * replayed request and any future caller reach the API without passing through it. The same rule is
 * enforced server-side against the merged stored state; see testScoreConflict in the backend's
 * routes/applicationProfile.ts.
 */

/** The literal option values the select offers, matching the backend enum. */
export const TEST_TYPE_OPTIONS = ["SAT", "ACT", "Both", "None"] as const;

/**
 * The gaps-screen answers after the student picks a standardized test type.
 *
 * Keys are DELETED rather than blanked. The save loop skips empty strings, so either would stop the
 * value being sent today, but a deleted key cannot be resurrected by a later edit to that loop, and
 * it matches what the student now sees on screen.
 *
 * `next` of "" is the decline option and means never answered, so it keeps no score either.
 * Answers to other questions on the screen are untouched: clearing them would lose a GPA the
 * student had already typed.
 */
export function chooseTestType(
  values: Record<string, string>,
  next: string,
): Record<string, string> {
  const { sat_score: satScore, act_score: actScore, ...rest } = values;
  const kept: Record<string, string> = { ...rest, standardized_test_type: next };
  if ((next === "SAT" || next === "Both") && satScore) kept.sat_score = satScore;
  if ((next === "ACT" || next === "Both") && actScore) kept.act_score = actScore;
  return kept;
}
