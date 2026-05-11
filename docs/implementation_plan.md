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

## Phase 13: Procedural Builder Persistence (JSON Workflow) (Completed)

- [x] **Save/Load JSON Database Workflow**:
    - **Compartmentalization**: Created `src/data/ProcedureDB.js` — a standalone I/O layer exposing `exportToJSON(procedures)` and `importFromJSON()`. Deliberately avoids touching localStorage directly so the module can be swapped for an online DB (Firebase/Supabase) later without touching the builder UI logic.
    - **Export (Save)**: `exportToJSON` serializes the full procedure array in a versioned envelope (`{ version, exportedAt, procedures }`), creates a `Blob({ type: 'application/json' })`, and triggers the native browser download via `URL.createObjectURL` attached to an ephemeral invisible `<a download="aeroproc_procedures.json">` element. The object URL is revoked after a 1-second delay to release memory.
    - **Import (Load)**: `importFromJSON` creates a hidden `<input type="file" accept=".json">` element and returns a Promise. The file contents are read asynchronously using `File.text()`. A window-focus fallback handles browsers that don't fire `change` on picker dismissal (resolves with `null` instead of rejecting).
    - **Validation**: `JSON.parse` is wrapped in a dedicated `try/catch` with a plain-English error. Structural validation checks that `data.version` exists and `data.procedures` is an Array before resolving. Caller receives `null` for picker-dismiss, a resolved array for valid files, and a rejected Error for bad files.
    - **UI Integration**: Two new side-by-side buttons — **"↓ Save to JSON"** and **"↑ Load from JSON"** — added to the Builder main menu (below the "+ New Procedure" button). Callbacks wired via `setJSONCallbacks()` in `Sidebar.js`. `handleSaveJSON` in `main.js` exports `loadAll()`. `handleLoadJSON` confirms replacement with the user, clears all existing procedures from the map and localStorage, then re-saves each imported procedure via `saveProc()` (assigning fresh IDs). Both panels refresh after import.
    - Build verified clean (`vite build` → 264.50 kB JS, 78.94 kB CSS, 0 errors).

---

## Phase 14: Procedural Builder Workflow Streamlining ✅ COMPLETE

- [x] **Streamlined Keyboard-Driven Workflow**:
    - Metadata form uses Tab/Enter progression: Name → Type → Airport → Runway → Submit.
    - Removed the redundant "BUILDER" header from the sidebar main menu.
- [x] **Airport Options Update**:
    - Airport dropdown now lists VHHH / VMMC / ZGSZ / ZGGG / ZGHK.
- [x] **Hide Airspaces**:
    - Airspace type options removed from the metadata form type dropdown (moved to Phase X).
- [x] **Point Creation & Inline Restrictions**:
    - `showDrawingPanel()` auto-focuses the waypoint search field via `setTimeout`.
    - Fix selection now shows the inline `#inline-restriction-panel` (no modal pop-up for new points). The modal is kept only for editing existing points via the ✎ button.
    - Auto-commit: if a point is pending when a second fix is clicked, the first is committed with current form values before showing the new point's form.
- [x] **Restriction Fields UI**:
    - ALT row: req dropdown (`@` / `+` / `-`) + numeric value + unit (`ft` / `FL` / `m`).
    - SPD row: req dropdown (`@` / `<` / `<=` / `>` / `>=`) + numeric value + `KT`.
    - `collectInlineRestrictions()` maps UI symbols → DrawingState schema strings and formats value+unit (`FL100` / `5000ft`).
- [x] **Holding Point Toggle**:
    - Toggle switch reveals Bearing / Turn Direction / OBS fields.
    - `holdingOBS` added to DrawingState schema (`_serializePoint`, `updatePoint`).
    - Turn direction uses active-button toggle (L / R buttons).
- [x] **Workflow Action Buttons**:
    - **Add Point**: commits pending point, resets panel to idle, refocuses search.
    - **Erase / Reset**: re-opens blank form for same fix (requires confirmation).
    - **Create Procedure**: commits pending point then calls `handleSave()`.
- [x] **`_commitPendingPoint()` in main.js**: calls `DrawingState.addPoint`, `_afterPointAdded`, clears `_pendingPoint`, calls `clearPendingPointRestrictions`.
- [x] **`handleSave()` updated**: auto-commits any pending point before saving.
- [x] **`_cleanupDrawingMode()` updated**: clears `_pendingPoint` and resets panel.
- [x] **CSS added** to `main.css`: all inline restriction panel styles.

**Implementation notes:**
- `_drawingCallbacks` cached as module-level var in Sidebar.js so `clearPendingPointRestrictions` can re-wire idle buttons without a callback parameter.
- `clearPendingPointRestrictions(refocusSearch)` accepts optional bool; false skips the search field focus (used when save/cancel follows immediately).
- Speed conditions `'Less Than Or Equal'` and `'Greater Than'` added to `_formatSpeedHtml` in Sidebar.
---

## Phase 15: Builder UX Refinements & Highlight Parity ✅ COMPLETE

- [x] **Keyboard Selection in Builder Search**:
    - `getFilteredFixes(searchTerm)` exported from `MapLayers.js` — prefix-matches `_allFixData`.
    - `handleSearchEnter(term)` in `main.js`: if exactly one fix matches, calls `_triggerPointAdded` immediately.
    - `Sidebar.js` wires a `keydown` listener on `#waypoint-search`: Enter key (when term is non-empty) calls `callbacks.onSearchEnter(term)`.
    - Both `showDrawingPanel` callback objects include `onSearchEnter: handleSearchEnter`.
- [x] **Manual Point Data Entry (Pop-up)**:
    - Removed the inline `manual-point-section` (lat/lon inputs + add button) from the drawing panel HTML.
    - Added a "Manual Point" button (`#btn-manual-point`) inside the `drop-point-section` alongside "Drop Custom Point".
    - `_showManualPointModal(onConfirm)` creates a `.modal-overlay` element dynamically, with lat/lon inputs, an error div, Confirm/Cancel buttons, backdrop-click dismiss, Enter/Escape key support, and auto-focus on the Lat field.
    - CSS added: `.manual-pt-modal-box`, `.manual-pt-fields`, `.manual-pt-row`, `.manual-pt-label`, `.manual-pt-input`, `.manual-pt-error`, `.drop-point-dot.manual-dot`.
- [x] **Builder Highlight Parity with View Mode**:
    - `filterWaypoints` now accepts `suppressMatchLabel = false`. When true, search-matched markers get bright/clickable style but NO permanent label — the DivIcon overlay provides the label.
    - `_styleFixMarker` updated: when `suppressMatchLabel` is true and `isFiltering`, reverts to a delayed hover tooltip (via `_bindDelayedTooltip`) instead of the permanent prefix-highlighted label.
    - `_lastFilterArgs` and `_onViewportChange` both carry and use `suppressMatchLabel` so viewport-change re-renders are consistent.
    - `handleSearch` in `main.js` passes `suppressMatchLabel: true` to `filterWaypoints` when a term is active, then calls `renderGlobalSearchHighlights` with the matched fixes formatted as `{ ...fix, layer: 'fix' }` — producing identical DivIcon glow overlays to View Mode.
    - When the term is cleared, `clearGlobalSearchHighlights` is called to remove overlays.
    - `_cleanupDrawingMode` calls `clearGlobalSearchHighlights` so overlays don't persist after save/cancel.

**Implementation notes:**
- `getFilteredFixes` is shared between `handleSearch` (highlight rendering) and `handleSearchEnter` (single-match Enter key selection).
- The DivIcon glow markers use `pointer-events: none` so clicks pass through to the circleMarkers below for snap-to-fix selection.

---

## Phase 16: Builder UI Overhaul & Polish ✅ COMPLETE

- [x] **Redesign Locked State**:
    - `showMainMenu()` now renders a completely different DOM tree depending on `_builderLocked`.
    - Locked: a large `.builder-locked-screen` button fills the builder area — amber-tinted border, centered SVG padlock icon, "Builder Locked" title, "Click to unlock" subtitle. No procedures list or action buttons are rendered.
    - All amber styling (background, border-color, color) transitions on hover to emphasize interactivity.
- [x] **Redesign Unlocked State**:
    - Unlocked: a `.builder-unlock-icon` button (26×26px, subtle border) appears in the top-right corner via `.builder-section-topbar`. Contains a small open-padlock SVG.
    - All content (New Procedure, JSON IO, procedures list) rendered below without clutter.
    - No emojis anywhere in the lock/unlock system — pure SVG icons.
- [x] **Holding Info Styling Fix**:
    - Holding field HTML restructured: long labels ("Inbound Bearing", "Turn Direction", "OBS") replaced with compact uppercase abbreviations ("BRG", "TURN", "OBS") using the existing `.inline-restr-label` class (same style as ALT/SPD).
    - `.inline-hold-field-row` grid updated from `60px 1fr auto` → `28px 1fr auto` (matching ALT/SPD row geometry).
    - Turn buttons now use single letters ("R" / "L") to fit the narrower grid.
    - Turn div and OBS input use `style="grid-column: 2 / -1"` to span the remaining columns cleanly.
- [x] **Builder Fixes Layer Optimization** (complete):
    - **Ghost dots as snap targets**: Ghost circleMarkers set `interactive: true`; `ghostFixPane.style.pointerEvents` toggled between `'auto'` (builder snap active) and `'none'` (default). `enableGhostSnapMode(map, cb)` / `disableGhostSnapMode()` added to MapLayers.js, replacing `enableSnapMode` for route types in main.js.
    - **Hover glow**: `_showGhostHoverGlow(fix)` renders a violet DivIcon overlay (pointer-events:none) at the hovered ghost dot on `mouseover`; removed on `mouseout` or click.
    - **Remove 3rd layer**: `handleSearch` in builder mode no longer calls `filterWaypoints` with a search term. Ghost dots are the click targets; `renderGlobalSearchHighlights` provides visual-only glow for search matches.
    - **Auto-enable ghost layers on unlock**: `setBuilderUnlockCallback` added to Sidebar.js; main.js auto-checks `#chk-ghost-t1` through `#chk-ghost-t4` on each lock→unlock transition.
    - **Context menu preserved**: guard updated to check `_ghostSnapCallback` so right-click on in-sequence markers works in ghost snap mode.

**Implementation notes:**
- Old CSS classes `.builder-lock-btn`, `.lock-label`, `.lock-hint`, `.new-procedure-btn.disabled` removed (no longer rendered).
- `refreshBuilderSavedList()` handles the missing `#builder-saved-list` element (early return) so it is safe to call regardless of lock state.

---

## Phase 17: Builder & Ghost Layer Polish (Complete)

- [x] **Procedure Name Auto-Caps**: `input` listener on `#proc-name` in `showMetadataForm` forces `value.toUpperCase()` on every keystroke, preserving cursor position via `setSelectionRange`.
- [x] **Remove Runway Threshold Yellow Dots**: `addThresholdsToLayer` call removed from main.js; `loadRunwayThresholds()` retained for aerodrome popup runway info. Threshold fixes appear via ghost layer instead.
- [x] **Ghost Fix Label De-Cluttering — Cross-Layer Awareness**: Module-level `_crossLayerOccupiedCells` Set added to MapLayers.js. `renderAerodromes` and `renderNavaids` populate it with each marker's `_crossLabelCellKey(lat, lon)`. `renderGhostFixes` initializes `_seenLabelCells` from this set (pre-seeded) instead of empty, suppressing ghost labels at aerodrome/navaid positions. Render order in main.js changed: aerodromes → navaids → ghost fixes (was: ghost → thresholds → aerodromes → navaids).
- [x] **"Add at least 2 points" Notice Styling**: Replaced `class="lock-hint"` with `class="transition-prereq-hint"` and added CSS: 11px muted text, amber left border (`rgba(249,115,22,0.3)`), subtle amber tint background.

---

## Phase 18: Ghost Fix Label Quantum Fix (Complete)

- [x] **Ghost Fix Labels Missing Near Dense Airports**:
    - **Root cause (confirmed via code review)**: The cross-layer awareness from Phase 17 is already working. The actual problem is that the `_CROSS_LABEL_QUANT = 667` constant produces ~165m grid cells. At VHHH's zoom level, threshold fixes like `VHHH07L`, `VHHH25R`, `VHHH07R`, `VHHH25L` are only 200–400m apart — multiple legitimate, distinct fixes collapse into the same cell and only the first one gets a label.
    - **Fix — zoom-dependent quantum**: Zoom-aware `_applyGhostLabels(quantum)` function replaces inline label-binding. `zoomend` calls it with quantum `667` (zoom ≤9) or `3333` (zoom ≥10). Cross-layer dedup uses raw `[lat, lon]` pairs (`_crossLayerOccupiedCoords`) re-quantized per call. `_currentLabelQuantum` guard makes same-tier zooms a no-op.

---

## Phase 19: Builder Bug Fixes & Label Cleanup (Complete)

- [x] **Pencil/Edit Button Non-Functional for Procedure Points**:
    - Root cause: `{ once: true }` on `refreshSequenceList`'s click listener was consumed by ANY click on the wrapper (even on empty space), silently breaking all subsequent button clicks until the next DOM re-render.
    - Fix: Added `_sequenceListWrapperEl` / `_sequenceListHandler` module-level tracking vars. `refreshSequenceList` now removes the old listener at the top of every call (before any early returns), then attaches a persistent handler — matching the `_builderSavedListHandler` pattern already used by `refreshBuilderSavedList`.
- [x] **"Holding Point" Toggle Label Styling**:
    - Added `.inline-hold-label-text { font-size: 11px; color: var(--text-muted); }` to `main.css`. The `<span class="inline-hold-label-text">` in `showDrawingPanel`'s restriction modal was inheriting the sidebar's default font size; it now matches the compact ALT/SPD label style.
- [x] **Duplicate Fix Labels (Active Layer Leaking into Builder Mode)**:
    - Root cause: `_styleFixMarker`'s `else` branch (viewport-visible, zoom ≥10, no search term) bound a faded permanent label, duplicating the ghost layer's own permanent label at the same position.
    - Fix: `_styleFixMarker` extended — when `suppressMatchLabel` is true, the `else` branch uses `_bindDelayedTooltip` instead of a permanent label. All 5 builder-mode `filterWaypoints` calls in `main.js` now pass `true` as the 5th argument. Ghost layer remains the sole permanent label source in builder mode.

---

## Phase 20: Builder Workflow & Interaction Fixes (Complete)

- [x] **Navaids as Valid Procedure Points**:
    - Root cause: `renderNavaids` click handler only checked `_snapCallback`, not `_ghostSnapCallback`. In ghost snap mode (route-type builder), clicking a VOR/NDB did nothing.
    - Fix: both `_snapCallback` and `_ghostSnapCallback` are now called with the same `{ ident, lat, lon, tipo: 'NAVAID', isFix: false }` ad-hoc data object in the navaid marker's click handler in `MapLayers.js`.
- [x] **"Create Procedure" vs "Save Procedure" Button Text**:
    - Added `_isEditSession` module-level flag in `Sidebar.js`. `showDrawingPanel` accepts a third `options = {}` argument; `options.isEdit` sets the flag. `clearPendingPointRestrictions` derives button text from the same flag. `handleEditProcedure` in `main.js` passes `{ isEdit: true }` as the third argument; `handleStartDrawing` uses the default `{}`.
- [x] **Remove "Save" Button from Point Creation Panel**:
    - Removed the `btn-create-proc-pending` button and its click handler from `showPendingPointRestrictions` in `Sidebar.js`. The pending-point panel now shows only "✓ Add Point" and "✕ Erase". The finalize action remains in the idle-state "Create / Save Procedure" button visible above the sequence list.
- [x] **Lock/Unlock Cycle Empties Procedures List**:
    - Root cause: `showMainMenu()` re-renders the builder DOM on every lock toggle, but `_refreshBuilderSavedList()` was only called by the tab-change handler (not by the unlock callback). After toggling, `#builder-saved-list` existed in the new DOM but was empty.
    - Fix: added `_refreshBuilderSavedList()` to the `setBuilderUnlockCallback` handler in `main.js`, so the list is repopulated immediately after each locked→unlocked transition.
- [x] **Eye Symbol Not Hiding Procedure in Builder Mode**:
    - Root cause: same as the lock/unlock issue above. After a lock→unlock toggle the list rendered empty, so there was no eye button to click. With `_refreshBuilderSavedList()` now called on unlock, the list is always populated and `handleToggleProcedure` fires correctly.
- [x] **Delete Procedure Confirmation Prompt**:
    - `handleDeleteProcedure` in `main.js` now calls `window.confirm('Delete procedure "NAME"?\n\nThis cannot be undone.')` before any destructive action. If the user cancels the prompt, the function returns immediately with no side effects.

---

## Phase 21: Builder Interaction Polish & Tool Integration ✅ COMPLETE

This phase consolidated the point creation tools, refined keyboard ergonomics, and successfully migrated restriction editing into a sidebar-integrated workflow.

- [x] **Unified Side Menu Editing**:
    - Migrated `handlePointEdit` in `main.js` to use `showPendingPointRestrictions` in the sidebar.
    - Implemented `initialValues` support in `Sidebar.js:showPendingPointRestrictions`.
- [x] **Keyboard Workflow Enhancements**:
    - **Tab Sequence**: Intercepted `Tab` on speed unit to focus holding toggle.
    - **Global Hotkeys**: Added `keydown` listener for `Enter` (commit) and `Escape` (cancel).
- [x] **Enhanced Custom Drop Tool**:
    - **Crosshair & Live Tracking**: Updated `MapLayers.js:enableCustomDropOverlay` for crosshair cursor and `mousemove` tracking.
    - **Sidebar Integration**: Added live Lat/Lon fields in `Sidebar.js`.
- [x] **Integrated Manual Input & Auto-Naming**:
    - **Auto-naming**: `_nextCustomPointName()` in `main.js` generates suffixes (a, b, aa...).
    - **Manual Entry**: Integrated inline Lat/Lon inputs for direct coordinate entry.
- [x] **Action Button Refinement**:
    - Renamed "Erase" to "Cancel Point/Edit".
    - Added "↺ Clear restrictions" link to reset fields without dismissing the fix.
- [x] **Holding Point Visual Fixes**:
    - Dedicated `holdingPane` (z-index: 700) and ghost label suppression for holding points.

## Phase 22: Precision Refinements & Safety Guards ✅ COMPLETE

Final polish to resolve custom point anchor offsets and add a safety check for the cancellation workflow.

- [x] **Precision "Math" Fix (Custom Point Anchor)**:
    - Updated `MapLayers.js:createDraggableCustomMarker` to use `iconSize: [24, 24]` and `iconAnchor: [12, 12]`.
    - Removed `transform: translate(-50%, -50%)` from `.draggable-custom-marker-inner` in `main.css`.
- [x] **Safety Guard: Cancel Confirmation**:
    - Added `window.confirm` check in `main.js:handleCancel` to prevent accidental data loss.
- [x] **Permanent Labels for Custom Points**:
    - Added `ident` support to `createDraggableCustomMarker` and bound permanent tooltips.

## Phase 23: Final Interaction Polish & UI Refinements ✅ COMPLETE

Addressing user feedback on holding point aesthetics, custom point rendering timing, and keyboard accessibility.

- [x] **Holding Point Aesthetic De-cluttering**:
    - Removed `<span class="holding-badge-info">` (bearing/side white text) from both `updateHoldingMarkers` and the saved-procedure badge in `renderSavedProcedure` (`MapLayers.js`). The "H" glyph alone is sufficient; the amber `fix-label-holding` line in the sequence fix tooltip is the sole restriction display.
    - Removed dead `.holding-badge-info` CSS rule from `main.css`. Updated `.holding-badge-inner` to `flex` (no column direction) with revised vertical offset `translate(8px, -28px)`.
- [x] **Custom Point "One Click Lag" Fix**:
    - Added optional `pendingPreview = null` parameter to `updateActiveShape` (`MapLayers.js`). When provided, the coordinate is appended to `latLngs` before the polyline is drawn, extending the visible path to the unconfirmed position.
    - In `main.js:_triggerPointAdded`, after `showPendingPointRestrictions`, non-fix (custom drop) points immediately call `updateActiveShape(_map, DrawingState, rawData)` so the preview segment appears without waiting for "Add Point".
- [x] **Keyboard Focus Visuals**:
    - Added `.toggle-switch:focus-within .toggle-slider { outline: 2px solid var(--accent-primary); outline-offset: 2px; }` to `main.css`, making the holding-point toggle clearly focused when navigated via Tab.

---
    - Build verified clean (`vite build` → 269.67 kB JS, 85.84 kB CSS, 0 errors).

---

## Phase 24: Holding Pattern Fixes & Aeronautical Drawing ✅ COMPLETE

Addresses a Phase 23 regression (no visual selection cue on holding points), two rendering artefacts (stale blue H and spurious fix label in saved procedures), a custom-point symbol timing gap, and adds a proper aeronautical holding pattern depiction layer.

### Task 24-A — Holding Point Selected-State Visual Cue (Phase 23 Regression Fix) [x]

**Problem**: Phase 23 removed the "H" bearing/side text from the builder's live `updateHoldingMarkers` call. The H badge still appears once the point is committed, but while the restriction panel is open (pending state) and the user ticks the *Holding Point* toggle, there is now no map feedback that holding is active.

**Fix — `Sidebar.js : showPendingPointRestrictions`**:
- When the `#inline-hold-chk` `change` event fires and `holdChk.checked === true`, add the CSS class `inline-hold-toggle-active` to the `#inline-hold-toggle-row` wrapper element (remove it when unchecked).
- Add a new CSS rule in `main.css` for `.inline-hold-toggle-row.inline-hold-toggle-active`: apply a left amber border (`border-left: 2px solid #ffb547`) and a subtle amber background tint (`background: rgba(255,181,71,0.06)`) — same visual language as `.fix-label-holding`. This gives the user a clear in-panel signal that holding is armed before the point is committed.
- No map-side change required: `updateHoldingMarkers` already fires when the point is committed by `_commitPendingPoint → _afterPointAdded`.

### Task 24-B — Remove Stale Blue "H" and Spurious Fix Label in Saved Procedures [x]

**Root cause A — Blue "H" badge in `renderSavedProcedure`**: The `_renderPointLabels` helper in `MapLayers.js` (~line 1201) renders the holding badge with:
```html
<span class="holding-badge-h">H</span>
```
Unlike `updateHoldingMarkers` (which injects `style="color:${sequenceColor};"` inline), the saved-procedure path passes no color. The `.holding-badge-h` CSS has no `color` declaration; the browser falls back to the system default — which renders as a dim blue on most platforms. The fix is to add `style="color:${_safeEscape(procedure.color)};"` to the `holding-badge-h` span in `_renderPointLabels`.

**Root cause B — Spurious label text (e.g. "ABBEY")**: The `proc-fix-label` DivIcon is rendered for *every* point including holding fixes. Since Phase 23 removed the "H bearing/side" text from the badge, the bare ident label (e.g. "ABBEY") now appears on the map without any visual distinction. This ident label is correct by design — but the image shows it appearing doubled (once from the ghost layer and once from the saved-procedure label). The saved-procedure label must stay because it shows restrictions. The actual artefact is the **holding badge "H" being offset wrong** after Phase 23's `translate(8px, -28px)` — it overlaps the existing `proc-fix-label` ident text making it look like a doubled label. No label removal is needed; the badge CSS offset should be verified so the "H" sits cleanly above/beside the ident without collision.

**Fix — `MapLayers.js : _renderPointLabels` (~line 1201)**:
```javascript
html: `<div class="holding-badge-inner"><span class="holding-badge-h" style="color:${_safeEscape(procedure.color)};">H</span></div>`,
```

**Verify — `.holding-badge-inner` transform**: The `translate(8px, -28px)` places the badge 8px right and 28px above the anchor. The `proc-fix-label` text also starts at the same anchor, so the badge clears the label text comfortably. If visual testing shows collision, adjust the Y offset to `-34px` to clear the ident line.

### Task 24-C — Custom Point Symbol/Label Timing Fix [x]

**Problem**: When a custom drop or manual-coordinate point is created, the sequence is:
1. `_triggerPointAdded` stores `_pendingPoint` and calls `showPendingPointRestrictions` → sidebar panel appears.
2. Phase 23 added `updateActiveShape(_map, DrawingState, rawData)` → the preview polyline extends to the pending coordinate. ✓
3. **But**: `createDraggableCustomMarker` (which renders the diamond `◇` symbol and the permanent label) is only called inside `_afterPointAdded`, which is called from `_commitPendingPoint` → triggered only when the user clicks "Add Point".

Result: the map shows the polyline extension but no diamond symbol or label for the pending point. This is the "symbol not showing" issue in the screenshot.

**Fix — `MapLayers.js` + `main.js`**:

1. **New function `showPendingCustomMarker(mapInstance, lat, lon, color, ident)`** in `MapLayers.js`:
   - Creates a non-draggable `L.marker` using a modified `draggable-custom-marker` DivIcon (same diamond HTML as `createDraggableCustomMarker`, but with `opacity: 0.55` and a dashed border via inline style to signal "pending/unconfirmed" status).
   - Binds a permanent tooltip with `ident` (same as `createDraggableCustomMarker`).
   - Uses `pane: 'markerPane'` for correct z-ordering.
   - Stores the marker reference in a module-level `_pendingCustomMarker` variable (only one can exist at a time).
   - Returns nothing (caller does not need the reference; `clearPendingCustomMarker` removes it).

2. **New function `clearPendingCustomMarker(mapInstance)`** in `MapLayers.js`:
   - If `_pendingCustomMarker` exists and is on the map, removes it and nulls the reference.

3. **Export both functions** from `MapLayers.js`.

4. **`main.js : _triggerPointAdded`** — after the existing `if (!rawData.isFix) { updateActiveShape(...) }` block, add:
   ```javascript
   if (!rawData.isFix) {
     clearPendingCustomMarker(_map);
     showPendingCustomMarker(_map, rawData.lat, rawData.lon, DrawingState.metadata.color, rawData.ident);
   }
   ```

5. **`main.js : _commitPendingPoint`** — at the top (before `DrawingState.addPoint`), add:
   ```javascript
   clearPendingCustomMarker(_map);  // remove temp marker; the real draggable one is created in _afterPointAdded
   ```

6. **`main.js : _cleanupDrawingMode`** — add `clearPendingCustomMarker(_map)` alongside the existing cleanup calls.

7. **Import `showPendingCustomMarker` and `clearPendingCustomMarker`** in `main.js`.

8. **CSS** — `.draggable-custom-marker-inner.pending` modifier class in `main.css`:
   - `opacity: 0.6`
   - `border-style: dashed`
   - `animation: pending-pulse 1.2s ease-in-out infinite` → `@keyframes pending-pulse { 0%,100% { opacity:0.5 } 50% { opacity:0.85 } }` — a gentle pulse to signal the point is awaiting confirmation.

### Task 24-D — Aeronautical Holding Pattern Drawing Layer [x]

Add a map-rendered holding pattern diagram styled after aeronautical instrument chart conventions: indicative (not to scale), showing the inbound track, outbound leg, and two 180° turns with small directional arrows. The shape is drawn using pure SVG inside a Leaflet `DivIcon`, oriented to the stored `holdingBearing` and `holdingSide`.

**Scope**: Both the live builder session (`updateHoldingMarkers`) and the saved-procedure render (`_renderPointLabels` in `renderSavedProcedure`).

#### Holding Pattern SVG Geometry

The aeronautical holding pattern is an oval ("racetrack") with:
- **Inbound leg**: a straight line from the holding fix toward `holdingBearing + 180°` (the outbound direction), length ≈ 40 SVG units.
- **Two semicircles**: radius ≈ 14 SVG units, turning in the `holdingSide` direction.
- **Outbound leg**: parallel to the inbound leg, returning to the fix end via the second semicircle.
- **Four directional arrow chevrons**: one on each leg at midpoint (facing direction of travel), and one at the exit of each turn.
- **Fix dot**: a small filled circle at the holding fix (origin of the inbound track).

SVG viewBox: `"-20 -20 100 60"` (landscape orientation before rotation). The SVG is rotated via `transform: rotate(${bearingDeg}deg)` around its center to align with the actual inbound track. The `holdingSide` flips the semicircle arcs: RIGHT turns use positive arc sweep; LEFT turns use negative.

#### Implementation — `MapLayers.js : _buildHoldingPatternSvg(bearingMag, side, color)`

New private helper function:

```javascript
// bearingMag: magnetic inbound bearing (number, degrees), e.g. 090
// side: 'RIGHT' or 'LEFT'
// color: hex string matching the procedure color
// Returns: an HTML string containing one self-contained <svg> element.
const _buildHoldingPatternSvg = (bearingMag, side, color) => {
  // Geometry constants (SVG units, not NM — the diagram is indicative only)
  const LEG = 44;          // length of each straight leg
  const R   = 14;          // radius of the semicircular turns
  const W   = 1.6;         // stroke width
  const isRight = (side || 'RIGHT').toUpperCase() !== 'LEFT';

  // Inbound track arrives at origin (0, 0) from the direction of bearingMag.
  // Pattern is drawn in "standard upward" space then rotated.
  // Y-axis: inbound track goes UP (−Y). Outbound goes DOWN (+Y).
  // Offset X: +R for RIGHT-hand pattern; −R for LEFT.
  const sx = isRight ? R : -R;  // x-offset for the outbound track

  // The four path segments (clockwise for RIGHT, CCW for LEFT):
  //  1. Inbound leg: from outbound-turn-exit (0, -LEG) → fix (0, 0)
  //  2. First turn at the fix end: from (0, 0) → (sx, 0), center (sx/2, 0)
  //     ... actually a 180° arc around (sx, 0) with radius R
  //  3. Outbound leg: from (sx, 0) → (sx, -LEG)     [going up]
  //  4. Second turn at outbound end: 180° arc → (0, -LEG)

  // Arc sweep flags: 1 = clockwise, 0 = anticlockwise
  const sw1 = isRight ? 1 : 0;   // first turn (at fix end)
  const sw2 = isRight ? 1 : 0;   // second turn (at outbound end)

  // Path for the racetrack outline (full loop)
  const path =
    `M 0 0` +
    ` A ${R} ${R} 0 0 ${sw1} ${sx*2} 0` +   // turn 1: fix-end 180°
    ` L ${sx*2} ${-LEG}` +                    // outbound leg
    ` A ${R} ${R} 0 0 ${sw2} 0 ${-LEG}` +    // turn 2: outbound-end 180°
    ` L 0 0`;                                 // inbound leg (close)

  // Arrow chevron helper: small V-shape at position (cx, cy) pointing in direction `angleDeg`
  const arrow = (cx, cy, angleDeg) => {
    const a = angleDeg * Math.PI / 180;
    const f = 6;  // half-width
    const tip_x = cx + Math.sin(a) * f;
    const tip_y = cy - Math.cos(a) * f;
    const l_x   = cx - Math.cos(a) * f + Math.sin(a) * -f;
    const l_y   = cy - Math.sin(a) * f - Math.cos(a) * -f;
    const r_x   = cx + Math.cos(a) * f + Math.sin(a) * -f;
    const r_y   = cy + Math.sin(a) * f - Math.cos(a) * -f;
    return `<polyline points="${l_x.toFixed(1)},${l_y.toFixed(1)} ${tip_x.toFixed(1)},${tip_y.toFixed(1)} ${r_x.toFixed(1)},${r_y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"/>`;
  };

  // Four arrows: mid-inbound (pointing toward fix), mid-outbound (pointing away),
  // mid-turn-1 (tangent), mid-turn-2 (tangent).
  const arrowInbound  = arrow(0, -LEG/2, 0);      // pointing up = toward fix
  const arrowOutbound = arrow(sx*2, -LEG/2, 180); // pointing down = away from fix
  // Turn arrows at 90° tangent points:
  const ta1 = isRight ?  90 : -90;
  const ta2 = isRight ? -90 :  90;
  const arrowTurn1    = arrow(sx, R,    ta1);
  const arrowTurn2    = arrow(sx, -LEG + (-R), ta2);

  // Rotation: the pattern is drawn with inbound track pointing UP (north).
  // We rotate by bearingMag so the inbound track aligns with the real bearing.
  // SVG rotation is clockwise, which matches compass bearing convention.
  const rot = typeof bearingMag === 'number' ? bearingMag : 0;

  // ViewBox is generous so the rotated shape never clips.
  const vbSize = LEG + R * 2 + 10;
  const cx = sx;  // approx center-x of pattern
  const cy = -LEG / 2;  // center-y

  return (
    `<svg viewBox="${-vbSize/2} ${-vbSize} ${vbSize*1.5} ${vbSize*1.5}"` +
    ` width="80" height="80" xmlns="http://www.w3.org/2000/svg"` +
    ` style="transform:translate(-50%,-50%) rotate(${rot}deg);display:block;overflow:visible;pointer-events:none;opacity:0.85;"` +
    `>` +
    // Pattern outline
    `<path d="${path}" fill="${color}1a" stroke="${color}" stroke-width="${W}" stroke-linejoin="round" fill-rule="evenodd"/>` +
    // Fix dot
    `<circle cx="0" cy="0" r="3" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>` +
    // Direction arrows
    arrowInbound + arrowOutbound + arrowTurn1 + arrowTurn2 +
    `</svg>`
  );
};
```

#### Integration into `updateHoldingMarkers`

In `updateHoldingMarkers`, replace the current `L.divIcon` for each holding point with an enhanced version that includes the SVG pattern:

```javascript
const patternSvg = _buildHoldingPatternSvg(
  pt.holdingBearing ? parseFloat(pt.holdingBearing) : null,
  pt.holdingSide,
  sequenceColor
);

const icon = L.divIcon({
  className: 'holding-badge-marker',
  html: `<div class="holding-badge-inner">`
    + patternSvg
    + `<span class="holding-badge-h" style="color:${_safeEscape(sequenceColor)};">H</span>`
    + `</div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0]
});
```

Update `.holding-badge-inner` CSS so the SVG and the "H" badge are layered:
- `.holding-badge-inner` becomes `position: relative` with the SVG as an absolutely positioned background centered on the fix, and the "H" badge as a foreground element offset to `translate(8px, -28px)` as before.

**Alternatively (simpler)**: render the holding pattern SVG as a separate `L.marker` in the `holdingPane` (same layer), placed at the fix coordinates with its own `DivIcon`. This avoids restructuring `.holding-badge-inner`. The "H" badge marker remains as-is; the new pattern marker is a sibling in `_holdingMarkersLayer`.

**Recommended**: use the separate-marker approach for minimum DOM risk:

```javascript
// Existing H badge marker (unchanged)
L.marker([pt.lat, pt.lon], { icon: hBadgeIcon, interactive: false, pane: 'holdingPane' })
  .addTo(_holdingMarkersLayer);

// NEW: holding pattern SVG marker
if (pt.holdingBearing != null || true) {  // always render, even without bearing data (defaults to 0°)
  const svgIcon = L.divIcon({
    className: 'holding-pattern-marker',
    html: _buildHoldingPatternSvg(pt.holdingBearing, pt.holdingSide, sequenceColor),
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
  L.marker([pt.lat, pt.lon], { icon: svgIcon, interactive: false, pane: 'holdingPane' })
    .addTo(_holdingMarkersLayer);
}
```

#### Integration into `_renderPointLabels` (saved procedures)

Same approach — add the pattern SVG as an additional `L.marker` in the procedure's `group` for each holding point:

```javascript
if (pt.isHolding) {
  // Existing H badge (color fix applied in Task 24-B)
  ...
  // NEW: pattern diagram
  const patternIcon = L.divIcon({
    className: 'holding-pattern-marker',
    html: _buildHoldingPatternSvg(pt.holdingBearing, pt.holdingSide, procedure.color),
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
  L.marker([pt.lat, pt.lon], { icon: patternIcon, interactive: false }).addTo(group);
}
```

#### CSS — `.holding-pattern-marker`

```css
.holding-pattern-marker {
  background: transparent !important;
  border:     none        !important;
  overflow:   visible     !important;
  pointer-events: none    !important;
}
```

#### Build verification
- Run `vite build` and confirm 0 errors.
- Visual test: create a SID/STAR procedure, mark a fix as holding (bearing + RIGHT/LEFT), confirm the pattern SVG appears on the map correctly oriented.
- Test with no bearing value → pattern defaults to 0° (pointing north) and still renders cleanly.

---

---

## Phase 25: Builder Reliability & Point Addition Fix (Completed)

Addressing the regression where clicking "Add Point" fails to commit the waypoint to the procedure sequence.

- [x] **Hoisting & Scope Verification**: Resolved `ReferenceError` by properly declaring `_procMarkersLayer` at the module level in `MapLayers.js`.
- [x] **Point Addition Flow Audit**: Fixed field name mismatch in `main.js:_commitPendingPoint` (mapping `altReq/spdReq` → `levelCondition/speedCondition`).
- [x] **Marker Layer Orchestration**: Restored `clearProcedureMarkers` during session cleanup and synchronized imports between modules.
- [x] **Defensive Rendering**: Verified that `updateProcedureMarkers` handles all sequence points without blocking UI execution.

## Phase 26: Premium Holding UX & Custom Point Cleanup ✅ COMPLETE

Restoring missing holding parameters and resolving label duplication for custom waypoints.

- [x] **Restore Holding Info**: Extended `_buildProcMarkerHtml` to accept `holdingBearing` and `holdingSide`. The "H" badge now renders the bearing/side in amber (`#ffb547`) beneath the colored "H" glyph — matching the legacy visual. Both call sites (`updateProcedureMarkers` and `_renderPointLabels` in `renderSavedProcedure`) updated to pass `pt.holdingBearing` and `pt.holdingSide`.
- [x] **Integrated Holding "H" Badge**: `_buildProcMarkerHtml` now embeds the "H" letter directly inside the glowing dot for holding waypoints (flex-centered 9px black text over the colored circle) instead of rendering a separate floating badge above the dot. The `holdingBearing`/`holdingSide` parameters were removed from the function signature; bearing/side detail moved exclusively to the hover tooltip.
- [x] **Slick Hover Tooltip (Glassmorphism)**: New `_ensureProcHoverPane(mapInstance)` creates a `procHoverPane` (z-index 701, `pointer-events: auto`) alongside the non-interactive `procMarkersPane`. New `_createHoldingHoverMarker(mapInstance, lat, lon, holdingBearing, holdingSide, addToTarget)` creates an invisible `L.circleMarker` (radius 10, zero fill/stroke) in `procHoverPane` with a Leaflet tooltip styled via new `.holding-hover-tip`, `.hht-bearing`, `.hht-side` CSS classes — dark glassmorphism panel with amber bearing and muted amber turn direction, no arrow tip. Both `updateProcedureMarkers` (active session) and `_renderPointLabels` inside `renderSavedProcedure` (saved procedures) now call this helper for every holding fix.
- [x] **Resolve Custom Label Doubling**: Handled by `_pendingCustomMarker.unbindTooltip()` call in `clearPendingCustomMarker` before `removeLayer`, ensuring the permanent label DOM node is destroyed immediately rather than lingering when the real draggable marker's identical tooltip is created a frame later.
- [x] **Refine Interaction Handshake**: The holding hover hit-area marker lives in `procHoverPane` (separate from `procMarkersPane`) and adds an `on('click')` handler that calls `L.DomEvent.stopPropagation(e)` then `mapInstance.fire('click', { latlng, originalEvent })`, re-dispatching every click to the Leaflet map. Measuring Vector's `handleMVClick` is bound on `map.on('click')` and therefore still receives the event correctly when the user clicks on a holding fix position.
- [x] **Resolve Custom Label Duplication**: Added `_pendingCustomMarker.unbindTooltip()` call in `clearPendingCustomMarker` before `removeLayer`, ensuring the permanent label DOM node is destroyed immediately rather than lingering when the real draggable marker's identical tooltip is created a frame later.
- [x] **Layer Visibility Sync**: Confirmed the pending → committed handshake is correct: `_commitPendingPoint` clears the pending marker and preview (`_pendingPoint = null`, `clearPendingCustomMarker`) before `_afterPointAdded` calls `updateActiveShape` (no preview) and `createDraggableCustomMarker` (real marker). No race condition possible because the preview call is gated on `!rawData.isFix` inside `_triggerPointAdded` — by the time `_pendingPoint` is null, no further preview can fire for that point.

## Phase 27: Hover Interaction Exclusivity ✅ COMPLETE

Resolving the visual "flicker" caused by competing hover effects between the background ghost layer and the active procedure overlay.

- [x] **Ghost Hover Suppression**: Added `_suppressedGhostIdents.has(fix.ident?.toUpperCase())` guard to the ghost marker `mouseover` handler. When a fix is already in the active procedure sequence its ident is in `_suppressedGhostIdents`, so the violet ghost glow is skipped entirely — the `procHoverPane` hit-area handles the hover in the procedure color instead.
- [x] **Global Search Style Parity**: New `_showProcPointHoverGlow(mapInstance, lat, lon, color)` and `_removeProcHoverGlow(mapInstance)` helpers mirror `_showGhostHoverGlow` but accept an explicit procedure color, producing the same 17px dot + glow geometry used by the search highlight system. `_createHoldingHoverMarker` was renamed to `_createProcPointHitArea(mapInstance, lat, lon, holdingBearing, holdingSide, procColor, addToTarget)` and now creates hit-area circles for **ALL** procedure points (not just holding ones), wiring `mouseover`/`mouseout` to show/remove the procedure-color glow. Holding points additionally receive the glassmorphism bearing/direction Leaflet tooltip (from Phase 26).
- [x] **Interaction Priority**: Architectural guarantee confirmed — `procHoverPane` (z=701) sits above `ghostFixPane` in the Leaflet pane stack. In SVG hit-testing, only the topmost interactive element at each pixel fires; the ghost circle below is therefore shadowed by the `procHoverPane` hit-area for all procedure fix positions. The Task 1 `_suppressedGhostIdents` guard provides full suppression even for edge pixels of the ghost circle that extend beyond the hit-area.
- [x] **Performance Audit**: No new render loops introduced. `_showProcPointHoverGlow` is O(1) — creates a single marker and stores it in `_procHoverGlowMarker`; `_removeProcHoverGlow` removes it in O(1). The additional hit-area circles (`_createProcPointHitArea` per sequence point) are O(n) in procedure length, identical to the existing holding-marker pattern. No measurable throughput impact during rapid map interactions.
- [x] **Performance Audit**: No new render loops introduced. `_showProcPointHoverGlow` is O(1) — creates a single marker and stores it in `_procHoverGlowMarker`; `_removeProcHoverGlow` removes it in O(1). The additional hit-area circles (`_createProcPointHitArea` per sequence point) are O(n) in procedure length, identical to the existing holding-marker pattern. No measurable throughput impact during rapid map interactions.

## Phase 28: Ghost Highlight Decommissioning & Unified Hover Overlay (Completed)

Completely eliminating the redundant ghost-fix selection effects to ensure a single, consistent "lighted" visual for all map interactions.

- [x] **Remove Legacy Ghost Glow**: Deleted `_showGhostHoverGlow`, `_removeGhostHoverGlow`, `_ghostHoverMarker`, `_showProcPointHoverGlow`, `_removeProcHoverGlow`, and `_procHoverGlowMarker`. Replaced with unified `_showFixHoverGlow` / `_removeFixHoverGlow` backed by `_fixHoverMarker`.
- [x] **Unified Selection Aesthetic**: All waypoint hovers (Ghost, Procedure hit-areas) now render through `_showFixHoverGlow` — a single dot+label DivIcon with consistent glow geometry `0 0 6px color, 0 0 14px color88, 0 0 22px color44`.
- [x] **Context-Aware Hover Colors**: `enableGhostSnapMode(mapInstance, callback, color)` accepts a `color` param stored in `_ghostSnapColor`. Ghost hover uses `_ghostSnapColor` (defaults to `'#b06bff'`). Both call sites in `main.js` now pass `DrawingState.metadata.color`. Procedure hit-areas pass `procColor` directly.
- [x] **Label Collision Guard**: Ghost `mouseover` calls `marker.closeTooltip()` before showing the unified glow; `mouseout` calls `marker.openTooltip()` to restore. `disableGhostSnapMode` calls `_refreshGhostLabels()` to restore any labels closed during active snap mode.

## 🕵️ Investigation Report: Waypoint Hover Conflict

- **Issue**: Hovering over a procedure waypoint exhibits a "donut" effect where the intended highlight (purple) only triggers on the outer rim, while the center triggers a legacy white ghost highlight and a "pointing finger" cursor.
- **Root Cause**: The underlying ghost marker (`radius: 3.6`) is remaining `interactive: true` at the same coordinate as the procedure hit-area (`radius: 10`). In some browser/Leaflet configurations, the physically smaller marker can "punch through" or capture the event before the larger overlay if the overlay is rendered as "hollow" (zero fill) or if the z-index stacking is compromised by late-added elements.
- **Solution**: We must implement **Interactivity Masking**. Ghost markers at procedure coordinates must have `interactive: false` explicitly set. Additionally, the procedure hit-areas must use a "solid" (but invisible) fill to guarantee center-point capture.

## Phase 29: Final Interaction Handshake & Hitbox Unification (Completed)

Ensuring absolute interaction priority for the procedure layer and eliminating the "donut" hover artifact.

- [x] **Ghost Interactivity Masking**: Extended `_applyGhostLabels` (already called by `_refreshGhostLabels` on every `_suppressedGhostIdents` mutation) to also set `pointer-events: none` inline on suppressed markers' SVG elements. Non-suppressed markers have the style cleared so they inherit the pane's value (`auto` in snap mode, `none` otherwise). This gives `procHoverPane` hit-areas exclusive event capture at procedure-fix coordinates.
- [x] **Solid Capture Geometry**: Changed `_createProcPointHitArea` `fillOpacity: 0` → `0.001`. SVG hit-testing under `pointer-events: auto` only counts painted geometry; a zero-opacity fill is "hollow" and the center pixel fired no events. The near-invisible `0.001` fill makes the entire disc interior hot without being visible.
- [x] **Cursor Logic Normalization**: Handled implicitly by Task 1 — suppressed markers have `pointer-events: none` on their SVG element so the browser never enters hit-test for them; the pointer cursor cannot appear. Non-suppressed markers only become interactive when `enableGhostSnapMode` turns the pane on.
- [x] **Legacy Cleanup**: Audited all `mouseover`/`mouseout`/`click` bindings in `MapLayers.js` — event handlers exist only inside `renderGhostFixes` loop, guarded by `_ghostSnapCallback` checks. No orphaned handlers found.

## Phase 30: Absolute Hitbox Decoupling & Unified Snap Engine (Completed)

Solving the hover-fighting once and for all by completely removing interactivity from the ghost layer and implementing a standalone, dedicated "Snap & Highlight" engine.

- [x] **Ghost Layer Pacification**: Changed all ghost markers in `renderGhostFixes` to `interactive: false`. `ghostFixPane` remains `pointer-events: none` permanently — it can never receive mouse events under any circumstances. Removed all `mouseover`/`mouseout`/`click` bindings from the ghost marker loop.
- [x] **Dedicated Snap Interaction Layer**: Added `_ensureSnapInteractionPane` (z=705, above `procHoverPane` z=701). `enableGhostSnapMode` now builds `_snapHitboxLayer` — a `L.layerGroup` of invisible solid (`fillOpacity: 0.001`) circleMarkers, one per fix from `_ghostMarkers`, placed in `snapInteractionPane`. The pane is enabled (`pointer-events: auto`) only while snap mode is active.
- [x] **Unified Snap-to-Highlight Engine**: Each hitbox wires `mouseover` → `_showFixHoverGlow` (procedure theme color), `mouseout` → `_removeFixHoverGlow`, and `click` → `_ghostSnapCallback`. Suppressed idents (already in sequence) are skipped; their `procHoverPane` hit-areas own those positions. Ghost label close/reopen dance preserved in hitbox handlers.
- [x] **Clean Cursor Orchestration**: Centralize the cursor "pointing finger" logic within this dedicated layer, ensuring no ghost-layer artifacts can bleed through.

## Phase 31: Editing Persistence & Custom UX Finalization (Completed)

Finalizing the builder's visual feedback by implementing persistent highlights for the active point and cleaning up legacy custom markers.

- [x] **Real-time Reactive Updates**: Added `onLiveChange` callback option to `showPendingPointRestrictions` in `Sidebar.js`. All ALT/SPD selects wire `change → onLiveChange`; value inputs wire `input → onLiveChange`. Holding toggle `change` and turn-direction button `click` also call `onLiveChange`. `handlePointEdit` in `main.js` passes `onLiveChange: (live) => { DrawingState.updatePoint(index, live); updateProcedureMarkers(...); }` so every keystroke re-renders the marker overlay instantly.
- [x] **Reactive Holding Preview**: Because `onLiveChange` triggers `updateProcedureMarkers` on every holding checkbox toggle and bearing/side change, the "H" badge and glassmorphism tooltip re-render in real time. Toggling "Holding Point" off removes the badge immediately; editing the bearing updates the tooltip the next time the user hovers.
- [x] **Persistent Editing Highlight**: Added `_editHighlightMarker`, `showEditingHighlight(mapInstance, lat, lon, ident, color)`, and `clearEditingHighlight(mapInstance)` to `MapLayers.js` (exported). `handlePointEdit` calls `showEditingHighlight` before opening the form, `clearEditingHighlight` in both `onAdd` and `onErase` so the highlight disappears on close regardless of whether the user confirmed or cancelled.
- [x] **Legacy Tooltip Removal**: Removed `marker.bindTooltip(ident, { className: 'custom-point-label', ... })` from `createDraggableCustomMarker`. Custom points receive their colored label exclusively through the `updateProcedureMarkers` overlay (`_buildProcMarkerHtml`), which already covers all sequence points including custom ones.
- [x] **State-Driven Sync**: `onLiveChange` applies restrictions immediately via `DrawingState.updatePoint`. `onErase` (Cancel Edit) rolls back by calling `DrawingState.updatePoint(index, originalPt)` where `originalPt` is a shallow snapshot taken at the start of `handlePointEdit` — no live changes survive a cancel.

## Phase 32: Editing Highlight Visibility Debug (Active)

Resolving the issue where the persistent highlight (selection ring) fails to appear on the map while a waypoint is being edited in the sidebar.

- [ ] **Pane Initialization Audit**: Verify that `procEditPane` (z=702) is correctly initialized and appended to the Leaflet map container. Check for any CSS overrides that might be hiding the pane.
- [ ] **Coordinate Tracking Verification**: Ensure `showEditingHighlight` is receiving the correct `lat/lon` coordinates, especially for custom points that may have been moved.
- [ ] **Render Loop Persistence**: Validate that `updateProcedureMarkers` (called during `onLiveChange`) does not accidentally clear or overwrite the `procEditPane` content.
- [ ] **Visual Weight Review**: Increase the stroke weight and glow intensity of the edit highlight to ensure it is "striking" and clearly visible against the dark aeronautical background.

- [ ] **Builder Airspaces**: Re-integrate Airspace selection options into the Procedural Builder (hidden during Phase 14).
- [ ] **Builder Transitions**: Develop the transitions logic and UI for connecting distinct procedure segments in the builder.

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
| **Procedural Builder Persistence** | 100% | Done |
| **Procedural Builder Workflow Streamlining** | 100% | Done |
| **Builder UX Refinements & Highlight Parity** | 100% | Done |
| **Builder Lock/Unlock UI Overhaul** | 100% | Done |
| **Builder & Ghost Layer Polish** | 100% | Done |
| **Ghost Fix Label Quantum Fix** | 100% | Done |
| **Builder Bug Fixes & Label Cleanup** | 100% | Done |
| **Builder Workflow & Interaction Fixes** | 100% | Done |
| **Builder Interaction Polish & Tool Integration** | 100% | Done |
| **Precision Refinements & Safety Guards** | 100% | Done |
| **Final Interaction Polish & UI Refinements** | 100% | Done |
| **Holding Pattern Fixes & Aeronautical Drawing** | 100% | Done |
| **Builder Reliability & Point Addition Fix** | 100% | Done |
| **Holding Metadata & Custom Point UX Cleanup** | 100% | Done |
| **Hover Interaction Exclusivity & Style Parity** | 100% | Done |
| **Ghost Highlight Decommissioning & Unified Overlay** | 100% | Done |
| **Final Interaction Handshake & Hitbox Unification** | 100% | Done |
| **Absolute Hitbox Decoupling & Unified Snap Engine** | 100% | Done |
| **Editing Persistence & Custom UX Finalization** | 100% | Done |
| **Editing Highlight Visibility Debug** | 10% | Active |

*Last Updated: 2026-05-11 — Phase 32 Active*
