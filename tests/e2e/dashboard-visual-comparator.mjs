import sharp from "sharp";

export function normalizeDashboardVisual(input, raw) {
  return sharp(input, raw ? { raw } : undefined)
    .resize(256, 256, { fit: "fill" })
    .blur(0.6)
    .removeAlpha()
    .raw()
    .toBuffer();
}

export function compareNormalizedDashboardVisuals(current, baseline, width = 256, height = 256) {
  if (current.length !== baseline.length) throw new Error("dashboard visual buffers have different lengths");
  if (current.length !== width * height * 3) throw new Error("dashboard visual buffer dimensions are inconsistent");

  const perPixel = new Float64Array(width * height);
  let total = 0;
  let changed = 0;
  for (let offset = 0, pixel = 0; offset < current.length; offset += 3, pixel += 1) {
    const difference = (
      Math.abs(current[offset] - baseline[offset])
      + Math.abs(current[offset + 1] - baseline[offset + 1])
      + Math.abs(current[offset + 2] - baseline[offset + 2])
    ) / 3;
    perPixel[pixel] = difference;
    total += difference;
    if (difference > 32) changed += 1;
  }

  const sorted = [...perPixel].sort((left, right) => left - right);
  const mean = total / sorted.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const changedRatio = changed / sorted.length;

  const windowSize = 6;
  const windowStep = 3;
  let maxLocalMean = 0;
  let maxLocalChangedRatio = 0;
  const hotLocalWindows = new Set();
  for (let top = 0, gridY = 0; top <= height - windowSize; top += windowStep, gridY += 1) {
    for (let left = 0, gridX = 0; left <= width - windowSize; left += windowStep, gridX += 1) {
      let localTotal = 0;
      let localChanged = 0;
      for (let y = top; y < top + windowSize; y += 1) {
        for (let x = left; x < left + windowSize; x += 1) {
          const difference = perPixel[y * width + x];
          localTotal += difference;
          if (difference > 32) localChanged += 1;
        }
      }
      const localMean = localTotal / (windowSize * windowSize);
      const localChangedRatio = localChanged / (windowSize * windowSize);
      maxLocalMean = Math.max(maxLocalMean, localMean);
      maxLocalChangedRatio = Math.max(maxLocalChangedRatio, localChangedRatio);
      if (localMean > 12 && localChangedRatio > 0.15) hotLocalWindows.add(`${gridX},${gridY}`);
    }
  }

  let maxLocalCluster = 0;
  while (hotLocalWindows.size > 0) {
    const first = hotLocalWindows.values().next().value;
    hotLocalWindows.delete(first);
    const stack = [first];
    let clusterSize = 0;
    while (stack.length > 0) {
      const [gridX, gridY] = stack.pop().split(",").map(Number);
      clusterSize += 1;
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const neighbor = `${gridX + deltaX},${gridY + deltaY}`;
          if (hotLocalWindows.delete(neighbor)) stack.push(neighbor);
        }
      }
    }
    maxLocalCluster = Math.max(maxLocalCluster, clusterSize);
  }

  const failed = mean > 18
    || p95 > 60
    || p99 > 72
    || changedRatio > 0.02
    || maxLocalCluster >= 15;

  return { failed, mean, p95, p99, changedRatio, maxLocalMean, maxLocalChangedRatio, maxLocalCluster };
}
