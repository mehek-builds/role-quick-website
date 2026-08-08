import { PortalForm } from "../../portal-form";
import { ShapeForm } from "../../shape-form";
import { toBoard } from "../../boards";
import { normalizeCaseId, toShape } from "../../shapes";

export default async function ControlledPortalCase({
  params,
  searchParams,
}: {
  params: Promise<{ board: string; case: string }>;
  searchParams: Promise<{ shape?: string; answered?: string }>;
}) {
  const route = await params;
  const query = await searchParams;
  // Shared with the ?board= route via toBoard, so the two entry points into the harness cannot drift.
  const board = toBoard(route.board);
  const caseId = normalizeCaseId(route.case, `${board}-01`);
  // The path segment doubles as the shape name, so /qa/portal-submission/greenhouse/select-jd-decoy
  // and /qa/portal-submission?board=greenhouse&shape=select-jd-decoy are the same page. Both routes
  // resolve the shape through toShape for the same reason they both resolve the board through
  // toBoard: two entry points that disagree is the drift this harness already had once.
  const shape = toShape(query.shape) ?? toShape(route.case);
  if (shape) {
    return <ShapeForm board={board} caseId={caseId} shape={shape} answered={query.answered === "1"} />;
  }
  return <PortalForm board={board} caseId={caseId} />;
}
