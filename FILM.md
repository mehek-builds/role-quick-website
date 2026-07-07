# FILM.md: the scroll film and every generated asset

The homepage is one continuous film. This file is the source of truth for
how it is built, every generated clip's exact prompt and job id, and how to
regenerate or extend any of it. Read DESIGN.md first for the visual laws;
read this before touching anything under `components/cinema/`, `public/film/`
or `public/broll/`.

## HARD RULE: resumes are black and white, period (2026-07-08)

Every resume/document in every generated clip is strictly black and white:
black/gray text on white paper, nothing else. No blue text lines, no blue
form fields, no colored accent marks, bars, dots or highlight pills on any
page or packet cover. The canon formatting is the resumes in the opening
sting. When writing ANY new Higgsfield prompt for this site, strip all
color-on-paper language (several prompts below predate this rule and still
contain it; do not copy those phrases) and add an explicit clause:
"every document is pure black and white, no colored marks of any kind."
Page-level UI overlays (Wash tints, chapter tints, dust) are a separate
system and stay; this rule is about the paper itself. KNOWN VIOLATIONS
still baked into shipped assets: the base film's swirl pages carry blue
text lines and the frames 75-120 finale packet has blue/teal bars +
blue/coral dots and teal/coral light sweeps; documents.mp4 (unplaced) has
colored keyword pills; close.mp4 (unplaced) has colored cover marks.
Reshoot these before they are ever re-placed.

## The layer model (the seamless recipe)

The page paints exactly one background. Everything else rides on top of it,
top of the page to the footer:

1. **The stage** (fixed, z-0, full viewport, in `CinematicHero.tsx`):
   film canvas + paper-dust particles + vignette. The canvas scrubs the
   121-frame sequence in `public/film/`; frame index = whole-page scroll
   progress, with a pacing curve that holds the paper swirl until 86% of the
   page and collates the book over the last 14% (`SWIRL_END` / `HOLD`).
2. **Sections** are transparent. Each gets a feathered radial `Wash`
   (`components/cinema/Wash.tsx`) that lifts text contrast in the middle and
   dissolves to nothing at the edges, so the storm shows around all content.
3. **B-roll shots** (`components/cinema/BRoll.tsx`) are printed INTO the
   film, not played over it: `mix-blend-mode: multiply` + a slight
   `brightness(1.05)` lift makes the clip's white studio become the page
   (wash + storm beneath), and an elliptical `mask-image` feather erases the
   crop. Only the subject, pages, ink, shadows, colored highlights, lands
   on the animation. NOTE: since the pinned-acts rework (`d0b55a0`) no
   section places a BRoll shot; the live product demos (Mockups) carry the
   sections instead. The component, the five section clips and their prompts
   are kept below for reuse.
4. **Grain** (`CinematicPage.tsx`, `.rq-grain`) sits fixed above everything
   and ties film, shots and UI into one surface.

Scroll pacing is Lenis (`SmoothScroll.tsx`, lerp 0.07, wheelMultiplier 0.85,
no snap); every ScrollTrigger reads from it. `window.__lenis` is exposed for
scripted QA scrolls. Reduced motion collapses the film to one static
viewport (CSS in `globals.css`) and every video stays a poster.

### The blend-isolation gotcha (will bite you)

CSS blend modes are silently isolated by ANY transformed / filtered /
opacity ancestor. The `BRoll` shots therefore live OUTSIDE the `Reveal`
wrappers and have no `[data-parallax]` ancestor: each spot in
`app/page.tsx` is marked with the comment
`outside Reveal: multiply-blend must reach the film behind`.
If a shot ever renders with a visible white rectangle again, a refactor has
put a transform between it and the stage. Check ancestors first.

There is no per-shot tint: the tinted `Wash` behind each section tints the
multiplied whites for free.

## The base film (`public/film/frame-0000..0120.webp`, ~2.2MB)

Real Higgsfield footage (job `671d0e6a-7944-465b-952b-ae27138722df`,
seedance_2_0, 10s, 1080p, 16:9, silent). Prompt (keep for reshoots):

> Minimal light studio scene, pure white seamless background, soft cinematic
> studio light. Dozens of white resume documents and application papers
> drift weightlessly in slow chaotic motion, each printed with faint
> soft-focus text lines and subtle blue form fields, all text gently out of
> focus and illegible. The camera slowly pushes in as the scattered papers
> glide into perfect alignment, assembling into one clean neat document
> packet at center, its top page showing three small colored accent marks:
> periwinkle blue, sage teal, terracotta coral. Light sweeps tint the scene
> in sequence: soft periwinkle blue wash, then muted sage teal wash, then
> warm terracotta coral wash, resolving to clean white light on the finished
> packet. Gentle depth of field, calm, precise, premium, airy. No logos, no
> watermark, no people.

Extraction contract: `ffmpeg -i film.mp4 -vf fps=12.1,scale=1600:900` →
webp, same filenames, no code change needed. The collation begins around
frame 75 and the book is formed by ~85: the pacing curve in
CinematicHero depends on that; if you reshoot, re-check those frame numbers.
`scripts/render-film.mjs` is the no-credits local fallback renderer.

## The six b-roll clips (`public/broll/`, ~2.1MB total)

All seedance_2_0, 1080p, std mode, 16:9, `generate_audio: false`. Higgsfield
account: Plus plan, ~605 credits left after this batch (45 credits per 5s
1080p clip). NOTE: prompts in this style trigger a "3D RENDER" preset
recommendation: decline it by retrying with
`declined_preset_id: 5a77643c-b6cc-4efd-bdc6-ab8ff48dfa82`, otherwise the
house style is lost.

Compression (bake this exactly): `ffmpeg -vf scale=1280:-2 -c:v libx264
-crf 27 -preset slow -pix_fmt yuv420p -movflags +faststart -an` (sting kept
at 1920, crf 26). Posters: first frame → sharp → webp q72. White-studio
footage compresses to 150-320KB a clip; if a new clip comes out much bigger,
something is off with the shot.

| file | where | dur | job id |
| --- | --- | --- | --- |
| sting.mp4 | opening loop at load, fixed stage (rebuilt as a seamless loop 2026-07-07; job id of the loop version not recorded, original in `.assets-orig/`) | 5s | `55b3c7ad-f63c-49c9-935f-73bad2f20864` (first, non-loop version) |
| transition.mp4 | first-scroll handoff, REGENERATED 2026-07-08 start/end-frame LOCKED (start = sting loop-point frame, end = film frame-0000). Take 3: the conversion is choreographed across the whole clip (a page sweeps close past the lens at the midpoint while the light softens, then the papers recede and curve into the orbit). Take 1 opened on a different scene; take 2 (`8c866017`) crammed the room change into the last half-second and read as a cut. Raw original in `.assets-orig/`. Prompt below. | 6s | `fbdccb8a-6e1c-46e1-84d7-6a5b90da7d1c` |
| formats.mp4 | UNPLACED since pinned-acts rework (was #formats) | 5s | `ff1d02c0-34c2-4e38-bcbb-9276a7443bd0` |
| documents.mp4 | UNPLACED since pinned-acts rework (was #documents) | 5s | `1d93cd52-3d0b-4929-93a0-db79fc73c164` |
| autofill.mp4 | UNPLACED since pinned-acts rework (was #autofill) | 4s | `57acf844-b9a4-43e3-909a-f682855cdf2f` |
| outreach.mp4 | UNPLACED since pinned-acts rework (was #outreach) | 4s | `963afe9f-434b-4d12-97d3-542dd0c215ca` |
| close.mp4 | UNPLACED since pinned-acts rework (was #close) | 5s | `2be36d17-c7d7-4259-b10a-4efc18c8f921` |

Uncompressed originals live in `.assets-orig/` (gitignored, never under
`public/`: they were being deployed and publicly served from
`/broll/_orig/` until 2026-07-08).

### Text-to-video prompts (sting, autofill, outreach, close)

**sting**: Slow cinematic push-in through dozens of white A4 resume pages
suspended and drifting mid-air in a bright white minimalist studio, soft
diagonal window light casting long shadows on white walls and floor, pages
slowly rotating with tiny blue printed text lines, shallow depth of field,
photorealistic clean 3D render aesthetic, serene and weightless, no people,
no logos, high key lighting

**autofill**: Overhead macro shot of a clean white paper application form
with empty fields, the blank fields filling themselves one by one with neat
small blue ink text from top to bottom as a soft teal-tinted light sweeps
across, small teal checkmarks appearing beside completed fields, bright
white minimalist studio, shallow depth of field, photorealistic clean 3D
render aesthetic, no people, no logos, high key lighting

**outreach**: A single white letter page with tiny blue text folding itself
neatly in thirds mid-air and gliding into a crisp white envelope, warm
coral-tinted light glow from one side, bright white minimalist studio with
soft diagonal window light, shallow depth of field, photorealistic clean 3D
render aesthetic, serene, no people, no logos, high key lighting

**close**: A loose stack of white pages on a white floor squaring itself up
and closing into one pristine white hardcover book standing upright, two
small vertical bars in royal blue and teal with one blue dot and one coral
dot printed near the top right of the cover, slow gentle camera push-in,
bright white minimalist studio, soft diagonal window light, photorealistic
clean 3D render aesthetic, no people, high key lighting

### The two resume shots are start/end-frame locked (this is the important part)

`formats.mp4` and `documents.mp4` must show REAL resumes, never AI gibberish
text. They are generated from reference frames rendered off the site's own
mockup content (`components/Mockups.tsx` is the single source of that
content). Pipeline:

1. `node scripts/render-stills.mjs` renders four 3840x2160 stills to
   `.stills-tmp/` (gitignored): `convert_start` (MessyResumeMockup as a page
   in the studio, "SKIPPED BY ATS" chip), `convert_end` (CleanResumeMockup,
   "ATS-READY" chip), `ats_start` (JobDescriptionMockup + TailoredResumeMockup,
   no highlights), `ats_end` (same frame, 5/5 pillar keyword pills lit).
   The studio background is drawn identically in every frame so the video
   model only animates the page content. If the mockup copy in Mockups.tsx
   changes, update the transcriptions in render-stills.mjs to match.
2. Downscale to 1920x1080 with sharp, upload via Higgsfield `media_upload`
   (presigned PUT + `media_confirm`), then `generate_video` with
   `medias: [{role: start_image}, {role: end_image}]`.
3. Prompts used:

**formats (convert)**: Motion graphics transformation between the two
provided frames. A messy serif resume document on a white studio backdrop
converts into a clean modern single-column resume: underlines dissolve,
serif letterforms morph into crisp sans-serif type, ragged paragraphs snap
onto an invisible grid, thin hairline section rules draw themselves in from
left to right, text blocks slide smoothly into their new positions, and a
soft sheet of light sweeps down the page as it reformats. The red status
pill above the page transitions to the green pill. The page itself stays
perfectly still and flat, camera locked, background unchanged. Precise,
elegant, premium UI motion design, no distortion of the paper, text stays
sharp and legible throughout.

**documents (ATS scan)**: Motion graphics between the two provided frames:
a job posting page on the left and a resume page on the right, both on a
white studio backdrop. A thin luminous scan line travels down the job
posting, and as it passes each requirement the keyword lights up with a soft
colored highlight pill: periwinkle blue, sage teal, warm coral. Each lit
keyword sends a subtle glowing thread of the same color across to the resume
on the right, where the matching phrase illuminates with the identical
colored pill. The grey status pill above the resume transitions to the green
pill reading TAILORED. Pages stay perfectly still and flat, camera locked,
background unchanged. Precise, elegant, premium UI motion design, text sharp
and legible throughout, no paper distortion.

## The opening's runtime behavior (sting loop + locked transition)

Desktop (≥640px) only, never under reduced motion. Src is assigned only
after a real layout exists (double-rAF plus a 300ms setTimeout fallback;
during hydration `innerWidth` can read 0 and would wrongly skip it). The
sting is a seamless loop (first frame == last) and loops until the first
scroll. The handoff on first scroll:

- transition buffered (`readyState >= HAVE_FUTURE_DATA`) → 0.45s crossfade
  into `transition.mp4`, which opens on the sting's own world (start-frame
  locked) and ends on film frame 0; on `ended` the whole opening stage
  dissolves into the canvas scrub (1.0s).
- transition NOT buffered (early scroll) → skip the clip, dissolve the
  stage straight into the scrub (1.0s). The handoff never waits on the
  network and never pops in a half-loaded video.
- viewer scrolls past 45% of the hero mid-transition → 0.4s emergency
  dissolve; the opening never lingers.

The transition only starts buffering after the sting fires
`canplaythrough` (or a 3s fallback timer), so the sting owns the network
first. Chrome pauses hidden-tab video without resuming it, so
visibilitychange + pause listeners restart whichever clip should be
running.

### transition.mp4 prompt (seedance_2_0, 6s, 1080p, std, 16:9, silent,
start_image = sting loop-point frame, end_image = film frame-0000 upscaled
to 1920x1080; a preset recommendation fired, declined with
declined_preset_id 24bae836-2c4a-48e0-89b6-49fcc0b21612). Lesson from the
rejected takes: with locked frames the model hides the scene change in
the final frames unless the prompt choreographs WHEN each beat happens
and bans every dissolve trick by name:

> One continuous single take, camera locked, inside a bright white
> minimalist studio, starting exactly on the first provided frame and
> ending exactly on the second. The motion plays out evenly across the
> full six seconds in three overlapping beats. First: the dozens of white
> resume pages drifting in the air slow their drift. Second: the pages
> glide backward, away from the camera, deeper into the room, and while
> one large page sweeps slowly and gently close past the lens, the light
> beyond it eases gradually from bright diagonal window light into soft
> even studio light with delicate long shadows. Third: the receding pages
> curve into a slow circular orbit around the center of the room,
> revolving gracefully and settling into the exact arrangement of the
> final frame. Every page follows one continuous physical flight path
> through all three beats, always in motion, never teleporting. Strictly
> no dissolve, no crossfade, no fade to white, no morph, no wipe, no jump
> cut, no sudden lighting change: the scene changes only through paper
> motion and gradually shifting light. Faint blue text lines on every
> page stay soft-focus and illegible. Serene, precise, premium, airy. No
> people, no logos, no watermark. The canvas draws frame 0 underneath,
so the crossfade lands on the same white-studio world.

## Verifying changes (what the headless preview can and cannot do)

`npm run build` + the launch.json servers (`role-quick-website` dev :3500,
`role-quick-website-prod` :3501). Known headless-preview quirks: the page
window reports `innerWidth` 0 until an explicit viewport resize;
requestAnimationFrame and IntersectionObserver deliveries freeze (so Lenis /
GSAP scrub / IO-triggered video playback cannot be exercised live there);
only a mobile-preset tab reliably paints scrolled screenshots. Trust the
build, layout metrics via eval, network waterfalls (b-roll must fetch ONLY
on intersection: look for lone 206s), and a real browser after deploy.

Deploys are manual: `npx vercel deploy --prod --yes` (the GitHub Action's
token is dead; see README).
