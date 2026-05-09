// ============================================================
// MeasuringVector.js - Measuring Vector Tool
// ============================================================
// This module provides a standalone "Measuring Vector" tool that
// lets the user draw temporary measurement lines on the map. Each
// finalized vector shows the distance (NM) and magnetic bearing
// between its two endpoints.
//
// The tool has two sub-states when active:
//   IDLE (waiting for first click)  — origin not yet placed.
//   DRAWING (waiting for second click) — origin placed, ghost line
//     tracks the cursor with live distance/bearing telemetry.
//
// Finalized vectors persist on the map even after the tool is toggled
// off or when the user switches between View and Builder tabs.
//
// Each finalized vector supports:
//   • Right-click  → context menu: "Delete Vector" / "Clear All Vectors"
//   • Left-click (tool OFF) → re-activates the tool instantly.
//
// This module is intentionally self-contained. It exports a small
// public API that main.js uses to wire the toggle button, and a
// handleMVClick() helper that MapLayers.js calls when a waypoint
// or aerodrome marker is clicked while the tool is active (because
// marker click handlers stop DOM propagation before the map sees the click).
// ============================================================

import { calculateDistance, calculateTrueBearing, trueToMagnetic } from '../utils/Helpers.js';
import { getNearestAircraft, getAircraftData } from '../traffic/LiveTraffic.js';


// ── Module-level state ───────────────────────────────────────────────────────

// Is the MV tool currently toggled ON?
let _isActive = false;

// Has the first click (origin) been placed? True between click 1 and click 2.
let _isDrawing = false;

// Leaflet LatLng of the first click.
let _originLatLng = null;

// Leaflet layers for the in-progress (ghost) vector being drawn.
// Both are removed when the second click finalizes the vector, or when
// the tool is toggled off while mid-draw.
let _ghostLine    = null;
let _originMarker = null;

// A fixed-position DOM element that follows the cursor and shows live
// distance + magnetic bearing while the user is drawing a vector.
let _telemetryEl = null;

// A fixed-position DOM element for the right-click "Delete / Clear All" menu.
// Kept separate from the waypoint context menu in MapLayers so there is no
// coupling between the two systems.
let _vectorContextMenuEl = null;

// Leaflet map event handler references — stored so they can be precisely removed.
// Without storing these, mapInstance.off('event', fn) can't find the function
// if it was created inside a closure (each closure creates a new reference).
let _mapClickHandler     = null;
let _mapMouseMoveHandler = null;

// Leaflet map reference — stored here so private helpers don't need it passed in.
let _mapRef = null;

// All finalized (permanent) vectors on the map.
// Each entry: { id: number, line: L.Polyline, labelMarker: L.Marker }
let _vectors      = [];
let _nextVectorId = 1;

// The id of the currently selected (red-highlighted) vector, or null if none is selected.
// Selection is toggled by clicking a finalized vector; cleared by clicking blank map area.
let _selectedVectorId = null;

// When the cursor passes within 3 NM of a live aircraft, the ghost line endpoint
// "snaps" to that aircraft position. This field holds the snapped aircraft object
// (from getNearestAircraft) so the second click can use the exact snapped position.
// Cleared when the snap falls outside the radius or when the vector is finalized.
let _snapTarget = null;

// When the FIRST click (origin placement) lands within 3 NM of a live aircraft,
// the origin snaps to that aircraft so the start point also enters follow mode.
// Cleared when the vector is finalized or the tool is reset.
let _originSnapTarget = null;

// The most recent Leaflet LatLng that the cursor was hovering over.
// Updated on every map mousemove event by updateCursorLatLng(), and consumed
// by setOriginAtCursor() / setFinalAtCursor() when the user presses O or F.
let _lastCursorLatLng = null;

// Tracks whether the dedicated 'mvPane' has been created on the map yet.
// The pane sits at z-index 2000 (above markerPane=600 and tooltipPane=650),
// guaranteeing MV labels render above aircraft symbols AND aircraft callsign
// tooltips. Using a custom pane (rather than reusing tooltipPane) avoids the
// label-displacement regression that occurred when MV markers were placed in
// tooltipPane — that pane uses a different zoom-animation pathway than
// markerPane, which broke marker positioning during/after zoom.
let _mvPaneInitialized = false;


// Lazily creates the dedicated 'mvPane' on the given map the first time a
// measurement is finalized. Subsequent calls are no-ops.
//
// 'mapInstance' — the Leaflet map
const _ensureMvPane = (mapInstance) => {
  if (_mvPaneInitialized || !mapInstance) return;
  if (!mapInstance.getPane('mvPane')) {
    const pane = mapInstance.createPane('mvPane');
    pane.style.zIndex       = '2000';   // above tooltipPane (650) and markerPane (600)
    pane.style.pointerEvents = 'auto';  // keep right-click + drag interactivity intact
  }
  _mvPaneInitialized = true;
};


// ── Public API ───────────────────────────────────────────────────────────────


// Sets up the telemetry DOM element and the context menu DOM element.
// Must be called ONCE at app startup before any other function in this module.
const initMeasuringVector = () => {

  // Telemetry label: a fixed-position DOM element positioned near the cursor.
  // Using a DOM element (not a Leaflet layer) keeps it above the Leaflet canvas
  // and bypasses the Leaflet re-render cycle — making updates feel instant.
  _telemetryEl             = document.createElement('div');
  _telemetryEl.id          = 'mv-telemetry';
  _telemetryEl.className   = 'mv-telemetry-label';
  _telemetryEl.style.display = 'none';
  document.body.appendChild(_telemetryEl);

  // Vector context menu: floating right-click menu, created once and reused.
  _vectorContextMenuEl             = document.createElement('div');
  _vectorContextMenuEl.id          = 'mv-context-menu';
  _vectorContextMenuEl.className   = 'mv-context-menu';
  _vectorContextMenuEl.style.display = 'none';
  document.body.appendChild(_vectorContextMenuEl);

  // Dismiss the context menu when the user clicks anywhere outside it.
  document.addEventListener('click', (e) => {
    if (_vectorContextMenuEl && !_vectorContextMenuEl.contains(e.target)) {
      _hideVectorContextMenu();
    }
  });

  // Also dismiss on Escape key.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideVectorContextMenu();
  });

  console.log('[MeasuringVector] Initialized.');
};

let _snapProvider = null;
const setVectorSnapProvider = (fn) => { _snapProvider = fn; };

// Unified snapping logic supporting Shift override and external providers.
// The provider is expected to return: { isAircraft: boolean, id?: string, lat, lon, ... }
const _getSnap = (latlng, originalEvent) => {
  if (originalEvent && originalEvent.shiftKey) return null;

  // 1. Check Aircraft (highest priority, 1 NM)
  const ac = getNearestAircraft(latlng, 1);
  if (ac) return { isAircraft: true, id: ac.id, lat: ac.lat, lon: ac.lon };

  // 2. Check external provider (NAVAIDs, FIXes, Airports)
  if (_snapProvider) return _snapProvider(latlng, 1);

  return null;
};


// Activates the measuring vector tool on the given Leaflet map.
// After calling this:
//   — The cursor changes to crosshair.
//   — The next click (on the map or a waypoint) places the origin node.
//   — Mouse movement draws a live ghost line + telemetry.
//   — A second click finalizes the vector and persists it.
//
// 'mapInstance' — the Leaflet map
const enableMeasuringVector = (mapInstance) => {
  if (!mapInstance) {
    console.error('[MeasuringVector] enableMeasuringVector: No map instance provided.');
    return;
  }

  _mapRef   = mapInstance;
  _isActive = true;

  // Change the map cursor to crosshair so the user knows the tool is active.
  mapInstance.getContainer().style.cursor = 'crosshair';

  // Create and attach the map click handler.
  // This handles both click 1 (origin) and click 2 (destination).
  _mapClickHandler = (e) => _handleClick(e.latlng, e.originalEvent, mapInstance);
  mapInstance.on('click', _mapClickHandler);

  // Create and attach the mousemove handler for the ghost line + telemetry.
  _mapMouseMoveHandler = (e) => {
    _handleMouseMove(e.latlng, e.originalEvent, mapInstance);
  };

  mapInstance.on('mousemove', _mapMouseMoveHandler);

  // Directly update the floating toolbar button to show the active state.
  const btnMv = document.getElementById('btn-mv-tool');
  if (btnMv) btnMv.classList.add('active');
  console.log('[MeasuringVector] Tool ENABLED — click map to place origin.');
};


// Deactivates the measuring vector tool without removing finalized vectors.
// If the user is mid-draw (origin placed, no destination yet), the ghost line
// is cleaned up to avoid leaving a partial line on the map.
//
// 'mapInstance' — the same Leaflet map passed to enableMeasuringVector()
const disableMeasuringVector = (mapInstance) => {
  if (!mapInstance) return;

  _isActive  = false;
  _isDrawing = false;
  _originLatLng = null;

  // Precisely remove only the handlers we registered, without touching any
  // other map listeners (e.g. the highlight-clearing handler in MapLayers.js).
  if (_mapClickHandler)     { mapInstance.off('click',     _mapClickHandler);     _mapClickHandler     = null; }
  if (_mapMouseMoveHandler) { mapInstance.off('mousemove', _mapMouseMoveHandler); _mapMouseMoveHandler = null; }

  // Remove ghost line remnants from a mid-draw cancellation.
  _cleanupGhostLine(mapInstance);

  // Clear any active selection so the user can grab the map cleanly.
  _deselectAll();

  // Hide the live telemetry label and restore the default cursor.
  if (_telemetryEl) _telemetryEl.style.display = 'none';
  mapInstance.getContainer().style.cursor = '';

  // Directly update the floating toolbar button to remove the active state.
  const btnMv = document.getElementById('btn-mv-tool');
  if (btnMv) btnMv.classList.remove('active');
  console.log('[MeasuringVector] Tool DISABLED. Existing vectors remain on map.');
};


// Removes ALL finalized measurement vectors from the map.
// Can be called while the tool is in any state (active or not).
//
// 'mapInstance' — the Leaflet map
const clearAllVectors = (mapInstance) => {
  _vectors.forEach(({ line, labelMarker }) => {
    if (mapInstance?.hasLayer(line))        mapInstance.removeLayer(line);
    if (mapInstance?.hasLayer(labelMarker)) mapInstance.removeLayer(labelMarker);
  });
  _vectors         = [];
  _selectedVectorId = null;
  _hideVectorContextMenu();
  console.log('[MeasuringVector] All measurement vectors cleared from map.');
};


// Removes only the currently selected (red) vector from the map.
// If no vector is selected this is a no-op.
// Designed to be triggered by the "Z" keyboard shortcut (set in main.js).
//
// 'mapInstance' — the Leaflet map
const clearSelectedVector = (mapInstance) => {
  if (_selectedVectorId === null) return;
  const id = _selectedVectorId;
  _selectedVectorId = null;   // reset before delete so _deleteVector doesn't double-clear
  _deleteVector(id, mapInstance);
  console.log(`[MeasuringVector] Selected vector #${id} cleared via keyboard shortcut.`);
};


// Called by MapLayers.js when a waypoint, threshold, or aerodrome marker is
// clicked while the MV tool is active. Because Leaflet marker click handlers
// call L.DomEvent.stop(e), the click never reaches the map's own click event —
// so we need this external entry point to route the coordinate into the
// same origin/destination drawing flow as a blank-area map click.
//
// 'latlng'      — L.LatLng of the clicked feature (from the marker's click event)
// 'mapInstance' — the Leaflet map
const handleMVClick = (latlng, mapInstance, originalEvent = null) => {
  if (!_isActive || !mapInstance) return;
  _handleClick(latlng, originalEvent, mapInstance);
};


// Returns whether the measuring vector tool is currently active (toggle ON).
// Used by MapLayers.js to decide whether to route marker clicks into the MV flow.
const isMeasuringVectorActive = () => _isActive;


// ── Private Helpers ───────────────────────────────────────────────────────────


// Core click logic: manages the origin → destination two-click flow.
// Called from the Leaflet map 'click' handler (blank-area clicks) and from
// handleMVClick (marker clicks routed in by MapLayers.js).
//
// 'latlng'      — Leaflet LatLng coordinate of the click
// 'mapInstance' — the Leaflet map
const _handleClick = (latlng, originalEvent, mapInstance) => {
  if (!_isDrawing) {
    // ── First click: place the origin node ────────────────────────────────
    // Clicking blank map area also deselects any currently selected vector.
    _deselectAll();

    _isDrawing = true;

    // Check if the click lands near a live aircraft or static object and snap the origin.
    const originSnap  = _getSnap(latlng, originalEvent);
    _originSnapTarget = originSnap && originSnap.isAircraft ? originSnap : null;
    _originLatLng     = originSnap ? L.latLng(originSnap.lat, originSnap.lon) : latlng;

    // A small filled circle marks the origin visually on the map.
    _originMarker = L.circleMarker(_originLatLng, {
      radius:      5,
      color:       '#ff9800',
      fillColor:   '#ff9800',
      fillOpacity: 1,
      weight:      2,
      interactive: false    // origin node is not clickable — only the final line is
    }).addTo(mapInstance);

    // Ghost line starts as a zero-length line from the (possibly snapped) origin.
    // _handleMouseMove expands it to follow the cursor on every frame.
    _ghostLine = L.polyline([_originLatLng, _originLatLng], {
      color:       '#ff9800',
      weight:      1,
      opacity:     0.55,
      dashArray:   '6, 5',
      interactive: false    // ghost line must not intercept map events
    }).addTo(mapInstance);

    const snapNote = originSnap ? ` [snapped to ${originSnap.id}]` : '';
    console.log(`[MeasuringVector] Origin placed at (${_originLatLng.lat.toFixed(5)}, ${_originLatLng.lng.toFixed(5)})${snapNote}.`);

  } else {
    // ── Second click: place the destination node ──────────────────────────
    _isDrawing = false;

    // Finalize destination — use the snap logic if applicable.
    const destSnap = _getSnap(latlng, originalEvent);
    const destTargetHex = destSnap && destSnap.isAircraft ? destSnap.id : null;
    const destLatLng = destSnap ? L.latLng(destSnap.lat, destSnap.lon) : latlng;

    // Pass both snap targets so _finalizeVector can store hex ids for follow mode.
    _finalizeVector(mapInstance, _originLatLng, destLatLng, _originSnapTarget || null, _snapTarget || null);

    // Remove the ghost overlay — the permanent vector replaces it.
    _cleanupGhostLine(mapInstance);

    // Hide the telemetry label now that the vector is fixed.
    if (_telemetryEl) _telemetryEl.style.display = 'none';

    // Reset drawing state: the next click will start a new vector from scratch.
    _isDrawing        = false;
    _originLatLng     = null;
    _snapTarget       = null;
    _originSnapTarget = null;

    console.log(`[MeasuringVector] Destination at (${destLatLng.lat.toFixed(5)}, ${destLatLng.lng.toFixed(5)}).`);
  }
};


// Updates the ghost line endpoint and the live telemetry label as the cursor moves.
// Called on every Leaflet 'mousemove' event while a vector is being drawn.
//
// Aircraft snapping: if a live aircraft is within 3 NM of the cursor, the ghost
// line snaps to that aircraft's position and the telemetry shows an ETA based on
// the aircraft's current ground speed. The snapped aircraft is stored in _snapTarget
// so the second click finalizes to the exact aircraft position.
//
// 'latlng'        — current cursor position as a Leaflet LatLng
// 'originalEvent' — the raw DOM MouseEvent (gives us clientX/Y for DOM positioning)
// 'mapInstance'   — the Leaflet map (unused here but kept for consistency)
const _handleMouseMove = (latlng, originalEvent, mapInstance) => {
  if (!_isDrawing || !_originLatLng) return;

  // Check for snapping
  const snapped = _getSnap(latlng, originalEvent);
  _snapTarget = snapped && snapped.isAircraft ? snapped : null;

  // Use the snapped position as the ghost endpoint, falling back to the cursor.
  const destPt = snapped ? L.latLng(snapped.lat, snapped.lon) : latlng;

  // Stretch the ghost line from the fixed origin to the (possibly snapped) destination.
  if (_ghostLine) {
    _ghostLine.setLatLngs([_originLatLng, destPt]);
  }

  // Calculate live telemetry. These are the same formulas used throughout the app
  // for leg measurements — Haversine distance and initial great-circle bearing,
  // then converted from True to Magnetic using the Hong Kong TMA declination.
  const distNm  = calculateDistance(_originLatLng.lat, _originLatLng.lng, destPt.lat, destPt.lng);
  const trueBrg = calculateTrueBearing(_originLatLng.lat, _originLatLng.lng, destPt.lat, destPt.lng);
  const magBrg  = trueToMagnetic(trueBrg);

  // Update the floating telemetry DOM element near the cursor.
  // Offset by +16px so the label sits just to the bottom-right of the cursor tip
  // rather than exactly under it (which would make the cursor invisible).
  if (_telemetryEl) {
    let html =
      `<span class="mv-tel-dist">${distNm.toFixed(1)} NM</span>` +
      `<span class="mv-tel-sep"> · </span>` +
      `<span class="mv-tel-brg">${String(Math.round(magBrg)).padStart(3, '0')}°</span>`;

    // When snapped to an aircraft with a known ground speed, append the ETA.
    // Formula: (distance NM / ground speed kts) × 60 = minutes to reach origin.
    if (snapped && snapped.gsKts > 0) {
      const etaMin = (distNm / snapped.gsKts) * 60;
      html +=
        `<span class="mv-tel-sep"> · </span>` +
        `<span class="mv-tel-snap">ETA ${etaMin.toFixed(1)} min</span>`;
    }

    _telemetryEl.innerHTML      = html;
    _telemetryEl.style.display  = 'block';
    _telemetryEl.style.left     = `${originalEvent.clientX + 16}px`;
    _telemetryEl.style.top      = `${originalEvent.clientY + 16}px`;
  }
};


// Builds the three-line structured label content for a finalized measurement vector.
// Returns { line1, line2, line3 } where line3 (ETA) is null when no aircraft speed
// is available (map-point-to-map-point vectors never have ETA).
//
// ETA speed source precedence:
//   Case B — both endpoints on aircraft: use ORIGIN aircraft GS.
//   Case C — origin on aircraft, dest is a point: use ORIGIN aircraft GS.
//   Case A — origin is a point, dest on aircraft: use DEST aircraft GS.
//   No aircraft → no ETA.
//
// Label format is intentionally terse — plain values, no unit/prefix text:
//   line1: "17.0"    (NM distance; ▶ prefix when tracking an aircraft)
//   line2: "060°"    (magnetic bearing)
//   line3: "03:48"   (ETA minutes:seconds, only when tracking an aircraft with known GS)
//
// 'originLatLng'    — Leaflet LatLng of the start point
// 'destLatLng'      — Leaflet LatLng of the end point
// 'originTargetHex' — hex id of the origin-tracked aircraft, or null
// 'destTargetHex'   — hex id of the dest-tracked aircraft, or null
const _buildLabelContent = (originLatLng, destLatLng, originTargetHex, destTargetHex) => {
  const distNm  = calculateDistance(originLatLng.lat, originLatLng.lng, destLatLng.lat, destLatLng.lng);
  const trueBrg = calculateTrueBearing(originLatLng.lat, originLatLng.lng, destLatLng.lat, destLatLng.lng);
  const magBrg  = trueToMagnetic(trueBrg);
  const line1 = `${distNm.toFixed(1)}`;
  const line2 = `${String(Math.round(magBrg)).padStart(3, '0')}°`;

  // Determine which aircraft (if any) provides the speed for ETA.
  const originAc = originTargetHex ? getAircraftData(originTargetHex) : null;
  const destAc   = destTargetHex   ? getAircraftData(destTargetHex)   : null;
  const speedKts = (originAc?.gsKts > 10) ? originAc.gsKts
                 : (destAc?.gsKts   > 10) ? destAc.gsKts
                 : 0;

  let line3 = null;
  if (speedKts > 0) {
    const etaMin = (distNm / speedKts) * 60;
    const mins   = Math.floor(etaMin);
    const secs   = Math.round((etaMin - mins) * 60);
    line3 = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return { line1, line2, line3 };
};


// Returns true when two Leaflet LatLng objects are within ~11m of each other.
// Used to detect vectors that share the same destination so their labels can be fanned out.
const _isSameLatLng = (a, b) =>
  Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;


// Computes the Leaflet iconAnchor [x, y] that places the label box at a fixed
// pixel offset outward from the endpoint, in the direction of the vector.
// Returning to native iconAnchor positioning (instead of the previously-tried
// inline CSS `transform: translate(calc(...))` on .mv-lbl-inner) avoids a
// class of bugs where the inner-div transform desynced from Leaflet's own
// marker positioning during zoom animation, sending labels into the corners.
//
// Approximate label box footprint is used here — it's good enough because
// the anchor only needs to be roughly half-a-box-width away from the endpoint
// in the bearing direction; small text-width variations don't visibly drift.
//
// 'originLatLng'    — vector start point
// 'destLatLng'      — vector end point (where the label marker is placed)
// 'offsetIndex'     — 0-based stacking index for co-destination labels
// 'isTrackingDest'  — when true, widens the gap to clear the 18px aircraft glyph
const _computeLabelAnchor = (originLatLng, destLatLng, offsetIndex, isTrackingDest) => {
  const trueBrg = calculateTrueBearing(originLatLng.lat, originLatLng.lng, destLatLng.lat, destLatLng.lng);
  const brgRad  = (trueBrg * Math.PI) / 180;
  // Screen-space unit vector: dx = east (+1), dy = south (+1 because screen Y grows down).
  const dx = Math.sin(brgRad);
  const dy = -Math.cos(brgRad);

  // Approximate label box dimensions and gap from the endpoint marker.
  // 14px gap clears the ~18px aircraft symbol without visual detachment;
  // 6px is the tight hug used for plain map-point destinations.
  const W = 40, H = 36;
  const M = isTrackingDest ? 14 : 6;

  // iconAnchor formula: pixel (ax, ay) of the icon div sits at the lat/lon point.
  // Setting ax = W/2 - dx*(W/2+M) centres the label box just beyond the endpoint
  // in the outward bearing direction.
  const ax = Math.round(W / 2 - dx * (W / 2 + M));
  // Stack subsequent co-destination labels vertically (Y-axis only), away from
  // the origin direction, so they form a tidy column instead of crossing the line.
  const ay = Math.round(H / 2 - dy * (H / 2 + M)) - (offsetIndex * 38);
  return [ax, ay];
};


// Builds a Leaflet DivIcon for a finalized measurement label.
// The icon stacks three value lines vertically (distance, bearing, optional ETA).
// Positioning is done via Leaflet's native `iconAnchor` so the label always
// stays glued to the marker's projected screen position across zoom animations.
//
// 'content'         — object from _buildLabelContent() with { line1, line2, line3 }
// 'originLatLng'    — vector start point (needed for bearing-based anchor calc)
// 'destLatLng'      — vector end point (label is placed here)
// 'offsetIndex'     — 0-based stacking index for co-destination labels (default 0)
// 'isTrackingDest'  — true when the destination is locked to a live aircraft
const _buildLabelIcon = (content, originLatLng, destLatLng, offsetIndex = 0, isTrackingDest = false) => {
  const { line1, line2, line3 } = content;
  const etaHtml = line3 ? `<span class="mv-lbl-val">${line3}</span>` : '';
  const anchor  = _computeLabelAnchor(originLatLng, destLatLng, offsetIndex, isTrackingDest);
  return L.divIcon({
    className:  'mv-measurement-label',
    html: `<div class="mv-lbl-inner">
      <span class="mv-lbl-val">${line1}</span>
      <span class="mv-lbl-val">${line2}</span>
      ${etaHtml}
    </div>`,
    iconSize:   [0, 0],
    iconAnchor: anchor
  });
};


// Redraws an existing vector's polyline and label after one of its endpoints moved.
// Called by updateAttachedVectors() on every traffic poll cycle for vectors in follow mode.
//
// 'entry' — a vector entry from _vectors[] (mutated in place by the caller before this call)
const _redrawVector = (entry) => {
  // Move the polyline to the new endpoints.
  entry.line.setLatLngs([entry.originLatLng, entry.destLatLng]);

  // Rebuild the multi-line label with fresh telemetry and reposition it at the destination.
  const newContent = _buildLabelContent(entry.originLatLng, entry.destLatLng, entry.originTargetHex, entry.destTargetHex);
  entry.labelMarker.setLatLng(entry.destLatLng);
  entry.labelMarker.setIcon(_buildLabelIcon(newContent, entry.originLatLng, entry.destLatLng, entry.offsetIndex || 0, entry.destTargetHex !== null));

  // setIcon() destroys and recreates the DOM element, stripping any CSS classes that
  // were added after the marker was first rendered. Re-apply mv-selected if this
  // vector is still the active selection so the label stays red after a redraw.
  if (entry.id === _selectedVectorId) {
    const el = entry.labelMarker.getElement();
    if (el) el.classList.add('mv-selected');
  }
};


// Creates a permanent measurement vector on the map.
// Adds a solid polyline and a label marker at the destination point showing
// the final distance and bearing. The vector is orange by default; clicking it
// turns it red ("selected"). Right-clicking shows the delete context menu.
//
// The new vector is registered in _vectors[] so it can be individually deleted later.
//
// 'mapInstance'      — the Leaflet map
// 'originLatLng'     — Leaflet LatLng of the start point (first click)
// 'destLatLng'       — Leaflet LatLng of the end point (second click / snapped aircraft)
// 'originSnapTarget' — live-traffic aircraft object if the origin was snapped to one; null otherwise.
// 'destSnapTarget'   — live-traffic aircraft object if the destination was snapped to one; null otherwise.
//                      When either is non-null the vector enters "follow mode" for that endpoint.
const _finalizeVector = (mapInstance, originLatLng, destLatLng, originSnapTarget, destSnapTarget) => {
  const id = _nextVectorId++;

  // Whether each endpoint is locked onto a live aircraft.
  const originTargetHex = originSnapTarget ? originSnapTarget.id : null;
  const destTargetHex   = destSnapTarget   ? destSnapTarget.id   : null;

  // Count how many existing vectors share the same destination so this label
  // can be fanned out along the vector's outward path to avoid overlap.
  const offsetIndex = _vectors.filter((v) => _isSameLatLng(v.destLatLng, destLatLng)).length;

  // Make sure the dedicated mvPane (z-index 2000) exists on the map so the
  // label marker can be promoted into it.
  _ensureMvPane(mapInstance);

  // Build the structured multi-line label.
  const labelContent = _buildLabelContent(originLatLng, destLatLng, originTargetHex, destTargetHex);

  // Permanent solid polyline — slightly thinner than before so it is less intrusive.
  const line = L.polyline([originLatLng, destLatLng], {
    color:       '#ff9800',
    weight:      1.5,
    opacity:     0.85,
    interactive: true     // interactive:true so click/contextmenu events fire on the line
  }).addTo(mapInstance);

  // Label placed at the destination point so it anchors visually to the endpoint.
  const labelMarker = L.marker(destLatLng, {
    icon: _buildLabelIcon(labelContent, originLatLng, destLatLng, offsetIndex, destTargetHex !== null),
    interactive: true,    // interactive so right-click shows the context menu
    draggable:   true,    // allows the user to re-snap the endpoint to a new location
    pane:        'mvPane' // dedicated pane at z-index 2000 — sits above aircraft
                          // glyphs (markerPane=600) AND aircraft callsign tooltips
                          // (tooltipPane=650) without inheriting tooltipPane's
                          // zoom-animation quirks that previously broke positioning.
  }).addTo(mapInstance);

  // Store originLatLng and destLatLng in the entry so _redrawVector can update them.
  const vectorEntry = {
    id,
    line,
    labelMarker,
    originLatLng,             // L.LatLng — start point (updated by follow mode if originTargetHex is set)
    destLatLng,               // L.LatLng — end point   (updated by follow mode if destTargetHex is set)
    originTargetHex,          // string hex id of the origin-tracked aircraft, or null
    destTargetHex,            // string hex id of the dest-tracked aircraft, or null
    offsetIndex               // stacking index for labels at the same destination
  };
  _vectors.push(vectorEntry);

  // ── Wire events on the permanent line and label marker ────────────────

  // Right-click: show the delete context menu for this specific vector.
  const onContextMenu = (e) => {
    L.DomEvent.stop(e);
    _showVectorContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id, mapInstance);
  };

  // Left-click: select this vector (turns it red). Stop propagation so the map
  // click handler does not also try to place a new origin underneath.
  const onClick = (e) => {
    L.DomEvent.stop(e);
    _selectVector(id);
  };

  // Dragging the label allows re-snapping the endpoint to a new map location.
  labelMarker.on('dragstart', (e) => {
    _selectVector(id);
  });

  labelMarker.on('drag', (e) => {
    vectorEntry.destLatLng = e.latlng;
    vectorEntry.line.setLatLngs([vectorEntry.originLatLng, e.latlng]);
  });

  labelMarker.on('dragend', (e) => {
    const newPos = e.target.getLatLng();
    // Check if the drop landed near an aircraft or static point
    const originalEvent = e.originalEvent; // leaflet might not have it on dragend perfectly, but we can try
    const snapped = _getSnap(newPos, originalEvent);
    vectorEntry.destTargetHex = snapped && snapped.isAircraft ? snapped.id : null;
    vectorEntry.destLatLng = snapped ? L.latLng(snapped.lat, snapped.lon) : newPos;
    
    _redrawVector(vectorEntry);
  });

  line.on('contextmenu', onContextMenu);
  line.on('click',       onClick);
  labelMarker.on('contextmenu', onContextMenu);
  labelMarker.on('click',       onClick);

  // Recompute telemetry for the console log — these values exist inside _buildLabelText
  // but are not available in this function's scope, so compute them once more for logging only.
  const _logDistNm = calculateDistance(originLatLng.lat, originLatLng.lng, destLatLng.lat, destLatLng.lng);
  const _logMagBrg = trueToMagnetic(calculateTrueBearing(originLatLng.lat, originLatLng.lng, destLatLng.lat, destLatLng.lng));
  const _followParts = [];
  if (originTargetHex) _followParts.push(`origin→${originTargetHex}`);
  if (destTargetHex)   _followParts.push(`dest→${destTargetHex}`);
  const _followStr = _followParts.length ? ` [${_followParts.join(', ')}]` : '';
  console.log(`[MeasuringVector] Vector #${id} finalized: ${_logDistNm.toFixed(1)} NM, ${Math.round(_logMagBrg)}° Mag${_followStr}.`);

  // Auto-select the vector immediately upon creation.
  _selectVector(id);
};


// Removes a single vector from the map, identified by its numeric id.
// Cleans up the polyline and the label marker. Also clears selection state if
// the deleted vector happened to be selected.
//
// 'id'          — integer id assigned when the vector was finalized
// 'mapInstance' — the Leaflet map
const _deleteVector = (id, mapInstance) => {
  const idx = _vectors.findIndex((v) => v.id === id);
  if (idx === -1) {
    console.warn(`[MeasuringVector] _deleteVector: vector id ${id} not found.`);
    return;
  }

  const { line, labelMarker } = _vectors[idx];
  if (mapInstance?.hasLayer(line))        mapInstance.removeLayer(line);
  if (mapInstance?.hasLayer(labelMarker)) mapInstance.removeLayer(labelMarker);

  // If we just deleted the selected vector, clear the selection state.
  if (_selectedVectorId === id) _selectedVectorId = null;

  _vectors.splice(idx, 1);
  console.log(`[MeasuringVector] Vector #${id} deleted.`);
};


// Removes the ghost line and origin marker from the map.
// Called when a vector is finalized (ghost replaced by the permanent line)
// or when the tool is toggled off mid-draw.
//
// 'mapInstance' — the Leaflet map
const _cleanupGhostLine = (mapInstance) => {
  if (_ghostLine    && mapInstance?.hasLayer(_ghostLine))    mapInstance.removeLayer(_ghostLine);
  if (_originMarker && mapInstance?.hasLayer(_originMarker)) mapInstance.removeLayer(_originMarker);
  _ghostLine    = null;
  _originMarker = null;
};


// Selects a vector by id — highlights it red to signal "active/selected".
// Deselects any previously selected vector first so only one can be active at a time.
// Both the polyline and the label text turn red together for clear visual pairing.
//
// 'id' — integer id of the vector to select
const _selectVector = (id) => {
  _deselectAll();
  _selectedVectorId = id;

  const entry = _vectors.find((v) => v.id === id);
  if (!entry) return;

  // Red line + slightly thicker weight visually distinguishes the selected vector.
  entry.line.setStyle({ color: '#ff3333', weight: 2 });

  // Toggle the mv-selected class on the label marker's DOM element so the CSS
  // can also turn the label text red, keeping line and label visually in sync.
  const el = entry.labelMarker.getElement();
  if (el) el.classList.add('mv-selected');
};


// Restores the currently selected vector (if any) to its default orange style,
// then clears the selection state.
const _deselectAll = () => {
  if (_selectedVectorId === null) return;
  const entry = _vectors.find((v) => v.id === _selectedVectorId);
  if (entry) {
    entry.line.setStyle({ color: '#ff9800', weight: 1.5 });
    const el = entry.labelMarker.getElement();
    if (el) el.classList.remove('mv-selected');
  }
  _selectedVectorId = null;
};


// Displays the vector-specific right-click context menu at the given screen position.
// Rebuilds the menu HTML on every open so the event listeners don't accumulate
// (each rebuild destroys the previous buttons and their stale listeners).
//
// 'x'           — clientX from the right-click event (used to position the menu)
// 'y'           — clientY from the right-click event
// 'vectorId'    — the id of the vector that was right-clicked
// 'mapInstance' — the Leaflet map (passed to _deleteVector / clearAllVectors)
const _showVectorContextMenu = (x, y, vectorId, mapInstance) => {
  if (!_vectorContextMenuEl) return;

  // Look up this vector so we can check if it is currently in follow mode.
  // followEntry is captured in the closure so the click handler can mutate it directly.
  const followEntry = _vectors.find((v) => v.id === vectorId);
  const isFollowing = followEntry?.destTargetHex != null || followEntry?.originTargetHex != null;

  // "Stop Following" is only shown when the vector is actively tracking an aircraft.
  const stopFollowHtml = isFollowing
    ? `<div class="mv-ctx-item" data-mv-action="stop-follow">&#9632;&nbsp; Stop Following</div>
       <div class="mv-ctx-separator"></div>`
    : '';

  _vectorContextMenuEl.innerHTML = `
    ${stopFollowHtml}<div class="mv-ctx-item" data-mv-action="delete">&#10005;&nbsp; Delete Vector</div>
    <div class="mv-ctx-separator"></div>
    <div class="mv-ctx-item danger" data-mv-action="clear-all">&#9866;&nbsp; Clear All Vectors</div>
  `;

  // Clamp the menu position so it never overflows the right or bottom edge.
  // Use vh - 160 to leave enough room for the tallest possible menu (5 items + separators).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _vectorContextMenuEl.style.left    = `${Math.min(x, vw - 200)}px`;
  _vectorContextMenuEl.style.top     = `${Math.min(y, vh - 160)}px`;
  _vectorContextMenuEl.style.display = 'block';

  // Wire up menu item clicks. Each open creates fresh buttons so there is never
  // more than one listener on each item (the old innerHTML is destroyed on rebuild).
  _vectorContextMenuEl.querySelectorAll('[data-mv-action]').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.mvAction;
      if (action === 'stop-follow' && followEntry) {
        // Detach both endpoints from any tracked aircraft — clears follow mode entirely.
        // The vector stays on the map frozen at its last known positions;
        // _redrawVector rebuilds the label without the '▶' prefix automatically.
        followEntry.originTargetHex = null;
        followEntry.destTargetHex   = null;
        _redrawVector(followEntry);
      }
      if (action === 'delete')    _deleteVector(vectorId, mapInstance);
      if (action === 'clear-all') clearAllVectors(mapInstance);
      _hideVectorContextMenu();
    });
  });
};


// Hides the context menu and clears its content.
const _hideVectorContextMenu = () => {
  if (_vectorContextMenuEl) {
    _vectorContextMenuEl.style.display = 'none';
    _vectorContextMenuEl.innerHTML     = '';
  }
};


// Called by LiveTraffic.js (via the callback registered in main.js) after every
// poll cycle for each aircraft whose position was updated.
// Finds any finalized vectors whose DESTINATION is attached to this hex id,
// moves the destination to the aircraft's new position, and redraws the line + label.
//
// The callback pattern (registered in main.js via setPositionUpdateCallback) avoids
// a circular import: MeasuringVector already imports from LiveTraffic, so LiveTraffic
// cannot import from MeasuringVector without creating a cycle.
//
// 'hex'    — the ICAO hex identifier of the aircraft (matches destTargetHex stored at finalize)
// 'newLat' — updated aircraft latitude
// 'newLon' — updated aircraft longitude
const updateAttachedVectors = (hex, newLat, newLon) => {
  _vectors.forEach((entry) => {
    let needsRedraw = false;

    // Update destination endpoint if it is tracking this aircraft.
    if (entry.destTargetHex === hex) {
      entry.destLatLng = L.latLng(newLat, newLon);
      needsRedraw = true;
    }

    // Update origin endpoint if it is also tracking this aircraft.
    if (entry.originTargetHex === hex) {
      entry.originLatLng = L.latLng(newLat, newLon);
      needsRedraw = true;
    }

    if (needsRedraw && _mapRef) _redrawVector(entry);
  });
};


// Stores the latest cursor position from the map's mousemove event.
// Called by main.js on every Leaflet mousemove so the O/F keyboard shortcuts
// always know where the cursor is at the moment the key is pressed.
//
// 'latlng' — the Leaflet LatLng from the mousemove event
const updateCursorLatLng = (latlng) => {
  _lastCursorLatLng = latlng;
};


// Places the measuring vector's origin node at the cursor's last-known position.
// If the tool is not currently active, this automatically enables it first.
// If the user is already mid-draw (origin placed, waiting for second click),
// the in-progress ghost is cancelled and a fresh origin is placed instead.
//
// Designed to be triggered by the "O" keyboard shortcut (set in main.js).
//
// 'mapInstance' — the Leaflet map
const setOriginAtCursor = (mapInstance) => {
  if (!_lastCursorLatLng || !mapInstance) return;

  // Auto-activate the tool if it is not already on.
  if (!_isActive) {
    enableMeasuringVector(mapInstance);
  }

  // If the user is mid-draw (origin already placed), cancel the ghost and
  // reset drawing state before placing the new origin at the cursor.
  if (_isDrawing) {
    _cleanupGhostLine(mapInstance);
    if (_telemetryEl) _telemetryEl.style.display = 'none';
    _isDrawing    = false;
    _originLatLng = null;
  }

  // Route the cursor position through the normal click handler, which will
  // place the origin node because _isDrawing is now false.
  _handleClick(_lastCursorLatLng, null, mapInstance);
};


// Completes the in-progress measuring vector by placing the destination node
// at the cursor's last-known position. Only acts when the tool is active AND
// an origin has already been placed (i.e., the user is mid-draw).
// Also supports re-snapping the currently selected vector if one is active.
//
// Designed to be triggered by the "F" keyboard shortcut (set in main.js).
//
// 'mapInstance' — the Leaflet map
const setFinalAtCursor = (mapInstance) => {
  if (!_lastCursorLatLng || !mapInstance) return;

  // If a vector is selected, "F" resnaps its endpoint even if the tool isn't actively drawing.
  if (_selectedVectorId !== null) {
    const entry = _vectors.find((v) => v.id === _selectedVectorId);
    if (entry) {
      const snapped = _getSnap(_lastCursorLatLng, null);
      entry.destTargetHex = snapped && snapped.isAircraft ? snapped.id : null;
      entry.destLatLng = snapped ? L.latLng(snapped.lat, snapped.lon) : _lastCursorLatLng;
      _redrawVector(entry);
      console.log(`[MeasuringVector] Vector #${entry.id} re-snapped via keyboard shortcut.`);
    }
    return;
  }

  // Otherwise, route the cursor position through the normal click handler to finalize.
  if (_isActive && _isDrawing) {
    _handleClick(_lastCursorLatLng, null, mapInstance);
  }
};


// Public alias for the internal _deselectAll helper. Exposed so main.js can
// clear the red selection when the user clicks an empty area of the map while
// the measuring vector tool is OFF — without this, the only way to deselect
// is to click another vector or to enable the tool and click empty space.
const deselectAllVectors = () => _deselectAll();


// Cycles the selection through all finalized vectors in creation order.
// If nothing is selected, selects the first vector.
// If the last vector is selected, wraps back to the first.
// Designed to be triggered by the 'C' keyboard shortcut (wired in main.js).
const cycleSelectedVector = () => {
  if (_vectors.length === 0) return;

  if (_selectedVectorId === null) {
    _selectVector(_vectors[0].id);
    return;
  }

  const idx     = _vectors.findIndex((v) => v.id === _selectedVectorId);
  const nextIdx = (idx + 1) % _vectors.length;
  _selectVector(_vectors[nextIdx].id);
};


export {
  initMeasuringVector,
  enableMeasuringVector,
  disableMeasuringVector,
  clearAllVectors,
  clearSelectedVector,
  cycleSelectedVector,
  deselectAllVectors,
  handleMVClick,
  isMeasuringVectorActive,
  updateCursorLatLng,
  setOriginAtCursor,
  setFinalAtCursor,
  updateAttachedVectors,
  setVectorSnapProvider
};
