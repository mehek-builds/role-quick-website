# Graph Report - .  (2026-07-25)

## Corpus Check
- 53 files · ~294,503 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 183 nodes · 237 edges · 20 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `api()` - 14 edges
2. `restart()` - 5 edges
3. `periodsFor()` - 5 edges
4. `continueFromResume()` - 4 edges
5. `degrade()` - 4 edges
6. `tick()` - 3 edges
7. `POST()` - 3 edges
8. `active()` - 3 edges
9. `advance()` - 3 edges
10. `_packet_shield()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (9): continueFromResume(), jobParams(), loadMore(), onVisibility(), poll(), prepareApplication(), saveCoverLetter(), saveResume() (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (16): api(), ApiError, clearSession(), completeOnboarding(), createEmailConnection(), disconnectEmailConnection(), getApplicationProfile(), getEmailConnections() (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (6): anonId(), device(), track(), extractResumeText(), fromDocx(), fromPdf()

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (0):

### Community 4 - "Community 4"
Cohesion: 0.18
Nodes (0):

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (2): sectionHeading(), startsNewSection()

### Community 6 - "Community 6"
Cohesion: 0.25
Nodes (0):

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (0):

### Community 8 - "Community 8"
Cohesion: 0.39
Nodes (6): bump(), looksLikeResume(), POST(), findJob(), getJobCards(), loadFeed()

### Community 9 - "Community 9"
Cohesion: 0.52
Nodes (5): active(), advance(), onVisibility(), restart(), stop()

### Community 10 - "Community 10"
Cohesion: 0.52
Nodes (5): defaultBackup(), defaultPrimary(), ordinal(), periodsFor(), periodSlug()

### Community 11 - "Community 11"
Cohesion: 0.53
Nodes (5): degrade(), frames(), _packet_shield(), The finale packet keeps its cover marks (Mehek's exception). Its teal     bar is, video()

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (0):

### Community 13 - "Community 13"
Cohesion: 0.67
Nodes (0):

### Community 14 - "Community 14"
Cohesion: 0.67
Nodes (0):

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (0):

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0):

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0):

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0):

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0):

## Knowledge Gaps
- **1 isolated node(s):** `The finale packet keeps its cover marks (Mehek's exception). Its teal     bar is`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 16`** (2 nodes): `BRoll.tsx`, `BRoll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `opengraph-image.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `The finale packet keeps its cover marks (Mehek's exception). Its teal     bar is` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._