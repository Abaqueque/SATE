// Explicit native-range parts keep Chromium/WebKit and Firefox consistent.
export const timelineStyles = String.raw`
#timeline-slider {
  --timeline-progress: 0%;
  --timeline-track: #26384d;
  --timeline-fill: #62d4df;
  appearance: none;
  -webkit-appearance: none;
  display: block;
  width: 100%;
  height: 26px;
  margin: 3px 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  outline: none;
  touch-action: pan-y;
}
#timeline-slider::-webkit-slider-runnable-track {
  height: 6px;
  border: 1px solid #355069;
  border-radius: 999px;
  background: linear-gradient(to right, var(--timeline-fill) 0%, var(--timeline-fill) var(--timeline-progress), var(--timeline-track) var(--timeline-progress), var(--timeline-track) 100%);
}
#timeline-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -6px;
  border: 2px solid #b9edf2;
  border-radius: 50%;
  background: #62d4df;
  box-shadow: 0 0 0 2px #071018;
}
#timeline-slider::-moz-range-track {
  height: 4px;
  border: 1px solid #355069;
  border-radius: 999px;
  background: var(--timeline-track);
}
#timeline-slider::-moz-range-progress {
  height: 4px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--timeline-fill);
}
#timeline-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 2px solid #b9edf2;
  border-radius: 50%;
  background: #62d4df;
  box-shadow: 0 0 0 2px #071018;
}
#timeline-slider:disabled {
  --timeline-track: #1c2b3b;
  --timeline-fill: #3c7180;
  opacity: .6;
  cursor: default;
}
#timeline-slider:disabled::-webkit-slider-thumb {
  border-color: #7bafba;
  background: #3c7180;
}
#timeline-slider:disabled::-moz-range-thumb {
  border-color: #7bafba;
  background: #3c7180;
}
#timeline-slider:focus-visible {
  outline: 2px solid #ffd28a;
  outline-offset: 3px;
  border-radius: 6px;
}
@media (forced-colors: active) {
  #timeline-slider { forced-color-adjust: auto; }
  #timeline-slider::-webkit-slider-runnable-track { background: Canvas; border-color: CanvasText; }
  #timeline-slider::-webkit-slider-thumb { background: Highlight; border-color: CanvasText; box-shadow: none; }
  #timeline-slider::-moz-range-track { background: Canvas; border-color: CanvasText; }
  #timeline-slider::-moz-range-progress { background: Highlight; }
  #timeline-slider::-moz-range-thumb { background: Highlight; border-color: CanvasText; box-shadow: none; }
}
`;
