// Scrolling never retrieves data: it only moves the retained image surface.
export function installMapPanning(scroller, board) {
  let drag = null;
  let suppressClick = false;
  let paddingX = 0;
  let paddingY = 0;
  function resize() {
    // A viewport of breathing room on every side allows four-way movement
    // even when the currently loaded map is only a single image.
    const x = Math.max(240, scroller.clientWidth);
    const y = Math.max(240, scroller.clientHeight);
    board.style.padding = y + 'px ' + x + 'px';
    scroller.scrollLeft += x - paddingX;
    scroller.scrollTop += y - paddingY;
    paddingX = x;
    paddingY = y;
  }
  resize();
  let observer;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(resize);
    observer.observe(scroller);
  }
  scroller.addEventListener('pointerdown', function (event) {
    suppressClick = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('.sky-arrow')) return;
    const rect = scroller.getBoundingClientRect();
    // Leave the native scrollbars to the browser.
    if (event.clientX >= rect.left + scroller.clientWidth || event.clientY >= rect.top + scroller.clientHeight) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false };
  });
  scroller.addEventListener('pointermove', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      scroller.setPointerCapture(event.pointerId);
      scroller.classList.add('is-panning');
    }
    event.preventDefault();
    scroller.scrollLeft = drag.left - dx;
    scroller.scrollTop = drag.top - dy;
  });
  function finish(event) {
    if (!drag || event.pointerId !== drag.id) return;
    suppressClick = drag.moved && event.type !== 'pointercancel';
    drag = null;
    scroller.classList.remove('is-panning');
    if (scroller.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
  }
  scroller.addEventListener('pointerup', finish);
  scroller.addEventListener('pointercancel', finish);
  scroller.addEventListener('lostpointercapture', function () {
    drag = null;
    scroller.classList.remove('is-panning');
  });
  scroller.addEventListener('click', function (event) {
    // Dragging across a tile must not select it or trigger its edge search.
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  scroller.addEventListener('wheel', function (event) {
    if (event.ctrlKey || event.metaKey || !event.shiftKey || event.deltaX !== 0) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1;
    event.preventDefault();
    scroller.scrollBy({ left: event.deltaY * unit, top: 0 });
  }, { passive: false });
  scroller.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const distance = event.shiftKey ? 240 : 80;
    scroller.scrollBy({ left: direction[0] * distance, top: direction[1] * distance });
  });
  return { resize, observer };
}
