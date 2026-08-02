# Changelog

## [0.1.11] - 2026-08-02

### Fixed

- Live personal previews now use a provider-compatible response schema while the API continues
  enforcing exactly three tailored bullets before returning a result.

## [0.1.10] - 2026-08-02

### Changed

- Job seekers can run the personal resume preview on mobile instead of being limited to the
  John Doe sample.
- When a resume does not explicitly state work authorization, Litos now asks the job seeker for
  authorization and sponsorship answers before completing the preview.

### Fixed

- Personal preview failures no longer switch to John's application or make sample information
  look like the job seeker's result.
- Work authorization is accepted from a resume only when it is both verbatim and clearly about
  authorization, citizenship, residency, a visa, or sponsorship.

## [0.1.9] - 2026-08-01

### Changed

- Onboarding now begins with a resume upload, then suggests five evidence-based job titles and a
  likely employment type that applicants can change or extend before continuing.
- The final targeting screen focuses only on application timing after job preferences are saved.

### Fixed

- Existing applicants no longer see the upload screen while saved resume details are loading, and
  can retry a failed profile request without losing their onboarding position.
- Custom job titles are case-insensitively deduplicated, keyboard accessible, and kept within API
  limits with a consistent fallback category.

## [0.1.8] - 2026-07-31

### Changed

- The public job board now distinguishes distinct roles from the raw openings behind them, using
  the format "8,221 roles across 10,246 openings."

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
