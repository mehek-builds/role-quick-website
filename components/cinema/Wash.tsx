/* A feathered clarity wash behind a section's content: keeps text at full
   contrast in the middle and dissolves to nothing at the edges, so the
   flying papers stay visible around every section. No panels, no seams —
   the page is the film. Pillar sections pass their soft tint. */

const TINTS = {
  white: "255,255,255",
  warm: "250,249,247",
  brand: "238,241,254",
  teal: "234,245,240",
  coral: "251,239,232",
} as const;

export function Wash({ tint = "white" }: { tint?: keyof typeof TINTS }) {
  const c = TINTS[tint];
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        background: `radial-gradient(72% 78% at 50% 50%, rgba(${c},0.93) 0%, rgba(${c},0.78) 55%, rgba(${c},0) 100%)`,
      }}
    />
  );
}
