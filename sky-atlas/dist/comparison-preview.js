import { MIRA_CELL } from './sky-model.js';

const windows = ['30 Nov 2025', '9–21 Jun 2026'];

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
        <div class="comparison-topbar"><span><i class="dot"></i> REGION PREVIEW</span><span>SPHEREx</span></div>
        <div class="comparison-field">
          <img data-preview-image src="/assets/mira-1.png" alt="Sample SPHEREx observation, 30 Nov 2025">
          <div class="comparison-reticle" aria-hidden="true"></div>
          <span class="comparison-region">EXAMPLE REGION · 60″ FIELD</span>
          <span class="comparison-date" data-preview-date>30 Nov 2025</span>
        </div>
        <div class="comparison-controls">
          <div class="comparison-control">
            <div class="comparison-label"><label for="preview-time">Time</label><output for="preview-time" data-time-value>30 Nov 2025</output></div>
            <input id="preview-time" type="range" min="0" max="1" step="1" value="0" aria-valuetext="30 Nov 2025" aria-describedby="preview-time-note">
            <div class="comparison-endpoints"><span>Nov 2025</span><span>Jun 2026</span></div>
            <p id="preview-time-note">Compare the two available sample observations.</p>
          </div>
          <div class="comparison-control">
            <div class="comparison-label"><label for="preview-wavelength">Wavelength</label><output for="preview-wavelength" data-wave-value>Loading…</output></div>
            <input id="preview-wavelength" type="range" min="0" max="1" step="1" value="0" disabled aria-describedby="preview-wave-note">
            <div class="comparison-endpoints"><span data-wave-min>Shorter wavelength</span><span data-wave-max>Longer wavelength</span></div>
            <p id="preview-wave-note">Choose a wavelength to view in the sky map.</p>
          </div>
          <a class="comparison-open" data-preview-open href="/explore/?hpx=${MIRA_CELL}&order=9">Open region in sky map <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>
  </section>`;
}

export async function mountComparisonPreview() {
  const root = document.querySelector('[data-comparison-preview]');
  if (!root) return;
  const time = root.querySelector('#preview-time');
  time.addEventListener('input', () => {
    const index = Number(time.value);
    const date = windows[index];
    const image = root.querySelector('[data-preview-image]');
    image.src = `/assets/mira-${index + 1}.png`;
    image.alt = `Sample SPHEREx observation, ${date}`;
    root.querySelector('[data-time-value]').textContent = date;
    root.querySelector('[data-preview-date]').textContent = date;
    time.setAttribute('aria-valuetext', date);
  });
  try {
    const response = await fetch('/assets/spherex-survey.json');
    if (!response.ok) throw new Error('Wavelengths unavailable');
    const metadata = await response.json();
    if (!root.isConnected) return;
    const channels = metadata.wavelengths.map((wave, channel) => ({ wave, channel }))
      .filter(item => !metadata.blankFrames.includes(item.channel))
      .sort((a, b) => a.wave - b.wave);
    const slider = root.querySelector('#preview-wavelength');
    slider.max = channels.length - 1;
    slider.value = Math.max(0, channels.findIndex(item => item.channel === 62));
    slider.disabled = false;
    root.querySelector('[data-wave-min]').textContent = `${channels[0].wave.toFixed(3)} µm`;
    root.querySelector('[data-wave-max]').textContent = `${channels.at(-1).wave.toFixed(3)} µm`;
    const update = () => {
      const { wave, channel } = channels[Number(slider.value)];
      const label = `${wave.toFixed(3)} µm`;
      root.querySelector('[data-wave-value]').textContent = label;
      slider.setAttribute('aria-valuetext', label);
      root.querySelector('[data-preview-open]').href = `/explore/?hpx=${MIRA_CELL}&order=9&channel=${channel}`;
    };
    slider.addEventListener('input', update);
    update();
  } catch {
    if (root.isConnected) root.querySelector('[data-wave-value]').textContent = 'Unavailable';
  }
}
