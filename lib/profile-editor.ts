export function parseEditableList(value: string): string[] {
  return deduplicate(value.split(/[\n,]/));
}

export function parseEditableLines(value: string): string[] {
  return deduplicate(value.split("\n"));
}

export function hasCompleteTargetRoleSet(roles: string[], currentRoles: string[]): boolean {
  return roles.length === 5 || (roles.length === 0 && currentRoles.length === 0);
}

export function targetRolesChanged(roles: string[], currentRoles: string[]): boolean {
  return roles.length !== currentRoles.length
    || roles.some((role, index) => role !== currentRoles[index]);
}

function deduplicate(candidates: string[]): string[] {
  const items: string[] = [];
  for (const candidate of candidates) {
    const item = candidate.trim();
    if (!item || items.some((existing) => existing.toLowerCase() === item.toLowerCase())) continue;
    items.push(item);
  }
  return items;
}
