# SATE sky prototype

Run `npm run build`, `npm run check`, then `npm run preview` (localhost:4182).

Routes: `/` landing, `/explore/` atlas, `/contribute/` contribution explanation, `/about/` scope and credits.

The explorer uses Aladin Lite 3.8.1 with the official NASA/IPAC SPHEREx DR1 all-sky HiPS cube, served directly by IRSA. It supports pan, zoom, progressive region selection, exact HEALPix task cells, neighbouring cells and coordinate entry. Selection updates the coordinate readout and shareable URL (`?hpx=734163&order=9&channel=62`). The global task grid is NESTED, NSIDE=512: 3,145,728 equal-area cells, 6.87097 arcminutes in equivalent-square width. Coarser parent regions are shown at wider zoom levels. This grid partitions investigations; it is not an instrument footprint map.

Wavelength labels come from the official `data_cube_crval3_arr` metadata. Frames 50 and 51 are blank and disabled. Aladin 3.8.1 internally addresses conventional cubes through a linear frequency index. `channelTransportHz` maps an explicit frame number into that addressing coordinate; it is NOT the physical frequency of the SPHEREx channel. Browser network checks verified frame 62 at 3.293 µm and frame 76 at 4.112 µm, including Norder5 requests. Do not replace this adapter with `setSliceNumber`, whose wavelength interpolation addresses the wrong frames in this release.

The map combines observations across time and is only spatial/spectral context. It is not a time sequence or an observation-count/epoch coverage map. HiPS display pixels are about 12.9 arcseconds; native Level 2 SPHEREx pixels are 6.15 arcseconds. Scientific investigations should use native images plus a margin outside the cell. Neither a blank tile nor a sample review establishes astronomical completeness.

Sample reviews stay in browser localStorage. No AI service or distributed computing is connected. Legacy sample states do not transfer into the scientific grid. The landing-page illustration still uses real bright-star coordinates from D3-Celestial (BSD-3-Clause; dist/assets/LICENSE). Vendor licences and upstream source links are under `dist/vendor/`.

The real SPHEREx example is known Mira variable J1502099+593125, not Mira/o Ceti. It uses a 60″ crop with two matched spectral samples per window, shared display stretch, and source records. Windows: November 30, 2025 and June 9–21, 2026. The approximately 79% lower aperture signal refers to this particular comparison. The rest of the cell remains unreviewed; moving-object catalog completeness is unresolved. Four source records are in dist/assets/mira.json.

Validation of the new grid: 90 seam/pole/wrap cases and all 102 channel addresses; 590 independent astropy-healpix coordinate, centre and neighbour reference cases. Shared vertices admit either incident cell. The direct face-coordinate mapping avoids seam errors in the dependency's forward angular conversion; its inverse geometry is independently checked. Browser QA verified actual SPHEREx tiles, selected coordinates, region selection, neighbouring cells, wavelength changes and coordinate navigation near the south pole. Full-page navigation into/out of the explorer releases its WebGL document. The legacy model checks preserve prior demo/source coverage. Original design direction was reviewed with Claude Opus 5.5; this map replacement and its verification were implemented by Codex.
