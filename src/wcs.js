// FITS TAN + SIP spatial WCS, with zero-based pixel centres at this boundary.
// SIP is applied when coefficients exist, as required by the SPHEREx headers.
export function extractWcs(header) {
  if (!/^RA---TAN/.test(header.CTYPE1 || '') || !/^DEC--TAN/.test(header.CTYPE2 || '')) return null;
  if ((header.CUNIT1 && header.CUNIT1 !== 'deg') || (header.CUNIT2 && header.CUNIT2 !== 'deg')) return null;
  if (Number(header.A_ORDER || 0) > 9 || Number(header.B_ORDER || 0) > 9) return null;
  const cd = header.CD1_1 != null ? [header.CD1_1, header.CD1_2 ?? 0, header.CD2_1 ?? 0, header.CD2_2] : [
    (header.CDELT1 ?? 1) * (header.PC1_1 ?? 1), (header.CDELT1 ?? 1) * (header.PC1_2 ?? 0),
    (header.CDELT2 ?? 1) * (header.PC2_1 ?? 0), (header.CDELT2 ?? 1) * (header.PC2_2 ?? 1),
  ];
  const crpix = [header.CRPIX1, header.CRPIX2];
  const crval = [header.CRVAL1, header.CRVAL2];
  if (![...cd, ...crpix, ...crval].every(Number.isFinite) || Math.abs(cd[0] * cd[3] - cd[1] * cd[2]) < 1e-16) return null;
  const sip = { a: [], b: [] };
  for (const [name, coefficient] of Object.entries(header)) {
    const match = /^([AB])_(\d+)_(\d+)$/.exec(name);
    if (match && Number.isFinite(coefficient) && Number(match[2]) + Number(match[3]) <= 9) {
      sip[match[1].toLowerCase()].push([Number(match[2]), Number(match[3]), coefficient]);
    }
  }
  return { crpix, crval, cd, sip };
}

export function sipValue(terms, u, v) {
  let value = 0;
  for (const [i, j, coefficient] of terms) value += coefficient * u ** i * v ** j;
  return value;
}

export function tangentToSky(wcs, xi, eta) {
  const rad = Math.PI / 180;
  const ra0 = wcs.crval[0] * rad;
  const dec0 = wcs.crval[1] * rad;
  const x = xi * rad;
  const y = eta * rad;
  const denominator = Math.cos(dec0) - y * Math.sin(dec0);
  return {
    ra: (Math.atan2(x, denominator) / rad + ra0 / rad + 720) % 360,
    dec: Math.atan2(Math.sin(dec0) + y * Math.cos(dec0), Math.hypot(denominator, x)) / rad,
  };
}

export function skyToTangent(wcs, ra, dec) {
  const rad = Math.PI / 180;
  const d = dec * rad;
  const d0 = wcs.crval[1] * rad;
  const difference = (ra - wcs.crval[0]) * rad;
  const denominator = Math.sin(d) * Math.sin(d0) + Math.cos(d) * Math.cos(d0) * Math.cos(difference);
  if (denominator <= 0) return null;
  return [Math.cos(d) * Math.sin(difference) / denominator / rad,
    (Math.sin(d) * Math.cos(d0) - Math.cos(d) * Math.sin(d0) * Math.cos(difference)) / denominator / rad];
}

export function pixelToSky(wcs, x, y) {
  const u = x + 1 - wcs.crpix[0];
  const v = y + 1 - wcs.crpix[1];
  const a = u + sipValue(wcs.sip.a, u, v);
  const b = v + sipValue(wcs.sip.b, u, v);
  return tangentToSky(wcs, wcs.cd[0] * a + wcs.cd[1] * b, wcs.cd[2] * a + wcs.cd[3] * b);
}

export function skyToPixel(wcs, ra, dec) {
  const tangent = skyToTangent(wcs, ra, dec);
  if (!tangent) return null;
  const [a, b, c, d] = wcs.cd;
  const determinant = a * d - b * c;
  const targetU = (d * tangent[0] - b * tangent[1]) / determinant;
  const targetV = (-c * tangent[0] + a * tangent[1]) / determinant;
  let u = targetU;
  let v = targetV;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const du = u + sipValue(wcs.sip.a, u, v) - targetU;
    const dv = v + sipValue(wcs.sip.b, u, v) - targetV;
    if (Math.max(Math.abs(du), Math.abs(dv)) < 1e-6) return [u + wcs.crpix[0] - 1, v + wcs.crpix[1] - 1];
    // Newton solve with a numerical Jacobian handles SIP distortion reliably.
    const h = .01;
    const aa = 1 + (sipValue(wcs.sip.a, u + h, v) - sipValue(wcs.sip.a, u - h, v)) / (2 * h);
    const bb = (sipValue(wcs.sip.a, u, v + h) - sipValue(wcs.sip.a, u, v - h)) / (2 * h);
    const cc = (sipValue(wcs.sip.b, u + h, v) - sipValue(wcs.sip.b, u - h, v)) / (2 * h);
    const dd = 1 + (sipValue(wcs.sip.b, u, v + h) - sipValue(wcs.sip.b, u, v - h)) / (2 * h);
    const det = aa * dd - bb * cc;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    u -= (dd * du - bb * dv) / det;
    v -= (-cc * du + aa * dv) / det;
  }
  return null;
}

export function createImageGrid(query, preview) {
  if (!preview.wcs) throw new Error('This image has no supported sky-alignment metadata. Try retrieving it again.');
  const centre = skyToPixel(preview.wcs, query.ra, query.dec);
  if (!centre) throw new Error('The image centre cannot be aligned.');
  const reference = { crval: [query.ra, query.dec] };
  const alongX = pixelToSky(preview.wcs, centre[0] + 1, centre[1]);
  const alongY = pixelToSky(preview.wcs, centre[0], centre[1] + 1);
  const dx = skyToTangent(reference, alongX.ra, alongX.dec);
  const dy = skyToTangent(reference, alongY.ra, alongY.dec);
  const scale = Math.sqrt(Math.abs(dx[0] * dy[1] - dy[0] * dx[1]));
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('The image pixel scale cannot be aligned.');
  const side = Math.max(2, Math.min(512, Math.round(query.size / scale)));
  return { width: side, height: side, projection: {
    crpix: [(side + 1) / 2, (side + 1) / 2], crval: reference.crval,
    cd: [dx[0], dy[0], dx[1], dy[1]], sip: { a: [], b: [] },
  } };
}

export function queryForImage(grid, origin, x, y) {
  const centre = pixelToSky(grid.projection, x * grid.width + (grid.width - 1) / 2, -y * grid.height + (grid.height - 1) / 2);
  return { ...origin, ...centre };
}

export function reprojectImage(preview, grid, tileX, tileY) {
  if (!preview.wcs) throw new Error('The neighbouring image has no supported sky-alignment metadata.');
  const values = new Array(grid.width * grid.height);
  let valid = 0;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const sky = pixelToSky(grid.projection, tileX * grid.width + x, -tileY * grid.height + y);
      const position = skyToPixel(preview.wcs, sky.ra, sky.dec);
      const sx = position ? Math.round(position[0]) : -1;
      const sy = position ? Math.round(position[1]) : -1;
      const value = sx >= 0 && sy >= 0 && sx < preview.width && sy < preview.height ? preview.pixels[sy * preview.width + sx] : null;
      values[y * grid.width + x] = value == null ? NaN : value;
      if (Number.isFinite(values[y * grid.width + x])) valid += 1;
    }
  }
  if (!valid) throw new Error('No valid archive pixels cover this adjoining image.');
  return { width: grid.width, height: grid.height, values };
}
