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


---

## 📈 Advancement Tracking
| Milestone | Progress | Status |
| :--- | :--- | :--- |
| **Foundation** | 100% | Done |
| **Data Expansion** | 100% | Done |
| **Airspace Modeling** | 100% | Done |
| **CI/CD** | 100% | Done |
| **Bug Fixes** | 100% | Done |

*Last Updated: 2026-05-09*
