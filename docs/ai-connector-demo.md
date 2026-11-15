# AI region queue

`/contribute/` uses the real SPHEREx sky map to build an ordered queue of selected HEALPix regions. Selection uses actual region IDs and orders, with canonical celestial coordinates. The queue can include wide regions and individual order-9 cells. Map selections and queue entries stay synchronized; removing a region clears its selection. There is no fixed illustrative grid or number-based substitute for region selection.

The selected queue is stored locally under `sate-ai-region-queue-v1`, separately from saved-cell reviews. It retains selection order and deduplicates by order and ID. Malformed records are ignored and the queue is bounded to 100 regions. Changing the queue is disabled while execution is active; Edit queue resets execution and restores selection controls.

Only AI execution remains a preview. Assistant choices do not authenticate, access allowance or send provider requests. The timed run steps through exactly the selected regions in order, showing the real active sky region and a link to its observation viewer. The page explicitly identifies preview execution; it produces no AI findings or saved scientific reviews. There are no fabricated image-search results.

`ai-demo-model.js` contains the validated queue and execution state. `ai-connector.js` renders the controls and schedules one timer while running. Inspection does not restart that timer. Pause retains its step, disconnect clears execution while retaining the queue, page hiding pauses, and route cleanup clears timers and destroys the map. The map's live imagery and selection lifecycle are owned by `ai-region-map.js`.

A real connector still needs supported provider authorization and an enforceable work budget. The frontend does not claim that subscription allowances can be read or transferred. A server-side job contract should pass selected region identity, source files, cancellation and source-linked outputs to a supported provider adapter.

Validation covers real-region identity, canonical coordinates, ordering, deduplication, bounded work, pause/resume, disconnect and separate queue persistence. Parent integration additionally verifies actual map selection, sequential active-region changes, responsive controls and browser cleanup.

The main atlas now regenerates a complete adaptive HEALPix grid when the viewport changes. It coarsens an overlarge grid instead of slicing a traversal-ordered list, which previously could omit central boundaries. Zooming and the Zoom into region action reveal finer cells. Selected regions continue using the same canonical coordinate model in the contribution map.

The main atlas includes the requested presentation overlay only at individual order-9 cell scale (roughly 6.9 arcminutes per cell). Wider views keep faint neutral boundaries and hide the colour legend. At cell scale: subtle red (unreviewed), green (reviewed) and orange (needs further review) fills with a plain legend. These initial colours are deterministic illustrative states, keyed to rendered region ID/order; they are not evidence of actual completed reviews and do not alter the notebook. The UI intentionally has no “Demo status” label. Filled polygons crossing the all-sky projection seam are excluded to avoid painting across unrelated sky areas.

Integration verification: Chromium and WebKit loaded actual IRSA HiPS tiles, selected multiple real regions, preserved selection order/reload state, and refined the grid during zoom. Both engines passed queue run/pause/resume/completion, inspection without slowing execution, removal, disconnect, hidden-page pause and route cleanup. Main atlas colour legend, complete grid and successive region zoom pass in both engines. Desktop and 320/390px layouts checked; the connector performs no provider calls.
