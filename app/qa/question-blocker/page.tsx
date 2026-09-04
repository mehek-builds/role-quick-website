import type { Metadata } from "next";
import { requireQaAccess } from "../gate";
import { QuestionBlockerHarness } from "./harness";
import type { DirectQuestionTask } from "@/features/applications";

/* The question Litos could not answer, rendered with the employer's own choices.
 *
 * Why this exists
 * ---------------
 * The packet harness next door shows questions that were ANSWERED. It has no fixture for the state
 * this product is judged on: a question Litos declined to guess, put back to her in plain language,
 * carrying the employer's exact option list. That state is the whole point of the answers editor
 * (see the options comment on ApplicationQuestion in lib/api.ts), and on 2026-08-31 nothing in the
 * repo rendered it: not the packet sandbox, and not one of the 39 visual scenarios.
 *
 * A UI no harness can reach is a UI nobody can screenshot, and it regresses silently. These four
 * fixtures are the cases that actually differ in the renderer, not four coats of the same paint:
 *
 *   short-choice-list   options at or under QUESTION_CHOICE_LIST_LIMIT, rendered as radios
 *   long-choice-list    options past the limit, which collapses to a native select
 *   incomplete-options  options_complete false, where discovery saw more choices than it retained
 *                       exactly and the UI must NOT present its partial list as the whole menu
 *   optional-unknown    not required, so it needs an explicit Answer or Skip rather than a default
 *   unreadable-choice-list  a closed control holding an answer on none of the choices Litos read,
 *                       which is the one state with no correct press on the screen until the
 *                       managed re-read is offered beside it
 *
 * Gated and unlinked like every other route under app/qa/. */
export const metadata: Metadata = {
  title: "Question blocker harness",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const item = (id: string, label: string) => ({
  id,
  label,
  questionId: id,
  actionKind: "answer" as const,
});

const tasks: DirectQuestionTask[] = [
  {
    kind: "question",
    id: "short-choice-list",
    intent: "answer",
    item: item("short-choice-list", "Work authorization"),
    question: {
      id: "short-choice-list",
      question: "Which of the following best describes your current work authorization in Germany?",
      answer: "",
      kind: "required",
      required: true,
      options: [
        "German or EU citizen",
        "Permanent residence permit",
        "Work permit tied to an employer",
        "Student visa with work allowance",
        "No current authorization",
      ],
      options_complete: true,
    },
  },
  {
    kind: "question",
    id: "long-choice-list",
    intent: "answer",
    item: item("long-choice-list", "Notice period"),
    question: {
      id: "long-choice-list",
      question: "How much notice are you required to give your current employer?",
      answer: "",
      kind: "required",
      required: true,
      options: [
        "None, I am available immediately",
        "One week", "Two weeks", "Three weeks", "One month",
        "Six weeks", "Two months", "Three months", "Four months",
        "Six months", "Longer than six months", "Not currently employed",
      ],
      options_complete: true,
    },
  },
  {
    kind: "question",
    id: "incomplete-options",
    intent: "answer",
    item: item("incomplete-options", "Preferred office"),
    question: {
      id: "incomplete-options",
      question: "Which office location would you prefer to be based in?",
      answer: "",
      kind: "required",
      required: true,
      options: ["Amsterdam", "Rotterdam", "Utrecht"],
      options_complete: false,
    },
  },
  /* THE DRAFTED ESSAY, which is the render this harness had no way to reach at all. The measured
     EQL Tech question (prod, 2026-09-02): required, free text, no options, no Skip. What is new is
     that the box arrives FILLED, by Litos, from her resume - answer_source 'litos_draft' - and the
     screen has to say so and let her approve or change it. */
  {
    kind: "question",
    id: "litos-drafted-essay",
    intent: "review",
    item: { ...item("litos-drafted-essay", "Multimodal system"), actionKind: "review" as const },
    question: {
      id: "litos-drafted-essay",
      question: "Describe a multimodal/cv system you personally shipped to production, and your role in it.",
      answer: "The system I would point to is the ingestion pipeline I built at Acme Labs. I owned it end to end, from the Postgres schema through the nightly load, and I was the person paged when it broke.",
      kind: "essay",
      required: true,
      options: null,
      answer_source: "litos_draft",
    },
  },
  /* THE STATE WITH NO CORRECT PRESS ON IT, measured on the Zeus Fire and Security breezy packet
     (application 31ff26a8 / packet f04623c3, 2026-09-03). The option reader stored ONE option for a
     radio group of three, so her real answer is on none of the list, Save is disabled, and the
     question is required so there is no Skip. The only selectable thing is a claim she does not
     make. This fixture is that screen, and what it must carry is the re-read. */
  {
    kind: "question",
    id: "unreadable-choice-list",
    intent: "answer",
    item: item("unreadable-choice-list", "Protected veteran status"),
    question: {
      id: "unreadable-choice-list",
      question: "i identify as one or more of the classifications of protected veteran listed above eeoc.veteran_status vet_yes",
      answer: "No",
      kind: "required",
      required: true,
      portal_input_type: "radio",
      options: ["I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERAN LISTED ABOVE"],
      options_complete: true,
    },
  },
  {
    kind: "question",
    id: "optional-unknown",
    intent: "answer",
    item: item("optional-unknown", "Referral"),
    question: {
      id: "optional-unknown",
      question: "If someone referred you, what is their full name?",
      answer: "",
      kind: "required",
      required: false,
      options: null,
    },
  },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, unknown>>;
}) {
  await requireQaAccess(await searchParams);
  return (
    <main>
      <p className="px-6 pt-8 text-xs tracking-widest text-ink-muted">
        SANDBOX · NOT LINKED, NOT INDEXED
      </p>
      <QuestionBlockerHarness tasks={tasks} />
    </main>
  );
}
