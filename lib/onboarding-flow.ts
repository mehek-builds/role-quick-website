import { CURRENT_ONBOARDING_FLOW_VERSION } from "@/lib/api";
import { getToken } from "@/lib/api";

const memoryDeferrals = new Set<string>();

function accountScope(): string {
  let token = "guest";
  try {
    token = getToken() ?? "guest";
  } catch {
    // The in-memory fallback below still lets Finish later complete this client navigation.
  }
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function onboardingDeferSessionKey() {
  return `litos_onboarding_deferred_v${CURRENT_ONBOARDING_FLOW_VERSION}_${accountScope()}`;
}

export function deferOnboardingForSession() {
  const key = onboardingDeferSessionKey();
  memoryDeferrals.add(key);
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // A blocked storage API must not turn Finish later into a dead button.
  }
}

export function onboardingDeferredForSession(): boolean {
  const key = onboardingDeferSessionKey();
  if (memoryDeferrals.has(key)) return true;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
