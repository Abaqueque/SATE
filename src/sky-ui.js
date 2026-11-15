// Motion view: stacked SPHEREx images of one small field, one per visit.
export const skyPage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SATE · motion</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#08090b;color:#dcdee2;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
main{height:100dvh;display:grid;grid-template-rows:minmax(0,1fr) auto}
#stage{position:relative;min-height:0;display:grid;place-items:center;overflow:hidden;container-type:size}
#frame{position:relative;width:min(100cqw,100cqh);aspect-ratio:1}
#image,#marks{position:absolute;inset:0;width:100%;height:100%}
#image{image-rendering:pixelated}
#marks{pointer-events:none}
#title{position:absolute;left:16px;top:14px;z-index:1;font-weight:600}
#title span{display:block;font-weight:400;color:#8b909b;font-size:12px;font-variant-numeric:tabular-nums}
#empty{position:absolute;color:#8b909b;text-align:center;padding:24px;max-width:420px}
footer{padding:10px 16px 14px;border-top:1px solid #20232a;background:#0e1014}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button,select,input[type=number]{font:inherit;color:#dcdee2;background:#1a1d23;border:1px solid #2c3039;border-radius:5px;height:32px;padding:0 12px;cursor:pointer;font-variant-numeric:tabular-nums}
button:hover:not(:disabled){border-color:#454b58}
button:disabled{opacity:.4;cursor:default}
button[aria-pressed=true]{background:#e8e9ec;color:#0e1014;border-color:#e8e9ec}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #e8b565;outline-offset:2px}
#wavelength{width:6.5em}#wave-control{flex:1;min-width:180px;max-width:600px;display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center}#wave-range{width:100%;margin:0;accent-color:#e8b565}#coverage{grid-column:2;width:100%;height:10px;margin-top:-4px}#wave-prev,#wave-next{padding:0 9px}#wave-note{font-variant-numeric:tabular-nums}#spectral{margin-bottom:8px;font-size:12px;color:#a8adb6}#time{flex:1;min-width:140px;accent-color:#e8b565;margin:0}
#date{font-variant-numeric:tabular-nums;min-width:19ch}
#result{margin:8px 0 0;font-variant-numeric:tabular-nums}
#status{margin:2px 0 0;color:#8b909b;font-size:12px;font-variant-numeric:tabular-nums}
[hidden]{display:none!important}
</style></head><body>
<main>
  <div id="stage">
    <div id="title"><b id="name">Van Maanen’s Star</b><span id="where"></span></div>
    <div id="frame"><canvas id="image" hidden></canvas><svg id="marks" hidden aria-hidden="true"></svg></div>
    <div id="empty">Loading observations…</div>
  </div>
  <footer>
    <div class="row" id="spectral">
      <select id="mode" aria-label="Comparison mode"><option value="matched">Matched wavelengths</option><option value="overview">All wavelengths · overview</option></select>
      <label for="wavelength">Wavelength</label>
      <div id="wave-control">
        <button id="wave-prev" type="button" aria-label="Previous available wavelength" disabled>‹</button>
        <input id="wave-range" type="range" min="0" max="1000" step="1" value="269" aria-label="Available wavelength" disabled>
        <button id="wave-next" type="button" aria-label="Next available wavelength" disabled>›</button>
        <svg id="coverage" viewBox="0 0 1000 10" preserveAspectRatio="none" aria-hidden="true"></svg>
      </div>
      <input id="wavelength" type="number" min="0.75" max="5" step="0.001" value="1.6" aria-label="Wavelength in micrometres"><span>µm ±5%</span>
      <span id="wave-note">Finding available wavelengths…</span>
    </div>
    <div class="row">
      <button type="button" id="play" disabled>Play</button>
      <input id="time" type="range" min="0" max="0" step="1" value="0" disabled aria-label="Image date">
      <output id="date">—</output>
      <button type="button" id="nights" aria-pressed="true" disabled>Every night (UTC)</button>
      <button type="button" id="diff" aria-pressed="false" disabled>Difference</button>
      <button type="button" id="retry" hidden>Retry</button>
    </div>
    <p id="result" aria-live="polite"></p>
    <p id="status" role="status"></p>
  </footer>
</main>
<script id="demo-data" type="application/json">{}</script>
<script type="module" src="/sky.js"></script>
</body></html>`;
