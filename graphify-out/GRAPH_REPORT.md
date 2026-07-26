# Graph Report - .  (2026-07-26)

## Corpus Check
- 60 files · ~301,821 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 216 nodes · 285 edges · 31 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `api()` - 16 edges
2. `restart()` - 5 edges
3. `periodsFor()` - 5 edges
4. `continueFromResume()` - 4 edges
5. `degrade()` - 4 edges
6. `tick()` - 3 edges
7. `prepareApplication()` - 3 edges
8. `POST()` - 3 edges
9. `active()` - 3 edges
10. `advance()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (0):

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (18): api(), ApiError, clearSession(), completeOnboarding(), createCheckout(), createEmailConnection(), disconnectEmailConnection(), getApplicationProfile() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (9): extractResumeText(), fromDocx(), fromPdf(), bump(), looksLikeResume(), POST(), findJob(), getJobCards() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.17
Nodes (5): defaultBackup(), defaultPrimary(), ordinal(), periodsFor(), periodSlug()

### Community 4 - "Community 4"
Cohesion: 0.19
Nodes (6): anonId(), device(), track(), getOrCreatePricingSubject(), loadPricingSelection(), savePricingSelection()

### Community 5 - "Community 5"
Cohesion: 0.2
Nodes (2): sectionHeading(), startsNewSection()

### Community 6 - "Community 6"
Cohesion: 0.2
Nodes (0):

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (0):

### Community 8 - "Community 8"
Cohesion: 0.31
Nodes (6): normalized(), packetMatchesJob(), portalName(), rankJobs(), resumeGenerationBody(), tokens()

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (0):

### Community 10 - "Community 10"
Cohesion: 0.52
Nodes (5): active(), advance(), onVisibility(), restart(), stop()

### Community 11 - "Community 11"
Cohesion: 0.53
Nodes (5): degrade(), frames(), _packet_shield(), The finale packet keeps its cover marks (Mehek's exception). Its teal     bar is, video()

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (5): continueFromResume(), prepareApplication(), retryPreparation(), saveCoverLetter(), saveResume()

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (0):

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (0):

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (3): onVisibility(), poll(), tick()

### Community 16 - "Community 16"
Cohesion: 0.67
Nodes (0):

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (0):

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (2): landingRoute(), submitCode()

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (2): jobParams(), loadMore()

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0):

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0):

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0):

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0):

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0):

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0):

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (2): requestCode(), submitEmail()

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0):

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0):

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0):

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0):

## Knowledge Gaps
- **1 isolated node(s):** `The finale packet keeps its cover marks (Mehek's exception). Its teal     bar is`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 18`** (2 nodes): `landingRoute()`, `submitCode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `jobParams()`, `loadMore()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `SmoothScroll.tsx`, `SmoothScroll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `CinematicPage.tsx`, `CinematicPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `google-session.ts`, `completeGoogleSession()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `Wash.tsx`, `Wash()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `GoogleSignInButton.tsx`, `GoogleSignInButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `portal-form.tsx`, `PortalForm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `requestCode()`, `submitEmail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `BRoll.tsx`, `BRoll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `opengraph-image.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `The finale packet keeps its cover marks (Mehek's exception). Its teal     bar is` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._