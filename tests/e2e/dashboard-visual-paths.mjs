import path from "node:path";

export function dashboardVisualBaselinePlatform() {
  const configured = process.env.DASHBOARD_VISUAL_BASELINE_PLATFORM?.trim();
  const platform = configured || process.platform;
  if (platform !== "darwin" && platform !== "linux") {
    throw new Error(`dashboard visual baselines do not support ${platform}`);
  }
  return platform;
}

export function dashboardVisualBaselineDirectory(cwd = process.cwd()) {
  const directory = dashboardVisualBaselinePlatform() === "linux" ? "dashboard-linux" : "dashboard";
  return path.join(cwd, "tests", "visual-baselines", directory);
}

export function dashboardVisualArtifactDirectory(cwd = process.cwd()) {
  const configured = process.env.DASHBOARD_VISUAL_ARTIFACT_DIR?.trim();
  return configured
    ? path.resolve(cwd, configured)
    : path.join(cwd, "test-results", "dashboard-visual-regressions");
}
