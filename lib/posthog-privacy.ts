import type { CaptureResult, Properties } from "posthog-js/dist/module.slim";

const URL_KEYS = new Set(["$current_url", "$initial_current_url"]);
const DROP_KEYS = new Set([
  "$referrer",
  "$initial_referrer",
  "$referring_domain",
  "$initial_referring_domain",
  "$gclid",
  "$gbraid",
  "$wbraid",
  "$dclid",
  "$fbclid",
  "$gad_source",
  "$msclkid",
]);

function pathnameOnly(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value, "https://litos.invalid").pathname;
  } catch {
    return undefined;
  }
}

function sanitizeProperties(properties: Properties): Properties {
  const safe: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (URL_KEYS.has(key)) {
      const pathname = pathnameOnly(value);
      if (pathname) safe[key] = pathname;
      continue;
    }
    if (DROP_KEYS.has(key) || key.startsWith("$utm_") || key.startsWith("$initial_utm_")) continue;
    if ((key === "$set" || key === "$set_once") && value && typeof value === "object" && !Array.isArray(value)) {
      safe[key] = sanitizeProperties(value as Properties);
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function sanitizePostHogEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  return {
    ...event,
    properties: sanitizeProperties(event.properties),
    ...(event.$set ? { $set: sanitizeProperties(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: sanitizeProperties(event.$set_once) } : {}),
  };
}
