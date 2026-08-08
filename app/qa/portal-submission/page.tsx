import { PortalForm } from "./portal-form";
import { ShapeForm } from "./shape-form";
import { toBoard } from "./boards";
import { normalizeCaseId, toShape } from "./shapes";

export default async function ControlledPortalSubmission({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; case?: string; shape?: string; answered?: string }>;
}) {
  const params = await searchParams;
  // See CONTROLLED_BOARDS: this page used to carry its own three-board list and was not updated when
  // Workable, JazzHR and Paylocity shipped, so ?board=workable rendered a Greenhouse form while the
  // backend resolved the url to controlled_workable.
  const board = toBoard(params.board);
  const caseId = normalizeCaseId(params.case, `${board}-01`);
  // ?shape= names one measured defect (see shapes.ts). The case id is accepted as a shape name too,
  // so the path route /qa/portal-submission/<board>/<shape> addresses the same page without needing
  // a second parameter. Anything unrecognised falls through to the original board form, which is
  // what keeps every pre-existing case working unchanged.
  const shape = toShape(params.shape) ?? toShape(params.case);
  if (shape) {
    return <ShapeForm board={board} caseId={caseId} shape={shape} answered={params.answered === "1"} />;
  }
  return <PortalForm board={board} caseId={caseId} />;
}
