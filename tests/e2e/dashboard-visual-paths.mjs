import path from "node:path";

export const DASHBOARD_VISUAL_CAPTURE_METADATA = "capture-platform.json";

export function dashboardVisualBaselineRoot(cwd = process.cwd()) {
  return path.join(cwd, "tests", "visual-baselines", "dashboard");
}

export function dashboardVisualBaselineDirectory(cwd = process.cwd(), platform = process.platform) {
  if (platform !== "darwin" && platform !== "linux") {
    throw new Error(`dashboard visual baselines do not support ${platform}`);
  }
  return path.join(dashboardVisualBaselineRoot(cwd), platform);
}

export function dashboardVisualArtifactDirectory(cwd = process.cwd()) {
  const configured = process.env.DASHBOARD_VISUAL_ARTIFACT_DIR?.trim();
  return configured
    ? path.resolve(cwd, configured)
    : path.join(cwd, "test-results", "dashboard-visual-regressions");
}
