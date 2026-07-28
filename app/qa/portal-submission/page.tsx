import { PortalForm } from "./portal-form";
import { toBoard } from "./boards";

export default async function ControlledPortalSubmission({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; case?: string }>;
}) {
  const params = await searchParams;
  // See CONTROLLED_BOARDS: this page used to carry its own three-board list and was not updated when
  // Workable, JazzHR and Paylocity shipped, so ?board=workable rendered a Greenhouse form while the
  // backend resolved the url to controlled_workable.
  const board = toBoard(params.board);
  const caseId = (params.case ?? `${board}-01`).replace(/[^a-z0-9-]/gi, "").slice(0, 32) || `${board}-01`;
  return <PortalForm board={board} caseId={caseId} />;
}
