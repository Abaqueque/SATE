export function installScience(catalogue) {
  const info = document.getElementById('target-info');
  if (!info) return { select() {} };
  const marker = document.getElementById('target-marker');
  const measured = document.getElementById('measured-marker');
  const rows = new Map();
  let selected = null;
  function targetFor(query) {
    return catalogue.find(target => {
      const deltaRa = ((query.ra - target.ra + 540) % 360) - 180;
      return Math.hypot(deltaRa * Math.cos(target.dec * Math.PI / 180), query.dec - target.dec) < .1;
    });
  }
  function locate(element, position, tile) {
    const show = document.getElementById('show-marker').checked;
    const grid = tile.map.imageGrid;
    const x = position ? (position[0] - tile.x * grid.width + .5) / grid.width : -1;
    const y = position ? 1 - (position[1] + tile.y * grid.height + .5) / grid.height : -1;
    element.style.display = show && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? 'block' : 'none';
    element.style.left = x * 100 + '%'; element.style.top = y * 100 + '%';
  }
  function plot(target) {
    const list = Array.from(rows.values()).filter(row => row.target === target.name && row.wave === selected.query.wavelength)
      .sort((a, b) => a.date.localeCompare(b.date));
    const chart = document.getElementById('measurement-chart');
    const fluxMode = target.kind === 'variable';
    const points = list.map(row => ({ ...row, time: Date.parse(row.date), value: fluxMode ? row.flux : row.offset,
      errorBar: fluxMode ? row.error : row.positionError }));
    if (points.length) {
      const minT = points[0].time, dt = Math.max(1, points.at(-1).time - minT);
      const min = Math.min(...points.map(p => p.value - p.errorBar));
      const max = Math.max(...points.map(p => p.value + p.errorBar));
      const dy = Math.max(1e-9, max - min);
      const x = p => 12 + (p.time - minT) / dt * 176;
      const y = v => 88 - (v - min) / dy * 60;
      chart.innerHTML = '<text x="8" y="12">' + (fluxMode ? 'Aperture flux (mJy)' : 'Offset from first candidate (arcsec)') + '</text>' +
        points.map(p => '<line x1="' + x(p) + '" x2="' + x(p) + '" y1="' + y(p.value - p.errorBar) + '" y2="' + y(p.value + p.errorBar) + '" stroke="#68869e"/><circle cx="' + x(p) + '" cy="' + y(p.value) + '" r="2" fill="#60dfdd"/>').join('') +
        '<text x="8" y="105">' + points[0].date.slice(0, 10) + ' → ' + points.at(-1).date.slice(0, 10) + '</text>';
    } else chart.innerHTML = '<text x="8" y="25">No reliable candidate measurements yet</text>';
    document.getElementById('measurement-table').innerHTML = '<table><tr><th>UTC</th><th>mJy ± scatter</th><th>Offset ″</th></tr>' + list.map(row =>
      '<tr><td>' + row.date.slice(0, 10) + '</td><td>' + row.flux.toPrecision(3) + ' ± ' + row.error.toPrecision(2) + '</td><td>' + row.offset.toFixed(2) + '</td></tr>').join('') + '</table>';
    document.getElementById('measurement-status').textContent = list.length + ' candidate measurements. Raw pixels; local-background errors only. No pipeline flags or PSF correction. Different effective wavelengths can mimic variability.';
  }
  function select(tile) {
    selected = tile;
    if (!tile) { marker.style.display = measured.style.display = 'none'; return; }
    const target = targetFor(tile.query);
    const preview = tile.preview;
    const date = preview.observedAt;
    const position = target ? predictPosition(target, date) : { ra: tile.query.ra, dec: tile.query.dec };
    locate(marker, position ? skyToPixel(tile.map.imageGrid.projection, position.ra, position.dec) : null, tile);
    measured.style.display = 'none';
    const archive = document.getElementById('older-survey');
    archive.href = 'https://irsa.ipac.caltech.edu/applications/wise/?' + new URLSearchParams({ api: 'searchPos', ra: tile.query.ra, dec: tile.query.dec, sr: Math.max(tile.query.size, .15) + 'd', imageSize: Math.max(tile.query.size, .3) + 'd', imageset: 'neowiser' });
    info.textContent = target ? target.name + ' · ' + (target.kind === 'variable' ? 'brightness tracking' : 'motion tracking') + (date ? ' · ' + date.slice(0, 10) : ' · Find dates to place the epoch marker') : 'Gold marker: entered coordinate. Select a named target for motion prediction.';
    if (!target) {
      document.getElementById('measurement-chart').innerHTML = '';
      document.getElementById('measurement-table').innerHTML = '';
      return;
    }
    info.textContent += preview.registration ? ' · registered on ' + preview.registration.stars + ' background candidates' : ' · WCS alignment only';
    if (target.name === 'Epsilon Indi B') info.textContent += ' · unresolved pair: tracks combined source, not its internal orbit.';
    if (target.name === 'WISE 0855' && tile.query.wavelength < 4) info.textContent += ' · use 4.5–5 µm; detection is not assured.';
    if (position && preview.wcs) {
      const candidate = measureSource(preview, skyToPixel(preview.wcs, position.ra, position.dec));
      if (candidate) {
        let sky = pixelToSky(preview.wcs, candidate.x, candidate.y);
        const registration = preview.registration;
        if (registration) {
          const projected = skyToPixel(tile.map.imageGrid.projection, sky.ra, sky.dec);
          sky = pixelToSky(tile.map.imageGrid.projection, projected[0] - registration.dx, projected[1] - registration.dy);
        }
        locate(measured, skyToPixel(tile.map.imageGrid.projection, sky.ra, sky.dec), tile);
        const first = Array.from(rows.values()).find(row => row.target === target.name && row.wave === tile.query.wavelength);
        const scale = Math.sqrt(Math.abs(preview.wcs.cd[0] * preview.wcs.cd[3] - preview.wcs.cd[1] * preview.wcs.cd[2]));
        const conversion = scale * scale * (Math.PI / 180) ** 2 * 1e9;
        const dra = first ? (((sky.ra - first.ra + 540) % 360) - 180) * Math.cos(sky.dec * Math.PI / 180) : 0;
        rows.set(target.name + ':' + tile.query.wavelength + ':' + preview.observation, {
          target: target.name, date, observation: preview.observation, wave: tile.query.wavelength,
          ra: sky.ra, dec: sky.dec, flux: candidate.flux * conversion, error: candidate.error * conversion,
          offset: first ? Math.hypot(dra, sky.dec - first.dec) * 3600 : 0,
          positionError: Math.hypot(candidate.positionErrorPixels, preview.registration?.scatter || 0) * scale * 3600,
        });
      }
    }
    plot(target);
  }
  document.getElementById('show-marker').addEventListener('change', () => { if (selected) select(selected); });
  document.getElementById('download-measurements').addEventListener('click', () => {
    const list = Array.from(rows.values()).sort((a, b) => a.date.localeCompare(b.date));
    const fields = ['target', 'date', 'observation', 'wave', 'ra', 'dec', 'flux', 'error', 'offset', 'positionError'];
    const csv = fields.join(',') + '\n' + list.map(row => fields.map(f => '"' + String(row[f]).replace(/"/g, '""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'exploratory-measurements.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return { select };
}
