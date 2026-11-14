import assert from 'node:assert/strict';
import { installMapPanning } from '../src/pan.js';

const handlers = {};
const classes = new Set();
const captures = new Set();
const scroller = {
  clientWidth: 700, clientHeight: 400, scrollLeft: 0, scrollTop: 0,
  classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
  addEventListener(name, handler, options) { handlers[name] = handler; if (name === 'click') assert.equal(options, true); },
  scrollBy({ left, top }) { this.scrollLeft += left; this.scrollTop += top; },
  getBoundingClientRect() { return { left: 0, top: 0 }; },
  setPointerCapture(id) { captures.add(id); },
  hasPointerCapture(id) { return captures.has(id); },
  releasePointerCapture(id) { captures.delete(id); },
};
const board = { style: {} };
const panning = installMapPanning(scroller, board);
assert.equal(board.style.padding, '400px 700px');
assert.equal(scroller.scrollLeft, 700);
assert.equal(scroller.scrollTop, 400);
panning.resize();
assert.equal(scroller.scrollLeft, 700, 'Repeated resize must not drift the viewport');
scroller.clientWidth = 800;
scroller.clientHeight = 500;
panning.resize();
assert.equal(scroller.scrollLeft, 800);
assert.equal(scroller.scrollTop, 500);

function event(properties = {}) {
  return { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 300, clientY: 200,
    target: { closest: () => null }, detail: 1,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }, ...properties };
}
for (const [key, dx, dy] of [['ArrowRight', 80, 0], ['ArrowLeft', -80, 0], ['ArrowDown', 0, 80], ['ArrowUp', 0, -80]]) {
  const before = [scroller.scrollLeft, scroller.scrollTop];
  const keyEvent = event({ key });
  handlers.keydown(keyEvent);
  assert.equal(keyEvent.prevented, true);
  assert.equal(scroller.scrollLeft, before[0] + dx);
  assert.equal(scroller.scrollTop, before[1] + dy);
}
handlers.keydown(event({ key: 'ArrowRight', shiftKey: true }));
assert.equal(scroller.scrollLeft, 1040);
const pageShortcut = event({ key: 'ArrowRight', ctrlKey: true });
handlers.keydown(pageShortcut);
assert.equal(pageShortcut.prevented, undefined);

for (const deltaMode of [0, 1, 2]) {
  const before = scroller.scrollLeft;
  const wheel = event({ shiftKey: true, deltaX: 0, deltaY: 2, deltaMode });
  handlers.wheel(wheel);
  assert.equal(wheel.prevented, true);
  assert.equal(scroller.scrollLeft, before + 2 * (deltaMode === 0 ? 1 : deltaMode === 1 ? 16 : 800));
}
for (const options of [{ deltaX: 40 }, { shiftKey: false }, { ctrlKey: true }, { metaKey: true }]) {
  const wheel = event({ shiftKey: true, deltaX: 0, deltaY: 20, ...options });
  handlers.wheel(wheel);
  assert.equal(wheel.prevented, undefined, 'Native trackpad, vertical wheel and browser zoom must remain available');
}

// Each mouse drag pans both axes and suppresses only its synthetic click.
for (const [dx, dy] of [[60, 50], [-60, -50]]) {
  const before = [scroller.scrollLeft, scroller.scrollTop];
  handlers.pointerdown(event());
  const move = event({ clientX: 300 + dx, clientY: 200 + dy });
  handlers.pointermove(move);
  assert.equal(move.prevented, true);
  assert.equal(classes.has('is-panning'), true);
  assert.equal(scroller.scrollLeft, before[0] - dx);
  assert.equal(scroller.scrollTop, before[1] - dy);
  handlers.pointerup(event({ type: 'pointerup' }));
  assert.equal(classes.has('is-panning'), false);
  assert.equal(captures.size, 0);
  const click = event();
  handlers.click(click);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  const normalClick = event();
  handlers.click(normalClick);
  assert.equal(normalClick.prevented, undefined);
}
handlers.pointerdown(event());
handlers.pointermove(event({ clientX: 302 }));
handlers.pointerup(event());
const tileClick = event();
handlers.click(tileClick);
assert.equal(tileClick.prevented, undefined, 'Ordinary tile clicks still select the image');

for (const options of [{ pointerType: 'touch' }, { button: 2 }, { target: { closest: () => ({}) } }, { clientX: 805 }]) {
  const before = [scroller.scrollLeft, scroller.scrollTop];
  handlers.pointerdown(event(options));
  handlers.pointermove(event({ clientX: 200, clientY: 100 }));
  assert.deepEqual([scroller.scrollLeft, scroller.scrollTop], before, 'Touch, right-click, edge buttons and scrollbars must not start a mouse drag');
}
handlers.pointerdown(event());
handlers.pointermove(event({ clientX: 280 }));
handlers.pointercancel(event({ type: 'pointercancel' }));
assert.equal(classes.has('is-panning'), false);
assert.equal(captures.size, 0);
console.log('Four-way drag/keyboard pan, Shift-wheel, resize stability, native touch/trackpad/zoom, scrollbar handling and drag-click suppression passed.');
