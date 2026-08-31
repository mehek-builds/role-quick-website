"use client";

// Explicit .ts extension: the node test runner loads this module directly (see tsconfig's note on
// allowImportingTsExtensions), and extensionless specifiers do not resolve there.
import { EXTENSION_ID } from "./config.ts";
import { isStripeCheckoutUrl } from "./billing.ts";

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
  /** Installed extension version reported by its own runtime manifest. */
  version: string | null;
  /** True when this installed binary predates the exact attended-handoff contract. */
  updateRequired: boolean;
};

const ABSENT: ExtensionState = {
  installed: false,
  signedIn: false,
  otherAccount: false,
  version: null,
  updateRequired: false,
};

export const MINIMUM_ATTENDED_HANDOFF_EXTENSION_VERSION = "0.6.5";
export const MINIMUM_MANAGED_ACCOUNT_HANDOFF_EXTENSION_VERSION = "0.6.5";
export const MINIMUM_ORACLE_HANDOFF_EXTENSION_VERSION = "0.6.5";

export function minimumAttendedHandoffExtensionVersion(atsName: string | undefined): string {
  if (atsName === "oraclecloud") return MINIMUM_ORACLE_HANDOFF_EXTENSION_VERSION;
  return atsName === "jobvite" || atsName === "icims" || atsName === "bamboohr"
    ? MINIMUM_MANAGED_ACCOUNT_HANDOFF_EXTENSION_VERSION
    : MINIMUM_ATTENDED_HANDOFF_EXTENSION_VERSION;
}

export function extensionVersionAtLeast(current: string | null | undefined, minimum: string): boolean {
  const parse = (value: string | null | undefined): number[] | null => {
    if (!value || !/^\d+(?:\.\d+){0,3}$/.test(value)) return null;
    return value.split(".").map(Number);
  };
  const currentParts = parse(current);
  const minimumParts = parse(minimum);
  if (!currentParts || !minimumParts) return false;
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (currentParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export type WebSession = { token: string | null; guest: boolean };

/* One handover per page load, shared by every caller. Two components asking independently must not
   produce two verification round trips inside the extension. */
let inFlight: Promise<ExtensionState> | null = null;

async function handOverSession(
  session: WebSession,
  minimumVersion = MINIMUM_ATTENDED_HANDOFF_EXTENSION_VERSION,
): Promise<ExtensionState> {
  const ping = await sendToExtension<{ ok?: boolean; signedIn?: boolean; version?: string }>({ type: "LITOS_PING" });
  if (!ping?.ok) return ABSENT;
  const version = typeof ping.version === "string" ? ping.version : null;
  if (!extensionVersionAtLeast(version, minimumVersion)) {
    return { installed: true, signedIn: false, otherAccount: false, version, updateRequired: true };
  }

  // A guest session is not an account yet. Handing it over would sign the extension in as a
  // stranger the applicant has no way to recognise or sign back out of.
  if (!session.token || session.guest) {
    return { installed: true, signedIn: ping.signedIn === true, otherAccount: false, version, updateRequired: false };
  }

  /* Always ask the extension to adopt the current website token, even when PING says it has a
     session. PING deliberately exposes no identity. Treating any signed-in extension as this
     account can arm an application for a stale or different user. The extension verifies both
     tokens against the backend and returns already_signed_in only for the same account. */
  const adopted = await sendToExtension<{ ok?: boolean; outcome?: string }>({
    type: "LITOS_ADOPT_SESSION",
    token: session.token,
  });
  return {
    installed: true,
    signedIn: Boolean(adopted?.ok),
    otherAccount: adopted?.outcome === "different_account",
    version,
    updateRequired: false,
  };
}

export function ensureExtensionSession(session: WebSession): Promise<ExtensionState> {
  inFlight ??= handOverSession(session).catch(() => ABSENT);
  return inFlight;
}

/** Re-check the installed extension and account immediately before an attended handoff. */
export function ensureCurrentExtensionSession(session: WebSession, minimumVersion?: string): Promise<ExtensionState> {
  return handOverSession(session, minimumVersion).catch(() => ABSENT);
}

/** Signing out here signs out there. Fire-and-forget: a sign-out must never wait on an extension. */
export function clearExtensionSession(): void {
  inFlight = null;
  void sendToExtension({ type: "LITOS_CLEAR_SESSION" });
}

export type ExtensionCheckoutRequest = {
  planId: "litos_plus_week" | "litos_plus_month" | "litos_plus_quarter";
  placement: string;
  trigger: string;
  actionNonce?: string | null;
};

type ExtensionCheckoutReply = {
  ok?: boolean;
  checkout_url?: string;
  error?: string;
  code?: string;
};

/**
 * Start checkout with the account held by the extension.
 *
 * An extension paywall can open the public pricing page while the website is signed in to a
 * different account. Passing the website token to checkout would then attach the purchase to the
 * wrong person. The external extension handler owns this request and makes the server call with
 * its stored token. The website only selects the term and validates the Stripe destination.
 */
export async function createCheckoutThroughExtension(
  request: ExtensionCheckoutRequest,
): Promise<string> {
  const reply = await sendToExtension<ExtensionCheckoutReply>({
    type: "LITOS_CREATE_CHECKOUT",
    plan_id: request.planId,
    surface: "extension",
    placement: request.placement,
    trigger: request.trigger,
    ...(request.actionNonce ? { action_nonce: request.actionNonce } : {}),
  });
  if (!reply) {
    throw new Error("The Litos extension is unavailable. Open or reinstall it, then try again.");
  }
  if (reply.ok !== true) {
    const code = reply.code?.toLowerCase() ?? "";
    if (code.includes("sign") || code.includes("auth") || code.includes("session") || code.includes("token")) {
      throw new Error("The Litos extension is signed out. Sign in from the extension, then try again.");
    }
    throw new Error(reply.error || "The Litos extension could not start checkout. Nothing was charged.");
  }
  if (!reply.checkout_url || !isStripeCheckoutUrl(reply.checkout_url)) {
    throw new Error("The Litos extension returned an invalid Stripe checkout link. Nothing was charged.");
  }
  return reply.checkout_url;
}

export type ExtensionCheckoutReturnReply = {
  ok: true;
  active: boolean;
  access_class: string;
  revision: string | number;
  account_id: string;
  action_ready: boolean;
} | {
  ok: false;
  error: string;
  code?: string;
};

/** Ask the extension to verify its own account after hosted checkout returns to the website. */
export function verifyExtensionCheckoutReturn(input: {
  status: string;
  context: string | null;
  actionNonce?: string | null;
}): Promise<ExtensionCheckoutReturnReply | null> {
  return sendToExtension<ExtensionCheckoutReturnReply>({
    type: "LITOS_CHECKOUT_RETURN",
    status: input.status,
    context: input.context,
    ...(input.actionNonce ? { action_nonce: input.actionNonce } : {}),
  });
}

type ExtensionPremiumActionRetryReply = {
  ok: true;
  opened: true;
} | {
  ok: false;
  error: string;
  code?: string;
};

/** Reopen the extension-owned premium action only after the applicant presses the return-page CTA. */
export async function retryPremiumActionThroughExtension(actionNonce: string): Promise<void> {
  if (!actionNonce) throw new Error("The saved extension action is missing. Return to the application tab and try it again.");
  const reply = await sendToExtension<ExtensionPremiumActionRetryReply>({
    type: "LITOS_RETRY_PREMIUM_ACTION",
    action_nonce: actionNonce,
  });
  if (!reply) {
    throw new Error("Litos could not reach the extension. Open it in the application tab, then try again.");
  }
  if (reply.ok !== true || reply.opened !== true) {
    const code = "code" in reply ? reply.code?.toLowerCase() ?? "" : "";
    if (code.includes("auth") || code.includes("session") || code.includes("token") || code.includes("sign")) {
      throw new Error("The Litos extension is signed out. Sign in there, then retry your action.");
    }
    if (code.includes("nonce") || code.includes("action") || code.includes("expired") || code.includes("mismatch")) {
      throw new Error("That saved action is no longer available. Return to the application tab and start it again.");
    }
    throw new Error(("error" in reply && reply.error) || "The extension could not reopen that action. Try again from the application tab.");
  }
}

type FreeFillHandoffReply = {
  ok?: boolean;
  armed?: boolean;
  error?: string;
  code?: string;
};

/**
 * Arm one canonical Free application for the extension's factual fill lane.
 *
 * This is intentionally a different message from `LITOS_ARM_HANDOFF`. That older contract binds
 * an immutable generated packet. Sending a canonical-only id through it makes the extension ask
 * the backend for a generated packet that does not exist. The extension owns the fill-data fetch
 * with its adopted account token, so the website sends no API URL or fill payload to trust.
 */
export async function startFreeFillThroughExtension(input: {
  applicationId: string;
  portalUrl: string;
}): Promise<void> {
  let portal: URL;
  try {
    portal = new URL(input.portalUrl);
  } catch {
    throw new Error("The saved employer form URL is invalid. Nothing was opened.");
  }
  if (portal.protocol !== "https:" || !input.applicationId.trim()) {
    throw new Error("The saved employer form URL is invalid. Nothing was opened.");
  }
  const reply = await sendToExtension<FreeFillHandoffReply>({
    type: "LITOS_START_FREE_FILL",
    application_id: input.applicationId,
    portal_url: portal.toString(),
  });
  if (!reply) {
    throw new Error("Litos could not reach the extension. Install or update it, then try again.");
  }
  if (reply.ok !== true || reply.armed !== true) {
    const code = reply.code?.toLowerCase() ?? "";
    if (code.includes("auth") || code.includes("session") || code.includes("token") || code.includes("sign")) {
      throw new Error("The Litos extension is signed out. Sign in there, then try again.");
    }
    throw new Error(reply.error || "Litos could not arm this application for filling. Nothing was opened.");
  }
}

/**
 * Tell the extension which employer pages the applicant is about to be sent to.
 *
 * Sent when the queue renders rather than on the click, so there is no race between a message and a
 * page load: by the time any of these tabs exists the extension already knows about all of them.
 */
export async function armHandoffs(
  applications: readonly { id: string; portalUrl?: string }[],
): Promise<boolean> {
  const armable = applications
    .filter((application): application is { id: string; portalUrl: string } => Boolean(application.portalUrl))
    .map((application) => ({ url: application.portalUrl, applicationId: application.id }));
  if (armable.length === 0) return false;
  const result = await sendToExtension<{ ok?: boolean; armed?: number }>({
    type: "LITOS_ARM_HANDOFF",
    applications: armable,
  });
  return result?.ok === true && typeof result.armed === "number" && result.armed >= armable.length;
}
