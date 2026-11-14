import assert from 'node:assert/strict';
import { page } from '../src/ui.js';
import { timelineStyles } from '../src/timeline-style.js';

assert.ok(page.indexOf(timelineStyles) > 0);
assert.ok(page.indexOf(timelineStyles) < page.indexOf('</head>'), 'Shared range styles are included in the document head');
for (const selector of ['::-webkit-slider-runnable-track', '::-webkit-slider-thumb', '::-moz-range-track', '::-moz-range-thumb', '::-moz-range-progress', ':disabled', ':focus-visible']) {
  assert.ok(timelineStyles.includes('#timeline-slider' + selector), 'Missing slider state: ' + selector);
}
assert.match(timelineStyles, /appearance:\s*none/);
assert.match(timelineStyles, /forced-colors: active/);
assert.match(timelineStyles, /--timeline-progress/);
assert.match(page, /type="range"[^>]*aria-label="Step through available exposures"[^>]*disabled/);
console.log('Explicit Chromium/WebKit/Firefox slider styling, disabled/focus states and head inclusion passed.');
