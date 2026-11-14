// Serialized into the existing browser bundle; no runtime dependencies.
export function installTimeline(actions, observationCache = null) {
  const panel = document.getElementById('observation-timeline');
  if (!panel) return { select() {}, busy() {} };
  const el = id => document.getElementById(id);
  const message = el('timeline-message'), select = el('timeline-exposure');
  const slider = el('timeline-slider'), previous = el('timeline-previous'), next = el('timeline-next');
  const load = el('timeline-load');
  const play = el('timeline-play'), first = el('timeline-first'), last = el('timeline-last'), blink = el('timeline-blink'), collect = el('collect-measurements');
  let tile = null, items = [], filtered = [], controller = null, loading = false, busy = false;
  let playing = false, playback = null, mode = 'play';
  const cache = new Map();
  function updateSlider() {
    const maximum = Number(slider.max);
    const progress = maximum > 0 ? Math.max(0, Math.min(100, Number(slider.value) / maximum * 100)) : 0;
    slider.style.setProperty('--timeline-progress', progress + '%');
  }
  function refresh() {
    filtered = items;
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
    updateSlider();
    slider.setAttribute('aria-valuetext', index < 0 ? 'Choose an exposure' : filtered[index].date);
    const disabled = busy || loading || playing || !filtered.length;
    select.disabled = slider.disabled = disabled;
    previous.disabled = disabled || index <= 0;
    next.disabled = disabled || index >= filtered.length - 1;
    load.disabled = busy || loading || playing || !tile;
    load.textContent = items.length ? 'Refresh observations' : 'Find observations';
    for (const button of [first, last, collect]) if (button) button.disabled = busy || loading || playing || !tile;
    if (blink) { blink.disabled = !playing && (busy || loading || !tile); blink.textContent = playing && mode === 'blink' ? 'Stop blink' : 'Blink'; }
    if (play) {
      play.disabled = !playing && (busy || loading || !tile);
      play.textContent = playing ? 'Pause' : 'Play';
      play.setAttribute('aria-pressed', String(playing));
    }
  }
  function summary() {
    const observedAt = items.find(item => item.id === tile?.preview.observation)?.date || tile?.preview.observedAt;
    message.textContent = !items.length ? 'No dated observations found for this position and wavelength.' :
      filtered.length + ' of ' + items.length + ' exposures · ' + (observedAt || 'choose an exposure to view its observation date') +
      (filtered.some(item => item.id === tile.preview.observation) ? '' : ' · current image is outside this selection');
  }
  async function discover(force = false) {
    if (!tile || loading || busy) return;
    const target = tile;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    loading = true;
    message.textContent = 'Finding available exposure dates…';
    refresh();
    try {
      const cacheKey = [target.query.ra, target.query.dec, target.query.wavelength, target.query.size].map(Number).join(':');
      let data = !force && (cache.get(JSON.stringify(target.query)) || await observationCache?.get('observations:' + cacheKey));
      const reused = Boolean(data);
      signal.throwIfAborted();
      if (!data) {
        const query = new URLSearchParams({ ...target.query, format: 'observations' });
        const response = await fetch('/api/cutout?' + query, { signal });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to retrieve observations.');
        if (!Array.isArray(data.observations)) throw new Error('Invalid archive observation list.');
        signal.throwIfAborted();
        await observationCache?.set('observations:' + cacheKey, data);
      }
      signal.throwIfAborted();
      if (target !== tile) return;
      items = data.observations;
      const current = items.find(item => item.id === target.preview.observation);
      if (current) { target.preview.observedAt = current.date; actions.dated?.(target); }
      cache.set(JSON.stringify(target.query), data);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
      refresh(); summary();
      if (reused) message.textContent += ' · cached dates';
      if (data.truncated) message.textContent += ' · limited to 1,000 archive results';
      if (data.undated) message.textContent += ' · ' + data.undated + ' undated results omitted';
    } catch (error) {
      if (!signal.aborted) message.textContent = error.message + ' Select Find observations to retry.';
    } finally { if (target === tile) { loading = false; refresh(); } }
  }
  function pause() {
    playing = false;
    playback?.abort();
    refresh();
    actions.paused?.();
  }
  async function choose(index, direction = 1) {
    if (busy || loading || playing || !tile) return;
    const target = tile;
    for (let cursor = index; cursor >= 0 && cursor < filtered.length; cursor += direction) {
      if (target !== tile) return;
      const item = filtered[cursor];
      if (item.id === tile.preview.observation) { refresh(); summary(); return; }
      try {
        await actions.show(target, item);
        refresh(); summary(); return;
      } catch (_) { /* Skip failed snapshots without an error message. */ }
    }
    refresh(); summary(); actions.paused?.();
  }
  select.addEventListener('change', () => choose(Number(select.value)));
  slider.addEventListener('change', () => choose(Number(slider.value)));
  slider.addEventListener('input', updateSlider);
  previous.addEventListener('click', () => choose(Number(select.value) - 1, -1));
  next.addEventListener('click', () => choose(select.value === '' ? 0 : Number(select.value) + 1));
  load.addEventListener('click', () => discover(items.length > 0));
  async function run(requested = 'play') {
    if (playing) { pause(); return; }
    if (!tile || busy || loading) return;
    const target = tile;
    if (!items.length) await discover();
    if (target !== tile || !filtered.length || busy || loading) return;
    mode = requested;
    const frames = [...filtered];
    const current = frames.findIndex(item => item.id === tile.preview.observation);
    // Resume from the current exposure; replay from the beginning after the last.
    let index = mode === 'play' && current >= 0 && current < frames.length - 1 ? current + 1 : 0;
    playback = new AbortController();
    const signal = playback.signal;
    playing = true; refresh();
    try {
      for (; index < frames.length; index++) {
        if (signal.aborted || target !== tile) break;
        try {
          await actions.show(target, frames[index], signal);
          if (signal.aborted || target !== tile) break;
          refresh(); summary();
          // Pause only after a frame is actually visible. Never overlap requests.
          await new Promise(resolve => {
            const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
            const timer = setTimeout(done, mode === 'measure' ? 0 : 1000);
            signal.addEventListener('abort', done, { once: true });
            if (signal.aborted) done();
          });
          if (mode === 'blink' && frames.length > 1) index = index === 0 ? frames.length - 2 : -1;
        } catch (_) {
          if (signal.aborted) break;
          // Unavailable frames are silently skipped.
          if (mode === 'blink') {
            const atStart = index === 0; frames.splice(index, 1);
            if (!frames.length) break;
            index = atStart ? -1 : frames.length - 2;
          }
        }
      }
    } finally {
      if (playback?.signal === signal) {
        playing = false; refresh();
        if (target === tile) { summary(); actions.paused?.(); }
      }
    }
  }
  play?.addEventListener('click', () => run('play'));
  blink?.addEventListener('click', () => run('blink'));
  collect?.addEventListener('click', () => run('measure'));
  async function endpoint(latest) {
    if (!tile || busy || loading || playing) return;
    if (!items.length) await discover();
    await choose(latest ? filtered.length - 1 : 0, latest ? -1 : 1);
  }
  first?.addEventListener('click', () => endpoint(false));
  last?.addEventListener('click', () => endpoint(true));
  refresh();
  return {
    clearFrames() { pause(); },
    busy(value) { busy = value; refresh(); },
    select(value) {
      if (tile === value) { refresh(); return; }
      pause(); controller?.abort(); loading = false; tile = value; items = [];
      const saved = value && cache.get(JSON.stringify(value.query));
      if (saved) items = saved.observations;
      refresh();
      message.textContent = value ? 'Find observations to explore actual exposure dates for the selected tile.' : 'Select a sky tile to explore its observations.';
      if (saved) summary();
    },
  };
}
