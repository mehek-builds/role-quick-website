/* The dashboard sidebar's icons, and nothing else.
 *
 * Drawn here rather than pulled from an icon package for two reasons. A package would ship several
 * hundred glyphs to render eight, and (the one that actually matters) every icon set has its own
 * stroke weight, corner radius and optical size, none of which are this brand's. These are one
 * family: 18px box, 1.5 stroke, round caps and joins, currentColor throughout.
 *
 * DESIGN.md's imagery law bans "icons-in-colored-circles" as decoration. These are not decoration
 * and never take a tile or a fill: they sit inline with their label, inherit the row's text colour,
 * and exist so a row is findable by shape at a glance. The label is always present; no icon here is
 * ever the only thing naming a destination.
 */

type IconProps = { className?: string };

function Glyph({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3.5 10.2 12 3.6l8.5 6.6" />
      <path d="M5.5 9.2V20h13V9.2" />
      <path d="M9.8 20v-5.4h4.4V20" />
    </Glyph>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.4 15.4 4.1 4.1" />
    </Glyph>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9 4.8H7.4A1.4 1.4 0 0 0 6 6.2v13.4a1.4 1.4 0 0 0 1.4 1.4h9.2a1.4 1.4 0 0 0 1.4-1.4V6.2a1.4 1.4 0 0 0-1.4-1.4H15" />
      <rect x="9" y="3" width="6" height="3.6" rx="1.1" />
      <path d="M9.2 11.5h5.6M9.2 15.1h3.8" />
    </Glyph>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2" />
      <path d="m3.8 7 8.2 5.6L20.2 7" />
    </Glyph>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M13.4 3.2H7.2a1.6 1.6 0 0 0-1.6 1.6v14.4a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6V8.2Z" />
      <path d="M13.4 3.2v5h5" />
      <path d="M8.8 13.2h6.4M8.8 16.6h4.2" />
    </Glyph>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5.4 20a6.6 6.6 0 0 1 13.2 0" />
    </Glyph>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20.4 12.6c0 3.7-3.8 6.7-8.4 6.7a10 10 0 0 1-2.6-.34L4.6 20.4l1.3-3.6a6.3 6.3 0 0 1-2.3-4.7c0-3.7 3.8-6.7 8.4-6.7s8.4 3 8.4 6.7Z" />
    </Glyph>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="2.9" />
      <path d="M12 3.4v2.2M12 18.4v2.2M20.6 12h-2.2M5.6 12H3.4M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9" />
    </Glyph>
  );
}

/** The rail's own collapse toggle. Left-pointing at rest; the caller rotates it 180 for the
    collapsed state rather than this needing two glyphs for one chevron. */
export function ChevronIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Glyph>
  );
}
