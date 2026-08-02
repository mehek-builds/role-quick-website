export const ACTIVE_BOARD_STAGES = ["applied", "interview", "offer"] as const;

const ACTIVE_BOARD_STAGE_SET = new Set<string>(ACTIVE_BOARD_STAGES);

export function activeBoardStages<T extends string>(stages: readonly T[]): T[] {
  return stages.filter((stage) => ACTIVE_BOARD_STAGE_SET.has(stage));
}
