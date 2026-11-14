// Fixed tangent-plane grid: screen right is west, screen down is south.
// Deriving every centre from the origin prevents drift and makes closed paths
// return to exactly the same tile, including at RA wrap and near the poles.
export function queryAtTile(origin, x, y) {
  if (![origin.ra, origin.dec, origin.size, origin.wavelength].every(Number.isFinite) ||
      !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new Error('Invalid sky-map coordinates.');
  }
  if (x === 0 && y === 0) return { ...origin };
  const radians = Math.PI / 180;
  const ra = origin.ra * radians;
  const dec = origin.dec * radians;
  const step = Math.tan(origin.size * radians);
  const east = -x * step;
  const north = -y * step;
  const vx = Math.cos(dec) * Math.cos(ra) - east * Math.sin(ra) - north * Math.sin(dec) * Math.cos(ra);
  const vy = Math.cos(dec) * Math.sin(ra) + east * Math.cos(ra) - north * Math.sin(dec) * Math.sin(ra);
  const vz = Math.sin(dec) + north * Math.cos(dec);
  return {
    ra: Number(((Math.atan2(vy, vx) / radians + 360) % 360).toFixed(10)),
    dec: Number((Math.atan2(vz, Math.hypot(vx, vy)) / radians).toFixed(10)),
    wavelength: origin.wavelength,
    size: origin.size,
  };
}
