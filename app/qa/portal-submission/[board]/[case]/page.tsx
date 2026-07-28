import { PortalForm, type Board } from "../../portal-form";

export default async function ControlledPortalCase({
  params,
}: {
  params: Promise<{ board: string; case: string }>;
}) {
  const route = await params;
  // Kept as an explicit allowlist rather than a cast: the board name comes straight off the URL, and
  // it is what selects which fixture DOM renders. Anything unrecognised falls back to greenhouse.
  const BOARDS = ["lever", "ashby", "smartrecruiters", "workable", "jazzhr", "paylocity"] as const;
  const board: Board = (BOARDS as readonly string[]).includes(route.board)
    ? (route.board as Board)
    : "greenhouse";
  const caseId = route.case.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || `${board}-01`;
  return <PortalForm board={board} caseId={caseId} />;
}
