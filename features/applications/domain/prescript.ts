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
  required: boolean;
  max_length: number | null;
  answer: string;
  reusable: boolean;
  remembered: boolean;
  reason?: string;
  explanation?: string;
};

type Prescript = {
  ask: PrescriptQuestion[];
  already_answered: number;
};

type EditableQuestion = {
  id: string;
  question: string;
  answer: string;
  kind: "essay" | "required";
  required: boolean;
  options?: string[] | null;
  portal_input_type?: string;
  explanation?: string;
  remembered?: boolean;
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
      portal_input_type: item.input_type,
      explanation: item.explanation,
      remembered: item.remembered === true,
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

/** Whether the Apply flow should stop and ask before it builds anything. */
export function prescriptNeedsHer(prescript: Prescript | null | undefined): boolean {
  return (prescript?.ask?.length ?? 0) > 0;
}
