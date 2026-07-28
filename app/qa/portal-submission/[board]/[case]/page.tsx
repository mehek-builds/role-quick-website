import { PortalForm } from "../../portal-form";
import { toBoard } from "../../boards";

export default async function ControlledPortalCase({
  params,
}: {
  params: Promise<{ board: string; case: string }>;
}) {
  const route = await params;
  // Shared with the ?board= route via toBoard, so the two entry points into the harness cannot drift.
  const board = toBoard(route.board);
  const caseId = route.case.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || `${board}-01`;
  return <PortalForm board={board} caseId={caseId} />;
}
