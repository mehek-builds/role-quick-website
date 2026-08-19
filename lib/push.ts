import { getPushKey, subscribePush, unsubscribePush } from "@/lib/api";

/* TURNING ON LAPTOP NOTIFICATIONS, and the four browser facts that shape every function here.
 *
 * 1. PERMISSION IS ONE SHOT. `Notification.requestPermission()` can only really be asked once: a
 *    student who clicks Block can never be asked again by any code we write and has to dig through
 *    site settings to undo it. So this is only ever called from a deliberate click, never on page
 *    load, and `pushSupport()` exists so the UI can tell "not asked yet" from "asked and refused"
 *    and stop offering a control that cannot work.
 *
 * 2. THE BROWSER HAS TO BE RUNNING to receive anything. Backgrounded is fine, quit is not. Nothing
 *    here can change that and the copy on the screen says so rather than implying otherwise.
 *
 * 3. SAFARI ON macOS NEEDS THE SITE ADDED TO THE DOCK. Until then `PushManager` is absent, which
 *    `pushSupport()` reports as unsupported rather than failing later inside subscribe().
 *
 * 4. A SUBSCRIPTION IS PER BROWSER PROFILE PER DEVICE. Saying yes here says nothing about a phone.
 */

export type PushSupport =
  | { supported: false; reason: "no_service_worker" | "no_push_manager" | "no_notifications" }
  | { supported: true; permission: NotificationPermission };

/** What this browser can actually do, checked before any control is offered. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "no_service_worker" };
  if (!("serviceWorker" in navigator)) return { supported: false, reason: "no_service_worker" };
  if (!("Notification" in window)) return { supported: false, reason: "no_notifications" };
  if (!("PushManager" in window)) return { supported: false, reason: "no_push_manager" };
  return { supported: true, permission: Notification.permission };
}

/**
 * The VAPID public key, as the byte array PushManager insists on.
 *
 * It travels as base64url because it is a URL-safe string everywhere else in the stack, and
 * `applicationServerKey` accepts only a BufferSource. The padding and the two character swaps are
 * the whole conversion; getting either wrong produces an opaque InvalidAccessError at subscribe
 * time rather than anything that names the key.
 */
function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  /* Backed by an explicit ArrayBuffer, not the default. `applicationServerKey` wants an
     ArrayBufferView<ArrayBuffer>, and a bare Uint8Array is typed over ArrayBufferLike, which
     includes SharedArrayBuffer and so is not assignable. */
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  /* Registered at the ROOT scope, which is what lets a notification click focus any Litos tab
     rather than only ones under a subpath. The file has to be served from the origin root for the
     browser to allow that scope, which is why it lives in public/ rather than being routed. */
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "dismissed" | "not_configured" | "failed"; detail?: string };

/**
 * Ask, subscribe, and tell the backend. Call this from a click and nowhere else.
 *
 * THE ORDER MATTERS. The key is fetched BEFORE the permission prompt, so a deployment with no VAPID
 * keys reports "not configured" without having spent the student's one and only permission ask on a
 * feature that cannot work. That sequence is the difference between a fixable misconfiguration and
 * a permanently blocked origin.
 */
export async function enablePush(): Promise<EnablePushResult> {
  const support = pushSupport();
  if (!support.supported) return { ok: false, reason: "unsupported", detail: support.reason };
  if (support.permission === "denied") return { ok: false, reason: "denied" };

  let key: string | null = null;
  try {
    const answer = await getPushKey();
    if (!answer.configured || !answer.public_key) return { ok: false, reason: "not_configured" };
    key = answer.public_key;
  } catch {
    return { ok: false, reason: "not_configured" };
  }

  const permission = support.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission === "denied") return { ok: false, reason: "denied" };
  // "default" means the prompt was dismissed rather than answered. It can be asked again, so this
  // is a distinct outcome from denied and the copy on screen must not treat it as a refusal.
  if (permission !== "granted") return { ok: false, reason: "dismissed" };

  try {
    const worker = await registration();
    /* Reuse the existing subscription when there is one. Browsers hand back the same endpoint for
       the same application key, so this is mostly belt and braces, but it also covers the case
       where the key ROTATED: an old subscription bound to a retired key has to go before a new one
       can be minted, and unsubscribe() is the only way to release it. */
    const current = await worker.pushManager.getSubscription();
    const subscription = current ?? await worker.pushManager.subscribe({
      /* Required to be true by Chrome. It is a promise that every push results in something the
         student can see, which the service worker keeps. */
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(key),
    });
    const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "failed", detail: "incomplete subscription" };
    }
    await subscribePush({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "failed", detail: error instanceof Error ? error.message : undefined };
  }
}

/**
 * Stop this device receiving.
 *
 * BOTH HALVES, and neither alone is enough. Dropping the browser subscription without telling the
 * backend leaves a row that will push to a dead endpoint until the push service 410s it; telling
 * the backend without dropping the browser subscription leaves the browser holding a live
 * subscription that silently resurrects on the next enable. The backend call is attempted even when
 * the browser half throws, because a stale row is the more expensive of the two to leave behind.
 */
export async function disablePush(): Promise<void> {
  const support = pushSupport();
  if (!support.supported) return;
  let endpoint: string | null = null;
  try {
    const worker = await navigator.serviceWorker.getRegistration("/");
    const subscription = await worker?.pushManager.getSubscription();
    endpoint = subscription?.endpoint ?? null;
    await subscription?.unsubscribe();
  } catch {
    /* Ignored on purpose: the backend call below is what actually stops notifications arriving. */
  }
  if (endpoint) await unsubscribePush(endpoint).catch(() => undefined);
}

/** Whether THIS browser currently holds a live subscription, for rendering the control honestly. */
export async function hasPushSubscription(): Promise<boolean> {
  const support = pushSupport();
  if (!support.supported || support.permission !== "granted") return false;
  try {
    const worker = await navigator.serviceWorker.getRegistration("/");
    return Boolean(await worker?.pushManager.getSubscription());
  } catch {
    return false;
  }
}
