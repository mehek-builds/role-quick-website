import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/* The site's one button.
 *
 * Before this file there wasn't one. `components/app/ui.tsx` exported Card, Chip, Meter
 * and no Button, so every call to action re-declared its own classes inline: sixteen
 * distinct primary strings across twenty-two files, with four paddings, three text sizes,
 * three different hover treatments and, on eight of them, no hover, focus or disabled
 * state at all. Height drifted with the padding, which is how /login's Sign in ended up
 * at 40px on a site that asks for 44 (design audit 2026-07-27, findings 27 to 31).
 *
 * Rules encoded here so they cannot drift again:
 *
 * - **44px minimum, every size.** A touch target is not a function of how much text is
 *   in the label. `size` changes the horizontal presence and the type, never the height
 *   floor. This used to be enforced only below 640px, by one media query in globals.css
 *   that covered the dashboard and missed /login and /start entirely.
 * - **Focus is not declared here.** globals.css already gives every `a` and `button` a
 *   2px brand outline on :focus-visible. Buttons that restated it were drawing a second,
 *   differently-offset ring on top of the first.
 * - **`variant` says what the button IS, never how urgently to press it.** Colour law,
 *   DESIGN.md: `primary` is the one human action, `secondary` is the alternative,
 *   `quiet` is navigation that happens to be a button. `danger` is reserved for the
 *   final control that irreversibly destroys user data.
 * - **Weight is 500.** The extension's own primary is `font-semibold`; that gap is real
 *   and still open, and belongs in a change to `src/components/ui.tsx`, not here.
 */

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-medium transition-[background-color,border-color,opacity,color,box-shadow,transform,scale] active:scale-[0.985] motion-reduce:transform-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action text-action-ink hover:bg-brand-ink",
  secondary: "border border-control-border bg-surface text-ink hover:border-ink",
  quiet: "text-muted hover:bg-surface-alt hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
};

/* Horizontal presence and type only. The height floor is in BASE and does not move. */
const SIZES: Record<Size, string> = {
  sm: "px-3.5 text-[13px]",
  md: "px-5 text-sm",
  lg: "px-7 text-sm",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  /** Stretch to the container. Pairs with `sm:w-auto` at the call site when needed. */
  block?: boolean;
  className?: string;
  children: ReactNode;
};

function classes({ variant = "primary", size = "md", block, className = "" }: CommonProps) {
  return [BASE, VARIANTS[variant], SIZES[size], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  block,
  className,
  children,
  type = "button",
  ...rest
}: CommonProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button type={type} className={classes({ variant, size, block, className, children })} {...rest}>
      {children}
    </button>
  );
}

/** The same button as a link. An anchor cannot be `disabled`, so there is no disabled prop. */
export function ButtonLink({
  variant,
  size,
  block,
  className,
  children,
  href,
  ...rest
}: CommonProps & ComponentPropsWithoutRef<"a"> & { href: string }) {
  const cn = classes({ variant, size, block, className, children });
  /* Next's Link only handles in-app routes; the store URL and mailto: are plain anchors. */
  const internal = href.startsWith("/") && !href.startsWith("//");
  if (internal) {
    return (
      <Link href={href} className={cn} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cn} {...rest}>
      {children}
    </a>
  );
}
