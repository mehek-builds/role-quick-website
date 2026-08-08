"use client";

// Explicit .ts extension: the node test runner loads this module directly (see tsconfig's note on
// allowImportingTsExtensions), and extensionless specifiers do not resolve there.
import { EXTENSION_ID } from "./config.ts";

/**
 * The wire between this site and the Litos extension.
 *
 * There was no wire. `EXTENSION_ID` sat in config.ts, exported and referenced by nothing, while the
 * extension declared `externally_connectable` for trylitos.com and listened for messages nobody
 * sent. The visible cost was the whole attended-handoff path: the extension keeps its session in
 * chrome.storage.local, written only by its own popup sign-in, so an applicant signed in HERE was,
 * as far as the extension could tell, not signed in at all. Clicking "Finish this one" landed them
 * on the employer's page and the extension answered "not signed in" while this tab sat
 * authenticated beside it.
 *
 * Two things travel over this wire:
 *   - the session, so the extension is signed in to the same account as the person looking at it;
 *   - which portal URLs the applicant is about to be sent to, so the extension recognises the page
 *     when they arrive and fills it rather than asking a question they already answered.
 *
 * This module deliberately does NOT import lib/api. api.clearSession() calls in the other
 * direction, and one-way is the only way that stays a straight line: callers pass the session in.
 *
 * Nothing here is required for the site to work. Every call degrades to "no extension" - a browser
 * without chrome.runtime, an extension that is not installed, a service worker that did not wake.
 */

type ExtensionRuntime = {
  sendMessage?: (id: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

function runtime(): ExtensionRuntime | null {
  if (typeof window === "undefined") return null;
  const chromeGlobal = (window as unknown as { chrome?: { runtime?: ExtensionRuntime } }).chrome;
  const value = chromeGlobal?.runtime;
  return typeof value?.sendMessage === "function" ? value : null;
}

/** The extension never answering is indistinguishable from it not being installed, and both mean
 *  the same thing to every caller: do not promise the applicant that it will fill anything. */
const REPLY_TIMEOUT_MS = 4000;

export function sendToExtension<T>(message: unknown): Promise<T | null> {
  const chromeRuntime = runtime();
  const send = chromeRuntime?.sendMessage;
  if (!chromeRuntime || !send) return Promise.resolve(null);
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const done = (value: T | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(null), REPLY_TIMEOUT_MS);
    try {
      send(EXTENSION_ID, message, (response: unknown) => {
        clearTimeout(timer);
        // lastError must be READ, not merely present: leaving it unread makes Chrome log
        // "Unchecked runtime.lastError" in the console of every page that has no extension.
        if (chromeRuntime.lastError?.message) {
          done(null);
          return;
        }
        done((response as T) ?? null);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

export type ExtensionState = {
  /** Whether the extension answered at all. */
  installed: boolean;
  /** Whether it holds a session for this account, AFTER any handover this module performed. */
  signedIn: boolean;
  /** Set when the extension is signed in to somebody else and declined to switch. */
  otherAccount: boolean;
};

const ABSENT: ExtensionState = { installed: false, signedIn: false, otherAccount: false };

export type WebSession = { token: string | null; guest: boolean };

/* One handover per page load, shared by every caller. Two components asking independently must not
   produce two verification round trips inside the extension. */
let inFlight: Promise<ExtensionState> | null = null;

async function handOverSession(session: WebSession): Promise<ExtensionState> {
  const ping = await sendToExtension<{ ok?: boolean; signedIn?: boolean }>({ type: "LITOS_PING" });
  if (!ping?.ok) return ABSENT;
  if (ping.signedIn) return { installed: true, signedIn: true, otherAccount: false };

  // A guest session is not an account yet. Handing it over would sign the extension in as a
  // stranger the applicant has no way to recognise or sign back out of.
  if (!session.token || session.guest) return { installed: true, signedIn: false, otherAccount: false };

  const adopted = await sendToExtension<{ ok?: boolean; outcome?: string }>({
    type: "LITOS_ADOPT_SESSION",
    token: session.token,
  });
  return {
    installed: true,
    signedIn: Boolean(adopted?.ok),
    otherAccount: adopted?.outcome === "different_account",
  };
}

export function ensureExtensionSession(session: WebSession): Promise<ExtensionState> {
  inFlight ??= handOverSession(session).catch(() => ABSENT);
  return inFlight;
}

/** Signing out here signs out there. Fire-and-forget: a sign-out must never wait on an extension. */
export function clearExtensionSession(): void {
  inFlight = null;
  void sendToExtension({ type: "LITOS_CLEAR_SESSION" });
}

/**
 * Tell the extension which employer pages the applicant is about to be sent to.
 *
 * Sent when the queue renders rather than on the click, so there is no race between a message and a
 * page load: by the time any of these tabs exists the extension already knows about all of them.
 */
export async function armHandoffs(
  applications: readonly { id: string; portalUrl?: string }[],
): Promise<void> {
  const armable = applications
    .filter((application): application is { id: string; portalUrl: string } => Boolean(application.portalUrl))
    .map((application) => ({ url: application.portalUrl, applicationId: application.id }));
  if (armable.length === 0) return;
  await sendToExtension({ type: "LITOS_ARM_HANDOFF", applications: armable });
}
