# Accessibility contract

Litos targets WCAG 2.2 Level AA across the public site, authentication, onboarding,
and the signed-in dashboard. Automated checks are a floor. A changed user flow is
not complete until its keyboard and screen-reader behavior has been checked.

## Color and focus

The following foreground and background pairs are the approved text contracts.
Ratios are calculated from the hex tokens in `app/globals.css`.

| Foreground | Background | Ratio | Use |
| --- | --- | ---: | --- |
| Ink `#12120f` | Canvas `#ffffff` | 18.8:1 | Primary text |
| Muted `#6b6a64` | Canvas `#ffffff` | 5.4:1 | Body and secondary text |
| Brand ink `#3d51ad` | Brand soft `#eef1fe` | 6.4:1 | Selected and document states |
| Teal ink `#3f7d67` | Teal soft `#eaf5f0` | 4.7:1 | Autofill states |
| Coral ink `#a35f3f` | Coral soft `#fbefe8` | 4.6:1 | Outreach states |
| Danger `#b91c1c` | Canvas `#ffffff` | 6.5:1 | Error text |

Faint text is limited to nonessential labels at supported sizes. It must not carry
instructions, errors, or the only statement of state. Every interactive element
uses a two-pixel `focus-visible` outline with at least three-to-one contrast against
its adjacent surface. Focus is never communicated by a border-color change alone.

## Design annotations

Every interactive design or implementation identifies:

- the accessible name and any description or error relationship
- keyboard order, activation keys, initial focus, and focus return
- live-region behavior for loading, success, and failure
- expanded, selected, pressed, busy, invalid, disabled, and readonly states
- reduced-motion behavior and a non-motion equivalent
- heading level, landmark, dialog, table, and list semantics

## Screen-reader smoke matrix

Run these checks for material changes. Record any environment limitation in the
pull request instead of implying it was tested.

| Environment | Routes | Required checks |
| --- | --- | --- |
| VoiceOver with Safari on macOS | `/`, `/login`, `/start`, `/dashboard/jobs`, `/dashboard/settings` | landmarks, headings, form errors, dialogs, loading completion, route announcements |
| NVDA with Firefox on Windows | `/login`, `/start`, `/dashboard/resume`, `/dashboard/settings` | names and descriptions, browse and focus order, file upload, save state, destructive confirmation |

## Pull request checklist

- [ ] Page title and heading identify the destination.
- [ ] The full flow works by keyboard with visible focus and no trap.
- [ ] Inputs have persistent labels, appropriate autocomplete, and linked errors.
- [ ] Status changes are announced once without moving focus unexpectedly.
- [ ] Dialog focus enters, stays contained, closes with Escape, and returns to its trigger.
- [ ] Touch targets are at least 24 by 24 CSS pixels, and primary mobile controls target 44 pixels.
- [ ] Content remains usable at 200 percent zoom and at a 320 CSS pixel viewport.
- [ ] Color and motion are never the sole carriers of meaning.
- [ ] Automated tests cover the semantic contract, then the relevant VoiceOver or NVDA smoke route is checked.
