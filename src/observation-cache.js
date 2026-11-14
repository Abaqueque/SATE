// Self-contained so the same implementation can be serialized into app.js.
// Cache successful public science previews/catalogues, never FITS downloads.
export function createObservationCache(options = {}) {
  const storage = options.storage === undefined ? globalThis.caches : options.storage;
  const now = options.now || Date.now;
  const limit = options.maxEntries ?? 128;
  const byteLimit = options.maxBytes ?? 64 * 1024 * 1024;
  const memoryLimit = options.memoryEntries ?? 32;
  const memoryByteLimit = options.memoryBytes ?? 8 * 1024 * 1024;
  const maxAge = options.maxAge ?? 7 * 86400000;
  const memory = new Map();
  let memoryBytes = 0, queue = Promise.resolve(), opened;
  const path = key => '/__sate_cache__/dr1-geometry1-v1/' + encodeURIComponent(key);
  const age = key => key.startsWith('observations:') ? Math.min(maxAge, 86400000) : maxAge;
  const serial = task => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  function forget(key) {
    const item = memory.get(key);
    if (item) memoryBytes -= item.bytes;
    memory.delete(key);
  }
  function remember(key, item) {
    forget(key);
    if (item.bytes > memoryByteLimit) return;
    memory.set(key, item); memoryBytes += item.bytes;
    while (memory.size > memoryLimit || memoryBytes > memoryByteLimit) forget(memory.keys().next().value);
  }
  async function disk() {
    if (!storage) return null;
    try { return await (opened ||= storage.open('sate-observations-dr1-geometry1-v1')); }
    catch { return null; }
  }
  async function prune(cache) {
    const entries = [];
    let bytes = 0;
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const size = Number(response.headers.get('x-sate-bytes'));
      const expires = Number(response.headers.get('x-sate-expires'));
      const used = Number(response.headers.get('x-sate-used'));
      if (!size || !expires || expires <= now()) { await cache.delete(request); continue; }
      entries.push({ request, size, used }); bytes += size;
    }
    entries.sort((a, b) => a.used - b.used);
    while (entries.length > limit || bytes > byteLimit) {
      const oldest = entries.shift();
      await cache.delete(oldest.request); bytes -= oldest.size;
    }
  }
  return {
    async get(key) {
      const hit = memory.get(key);
      if (hit && hit.expires > now()) {
        remember(key, hit);
        // Keep persistent eviction order accurate even for memory-cache hits.
        void serial(async () => {
          const cache = await disk();
          if (!cache) return;
          try {
            if (!await cache.match(path(key))) return; // Do not resurrect an evicted disk entry.
            await cache.put(path(key), new Response(hit.text, { headers: {
              'content-type': 'application/json', 'x-sate-expires': String(hit.expires),
              'x-sate-used': String(now()), 'x-sate-bytes': String(hit.bytes),
            } }));
          } catch { /* A storage write failure cannot prevent a cached read. */ }
        });
        return JSON.parse(hit.text); // Display annotations cannot mutate cached science data.
      }
      forget(key);
      return serial(async () => {
        const cache = await disk();
        if (!cache) return null;
        try {
          const response = await cache.match(path(key));
          if (!response) return null;
          const expires = Number(response.headers.get('x-sate-expires'));
          if (!expires || expires <= now()) { await cache.delete(path(key)); return null; }
          const text = await response.text(), value = JSON.parse(text);
          remember(key, { text, bytes: text.length * 2, expires });
          const headers = new Headers(response.headers);
          headers.set('x-sate-used', String(now()));
          try { await cache.put(path(key), new Response(text, { headers })); } catch {}
          return value;
        } catch { return null; }
      });
    },
    async set(key, value) {
      const text = JSON.stringify(value);
      const bytes = text.length * 2;
      if (bytes > byteLimit) return;
      const expires = now() + age(key);
      remember(key, { text, bytes, expires });
      await serial(async () => {
        const cache = await disk();
        if (!cache) return;
        try {
          const response = () => new Response(text, { headers: {
            'content-type': 'application/json', 'x-sate-expires': String(expires),
            'x-sate-used': String(now()), 'x-sate-bytes': String(bytes),
          } });
          try { await cache.put(path(key), response()); }
          catch {
            // Retry once after evicting our oldest entry, never another app's data.
            const oldest = (await cache.keys())[0];
            if (oldest) await cache.delete(oldest);
            await cache.put(path(key), response());
          }
          await prune(cache);
        } catch { /* Storage restrictions leave memory caching available. */ }
      });
    },
  };
}

// Retain the completed display, not just pixels that would need reprojection,
// registration, gap repair and stretching again on every blink/revisit.
export function createRenderedFrameCache(maxEntries = 128, maxBytes = 64 * 1024 * 1024) {
  const frames = new Map();
  let bytes = 0;
  function remove(key) {
    const entry = frames.get(key);
    if (entry) bytes -= entry.bytes;
    frames.delete(key);
  }
  return {
    get(key) {
      const entry = frames.get(key);
      if (!entry) return null;
      frames.delete(key); frames.set(key, entry);
      return entry.frame;
    },
    set(key, frame) {
      remove(key);
      const size = frame.preview.pixels.length * 8 + frame.thumbnail.width * frame.thumbnail.height * 4;
      if (size > maxBytes) return;
      frames.set(key, { frame, bytes: size }); bytes += size;
      while (frames.size > maxEntries || bytes > maxBytes) remove(frames.keys().next().value);
    },
    closeMap(id) {
      for (const key of frames.keys()) if (key.startsWith(id + ':')) remove(key);
    },
  };
}
