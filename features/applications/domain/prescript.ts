/**
 * The Apply-time pre-script, turned into rows the existing answers editor already knows how to
 * render.
 *
 * This is deliberately a translation and not a new flow. The backend has already decided which
 * questions need her; everything here does is give each one an id and hand it to the same
 * ApplicationQuestion list that "Check the answers" has always used, so the answer she types at
 * Apply reaches the employer down the path every other answer takes:
 * POST /applications/:id/submit-request.
 */

type PrescriptQuestion = {
  question: string;
  input_type: string;
  options: string[] | null;
  options_complete?: boolean;
  optionsComplete?: boolean;
  required: boolean;
  max_length: number | null;
  answer: string;
  reusable: boolean;
  remembered: boolean;
  reason?: string;
  explanation?: string;
};

type Prescript = {
  discovery_status?: "ok" | "metadata_incomplete" | "form_not_reached" | "failed";
  metadata_blockers?: PrescriptMetadataBlocker[];
  ask: PrescriptQuestion[];
  already_answered: number;
  question_count?: number;
};

type PrescriptMetadataBlocker = {
  kind: "missing_question_text" | "missing_exact_options" | "unsupported_multi_value" | "ambiguous_question_identity";
  required: boolean;
  portal_input_type: string;
  control_id?: string;
  portal_selector?: string;
  question?: string;
};

type EditableQuestion = {
  id: string;
  question: string;
  answer: string;
  kind: "essay" | "required";
  required: boolean;
  options?: string[] | null;
  options_complete?: boolean;
  optionsComplete?: boolean;
  portal_input_type?: string;
  explanation?: string;
  remembered?: boolean;
  answer_state?: "unanswered" | "skipped" | "litos_refused";
};

/**
 * A stable id for a question that has no server id yet.
 *
 * Derived from the label rather than random, and that matters: the Apply screen may resolve twice
 * in one session (she goes back and forward, or a retry re-reads the pre-script), and a fresh
 * random id each time would leave two rows for one question and lose whichever she typed into
 * first. mergeDiscoveredQuestions keys on the label too, so a server-discovered question later
 * lands on the same row.
 */
export function prescriptQuestionId(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `prescript-${slug || "question"}`;
}

/**
 * The questions to put in front of her at Apply.
 *
 * `kind` is "required" for everything, including the open-ended ones, and that is on purpose:
 * "essay" is the marker for an answer LITOS DRAFTED and she is reviewing. Nothing here was drafted.
 * Labelling a blank box as an essay would tell the review screen there is a draft to check.
 */
export function prescriptEditableQuestions(prescript: Prescript | null | undefined): EditableQuestion[] {
  if (!prescript?.ask?.length) return [];
  const seen = new Set<string>();
  const out: EditableQuestion[] = [];
  for (const item of prescript.ask) {
    const label = (item.question ?? "").trim();
    if (!label) continue;
    const id = prescriptQuestionId(label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      question: label,
      // Only ever blank or something she typed herself on an earlier posting. The backend never
      // sends a drafted or inferred value on this path.
      answer: item.answer ?? "",
      kind: "required",
      required: item.required !== false,
      options: item.options && item.options.length > 0 ? item.options : null,
      options_complete: item.options_complete,
      optionsComplete: item.optionsComplete,
      portal_input_type: item.input_type,
      explanation: item.explanation,
      remembered: item.remembered === true,
      ...(!item.required && !(item.answer ?? "").trim()
        ? { answer_state: "unanswered" as const }
        : {}),
    });
  }
  return out;
}

/**
 * The one line at the top of the Apply questions screen.
 *
 * Says the number Litos handled as well as the number left, because a screen that only counts what
 * is still owed reads as a bill. Singular and plural are spelled out rather than pluralized with a
 * bare "(s)", which the design notes call out as machine voice.
 */
export function prescriptSummary(prescript: Prescript | null | undefined): string {
  const asked = prescript?.ask?.length ?? 0;
  if (asked === 0) return "";
  const answered = prescript?.already_answered ?? 0;
  const question = asked === 1 ? "one question" : `${asked} questions`;
  if (answered === 0) {
    return `This form asks ${question} that only you can answer. Fill them in and Litos will put them on the form with the rest.`;
  }
  const filled = answered === 1 ? "one answer" : `${answered} answers`;
  return `Litos already has ${filled} for this form. There ${asked === 1 ? "is" : "are"} ${question} only you can answer.`;
}

/** Metadata that must be read exactly before the Apply flow may continue. */
export function prescriptMetadataBlockers(
  prescript: Prescript | null | undefined,
): PrescriptMetadataBlocker[] {
  return Array.isArray(prescript?.metadata_blockers) ? prescript.metadata_blockers : [];
}

/** Whether lookahead has an incomplete employer-form read. */
export function prescriptBlocksProgress(prescript: Prescript | null | undefined): boolean {
  if (!prescript) return false;
  return prescript.discovery_status !== "ok" || prescriptMetadataBlockers(prescript).length > 0;
}

/** Whether the Apply flow should stop for an answer or an incomplete employer-form read. */
export function prescriptNeedsHer(prescript: Prescript | null | undefined): boolean {
  return (prescript?.ask?.length ?? 0) > 0 || prescriptBlocksProgress(prescript);
}

/**
 * The ONE scan outcome the onboarding build cannot proceed past: the form was not read at all, so
 * there is nothing to ask and nothing that could be safely submitted. Everything else proceeds.
 *
 * This is deliberately much narrower than prescriptBlocksProgress (2026-09-01, Mehek). Blocking the
 * whole build on any imperfect read was wrong: a scan that DID read the employer's questions but
 * could not verify every option is exactly the case the follow-up questions screen exists for, so
 * the build should go there and ask them in the same boxes the dashboard uses, not dead-end on a
 * failure screen. The build only truly cannot continue when the scan read NOTHING: no questions
 * counted and none to ask, on a run the provider did not complete. An `ok` scan with zero questions
 * is not this case, it is a form that asks nothing extra, and it proceeds straight to review.
 */
export function prescriptReadNothing(prescript: Prescript | null | undefined): boolean {
  if (!prescript) return true;
  const questionsRead = (prescript.question_count ?? 0) > 0 || (prescript.ask?.length ?? 0) > 0;
  return !questionsRead && prescript.discovery_status !== "ok";
}
