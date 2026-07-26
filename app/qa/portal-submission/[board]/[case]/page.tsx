import { PortalForm, type Board } from "../../portal-form";

export default async function ControlledPortalCase({
  params,
}: {
  params: Promise<{ board: string; case: string }>;
}) {
  const route = await params;
  const board: Board = route.board === "lever" || route.board === "ashby" || route.board === "smartrecruiters"
    ? route.board
    : "greenhouse";
  const caseId = route.case.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || `${board}-01`;
  return <PortalForm board={board} caseId={caseId} />;
}
