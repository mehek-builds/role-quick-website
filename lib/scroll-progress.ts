export function normalizedScrollProgress(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
) {
  const max = scrollHeight - viewportHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollY / max));
}
