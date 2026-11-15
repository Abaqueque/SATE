export function comparisonPreview() {
  return `<section class="proof-section" aria-labelledby="comparison-heading">
    <div class="shell proof-inner">
      <div>
        <div class="eyebrow">Explore the sky map</div>
        <h2 class="section-title" id="comparison-heading">Select regions<br>and analyse changes.</h2>
        <p class="section-copy">Select a region to investigate, explore the sky at different wavelengths, and compare available observations to see whether an object has brightened, faded or moved.</p>
        <a class="button outline" href="/explore/">Select a region <span class="arrow" aria-hidden="true">↗</span></a>
      </div>
      <figure class="comparison-preview" aria-label="Sky-map interface illustration with an example star image, a horizontal time slider and a vertical wavelength slider">
        <div class="comparison-topbar"><span><i class="dot"></i> SKY MAP</span><span>INTERFACE PREVIEW</span></div>
        <div class="comparison-field" aria-hidden="true">
          <img class="comparison-object" src="/assets/mira-1.png" alt="" width="480" height="480" loading="lazy">
          <div class="comparison-region"><span>Selected region</span></div>
          <div class="comparison-source">SPHEREx · Example observation</div>
          <div class="comparison-wave">
            <span>Wavelength</span><span class="comparison-unit">4.99 µm</span>
            <div class="illustration-track vertical"><i></i></div>
            <span class="comparison-unit">0.75 µm</span>
          </div>
          <div class="comparison-time">
            <div><span>Observation date</span><span>Nov 2025</span></div>
            <div class="illustration-track horizontal"><i></i></div>
            <div class="comparison-unit"><span>Nov 2025</span><span>Jun 2026</span></div>
          </div>
        </div>
        <figcaption class="comparison-caption">The sky map lets you select a region and explore wavelengths; available observations show how an object changes over time.</figcaption>
      </figure>
    </div>
  </section>`;
}
