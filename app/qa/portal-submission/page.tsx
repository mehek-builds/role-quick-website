import { PortalForm, type Board } from "./portal-form";

export default async function ControlledPortalSubmission({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; case?: string; captcha?: string }>;
}) {
  const params = await searchParams;
  const board: Board = params.board === "lever" || params.board === "ashby" || params.board === "smartrecruiters"
    ? params.board
    : "greenhouse";
  const caseId = (params.case ?? `${board}-01`).replace(/[^a-z0-9-]/gi, "").slice(0, 32) || `${board}-01`;
  const captcha = params.captcha === "solved" ? "solved" : params.captcha === "unresolved" ? "unresolved" : "none";
  return <PortalForm board={board} caseId={caseId} captcha={captcha} />;
}
