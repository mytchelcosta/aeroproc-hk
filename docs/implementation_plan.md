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

## Phase 8: Fixes Visualization (Completed)
- [x] **Incremental Search Highlighting in View Mode**:
    - **Pass Search Term**: `handleGlobalSearch` in `SearchManager.js` now forwards the already-trimmed/uppercased query string `q` as the third argument to `renderGlobalSearchHighlights(map, results, q)`. Reusing `q` avoids re-running `trim().toUpperCase()` inside the renderer.
    - **Highlight Substring**: `renderGlobalSearchHighlights(mapInstance, results, term)` in `MapLayers.js` accepts the new `term` parameter and exposes a local `_highlightMatch(rawText)` helper. The helper finds the first case-insensitive occurrence of `term` inside `rawText`, escapes each segment (before / match / after) with `_safeEscape` to keep the XSS guarantee, and stitches them back together with a `<span class="fix-label-highlight">…</span>` around the matched run. With no `term` (empty/undefined) it short-circuits to a fully-escaped plain string — same output shape as `_safeEscape`.
    - **Apply CSS**: All four label-rendering branches inside `_buildHighlightHtml` now route their ident/name through `_highlightMatch`:
        - **Fix**: `_floatingLabel(_highlightMatch(result.ident), color)`.
        - **Aerodrome (heliport tier)**: ident + optional name both highlighted in the H-ring's floating label.
        - **Aerodrome (major/regional)**: ident + optional name both highlighted in the ✈ circle's floating label.
        - **NAVAID**: `<span class="navaid-label-inline …">${_highlightMatch(result.ident)}</span>` so the inline label glows on match.
    - The reused `.fix-label-highlight` CSS class (white text, blue glow) takes precedence over the per-layer ident colour because the child span carries its own `color` rule, while the parent's colour comes from an inline style on the wrapper. Same visual treatment as Builder mode.
    - Build verified clean (`vite build` → 252.82 kB JS, 76.27 kB CSS, 0 errors).
- [x] **Advanced Filtering / Category Toggles**:
    - **UI Update**: The three legend entries inside `.global-search-legend` (Aerodrome / Fix / NAVAID) were promoted from passive `<span>` swatches into clickable `<button class="gsl-chip active" data-category="…" aria-pressed="true">` toggle chips, all defaulting to ON. The chip layout reuses the existing legend row so the search section's vertical footprint is unchanged. New CSS in `main.css`: `.gsl-chip` (transparent button, hover background, focus-visible outline), `.gsl-chip:not(.active)` (opacity 0.45 + line-through label + grayscale dot) so muted categories read at a glance.
    - **Search Logic Update**: New `getGlobalSearchCategoryFilter()` exported from `Sidebar.js` reads each chip's `.active` class straight from the DOM — single source of truth, no parallel JS state object that could drift. `main.js` now wraps the search callback as `setViewGlobalSearchCallback((term) => handleGlobalSearch(_map, term, getGlobalSearchCategoryFilter()))` so the latest filter is captured on every keystroke. `handleGlobalSearch` accepts an optional third argument `categoryFilter = { aerodrome, fix, navaid }` (defaults to all-on for older callers); the inner scoring loop short-circuits with `if (filter[entry.layer] === false) continue;` before any string compares so muted layers cost nothing.
    - **Re-fire on Toggle**: `_wireGlobalSearch` in `Sidebar.js` adds a click handler to every `.gsl-chip[data-category]` that flips the `.active` class, mirrors it to `aria-pressed` for screen readers, and calls `_onGlobalSearch(input.value)` so the result set updates instantly without the user re-typing.
    - Build verified clean (`vite build` → 254.25 kB JS, 76.80 kB CSS, 0 errors).
- [x] **Search UX Polish (Cap, Layout & Per-Category Counts)**:
    - **Raise Result Cap & Distance Priority**: `SearchManager.js` now defines `_RESULT_CAP = 200` (replacing the hard 50), `_VHHH_LAT / _VHHH_LON` literals, and an inlined `_haversineNM(lat1, lon1, lat2, lon2)` (3440.065 NM Earth radius). For each scored entry the loop precomputes `distNm = _haversineNM(_VHHH_LAT, _VHHH_LON, entry.lat, entry.lon)` and stores it on the result. The sort comparator now goes `score → distNm asc → ident locale` so equally-scored matches are ordered by proximity to VHHH; the slice then applies `_RESULT_CAP`. No cap exists in `MapLayers.js` (`renderGlobalSearchHighlights` iterates the full `results` array as-is), so nothing to remove on that side.
    - **Fix "XX Results" count positioning**: The `#global-search-count` badge was moved BELOW `.global-search-legend` inside `.global-search-meta` in `Sidebar.js` (was above, in a horizontal `space-between` flex row that pushed the chips around when the badge appeared). `.global-search-meta` is now `flex-direction: column`, so the badge's show/hide cycle only ever shifts content below the chips, never above. `.global-search-legend` also carries `min-height: 66px` (~3 chip rows) so any sibling appearing/disappearing nearby can't cause the chip block to bounce.
    - **Vertical Chip Layout with Per-Category Counts**: `.global-search-legend` is now a vertical column (`flex-direction: column`); each `.gsl-chip` is a full-width `display: flex` row containing `[gsl-dot] [gsl-label flex:1 1 auto] [gsl-cat-count, margin-left:auto]`. New `<span class="gsl-cat-count" data-cat-count="…">` injected per chip. New `updateCategoryChipCounts({aerodrome, fix, navaid})` exported from `Sidebar.js` sets `textContent` and toggles `display: inline-block` / `none` per badge; called with `null` to hide all (used on empty search). `handleGlobalSearch` computes the per-category totals from the FULL `scoredResults` (before sort/slice) so the badges show the true category match count, not the displayed top-N. New CSS `.gsl-cat-count` (monospaced, font-size 10px, opacity 0.75, subtle white-tint background pill); inactive-chip rule retargeted to `.gsl-chip:not(.active) .gsl-label` so the strikethrough lands on the label, not the new count badge.
    - Build verified clean (`vite build` → 255.28 kB JS, 77.10 kB CSS, 0 errors).

---

## Phase 9: Weather Card UX Polish (Completed)

- [x] **Three-Tier Data Fallback System**:
    - **Source priority**: Decoded CheckWX API field (tier 1, white) → raw METAR regex parse (tier 2, yellow `#facc15`) → TAF first period (tier 3, orange `#f97316`). Each field (Wind, QNH, Temp/Dew, Clouds, Visibility) resolves independently through this chain.
    - **`_wrapTier(valueStr, tier)`**: Local helper inside `_buildWeatherCard` wraps each value in a `<span>` with the appropriate CSS class (`wx-value`, `wx-value--metar-fallback`, `wx-value--taf-fallback`, `wx-value--na`). Color alone signals data origin — no asterisk superscripts needed.
    - **QNH raw fallback**: Handles both ICAO `Q` format (`Q1015` → 1015 hPa) and US InHg format (`A2992` → converted to hPa).
    - **Visibility in metres**: Decoded API statute miles converted to metres (`× 1609`). Raw METAR 4-digit group is already metres. Capped display at `>=9999 m` / `>=10000 m`.
    - **Cloud height 0-ft guard**: CheckWX API sometimes returns `base_feet_agl: 0` for coverage layers it can't decode. If ALL coverage layers (FEW/SCT/BKN/OVC) have `base_ft === 0`, the decoded array is flagged `apiCloudsSuspect = true` and tier 1 is skipped entirely, falling through to raw METAR regex (tier 2) which correctly parses heights like `BKN020` → 2000 ft.
    - **Ceiling-only cloud display**: Only `BKN` and `OVC` layers are shown (FEW/SCT are non-ceiling and suppressed). If no BKN/OVC exists, displays `NIL`. Heights formatted as compact METAR notation (`BKN020`) rather than verbose `BKN 2,000ft`.

- [x] **Raw String Box Colour Parity**:
    - Raw METAR string box uses new `.wx-metar-raw` class → **yellow** text (`#facc15`), matching tier-2 value colour.
    - Raw TAF string box retains `.wx-taf-raw` class → **orange** text (`#f97316`), matching tier-3 value colour.
    - Both boxes share identical padding/border/background CSS shape for visual consistency.
    - The redundant `<div class="wx-section-title">TAF</div>` header was removed — the TAF raw string itself starts with `TAF ICAO ...` making the label redundant.
    - TAF validity period sub-line also removed for brevity.

- [x] **Compact Layout Restructure**:
    - **Header row**: Flight category badge + `METAR` label + compact observation timestamp (`DD Mon HH:MMZ`, e.g. `10 May 00:00Z`) aligned right — all on one line. The verbose `Observed: Sat, 09 May 2026 23:30:00Z` footer line is removed.
    - **6-column CSS grid**: Row 1 — Wind (span 2) | QNH (span 2) | T/D (span 2). Row 2 — Clouds (span 3) | Visibility (span 3). Each cell uses `.wx-item-hdr` (`display: flex`) to place the emoji icon and abbreviated label on the same line, with the value on the line below.
    - **`.wx-value` CSS**: `word-break: break-all` removed; replaced with `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 10px` to guarantee single-line values without text wrapping.
    - **Compact value strings**: Wind — `100°/10KT` (no spaces around `/`, no space before `KT`); Temp/Dew — `24°C/20°C`; Gust — `10KTG20`. These eliminate the mid-number wraps seen at 11px.
    - Build verified clean (`vite build` → 257.59 kB JS, 77.80 kB CSS, 0 errors).

## Phase 10: FIR Fixes Overlay (Completed)

- [x] **Data Audit & Completion**:
    - **Verify existing dataset**: `public/data/fixes_hk.json` already contains **884 RNAV waypoints** parsed from the `[FIXES]` section (lines 133–1032) of `public/data/Hong-Kong-Sector-File.sct`. That section has 900 entries; the 16-entry gap is due to blank/comment lines. The JSON is therefore essentially complete for the current SCT revision and **no re-extraction is required** unless a newer sector file is dropped in.
    - **Future-proofing script**: `scripts/parse_sct_fixes.js` (to be created) should read `public/data/Hong-Kong-Sector-File.sct`, extract every line in the `[FIXES]` block (stop at the next `[` section header), parse the EuroScope DMS coordinate strings (`N/S DD.MM.SS.sss E/W DDD.MM.SS.sss`) into decimal lat/lon, and write `public/data/fixes_hk.json` as `[{ "ident": "XXXXX", "lat": DD.ddddd, "lon": DDD.ddddd }]`. Run this any time the sector file is updated to keep the JSON in sync.

- [x] **Ghost Fix Layer (Non-Interactive Background Dots)**:
    - **Design intent**: Every fix in `fixes_hk.json` should be permanently visible on the map as a very faint, greyed-out dot — the same geometric shape as the active (interactive) fix markers but at low opacity and with no mouse events. Because the search-result highlight markers use the same dot geometry and appear in the same screen location, the highlighted markers will visually appear to "activate" a pre-existing ghost dot, creating a convincing pop-in effect with zero extra click targets.
    - **Rendering**: Add a new function `renderGhostFixes(mapInstance, waypointData)` in `MapLayers.js`. For each fix, create a `L.circleMarker` (same radius as the interactive fix markers) with: `color: 'rgba(180,200,210,0.25)'`, `fillColor: 'rgba(180,200,210,0.20)'`, `fillOpacity: 1`, `weight: 0.8`, `interactive: false`, `bubblingMouseEvents: false`. Add all ghost markers to a new dedicated `L.layerGroup` that is assigned to a new Leaflet custom pane named `'ghostFixPane'` (z-index slightly below the existing `waypointPane` so interactive markers always render on top).
    - **No labels**: Ghost markers must not carry any tooltip or DivIcon label. The purpose is purely positional reference — adding labels at this scale would produce illegible noise for the full 884-fix dataset.
    - **Layer toggle**: Register the ghost layer with the existing toolbar layer control under a new entry — e.g., labelled **"All Fixes (FIR)"** or **"Ghost Fixes"** — so the user can toggle visibility. The layer should default to **ON** since it is a core positional reference for ATCOs. The toolbar toggle drives `addTo` / `removeLayer` just like all other layers.
    - **Performance**: All 884 markers should be added to the layer group in a single loop. Do **not** use `L.marker` or `L.divIcon` for ghost fixes — `L.circleMarker` is a native SVG element and is much cheaper. Do not add any zoom-level virtualization; at the scale the app targets (VHHH area), the full set is manageable.
    - **Export**: Export `renderGhostFixes` and the ghost layer group reference from `MapLayers.js` so `main.js` can wire the toolbar toggle.
    - **Build must pass clean.**

## Phase 11: Fixes Label Alignment & De-cluttering (Ghost Layer Polish) (Completed)

- [x] **Visual Alignment / Doubling Fix**:
    - **Root cause**: The ghost label (Leaflet tooltip with `direction: 'bottom'`, `offset: [0, 7]`) placed its text top at lat/lon Y + 7 px. The search-highlight `_floatingLabel` for a Fix renders an 18 px outer dot (14 px content + 2×2 px border, default content-box sizing) inside a wrapper translated `-7 px`, with the label sitting `margin-top: 3px` beneath the dot — net text top at lat/lon Y + 14 px. Vertical mismatch was therefore exactly 7 px, producing a faint "doubling" halo when the highlight overlaid the ghost.
    - **Fix**: Bumped the ghost tooltip offset from `[0, 7]` to `[0, 14]` in `renderGhostFixes` (`MapLayers.js`) so the tooltip's top edge lands at lat/lon Y + 14 — pixel-matching the highlight label's text-top.
    - **Font-metric pinning**: Added explicit `line-height: 1.2` to `.ghost-fix-label` (`main.css`) AND inline on the `_floatingLabel` div in `_buildHighlightHtml` (`MapLayers.js`). Without this, browser default line-heights for `JetBrains Mono` could vary by 1-2 px between the tooltip context and the divIcon context, drifting the glyph baselines apart even after the offset fix. Also added `text-align: center !important` to `.ghost-fix-label` to mirror the highlight's centered alignment.
    - **Verified shared styles**: font-family, font-size (8 px), font-weight (600), white-space (nowrap), padding (0), margin (0), and text-shadow outline+glow are now identical between both labels — the only intentional differences are color (ghost teal vs highlight per-layer color) and opacity (ghost 0.45 vs highlight 1.0).

- [x] **Proximity De-cluttering**:
    - **CSS-only investigation**: Pure CSS cannot solve this because the labels live in independent marker DOM nodes — there is no parent–sibling relationship a CSS selector could use to detect cross-marker collisions. `:has()`, `+`, `~`, hover, and `mix-blend-mode` were all considered; none can address screen-space proximity between separately-rendered Leaflet markers.
    - **Lightest viable JS**: A single bucket-dedup pass in `renderGhostFixes` (`MapLayers.js`) before `bindTooltip`. Each fix's lat/lon is quantised to a ~165 m grid cell (`Math.round(coord * 667)` → `0.0015°` quantum, ≈ 167 m at 22 °N). The first fix that lands in a given cell gets its label rendered; subsequent fixes in the same cell render their dot only — no label. Cost is one `Set` lookup per fix; no zoom-time recomputation, no DOM mutations after render.
    - **Behavioural guarantee**: The dot itself is always shown so the positional reference is preserved for every fix; only the redundant text in coincident clusters is suppressed. The 165 m threshold catches true duplicates and very-close pairs (which would otherwise produce illegible overlapping 8 px labels) without affecting legitimately-separate fixes.
    - Build verified clean (`vite build` → 259.74 kB JS, 78.50 kB CSS, 0 errors).

---

## Phase 12: Display Settings Polish (Completed)

- [x] **Aerodromes Visibility**:
    - Increased opacity of all aerodrome tiers by 25% (more opaque):
        - Major airports `.airport-icon-inner`: `0.3` → `0.375`
        - Regional airports `.airport-icon-inner-regional`: `0.3` → `0.375`
        - Heliports: RGBA alpha channels scaled ×1.25 (background `0.14→0.175`, border `0.60→0.75`, symbol color `0.80→1.00`)
- [x] **Sizing Interface Defaults**:
    - Updated CSS root variables in `variables.css` and HTML slider defaults in `index.html`:
        - `--map-label-scale`: `1.0` → `1.2`
        - `--map-symbol-scale`: `1.0` → `1.4`
        - `--ui-scale`: `1.0` → `1.3`
- [x] **Fixes Scaling**:
    - Ghost fix marker radius: `3` → `3.6` px
    - Ghost fix label font-size: `8px` → `10px` (`.ghost-fix-label` CSS)
    - Search-highlight fix dot: `14px` → `17px` (border-box)
    - Highlight wrapper translate: `-7px` → `-8.5px` (re-centred on new dot size)
    - `_floatingLabel` gains optional `fontSize` parameter (default `'8px'`); fix highlights pass `'10px'` — aerodrome/heliport highlights remain at 8px
- [x] **Ghost Labels Zoom Persistence**:
    - Removed `container.classList.toggle('zoom-hide-ghost-labels', zoom < 10)` from `renderGhostFixes`.
    - Removed the dead CSS rule `.zoom-hide-ghost-labels .ghost-fix-label { display: none }` from `main.css`.
    - Tier-4 marker hiding (`zoom-hide-generic-ghosts`) preserved for performance.
- [x] **Airspace Stacking Reorder**:
    - Added `_ensureAirspacePanes()` and `_getAirspacePaneName()` helpers in `MapLayers.js`.
    - Created 5 dedicated Leaflet panes at z-indices 201–205 (between tiles at 200 and ghost fixes at 390):
        1. `airspaceFIRPane` (z=201) — FIR, FIZ, SEC (bottom-most)
        2. `airspaceTMAPane` (z=202) — TMA + outer boundary
        3. `airspaceCTRPane` (z=203) — CTR
        4. `airspaceATZPane` (z=204) — ATZ
        5. `airspaceUCARAPane` (z=205) — UCARA (top of airspace group)
    - Each `L.polygon` in `renderAirspaces` now receives `pane: _getAirspacePaneName(type)` so fills are visually below all markers, fixes, and symbols.
    - Removed the `polygon.bringToBack()` call from the default-visibility block.
- [x] **Absolute Label Synchronization**:
    - **Root cause identified**: The global CSS reset `* { box-sizing: border-box }` means the highlight dot `width:17px;height:17px;border:2px` is 17 px TOTAL. Phase 11 incorrectly treated border as additive (assumed 21 px), overestimating the tooltip offset.
    - **Correct geometry**: `text_top = (-8.5 translate) + (17 dot, border-box) + (3 margin) = +11.5 ≈ +12`
    - Ghost tooltip offset corrected: `[0, 16]` → `[0, 12]`
    - Build verified clean (`vite build` → 260.60 kB JS, 78.50 kB CSS, 0 errors).

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
| **Fixes Visualization** | 100% | Done |
| **Weather Card UX Polish** | 100% | Done |
| **FIR Fixes Overlay** | 100% | Done |
| **Ghost Layer Polish** | 100% | Done |
| **Display Settings Polish** | 100% | Done |

*Last Updated: 2026-05-10*
