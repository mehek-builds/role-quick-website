import { track } from "./analytics";
import {
  trackZeroResultJobSearchWithRuntime,
  type ZeroResultSearchInput,
} from "./job-search-demand";

const seenOnPage = new Set<string>();

/**
 * One identical zero-result search per browser session is enough to measure unmet demand. The
 * dashboard already waits for its debounced API response, and this second gate stops rerenders,
 * back navigation and repeated submits from inflating one person's role into several requests.
 */
export function trackZeroResultJobSearch(
  input: ZeroResultSearchInput,
): boolean {
  if (typeof window === "undefined") return false;
  return trackZeroResultJobSearchWithRuntime(input, {
    capture: (properties) => track("job_search_zero_results", properties),
    getSessionStorage: () => window.sessionStorage,
    seen: seenOnPage,
  });
}
