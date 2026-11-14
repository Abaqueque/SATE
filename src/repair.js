// Cosmetic interpolation only: never change the original science pixels.
export function repairPreviewGaps(image) {
  const { width, height } = image;
  const values = Array.from(image.values);
  const visited = new Uint8Array(values.length);
  const filled = [];
  // Bound work and avoid inventing broad missing sky regions.
  const limit = Math.min(256, Math.max(4, Math.floor(values.length * .05)));
  const neighbours = index => {
    const x = index % width, y = Math.floor(index / width), result = [];
    if (x > 0) result.push(index - 1);
    if (x + 1 < width) result.push(index + 1);
    if (y > 0) result.push(index - width);
    if (y + 1 < height) result.push(index + width);
    return result;
  };
  for (let seed = 0; seed < values.length; seed++) {
    if (visited[seed] || Number.isFinite(values[seed])) continue;
    const component = [seed], boundary = new Set();
    visited[seed] = 1;
    let edge = false;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const index = component[cursor], x = index % width, y = Math.floor(index / width);
      if (!x || !y || x === width - 1 || y === height - 1) edge = true;
      for (const adjacent of neighbours(index)) {
        if (Number.isFinite(image.values[adjacent])) boundary.add(adjacent);
        else if (!visited[adjacent]) { visited[adjacent] = 1; component.push(adjacent); }
      }
    }
    if (edge || component.length > limit || boundary.size < 4) continue;
    const mean = Array.from(boundary).reduce((sum, index) => sum + image.values[index], 0) / boundary.size;
    component.forEach(index => { values[index] = mean; });
    // Solve a discrete Laplace equation inside the gap with observed boundaries fixed.
    for (let iteration = 0; iteration < 160; iteration++) {
      let change = 0;
      for (const index of component) {
        const adjacent = neighbours(index);
        const next = adjacent.reduce((sum, item) => sum + values[item], 0) / adjacent.length;
        change = Math.max(change, Math.abs(next - values[index]));
        values[index] = next;
      }
      if (change < Math.max(1, Math.abs(mean)) * 1e-6) break;
    }
    filled.push(...component);
  }
  return { ...image, values, repairedCount: filled.length };
}
