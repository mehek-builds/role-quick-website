# Changelog

## [0.1.7] - 2026-07-31

### Added

- Job seekers can browse and open eligible Workable postings from both public and dashboard
  job surfaces.
- Litos records privacy-filtered, deduplicated demand when an explicit target-role search
  returns no results.

### Changed

- Dashboard job search now commits target-role demand only after Enter or blur, so partial typing
  is not counted as unmet demand.
- The privacy policy now explains how zero-result role and filter analytics are collected and
  how personal-information-shaped searches are discarded.

## [0.1.6] - 2026-07-31

### For contributors

- Dashboard application, job, and loading code is now easier to change safely because stable
  feature APIs separate domain, application, and infrastructure responsibilities.
- Architecture checks require public feature entry points, prevent presentation code from importing
  feature internals, and keep framework and infrastructure dependencies out of domain code.

## [0.1.5] - 2026-07-31

### Performance

- The homepage defers its Three.js paper-roll engine until after hydration and avoids downloading
  the reduced-motion product still for full-motion visitors.
- Scroll progress updates now paint through a single animation frame without rerendering React on
  every scroll event.
- Identical concurrent authenticated GET requests share one network call and are forgotten as soon
  as they settle, preserving fresh later reads.

## [0.1.4] - 2026-07-30

### Fixed

- API compatibility requests now derive the web client version from package metadata so releases
  cannot silently keep reporting an obsolete hard-coded version.

## [0.1.3] - 2026-07-26

### Fixed

- Public pricing and dashboard settings now consistently state the 1,000-resume Pro allowance.

## [0.1.2] - 2026-07-26

### Added

- Today's matches open in a right-side review drawer with the job description and tailored resume side by side.

### Changed

- The dashboard now centers on three application states: Ready, Needs action, and Submitted.
- Pro usage shows the 1,000-resume monthly allowance.
- Pro pricing now states the 1,000-resume monthly allowance instead of unlimited resumes.

### Fixed

- The review drawer follows in-progress submissions until they complete and restores keyboard focus when closed.
- Failed resume preparation can be retried directly from the match card.

## [0.1.1] - 2026-07-25

### Added

- Applicants can grant separate automatic-submission and verification-code permissions during onboarding.
- Settings now shows both permissions and allows immediate revocation.

### Changed

- Application progress and public product copy now accurately describe standing consent, safety pauses, and verified submission receipts.
