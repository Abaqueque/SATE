// Serialized into the existing browser bundle; no runtime dependencies.
export function installTimeline(actions) {
  const panel = document.getElementById('observation-timeline');
  if (!panel) return { select() {}, busy() {} };
  const el = id => document.getElementById(id);
  const message = el('timeline-message'), select = el('timeline-exposure');
  const slider = el('timeline-slider'), previous = el('timeline-previous'), next = el('timeline-next');
  const start = el('timeline-start'), end = el('timeline-end'), load = el('timeline-load');
  let tile = null, items = [], filtered = [], controller = null, loading = false, busy = false;
  const cache = new Map();
  function refresh() {
    filtered = items.filter(item => (!start.value || item.date.slice(0, 10) >= start.value) && (!end.value || item.date.slice(0, 10) <= end.value));
    select.replaceChildren();
    filtered.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = item.date.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') + ' · ' + item.id;
      select.append(option);
    });
    const index = filtered.findIndex(item => item.id === tile?.preview.observation);
    select.value = index < 0 ? '' : String(index);
    slider.max = String(Math.max(0, filtered.length - 1));
    slider.value = String(Math.max(0, index));
    slider.setAttribute('aria-valuetext', index < 0 ? 'Choose an exposure' : filtered[index].date);
    const disabled = busy || loading || !filtered.length;
    select.disabled = slider.disabled = disabled;
    previous.disabled = disabled || index <= 0;
    next.disabled = disabled || index >= filtered.length - 1;
    load.disabled = busy || loading || !tile;
    start.disabled = end.disabled = busy || loading;
  }
  function summary() {
    const observedAt = items.find(item => item.id === tile?.preview.observation)?.date || tile?.preview.observedAt;
    message.textContent = !items.length ? 'No dated observations found for this position and wavelength.' :
      filtered.length + ' of ' + items.length + ' exposures · ' + (observedAt || 'choose an exposure to view its observation date') +
      (filtered.some(item => item.id === tile.preview.observation) ? '' : ' · current image is outside this selection');
  }
  async function discover() {
    if (!tile || loading || busy) return;
    const target = tile;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    loading = true;
    message.textContent = 'Finding available exposure dates…';
    refresh();
    try {
      const query = new URLSearchParams({ ...target.query, format: 'observations' });
      const response = await fetch('/api/cutout?' + query, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to retrieve observations.');
      if (target !== tile) return;
      items = data.observations;
      cache.set(JSON.stringify(target.query), data);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
      refresh(); summary();
      if (data.truncated) message.textContent += ' · limited to 1,000 archive results';
      if (data.undated) message.textContent += ' · ' + data.undated + ' undated results omitted';
    } catch (error) {
      if (!signal.aborted) message.textContent = error.message + ' Select Find observations to retry.';
    } finally { if (target === tile) { loading = false; refresh(); } }
  }
  async function choose(index) {
    if (busy || loading || !filtered[index] || !tile) return;
    const target = tile, item = filtered[index];
    if (item.id === tile.preview.observation) return;
    try {
      await actions.show(target, item);
      refresh(); summary();
    } catch (error) { refresh(); message.textContent = error.message + ' Current image retained.'; }
  }
  select.addEventListener('change', () => choose(Number(select.value)));
  slider.addEventListener('change', () => choose(Number(slider.value)));
  previous.addEventListener('click', () => choose(Number(select.value) - 1));
  next.addEventListener('click', () => choose(select.value === '' ? 0 : Number(select.value) + 1));
  [start, end].forEach(input => input.addEventListener('change', () => {
    refresh(); summary();
    if (start.value && end.value && start.value > end.value) message.textContent = 'Start date must be on or before end date.';
  }));
  load.addEventListener('click', discover);
  refresh();
  return {
    busy(value) { busy = value; refresh(); },
    select(value) {
      if (tile === value) { refresh(); return; }
      controller?.abort(); loading = false; tile = value; items = [];
      const saved = value && cache.get(JSON.stringify(value.query));
      if (saved) items = saved.observations;
      refresh();
      message.textContent = value ? 'Find observations to explore actual exposure dates for the selected tile.' : 'Select a sky tile to explore its observations.';
      if (saved) summary();
    },
  };
}
