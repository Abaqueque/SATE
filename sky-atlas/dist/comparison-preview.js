export function comparisonPreview() {
  return `<section class="proof-section" aria-labelledby="comparison-heading">
    <div class="shell proof-inner">
      <div>
        <div class="eyebrow">Explore. Compare. Discover.</div>
        <h2 class="section-title" id="comparison-heading">Select regions<br>and analyse changes.</h2>
        <p class="section-copy">Choose a patch of sky, explore wavelengths, and compare available observations to spot what changes.</p>
        <a class="button outline" href="/explore/">Select a region <span class="arrow" aria-hidden="true">↗</span></a>
      </div>
      <div class="comparison-preview" data-comparison-preview>
        <div class="comparison-topbar"><span><i class="dot"></i> LIVE SKY MAP</span><span>SPHEREx DR1</span></div>
        <iframe class="comparison-map" title="Interactive sky map preview" src="/explore/?embed=1" loading="lazy"></iframe>
        <a class="comparison-open" data-preview-open href="/explore/">Open this view in sky map <span aria-hidden="true">↗</span></a>
      </div>
    </div>
  </section>`;
}

export function mountComparisonPreview() {
  const root = document.querySelector('[data-comparison-preview]');
  if (!root) return () => {};
  const frame = root.querySelector('iframe');
  const receive = event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'sate-sky-preview') return;
    if (typeof event.data.path !== 'string') return;
    const url = new URL(event.data.path, location.origin);
    if (url.origin !== location.origin || url.pathname !== '/explore/') return;
    url.searchParams.delete('embed');
    root.querySelector('[data-preview-open]').href = url.pathname + url.search;
  };
  window.addEventListener('message', receive);
  return () => window.removeEventListener('message', receive);
}
