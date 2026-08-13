"use client";

import { useCallback, useState } from "react";

import { ExactPacketPdf } from "@/components/app/ExactPacketPdf";
import type { PacketPdfEvidenceVerification } from "@/features/applications";

/* The fixture is a real one-page PDF with a real cross reference table, a real content stream and
   real glyphs, committed at public/qa/exact-packet-fixture.pdf. It is not a stub carrying a
   "%PDF-" header: an earlier test here passed against exactly that, because a header is enough to
   clear the byte check and nothing then asked PDF.js to draw it. The spec beside this harness
   counts painted pixels for the same reason. */
export const FIXTURE_URL = "/qa/exact-packet-fixture.pdf";
export const FIXTURE_SHA256 = "ddcdd437d12d91b9930134d2cc5eb15437bb4bbcfbf2c166b77a4cf8ad1ff89f";
export const FIXTURE_SIZE_BYTES = 3256;

/**
 * A mount point for the send gate's PDF viewer.
 *
 * The real one lives behind the login wall, three screens into a packet that has already passed a
 * server audit, and it needs a stored PDF whose digest matches that audit. That is not a state a
 * test can produce without a cooperating backend, which is how the viewer came to be covered only
 * by assertions that read its source text and matched regular expressions against it. Those passed
 * for the entire life of a defect that hung the gate forever in production.
 *
 * So the component is mounted here against the same props the dashboard passes it, and the spec
 * drives it in a real browser: a real download, a real digest check, a real parse, and a real
 * paint. `timeout` and `binding` are overridable so a stalled render can be exercised without the
 * spec waiting out the production deadline.
 */
export function ExactPacketPdfHarness({
  timeoutMs,
  sha256,
  sizeBytes,
}: {
  timeoutMs?: number;
  sha256?: string;
  sizeBytes?: number;
}) {
  const [verified, setVerified] = useState<PacketPdfEvidenceVerification | null>(null);
  const [revocations, setRevocations] = useState(0);
  /* THE TOKEN REFRESH, because production performs one every 2.5 seconds and nothing here could
     reach it. The backend mints a new `?t=` on every POST /packet-audit, the dashboard re-audits on
     its poll while the evidence is acknowledged, and the response is installed verbatim. Same
     object, same bytes, same digest, different credential. Same shape as production: only the
     query string moves. */
  const [token, setToken] = useState(0);
  const downloadUrl = token === 0 ? FIXTURE_URL : `${FIXTURE_URL}?t=${token}`;

  const onVerified = useCallback((next: PacketPdfEvidenceVerification | null) => {
    setVerified(next);
    if (!next) setRevocations((current) => current + 1);
  }, []);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6">
      <h1 className="text-lg font-medium text-ink">Exact packet PDF harness</h1>
      {/* The spec reads these rather than the viewer's own copy, so it is asserting the value the
          dashboard's send gate actually reads and not a sentence that happens to be on screen. */}
      <p data-testid="gate-state">{verified ? "ready" : "blocked"}</p>
      <p data-testid="gate-sha256">{verified?.sha256 ?? ""}</p>
      <p data-testid="gate-revocations">{revocations}</p>
      <p data-testid="gate-download-url">{downloadUrl}</p>
      <button type="button" data-testid="refresh-download-token" onClick={() => setToken((current) => current + 1)}>
        Refresh download token
      </button>
      <ExactPacketPdf
        auditDigest="qa-harness-audit-digest"
        binding={{ sha256: sha256 ?? FIXTURE_SHA256, size_bytes: sizeBytes ?? FIXTURE_SIZE_BYTES }}
        downloadUrl={downloadUrl}
        onVerified={onVerified}
        timeoutMs={timeoutMs}
      />
    </main>
  );
}
