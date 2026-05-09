# Implementation Plan: AeroProc Hong Kong (VHHH)

This document tracks the roadmap for the Hong Kong adaptation of the AeroProc procedural visualization tool.

## Phase 1: Regional Foundation (Completed)
Establish the geospatial and localization baseline for the Hong Kong TMA.

- [x] **Map Calibration**: Center map on VHHH (`22.3089, 113.9146`).
- [x] **Magnetic Declination**: Adjust to **3° West**.
- [x] **Persistence Key**: Update Storage Key to `aeroproc_procs_hk`.
- [x] **UI Localization**: Full English/Portuguese support for HK-specific terminology.

## Phase 2: Data Ingestion & Expansion (Completed)
Migrate localized aviation datasets and expand fidelity using industry-standard formats.

- [x] **RNAV Fixes**: Bulk extraction of **884 waypoints** from `.sct` sector files.
- [x] **Navaids**: Integrated 21 VORs and NDBs with precise frequencies.
- [x] **SCT Parser**: Developed `scripts/parse_sct.js` for automated EuroScope data conversion.
- [x] **Runways**: Populated thresholds for VHHH, VMMC, and ZGSZ.

## Phase 3: Airspace & Sector Modeling (Completed)
Detailed modeling of the Hong Kong FIR subdivisions.

- [x] **FIR Boundary**: Precise modeling of the HK FIR.
- [x] **Sub-Sectors**: Implemented overlapping Southern ACC (Radar) and Southern FIS (Information) layers.
- [x] **Central FIS**: Added service volume beneath the TMA footprint.
- [x] **UCARA**: Integrated Uncontrolled Airspace Reporting Areas with standard amber/dashed styling.
- [x] **ATZ Correction**: Corrected HK ATZ categorization and styling (Orange).

## Phase 4: CI/CD & Deployment (Completed)
Establish a professional delivery pipeline.

- [x] **GitHub Actions**: Automated build and deploy workflow.
- [x] **Pages Integration**: Configured repository for Action-based deployment.
- [x] **Live Environment**: Accessible at [mytchelcosta.github.io/aeroproc-hk/](https://mytchelcosta.github.io/aeroproc-hk/).

## Phase 5: UI & Rendering Bug Fixes (Completed)
- [x] **Search Highlight Duplication**: 
    - Refactored the NAVAID block in `_buildHighlightHtml` (`MapLayers.js`) to use the same `.navaid-icon-inner` / `.navaid-label-inline` HTML structure as `renderNavaids`. The highlight geometry now perfectly eclipses the base marker. The "TD TD" redundant-name issue was eliminated by showing only the ident in the permanent label (name is in the tooltip).
- [x] **Measuring Vector UX Refinements**:
    - **Dynamic Label Anchoring**: Added `_computeLabelAnchor()` in `MeasuringVector.js` — computes `iconAnchor` from the vector's true bearing so the label box always extends away from the line.
    - **De-clutter Overlapping Labels**: Added `_isSameLatLng()` helper and `offsetIndex` field on vector entries. Labels at the same destination fan out 22px apart along the outward vector path.
    - **Simplified Label Format**: `_buildLabelContent` now returns plain values (`17.0`, `060°`, `03:48`). `_buildLabelIcon` uses a single `.mv-lbl-val` class with unified amber color instead of distinct per-line colors.
    - **Selected Label Synchronization**: `_selectVector` / `_deselectAll` toggle the `mv-selected` CSS class on the label marker's DOM element, turning both line and label text red together.
    - **Keyboard Shortcut (C)**: `cycleSelectedVector()` added to `MeasuringVector.js` and exported; bound to the 'C' key in `main.js`.
- [x] **Measuring Vector UX Follow-ups**:
    - **Selection State Loss on Redraw**: `_redrawVector` now re-applies `mv-selected` to the label's DOM element after `setIcon()` if the vector is the current selection.
    - **De-cluttering Stacking Strategy**: `_computeLabelAnchor` bearing-positions the base anchor; `offsetIndex` shifts ONLY the Y-axis by `offsetIndex * 38px` for a clean vertical column.
    - **Remove Play Triangle & Border**: `▶ ` prefix removed from `_buildLabelContent`; `border-left` removed from `.mv-lbl-inner`.
    - **Closer Label Placement**: `W = 40`, `H = 36` in `_computeLabelAnchor` brings the label box close to the endpoint.
- [x] **Measuring Vector Edge Cases (Critical Bug Fixes)**:
    - **Severe Label Displacement (Reverted)**: The inline CSS `transform: translate(calc(-50% + ...))` on `.mv-lbl-inner` was reverted; positioning is back to Leaflet-native `iconAnchor`. The bug surfaced because the inner-div CSS transform sat downstream of Leaflet's own marker transform, and a marker placed in `tooltipPane` does not share `markerPane`'s zoom-animation handshake — during/after zoom the two transforms desynced and the labels drifted to the corners. Restored `_computeLabelAnchor(origin, dest, offsetIndex, isTrackingDest)` with `W=40, H=36` and `M = isTrackingDest ? 14 : 6`, so the box still sits 14px clear of an 18px aircraft glyph and tight (6px) to plain map points.
    - **Aircraft Label Z-Index Collision**: Created a dedicated `mvPane` at `z-index: 2000` (above markerPane=600 and tooltipPane=650). New `_ensureMvPane(mapInstance)` lazily provisions it on first finalize; `_finalizeVector` now uses `pane: 'mvPane'` (and `zIndexOffset` is dropped — pane stacking handles ordering deterministically). MV labels float above aircraft callsign tooltips without re-introducing tooltipPane's zoom-animation quirks.
    - **Transparency & "Brown Bar" Illusion**: `.mv-lbl-inner` background dropped to `rgba(30, 15, 0, 0.20)` (selected: `rgba(40, 0, 0, 0.20)`). The heavy `0 0 8px` halo on `.mv-lbl-inner span` is replaced with a tight `0 1px 2px rgba(0, 0, 0, 0.6)` drop shadow, eliminating the dark-bleed stripe on the left edge that read as a fake border.
    - **Global Deselection**: New `deselectAllVectors` export in `MeasuringVector.js` (alias for `_deselectAll`); wired into a new `_map.on('click')` handler in `main.js` that fires only when `isMeasuringVectorActive()` is false, so empty-map clicks clear red selection without interfering with the tool's own click flow.
- [x] **Toolbar Tooltip Clipping (Mobile/Scroll)**:
    - Added CSS overrides in `main.css` for `.map-tool-btn:first-of-type` (anchors tooltip to top edge) and `.map-tool-btn:last-of-type` (anchors to bottom edge), preventing clipping by the scroll wrapper's `overflow-y: auto`.
- [x] **Traffic Data Consistency**:
    - **Magnetic Track Conversion**: `LiveTraffic.js` now imports `trueToMagnetic` from `../utils/Helpers.js`; the `trkStr` in `_buildTooltipHtml` wraps `ac.track` so the tooltip displays magnetic track in parity with the Measuring Vector tool. The icon rotation still uses raw `ac.track` (True) — correct, because rotation is applied directly to the SVG in screen-space relative to the map's geographic-north orientation, not to a magnetic compass rose.


## Phase 6: Traffic Coloring & Logic Refinements (Completed)
- [x] **Aircraft Symbol Coloring Revamp**:
    `LiveTraffic.js` now imports `calculateDistance` from `../utils/Helpers.js` and the old proximity-based classifier (`_HK_AIRPORTS`, `_PROX_NM`, `_haversineNM` for the airport pick) is replaced with a strict VHHH-centric scheme. New module-level constants `_HK_AIRFIELDS = ['VHHH', 'VHHX']`, `_NEAR_DIST_NM = 50`, and `_LOW_ALT_FT = 25000` make the thresholds explicit. Distance is measured from `ac.lat / ac.lon` to the existing `_CENTRE_LAT / _CENTRE_LON` VHHH reference.
    - **Yellow (`'hk-near'` → `#ffd84a`)**: route has VHHH or VHHX as origin/dest **AND** `ac.altFt < 25 000` **AND** `distToVHHH ≤ 50 NM`.
    - **White (`'hk-far'` → `#ffffff`)**: route has VHHH or VHHX as origin/dest **AND** (`ac.altFt ≥ 25 000` **OR** `distToVHHH > 50 NM`).
    - **Grey (`'other'` → `#94a3b8`)**: all other aircraft, including those whose adsbdb.com route lookup is still in flight (default fallback until the route resolves).
    - The dedicated `'ground'` colour was retired — surface-movement aircraft now classify under the same three-bucket scheme (e.g. a VHHH-bound flight taxiing reads as `'hk-near'`).
    - `_haversineNM` is preserved as it is still used by `getNearestAircraft` (MeasuringVector aircraft snapping); the new classifier uses `calculateDistance` so its metric matches the Measuring Vector's NM readout.
    - Build verified clean (`vite build` → 250.43 kB JS, 0 errors).

## Phase 7: UI & Interaction Refinements (Completed)
- [x] **Aircraft Tooltip Enhancements**:
    - **TRK Line Color**: `.ac-trk` in `main.css` is now `rgba(200, 210, 220, 0.9)` (the same soft gray as `.ac-detail`) instead of `#60a5fa`. Track now reads as part of the same visual block as Type/Alt/GS lines.
    - **Wake Turbulence Indicator**: `LiveTraffic.js` lazy-loads `public/data/wtc.json` once on `initLiveTraffic` (cache: `force-cache`), stores the parsed object in `_wtcMap`, and exposes a private `_wtcLetterHtml(icaoType)` helper that returns a `<span class="ac-wtc ac-wtc-${letter}">${letter}</span>` for known types. `_buildTooltipHtml` now appends the span inside the existing `.ac-type` block (e.g. `B777 H`, `A320 M`). Once the fetch resolves, `_rebuildAllTooltips` is called so already-rendered aircraft pick up the WTC letter without waiting for the next poll. New CSS classes in `main.css`: `.ac-wtc`, `.ac-wtc-S` (red `#ef4444`), `.ac-wtc-H` (orange `#f97316`), `.ac-wtc-M` (yellow `#facc15`), `.ac-wtc-L` (green `#22c55e`). Failure modes (network error, missing key) silently omit the letter — no placeholder ever rendered.
- [x] **Measuring Vector Snapping UX**:
    - **Visibility Check**: `setVectorSnapProvider` callback in `main.js` now resolves each search-index entry to its parent LayerGroup (`_navaidLayer`, `_waypointLayer`, or one of the three aerodrome-tier layers `_majorLayer / _regionalLayer / _heliportLayer`) and rejects it via `_map.hasLayer(layer)` when that layer is toggled OFF. Since the toolbar checkboxes drive `addTo` / `removeLayer` directly, `hasLayer` is the authoritative truth — no parallel "is-visible" flag to keep in sync.
    - **Exclude Airspaces**: Confirmed by construction. `SearchManager.buildSearchIndex` only emits entries with `layer ∈ {'aerodrome', 'fix', 'navaid'}`, so airspaces are never candidates and the new layer-visibility filter rejects anything without a recognised parent layer anyway.
    - **Hitbox Tuning**: `MeasuringVector.js` introduces split radii — `_AIRCRAFT_SNAP_NM = 1.0` (unchanged, generous for moving targets) and `_STATIC_SNAP_NM = 0.4` (down from 1.0). `_getSnap` calls `getNearestAircraft(latlng, 1.0)` first then `_snapProvider(latlng, 0.4)`, so static fixes/navaids/airports only snap when the cursor is genuinely close.
- [x] **Airspace Hover Tooltip**:
    - `renderAirspaces` in `MapLayers.js` now creates each polygon with `interactive: true, bubblingMouseEvents: true, className: 'airspace-polygon'`. Clicks still bubble to the map so the Measuring Vector flow is unchanged. A new `_attachAirspaceHoverTooltip(map, polygon, name, type, coordinates)` helper binds per-polygon mouseover/mouseout/remove handlers driving a `setTimeout` of `_AIRSPACE_HOVER_DELAY_MS = 2000`. After the dwell, an `L.tooltip` (className `airspace-hover-tooltip`, anchored at the cursor's latlng captured on hover-start) is added to the map; mouseout clears the timer and removes the tooltip. Each polygon owns its own `_timer` + `_tooltip` closures so multiple airspaces don't fight each other. Tooltip body shows Name, Type, Vertex count, and bounding-box span (`Δlat × Δlon`) — altitude limits are placeholdered in the helper for when the AIP data set merges them in. New CSS in `main.css`: `.airspace-hover-tooltip`, `.airspace-hover-tooltip .ah-name/.ah-row/.ah-key`, plus `.airspace-polygon { cursor: inherit !important; }` so the interactive polygons don't flip the cursor to a pointer.
    - Build verified clean (`vite build` → 252.30 kB JS, 76.23 kB CSS, 0 errors).
- [x] **Airspace Hover Tooltip (Border-Only Follow-up)**:
    - **Border-Only Interaction**: Reverted the polygon to `interactive: false`. `_attachAirspaceHoverTooltip` now creates a sibling `L.polyline` ("border hit") that traces the closed vertex ring with `weight: 8`, `color: 'rgba(0,0,0,0.001)'`, `interactive: true`, and `className: 'airspace-border-hit'`. The polyline is invisible on screen but its 8 px stroke catches the cursor along the entire boundary. Visibility is mirrored from the polygon: `polygon.on('add', …)` adds the hit-line, `polygon.on('remove', …)` removes it (and clears any open tooltip / pending timer), so the toolbar checkboxes still drive everything through the polygon reference — no public API change. CSS class `.airspace-border-hit` forces `pointer-events: stroke !important` (belt-and-suspenders against Leaflet's default `visiblePainted` rejecting the near-zero paint) and `cursor: inherit !important` (so the invisible border doesn't flip the cursor to a pointer). The redundant `.airspace-polygon` cursor rule was deleted alongside.
    - **Streamlined Info**: `_buildAirspaceTooltipHtml(name, type)` now only emits `Name`, `Type:`, `Class:` (placeholder `—`), `Vertical Boundaries:` (placeholder `—`). The previous Vertex/Span lines and the bounding-box computation were deleted. The function signature dropped its `coordinates` parameter — that data is consumed by the hit-polyline ring instead.
    - **Cursor Anchoring**: The helper now tracks `_lastLatLng` via the polyline's own `mousemove` events. On `mouseover` it captures the current cursor position; the 2 s setTimeout reads `_lastLatLng` at firing time so the tooltip anchors at the *current* cursor position, not the position captured when hover began. While the tooltip is visible, mousemove also calls `_tooltip.setLatLng(_lastLatLng)` so it follows the cursor along the border.
    - Build verified clean (`vite build` → 252.47 kB JS, 76.27 kB CSS, 0 errors).
- [x] **Airspace Hover Tooltip (Data Integration)**:
    - **Real Data Utilization**: `renderAirspaces` in `MapLayers.js` now destructures `class` (aliased to `airspaceClass`, since `class` is a reserved word) and `limits` from each `airspaces_aip.json` record and forwards both to `_attachAirspaceHoverTooltip(map, polygon, name, type, coordinates, airspaceClass, limits)`. The helper passes them straight through to `_buildAirspaceTooltipHtml(name, type, airspaceClass, limits)`, which renders the live AIP values (`"C"`, `"A/C/G"`, `"SFC - 4500 FT"`, `"SFC - UNL"`, etc.) in the Class and Vertical Boundaries rows.
    - The `—` em-dash fallback was kept in `_buildAirspaceTooltipHtml` as a defensive default — any future record missing one of the two fields will still render cleanly instead of leaving a blank value next to the row label.
    - Header doc-comment for `renderAirspaces` updated to reflect the new schema (`{ name, type, coordinates, class, limits }`).
    - Build verified clean (`vite build` → 252.55 kB JS, 76.27 kB CSS, 0 errors).

---

## 📈 Advancement Tracking
| Milestone | Progress | Status |
| :--- | :--- | :--- |
| **Foundation** | 100% | Done |
| **Data Expansion** | 100% | Done |
| **Airspace Modeling** | 100% | Done |
| **CI/CD** | 100% | Done |
| **Bug Fixes** | 100% | Done |
| **Traffic Coloring** | 100% | Done |
| **UI Refinements** | 100% | Done |

*Last Updated: 2026-05-09*
