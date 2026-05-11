// ============================================================
// MapLayers.js - The Map Rendering & Drawing Engine
// ============================================================
// This module has two responsibilities:
//
//   1. RENDERING — drawing static data (airports, waypoints,
//      SIDs, STARs) on the base map as Leaflet layers.
//
//   2. DRAWING — managing the interactive drawing modes that
//      let the user build new procedures on the map:
//        • Snap-to-Fix mode: clicking an existing waypoint
//          marker adds it to the active procedure sequence.
//        • Free-Draw mode: clicking anywhere on the map adds
//          a custom coordinate point (used for areas/polygons).
//
// The drawing state (which mode is active, what shape is being
// built) is managed by DrawingState.js. This module only
// manages the Leaflet-level interactions and rendering.
// ============================================================

import { i18n } from '../utils/i18n.js';
import { calculateDistance, calculateTrueBearing, trueToMagnetic } from '../utils/Helpers.js';
import { isMeasuringVectorActive, handleMVClick } from './MeasuringVector.js';
import { loadVfrData } from '../services/VfrDataLoader.js';
import * as turf from '@turf/turf';


// ── Private tooltip formatting helpers ──────────────────────────────
// These build HTML strings for use inside Leaflet tooltip content.
// They mirror the sidebar's _formatLevelHtml / _formatSpeedHtml but are
// kept here so MapLayers has no dependency on the sidebar module.

// Escapes characters that would break innerHTML to prevent rendering issues.
const _safeEscape = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');


// ── Phase 12: Transition colour helper ────────────────────────────────────────
// Each transition branch gets a slightly different hue so overlapping branches
// are visually distinct. We do a simple HSL rotation: parse the hex color into
// H/S/L, shift H by a fixed amount per transition index, and convert back.

// Converts a 6-digit hex colour (#rrggbb) to an [h, s, l] triple.
// H is 0-360, S and L are 0-1.
const _hexToHsl = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];  // achromatic (grey)
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
};

// Converts HSL (H: 0-360, S: 0-1, L: 0-1) back to a #rrggbb hex string.
const _hslToHex = (h, s, l) => {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;
  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

// Returns a version of 'baseHex' with its hue rotated by 'index * 25' degrees.
// Index 0 → 25°, index 1 → 50°, etc. — gives each transition a distinct tint
// while staying within the same colour family as the procedure's main colour.
const _transitionColor = (baseHex, index) => {
  if (!baseHex || !baseHex.startsWith('#') || baseHex.length < 7) return baseHex;
  try {
    const [h, s, l] = _hexToHsl(baseHex);
    const newH = (h + 25 * (index + 1)) % 360;
    return _hslToHex(newH, Math.max(0.4, s), Math.max(0.35, Math.min(0.65, l)));
  } catch {
    return baseHex;  // fallback: keep original colour on parse error
  }
};

// Formats an altitude restriction for a map label using ATC notation.
// Above → underline, Below → overline, At → plain text.
const _tooltipLevelHtml = (condition, value) => {
  if (!condition || !value) return '';
  const safe = _safeEscape(value);
  if (condition === 'Above') return `<u>${safe}</u>`;
  if (condition === 'Below') return `<span style="text-decoration:overline">${safe}</span>`;
  return safe;
};

// Formats a speed restriction for a map label using ATC notation.
// At → "@" prefix, At Least → ">" prefix, Less Than → "<" prefix.
const _tooltipSpeedHtml = (condition, value) => {
  if (!condition || !value) return '';
  const safe = _safeEscape(value);
  if (condition === 'At') return `@${safe}`;
  if (condition === 'At Least') return `&gt;${safe}`;
  if (condition === 'Less Than') return `&lt;${safe}`;
  return safe;
};


// ── Module-level variables for interactive drawing modes ────
// These are set by enableSnapMode / enableFreeDrawMode and read
// by the marker click handlers that are created in renderFixes.

// When non-null, the app is in snap-to-fix mode.
// Clicking a waypoint marker will call this function with the fix's data.
let _snapCallback = null;

// When non-null, the app is in free-draw (click-anywhere) mode.
let _freeDrawCallback = null;

// The actual Leaflet event handler function attached to the map in free-draw mode.
// Stored so we can remove it precisely when disabling free-draw mode.
let _mapFreeDrawHandler = null;

// A reference to the Leaflet map, stored when renderFixes() is called.
// Needed by marker click handlers to open popups without the map being passed in.
let _mapRef = null;

// Helper to determine if any interactive drawing/measuring tool is active.
const isAnyDrawingToolActive = () => {
  return !!_snapCallback || !!_freeDrawCallback || !!_ghostSnapCallback || isMeasuringVectorActive();
};

// ── Measurement labels ────────────────────────────────────────────────
// A LayerGroup containing DivIcon markers placed at the midpoint of each
// procedure segment. Each marker shows the distance (NM) and magnetic
// bearing for that leg. Visibility is toggled by the user.
let _measurementLayer = null;
let _measurementsVisible = false;

// ── Holding pattern markers ───────────────────────────────────────────
// A LayerGroup containing "H" DivIcon markers positioned next to each
// waypoint that has been designated as a holding point. Rebuilt any time
// the active sequence changes and cleared when the drawing session ends.
let _holdingMarkersLayer = null;

// Set of fix idents (uppercase) whose ghost fix labels should be hidden because
// they are currently designated as holding points. The "H" badge already provides
// the primary identification; the ghost label's white ident text behind it causes
// visual clutter. Managed by updateHoldingMarkers / clearHoldingMarkers.
let _suppressedGhostIdents = new Set();

// Temporary non-draggable marker shown while a custom-drop point is pending
// the restriction form. Replaced by the real draggable marker on commit.
let _pendingCustomMarker = null;

// ── Highlight system (normal / viewer mode) ───────────────────────────────
// Set of ident strings (uppercase) that the user has clicked to highlight.
// Clicking a fix in normal mode (no active drawing) highlights it in place
// of the removed popup. Ctrl+Click adds to the set; clicking blank map space
// clears all highlights.
let _highlightedFixes = new Set();
let _waypointLayerRef = null;  // stored so _clearHighlights() can iterate markers

// ── Phase 14: Fix Virtualization ──────────────────────────────────────────────
// Instead of creating all ~3 000+ Leaflet markers up-front, we keep the raw
// fix data in _allFixData and only instantiate a marker when a fix needs to be
// visible (in-sequence, matches search, or within viewport when zoomed in).
//
// _fixMarkerMap holds every marker that is CURRENTLY on the map so we can
// remove the ones that no longer need to be shown without iterating the full set.
//
// _lastFilterArgs caches the most recent filterWaypoints arguments so that the
// viewport-change handler (map pan/zoom) can re-run the filter automatically.
let _allFixData = [];           // raw fix objects from renderFixes()
let _fixMarkerMap = new Map();    // ident.toUpperCase() → Leaflet circleMarker
let _lastFilterArgs = null;        // { searchTerm, activePoints, sequenceColor }

// ── Context menu ──────────────────────────────────────────────────────────
// A single reusable DOM element for the right-click context menu shown when
// the user right-clicks an in-sequence fix during snap-to-fix mode.
//
// Phase 12: the menu now also shows a "Add Transition" option whose label
// adapts to the procedure type (STAR/IAC → inbound, SID → outbound).
// The callbacks object was extended to include:
//   onAddTransition(fixIdent, direction) — fired when the transition option is clicked
//   procedureType()                      — returns the current procedure type string
//   isInTransitionMode()                 — returns true if already drawing a transition
// Callbacks are provided by main.js via setContextMenuCallbacks().
let _contextMenuEl = null;
let _contextMenuCallbacks = null;  // { isInSequence, onRemove, onEdit }

// ── Custom drop overlay ───────────────────────────────────────────────────
// When active, clicking blank map areas in snap mode drops a custom coordinate
// point. Works alongside snap mode so snap and free-click can both be used
// within the same route procedure drawing session.
let _customDropCallback = null;
let _customDropMapHandler = null;

// ── Cross-layer label dedup ───────────────────────────────────────────────
// Populated by renderNavaids and renderAerodromes with their label positions.
// _applyGhostLabels re-seeds its dedup set from these coords at whatever
// quantum is appropriate for the current zoom, suppressing ghost fix labels
// wherever another layer already occupies the same visual grid cell.
let _crossLayerOccupiedCoords = [];  // [lat, lon] pairs — quantum-agnostic

// Tracks which quantum was last used so _applyGhostLabels can skip the
// full rebind pass when the zoom level stays within the same quantum tier.
let _currentLabelQuantum = null;

// ── Ghost snap mode (Builder) ─────────────────────────────────────────────
// Ghost dots (renderGhostFixes) serve as the click/hover targets in builder
// snap mode. The pane starts with pointer-events:none; enabling ghost snap mode
// sets it to auto so Leaflet events reach the individual marker SVG paths.
// Individual markers are created with interactive:true so their SVG paths
// respond once the pane allows events.
let _ghostMarkers = [];     // every marker created by renderGhostFixes
let _ghostSnapCallback = null;   // set by enableGhostSnapMode; null otherwise
let _ghostMapRef = null;   // map ref kept for hover glow management
let _ghostHoverMarker = null;   // single DivIcon shown over hovered ghost dot


// ── Phase 39: VFR Corridors (REA/REH) ──────────────────────────────────────
// Dedicated LayerGroups for VFR corridor polylines and forced waypoints.
let _reaLayerGroup = null;
let _rehLayerGroup = null;
let _vfrWaypointsLayer = null;
let _vfrFlowLayer = null;
let _vfrData = null;
let _vfrLayersInitialized = false;


// ── RENDERING FUNCTIONS ─────────────────────────────────────


// This function renders a set of airport markers on the map.
//
// 'mapInstance' — the Leaflet map to draw on.
// 'airports'    — array from DataLoader: [{ icao, name, lat, lon }, ...]
const renderAirports = (mapInstance, airports) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderAirports: No map instance provided.');
    return;
  }
  if (!airports || airports.length === 0) {
    console.warn('[MapLayers] renderAirports: Empty airport array. Nothing to render.');
    return;
  }

  airports.forEach((airport) => {
    if (!airport.lat || !airport.lon || !airport.icao) {
      console.warn('[MapLayers] Skipping airport with incomplete data:', airport);
      return;
    }
    L.marker([airport.lat, airport.lon])
      .addTo(mapInstance)
      .bindPopup(
        `<div style="font-family:'JetBrains Mono';font-size:12px;font-weight:bold;">${airport.icao}</div>` +
        `<div style="font-family:Inter;font-size:11px;">${airport.name}</div>`
      );
  });

  console.log(`[MapLayers] Rendered ${airports.length} airport markers.`);
};


// Phase 29: Delayed Tooltip Helper
// ─────────────────────────────────────────────────────────────────────────────
// Replaces direct `marker.bindTooltip(...)` calls for non-permanent hover tooltips.
// Instead of Leaflet's default behaviour (tooltip appears instantly on mouseover),
// this pattern starts a 2-second timer on mouseover and only opens the tooltip if
// the cursor is STILL over the marker when the timer fires.
//
// Why: hover tooltips on dense map elements (hundreds of fix labels, threshold
// markers, etc.) create visual noise when panning. The 2-second delay ensures
// tooltips only appear when the user is genuinely inspecting a point.
//
// 'marker'  — any Leaflet layer that supports bindTooltip / openTooltip.
// 'content' — tooltip HTML or plain text string.
// 'options' — Leaflet tooltip options (direction, className, offset, etc.).
//             'permanent' must NOT be set to true here — use bindTooltip directly
//             for permanent labels.
const _bindDelayedTooltip = (marker, content, options = {}) => {
  let _hoverTimer = null;
  let _activeTooltip = null;

  marker.on('mouseover', (e) => {
    if (isAnyDrawingToolActive()) return;

    _hoverTimer = setTimeout(() => {
      if (!isAnyDrawingToolActive() && _mapRef) {
        _activeTooltip = L.tooltip({ ...options, permanent: false, interactive: false })
          .setLatLng(e.latlng || marker.getLatLng())
          .setContent(content)
          .addTo(_mapRef);
      }
    }, 2000);
  });

  marker.on('mouseout', () => {
    if (_hoverTimer !== null) {
      clearTimeout(_hoverTimer);
      _hoverTimer = null;
    }
    if (_activeTooltip && _mapRef) {
      _mapRef.removeLayer(_activeTooltip);
      _activeTooltip = null;
    }
  });
};

/**
 * Helper: Calculates turn angle between three points in degrees.
 * 0 is straight, 90 is right turn, -90 is left turn.
 */
const _calculateAngle = (p1, p2, p3) => {
  const angle1 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const angle2 = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]);
  let diff = (angle2 - angle1) * 180 / Math.PI;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
};

// Similar to _bindDelayedTooltip, but uses L.popup to show HTML content
// as a pseudo-tooltip. This is useful when the marker already has a permanent
// tooltip (like NAVAIDs) and we need a second information overlay on hover.
const _bindDelayedInfoPopup = (marker, latlng, html) => {
  let _hoverTimer = null;
  let _activePopup = null;

  marker.on('mouseover', () => {
    if (isAnyDrawingToolActive()) return;
    _hoverTimer = setTimeout(() => {
      if (!isAnyDrawingToolActive() && _mapRef) {
        _activePopup = L.popup({ className: 'navaid-popup', autoPan: false, closeButton: false })
          .setLatLng(latlng)
          .setContent(html)
          .openOn(_mapRef);
      }
    }, 2000);
  });

  marker.on('mouseout', () => {
    if (_hoverTimer !== null) {
      clearTimeout(_hoverTimer);
      _hoverTimer = null;
    }
    if (_activePopup && _mapRef) {
      _mapRef.closePopup(_activePopup);
      _activePopup = null;
    }
  });
};


// This function renders named fix/waypoint markers on the map.
// Each waypoint is drawn as a small L.circleMarker (fixed pixel size at all zooms).
//
// The markers have smart click behavior:
//   • In snap-to-fix mode → clicking calls the snap callback with the fix's data.
//   • In free-draw mode   → click is ignored (user draws by clicking blank map areas).
//   • In normal mode      → clicking opens a popup with the fix's identifier and type.
//
// All markers are collected into a Leaflet LayerGroup and returned so the sidebar
// toggle can show/hide all waypoints with one command.
//
// 'mapInstance' — the Leaflet map to draw on.
// 'fixes'       — array from DataLoader: [{ ident, lat, lon, tipo }, ...]
//
// Returns: Leaflet LayerGroup containing all markers, or null on failure.
// Phase 14: Creates a single Leaflet circleMarker for a fix and wires its
// click and contextmenu handlers. Called lazily by filterWaypoints the first
// time a fix needs to be shown rather than up-front in renderFixes().
//
// 'fix' — raw fix object from _allFixData: { ident, lat, lon, ... }
const _createFixMarker = (fix) => {
  const marker = L.circleMarker([fix.lat, fix.lon], {
    radius: 3,
    color: '#7ec8e3',
    fillColor: '#7ec8e3',
    fillOpacity: 0.75,
    weight: 1,
    className: 'fix-marker-svg'
  });

  marker.defaultStyle = { color: '#7ec8e3', fillColor: '#7ec8e3', fillOpacity: 0.75, radius: 3, weight: 1 };
  marker.fixData = fix;

  // Start with a delayed hover tooltip — filterWaypoints will upgrade to permanent when
  // the fix enters a sequence or search result. Phase 29: tooltip appears after 2s hover.
  _bindDelayedTooltip(marker, fix.ident, {
    direction: 'top',
    className: 'fix-tooltip',
    offset: [0, -4]
  });

  marker.on('click', (e) => {
    L.DomEvent.stop(e);

    if (isMeasuringVectorActive()) {
      handleMVClick(e.latlng, _mapRef);
      return;
    }

    if (_snapCallback) {
      _snapCallback(marker.fixData);
    }
    // In view mode (no tool active), clicking does nothing.
  });

  marker.on('contextmenu', (e) => {
    L.DomEvent.stop(e);
    if (!_snapCallback && !_ghostSnapCallback) return;
    const id = (marker.fixData?.ident || '').toUpperCase();
    if (!_contextMenuCallbacks?.isInSequence?.(id)) return;
    _showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id);
  });

  return marker;
};


// Phase 14: Applies the correct visual style to a currently-visible fix marker
// based on its relationship to the active procedure and search term.
// Extracted so both filterWaypoints and the viewport-refresh path share the logic.
//
// 'marker'            — a Leaflet circleMarker from _fixMarkerMap
// 'ident'             — the fix's ident string (already uppercased)
// 'activeMap'         — Map<ident → point> for the current procedure sequence
// 'isFiltering'       — true when a search term is active
// 'term'              — uppercased search term (empty string when not filtering)
// 'sequenceColor'     — hex color string for in-sequence fix markers
// 'suppressMatchLabel'— when true, matched markers get bright style but NO permanent
//                       label (caller provides a DivIcon highlight overlay instead)
const _styleFixMarker = (marker, ident, activeMap, isFiltering, term, sequenceColor, suppressMatchLabel = false) => {
  const inSequence = activeMap.has(ident);
  const tooltipEl = marker.getTooltip()?.getElement();
  const baseRadius = marker.defaultStyle?.radius || 3;

  if (inSequence) {
    // Full-brightness permanent label with ATC restriction text.
    const pt = activeMap.get(ident);
    const levelHtml = _tooltipLevelHtml(pt.levelCondition, pt.levelValue);
    const speedHtml = _tooltipSpeedHtml(pt.speedCondition, pt.speedValue);
    const restrParts = [levelHtml, speedHtml].filter(Boolean);
    const restrLine = restrParts.length
      ? `<div class="fix-label-restriction">${restrParts.join(' · ')}</div>`
      : '';
    const holdingLine = pt.isHolding
      ? `<div class="fix-label-holding">H: ${_safeEscape(pt.holdingBearing || '---')}° ${_safeEscape(pt.holdingSide || 'RIGHT')}</div>`
      : '';
    // Phase 24 Fix: Ident labels for in-sequence fixes are now considered unnecessary/redundant
    // as the Ghost Dot Layer (Phase 11) already provides names for all fixes.
    // The procedure point tooltip now only shows restrictions and holding info.
    const labelHtml = `${restrLine}${holdingLine}`.trim();

    marker.unbindTooltip();
    if (labelHtml) {
      marker.bindTooltip(labelHtml, { permanent: true, direction: 'top', className: 'fix-label', offset: [0, -4] });
    }
    marker.setStyle({ color: '#ffffff', fillColor: sequenceColor, fillOpacity: 1, opacity: 1, weight: 2.5 });
    if (marker.setRadius) marker.setRadius(Math.max(baseRadius + 3, 6));
    const newEl = marker.getTooltip()?.getElement();
    if (newEl) newEl.style.setProperty('opacity', '1', 'important');

  } else if (isFiltering) {
    // Search match: bright + clickable. Label is suppressed when the caller provides
    // a DivIcon highlight overlay (Phase 15 highlight parity mode).
    marker.setStyle({ color: '#ffffff', fillColor: marker.defaultStyle?.fillColor || '#7ec8e3', fillOpacity: 1, opacity: 1, weight: 2 });
    if (marker.setRadius) marker.setRadius(Math.max(baseRadius + 2, 5));
    if (suppressMatchLabel) {
      // Caller shows a DivIcon glow overlay — revert to delayed hover tooltip only.
      marker.unbindTooltip();
      _bindDelayedTooltip(marker, ident, { direction: 'top', className: 'fix-tooltip', offset: [0, -4] });
    } else {
      // Standard builder search: highlighted prefix in permanent label above the dot.
      const matchLen = term.length;
      const highlighted =
        `<span class="fix-label-highlight">${_safeEscape(ident.slice(0, matchLen))}</span>` +
        _safeEscape(ident.slice(matchLen));
      marker.unbindTooltip();
      marker.bindTooltip(highlighted, { permanent: true, direction: 'top', className: 'fix-label', offset: [0, -4] });
      const newEl = marker.getTooltip()?.getElement();
      if (newEl) newEl.style.setProperty('opacity', '1', 'important');
    }

  } else {
    // Viewport-visible but not in sequence and not searched — faded style.
    // Only reaches this branch in viewport-culling mode (zoom ≥ 10, no search term).
    // When ghost snap mode is active (suppressMatchLabel true), the ghost layer already
    // shows permanent labels for all fixes — binding another permanent label here would
    // create duplicate labels at the same map position. Use a delayed tooltip instead.
    marker.unbindTooltip();
    if (suppressMatchLabel) {
      _bindDelayedTooltip(marker, ident, { direction: 'top', className: 'fix-tooltip', offset: [0, -4] });
    } else {
      marker.bindTooltip(_safeEscape(ident), { permanent: true, direction: 'top', className: 'fix-label', offset: [0, -4] });
      const newEl = marker.getTooltip()?.getElement();
      if (newEl) newEl.style.setProperty('opacity', '0.18', 'important');
    }
    marker.setStyle({ color: marker.defaultStyle?.color || '#7ec8e3', fillColor: marker.defaultStyle?.fillColor || '#7ec8e3', fillOpacity: 0.15, opacity: 0.15, weight: 1 });
    if (marker.setRadius) marker.setRadius(baseRadius);
  }
};


// Phase 14: Viewport-change handler wired to map 'moveend' and 'zoomend' events.
// Re-runs filterWaypoints with the cached args whenever the user pans or zooms
// so viewport-culled markers are updated to reflect the new visible area.
const _onViewportChange = () => {
  if ((!_snapCallback && !_ghostSnapCallback) || !_waypointLayerRef || !_lastFilterArgs) return;
  filterWaypoints(
    _waypointLayerRef,
    _lastFilterArgs.searchTerm,
    _lastFilterArgs.activePoints,
    _lastFilterArgs.sequenceColor,
    _lastFilterArgs.suppressMatchLabel
  );
};


// Registers all raw fix data and returns an empty LayerGroup.
// Phase 14: no Leaflet markers are created here — they are instantiated lazily
// by filterWaypoints() only when a fix is actually needed on screen.
// This eliminates the ~3 000 DOM elements that were causing Builder Mode lag.
//
// 'mapInstance' — the Leaflet map
// 'fixes'       — array of { ident, lat, lon, tipo, ... } from DataLoader
const renderFixes = (mapInstance, fixes) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderFixes: No map instance provided.');
    return null;
  }
  if (!fixes || fixes.length === 0) {
    console.warn('[MapLayers] renderFixes: No fix data provided. Nothing to render.');
    return null;
  }

  _mapRef = mapInstance;

  // Store all fix data for lazy marker creation.
  _allFixData = fixes.filter((f) => f.ident && f.lat != null && f.lon != null);

  const waypointLayer = L.layerGroup();
  _waypointLayerRef = waypointLayer;

  // Wire viewport-change events so the culled marker set updates on pan/zoom.
  mapInstance.on('moveend zoomend', _onViewportChange);

  // Map click handler: de-highlight all highlighted fixes when the user clicks
  // on blank map space. Marker click handlers call L.DomEvent.stop(e) so this
  // handler only fires for genuine empty-area clicks.
  mapInstance.on('click', () => {
    if (_highlightedFixes.size > 0) _clearHighlights();
  });

  console.log(`[MapLayers] Registered ${_allFixData.length} fix records (no markers created yet).`);
  return waypointLayer;
};


// This function draws a SID (Standard Instrument Departure) as a blue polyline.
//
// 'mapInstance' — the Leaflet map to draw on.
// 'sidData'     — { name: 'ASPAT1A', waypoints: [[-23.4, -46.5], ...] }
const renderSID = (mapInstance, sidData) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderSID: No map instance provided.');
    return;
  }
  if (!sidData || !sidData.waypoints || sidData.waypoints.length < 2) {
    console.warn(`[MapLayers] renderSID: "${sidData?.name}" needs ≥2 waypoints. Skipping.`);
    return;
  }
  L.polyline(sidData.waypoints, { color: '#3b9eff', weight: 2, opacity: 0.85 })
    .addTo(mapInstance)
    .bindTooltip(`SID: ${sidData.name}`, { sticky: true });
  console.log(`[MapLayers] Rendered SID: ${sidData.name}`);
};


// This function draws a STAR (Standard Terminal Arrival Route) as an amber polyline.
//
// 'mapInstance' — the Leaflet map to draw on.
// 'starData'    — { name: 'ASPAT1A', waypoints: [[-23.4, -46.5], ...] }
const renderSTAR = (mapInstance, starData) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderSTAR: No map instance provided.');
    return;
  }
  if (!starData || !starData.waypoints || starData.waypoints.length < 2) {
    console.warn(`[MapLayers] renderSTAR: "${starData?.name}" needs ≥2 waypoints. Skipping.`);
    return;
  }
  L.polyline(starData.waypoints, { color: '#ffb547', weight: 2, opacity: 0.85 })
    .addTo(mapInstance)
    .bindTooltip(`STAR: ${starData.name}`, { sticky: true });
  console.log(`[MapLayers] Rendered STAR: ${starData.name}`);
};


// ── DRAWING MODE FUNCTIONS ───────────────────────────────────


// Activates snap-to-fix mode. While active, clicking any waypoint marker
// will call 'callback' with the fix's data object ({ ident, lat, lon, tipo }).
//
// Per Phase 6, markers are rendered FADED (not bright) when snap mode activates.
// Their labels switch from hover-only to permanent so the user can read the
// identifiers at a glance. The search bar then highlights matching fixes.
//
// 'waypointLayer' — the LayerGroup returned by renderFixes()
// 'callback'      — function called with the clicked fix's data
// Activates snap-to-fix mode. Stores the callback so marker click handlers can
// fire it. Phase 14: no markers exist yet — filterWaypoints() called shortly
// after (by handleStartDrawing) will create the initial set of visible markers.
//
// 'waypointLayer' — the LayerGroup returned by renderFixes()
// 'callback'      — function(fixData) called when a waypoint marker is clicked
const enableSnapMode = (waypointLayer, callback) => {
  if (!waypointLayer) {
    console.error('[MapLayers] enableSnapMode: waypointLayer is null. Cannot enable snap mode.');
    return;
  }
  _snapCallback = callback;
  console.log('[MapLayers] Snap-to-fix mode ENABLED. Click waypoints to add them.');
};


// Deactivates snap-to-fix mode and removes all virtualized fix markers from the map.
// Phase 14: instead of reverting 3000 markers to hover tooltips, we simply tear down
// the small set of currently visible markers. The layer remains on the map but will
// be empty (except for threshold markers added by addThresholdsToLayer).
//
// 'waypointLayer' — the same LayerGroup passed to enableSnapMode()
const disableSnapMode = (waypointLayer) => {
  _snapCallback = null;
  _lastFilterArgs = null;

  // Remove every virtualized fix marker from the layer.
  if (waypointLayer) {
    _fixMarkerMap.forEach((marker) => waypointLayer.removeLayer(marker));
  }
  _fixMarkerMap.clear();

  console.log('[MapLayers] Snap-to-fix mode DISABLED. Virtualized markers cleared.');
};


// Activates free-draw mode. While active, clicking anywhere on the map
// (on blank areas — not on markers) calls 'callback' with { lat, lon }.
// The map cursor changes to a crosshair to signal this mode.
//
// 'mapInstance' — the Leaflet map to attach the click listener to
// 'callback'    — function called with { lat, lon } when the map is clicked
const enableFreeDrawMode = (mapInstance, callback) => {
  if (!mapInstance) {
    console.error('[MapLayers] enableFreeDrawMode: No map instance provided.');
    return;
  }
  _freeDrawCallback = callback;

  // Create and store the handler function so we can remove it precisely later.
  _mapFreeDrawHandler = (e) => {
    if (_freeDrawCallback) {
      _freeDrawCallback({ lat: e.latlng.lat, lon: e.latlng.lng });
    }
  };

  mapInstance.on('click', _mapFreeDrawHandler);
  mapInstance.getContainer().style.cursor = 'crosshair';
  console.log('[MapLayers] Free-draw mode ENABLED. Click map to place vertices.');
};


// Deactivates free-draw mode and restores the default map cursor.
//
// 'mapInstance' — the same map instance passed to enableFreeDrawMode()
const disableFreeDrawMode = (mapInstance) => {
  _freeDrawCallback = null;

  if (mapInstance && _mapFreeDrawHandler) {
    mapInstance.off('click', _mapFreeDrawHandler);
    _mapFreeDrawHandler = null;
    mapInstance.getContainer().style.cursor = '';
  }

  console.log('[MapLayers] Free-draw mode DISABLED.');
};


// Updates the live Leaflet shape on the map to reflect the current sequence of points
// in the DrawingState. Automatically creates the shape on first call, then updates it.
//
// The shape type (polyline vs polygon) is determined by DrawingState.isAreaType().
// The dash pattern is derived from DrawingState.metadata.pattern.
//
// If fewer than 2 points exist, the shape is removed (can't draw a line from one point).
//
// 'mapInstance'  — the Leaflet map
// 'drawingState' — the shared DrawingState singleton object from DrawingState.js
// 'pendingPreview' — optional { lat, lon } object for a point that has been placed but
// not yet committed to DrawingState (e.g. a custom drop point pending the restriction form).
// When provided, a dashed preview segment is drawn from the last committed point to this
// position so the user gets immediate visual feedback without waiting for form submission.
const updateActiveShape = (mapInstance, drawingState, pendingPreview = null) => {
  if (!mapInstance || !drawingState) {
    console.error('[MapLayers] updateActiveShape: mapInstance or drawingState is missing.');
    return;
  }

  // Start with the live points array (transition branch or common route, depending on mode).
  let latLngs = drawingState.points.map((p) => [p.lat, p.lon]);

  // Append the pending-preview coordinate so the polyline visually extends to the
  // unconfirmed position. The preview segment is removed on the next updateActiveShape
  // call (when the point is committed and latLngs is rebuilt from DrawingState.points).
  if (pendingPreview && pendingPreview.lat != null && pendingPreview.lon != null) {
    latLngs = [...latLngs, [pendingPreview.lat, pendingPreview.lon]];
  }

  // Phase 12 — INBOUND transition preview: append the convergence fix to the rendered
  // path so the user can see the line they are drawing will connect to that specific
  // fix on the common route. The fix is NOT in DrawingState.points (it will be stored
  // in 'convergence_fix', not duplicated inside 'points'), so we look it up from the
  // locked common_route snapshot. Only add the preview when at least 1 transition
  // point has been placed (avoids showing a dangling line at the very start).
  if (
    drawingState._inTransitionMode &&
    drawingState._transitionDirection === 'inbound' &&
    drawingState.convergencePointIdent &&
    latLngs.length >= 1
  ) {
    const convergePt = (drawingState.common_route || []).find(
      (p) => (p.ident || '').toUpperCase() === drawingState.convergencePointIdent.toUpperCase()
    );
    if (convergePt) {
      latLngs = [...latLngs, [convergePt.lat, convergePt.lon]];
    }
  }

  // Map pattern names to Leaflet dashArray strings.
  const dashMap = { solid: null, dashed: '10, 8', dotted: '3, 6' };
  const shapeOptions = {
    color: drawingState.metadata.color,
    weight: 2.5,
    opacity: 0.9,
    dashArray: dashMap[drawingState.metadata.pattern] ?? null
  };

  // Remove the shape if we now have fewer than 2 points
  if (latLngs.length < 2) {
    if (drawingState.activeShape) {
      mapInstance.removeLayer(drawingState.activeShape);
      drawingState.activeShape = null;
    }
    return;
  }

  if (drawingState.activeShape) {
    // Shape already exists — update its path and style in place.
    // This is more efficient than removing and re-creating the shape.
    drawingState.activeShape.setLatLngs(latLngs);
    drawingState.activeShape.setStyle(
      drawingState.isAreaType()
        ? { ...shapeOptions, fillColor: drawingState.metadata.color, fillOpacity: 0.15 }
        : shapeOptions
    );
  } else {
    // First time creating the shape for this session.
    if (drawingState.isAreaType()) {
      drawingState.activeShape = L.polygon(latLngs, {
        ...shapeOptions,
        fillColor: drawingState.metadata.color,
        fillOpacity: 0.15
      }).addTo(mapInstance);
    } else {
      drawingState.activeShape = L.polyline(latLngs, shapeOptions).addTo(mapInstance);
    }

    // Bind a sticky hover tooltip so the procedure name appears when the user
    // hovers over the drawn line, without needing to look at the sidebar.
    drawingState.activeShape.bindTooltip(drawingState.metadata.name, {
      sticky: true,
      className: 'proc-hover-tooltip'
    });
  }
};


// Removes the active shape from the map and clears the reference in drawingState.
// Also clears any common-route ghost line that was shown during transition drawing.
// Called when a drawing session is cancelled or exported.
//
// 'mapInstance'  — the Leaflet map
// 'drawingState' — the shared DrawingState singleton
const clearActiveShape = (mapInstance, drawingState) => {
  if (drawingState && drawingState.activeShape) {
    mapInstance.removeLayer(drawingState.activeShape);
    drawingState.activeShape = null;
    console.log('[MapLayers] Active shape cleared from map.');
  }
  // Always clear the ghost too — if we are not in transition mode this is a no-op.
  clearCommonRouteGhost(mapInstance);
};


// Filters the waypoint layer based on a live search term and the active procedure sequence.
// Called on every keystroke in the Builder search bar AND after every point add/remove
// so the display always reflects both the search and the current sequence state.
//
// Priority rules (highest to lowest):
//   1. Waypoints IN the active procedure → always fully opaque, procedure color, with ATC
//      restriction annotations shown directly in the permanent map label.
//   2. Waypoints that MATCH the search term → fully bright; the matching prefix characters
//      are highlighted with a glow effect inside the label text.
//   3. All others → faded (no search active) or completely hidden (search is active).
//
// Matching logic: ident must START WITH the typed string (case-insensitive).
//
// 'waypointLayer'  — the LayerGroup returned by renderFixes()
// 'searchTerm'     — the string currently in the search input field (can be empty)
// 'activePoints'   — the full DrawingState.points array (not just idents) so restrictions
//                    can be read and displayed in the permanent label for each sequence fix.
// 'sequenceColor'  — the procedure's color (hex) used to fill sequence markers distinctly
// Phase 14: Adds/removes fix markers on demand instead of showing/hiding all 3000+.
// Only markers for in-sequence fixes, search-matching fixes, and (when no search term
// is active) viewport-visible fixes at zoom ≥ 10 are kept in the DOM.
// Everything else is never instantiated — or removed if it was previously visible.
//
// 'waypointLayer' — the LayerGroup returned by renderFixes()
// 'searchTerm'    — the current text in the Builder search box (may be empty)
// 'activePoints'  — the current procedure sequence from DrawingState.points
// 'sequenceColor' — hex color string used to tint in-sequence markers
// 'suppressMatchLabel' — Phase 15: when true, matched markers are made bright but have
//                        no permanent label; the caller renders a DivIcon glow overlay
//                        (via renderGlobalSearchHighlights) for visual highlight parity
//                        with View Mode.
const filterWaypoints = (waypointLayer, searchTerm, activePoints = [], sequenceColor = '#4ddb8d', suppressMatchLabel = false) => {
  if (!waypointLayer) return;

  // Cache for viewport-change re-renders triggered by map pan / zoom.
  _lastFilterArgs = { searchTerm, activePoints: activePoints.slice(), sequenceColor, suppressMatchLabel };

  const term = searchTerm.trim().toUpperCase();
  const isFiltering = term.length > 0;
  const activeMap = new Map(activePoints.map((p) => [p.ident.toUpperCase(), p]));

  // Viewport culling: when there is no search term, only render fixes that are
  // inside the current map bounds AND the zoom is high enough to make individual
  // fixes legible. This avoids blank-map syndrome without flooding the DOM.
  const bounds = _mapRef?.getBounds();
  const zoom = _mapRef?.getZoom() ?? 0;
  const showViewport = !isFiltering && (!!_snapCallback || !!_ghostSnapCallback) && zoom >= 10 && !!bounds;

  // Predicate: should this fix have a visible marker right now?
  const shouldShow = (fix) => {
    const ident = (fix.ident || '').toUpperCase();
    if (activeMap.has(ident)) return true;                           // always show in-sequence
    if (isFiltering) return ident.startsWith(term);         // search mode
    if (showViewport) return bounds.contains([fix.lat, fix.lon]);  // viewport culling
    return false;                                                    // hidden (no search, not in seq)
  };

  // ── Remove markers that no longer qualify ──────────────────────────────────
  const toRemove = [];
  _fixMarkerMap.forEach((marker, ident) => {
    if (!shouldShow(marker.fixData)) toRemove.push(ident);
  });
  toRemove.forEach((ident) => {
    waypointLayer.removeLayer(_fixMarkerMap.get(ident));
    _fixMarkerMap.delete(ident);
  });

  // ── Add / update markers that should be visible ────────────────────────────
  _allFixData.forEach((fix) => {
    if (!shouldShow(fix)) return;

    const ident = (fix.ident || '').toUpperCase();
    let marker = _fixMarkerMap.get(ident);

    if (!marker) {
      marker = _createFixMarker(fix);
      waypointLayer.addLayer(marker);
      _fixMarkerMap.set(ident, marker);
    }

    _styleFixMarker(marker, ident, activeMap, isFiltering, term, sequenceColor, suppressMatchLabel);
  });
};


// Phase 15: Returns all fix records whose ident starts with the given search term
// (case-insensitive prefix match). Used by main.js to:
//   1. Select the single matched fix when the user presses Enter in the Builder search bar.
//   2. Build the results array for renderGlobalSearchHighlights (highlight parity).
// Returns an empty array when searchTerm is blank.
const getFilteredFixes = (searchTerm) => {
  const term = (searchTerm || '').trim().toUpperCase();
  if (!term) return [];
  return _allFixData.filter((f) => (f.ident || '').toUpperCase().startsWith(term));
};


// This function adds runway threshold markers into an already-created waypoint
// LayerGroup so that thresholds and regular fixes are controlled by the same
// show/hide toggle and both respond to snap-to-fix mode.
//
// Threshold markers use amber styling so the user can visually tell them apart
// from the teal regular waypoints. They carry a 'defaultStyle' property so
// disableSnapMode() can restore the correct amber colour after snapping ends.
//
// 'waypointLayer' — the LayerGroup returned by renderFixes()
// 'thresholds'    — array from DataLoader.loadRunwayThresholds()
const addThresholdsToLayer = (waypointLayer, thresholds) => {
  if (!waypointLayer) {
    console.error('[MapLayers] addThresholdsToLayer: waypointLayer is null. Cannot add thresholds.');
    return;
  }
  if (!thresholds || thresholds.length === 0) {
    console.warn('[MapLayers] addThresholdsToLayer: No threshold data provided. Nothing to add.');
    return;
  }

  const DEFAULT_THRESHOLD_STYLE = { color: '#ffb547', fillColor: '#ffb547', fillOpacity: 0.9, radius: 5, weight: 2 };

  thresholds.forEach((threshold) => {
    if (!threshold.ident || threshold.lat == null || threshold.lon == null) {
      console.warn('[MapLayers] Skipping threshold with incomplete data:', threshold);
      return;
    }

    // Amber circle — larger radius than regular waypoints so thresholds stand out.
    const marker = L.circleMarker([threshold.lat, threshold.lon], { ...DEFAULT_THRESHOLD_STYLE });

    // Store default style so disableSnapMode can restore amber after snap ends.
    marker.defaultStyle = { ...DEFAULT_THRESHOLD_STYLE };

    // Attach the threshold data so the snap callback receives it with the same
    // structure as a regular fix: { ident, lat, lon, tipo, airport }.
    marker.fixData = threshold;

    // Show the runway identifier after a 2-second hover — Phase 29 delayed tooltip.
    _bindDelayedTooltip(marker, threshold.ident, {
      direction: 'top',
      className: 'fix-tooltip',
      offset: [0, -6]
    });

    // Same unified click handler as regular waypoint markers.
    // Reads _snapCallback / _freeDrawCallback from module scope.
    marker.on('click', (e) => {
      L.DomEvent.stop(e);

      // Measuring Vector tool takes priority — route the threshold's coordinate
      // into the MV drawing flow so threshold markers work as origin/destination nodes.
      if (isMeasuringVectorActive()) {
        handleMVClick(e.latlng, _mapRef);
        return;
      }

      if (_snapCallback) {
        // Snap-to-fix mode: pass this threshold's data to the drawing orchestrator.
        _snapCallback(marker.fixData);

      } else if (!_freeDrawCallback) {
        // Normal mode: highlight this threshold, same as regular fix markers.
        // Popup removed per Phase 7.5 (replaced by highlight system).
        const id = (marker.fixData?.ident || '').toUpperCase();
        if (e.originalEvent?.ctrlKey) {
          _highlightFix(marker, !_highlightedFixes.has(id));
        } else {
          _clearHighlights();
          _highlightFix(marker, true);
        }
      }
    });

    waypointLayer.addLayer(marker);
  });

  console.log(`[MapLayers] Added ${thresholds.length} runway threshold markers to the layer.`);
};


// Turns the distance/heading segment labels on or off.
// When switching on, any existing labels are shown immediately.
// When switching off, the label layer is removed from the map but kept in memory
// so it can be re-shown without re-calculating.
//
// 'mapInstance' — the Leaflet map
// 'visible'     — boolean: true = show labels, false = hide them
const setMeasurementsVisible = (mapInstance, visible) => {
  _measurementsVisible = visible;

  if (!_measurementLayer) {
    _measurementLayer = L.layerGroup();
  }

  if (visible && mapInstance && !mapInstance.hasLayer(_measurementLayer)) {
    _measurementLayer.addTo(mapInstance);
  } else if (!visible && mapInstance && mapInstance.hasLayer(_measurementLayer)) {
    mapInstance.removeLayer(_measurementLayer);
  }
};


// Redraws the segment measurement labels (distance + magnetic bearing) for the
// current procedure. Called after every point add, remove, or reorder so the
// labels always match the live sequence. If measurements are hidden, this only
// updates the layer's data — the labels remain invisible until re-enabled.
//
// Labels are placed at the midpoint of each leg using a Leaflet DivIcon so
// they can be styled as clean floating text with no background box or border.
//
// 'mapInstance'  — the Leaflet map
// 'drawingState' — the shared DrawingState singleton
const updateMeasurementLabels = (mapInstance, drawingState) => {
  if (!mapInstance) return;

  // Initialize the layer if first call
  if (!_measurementLayer) {
    _measurementLayer = L.layerGroup();
  }

  // Clear any previous labels
  _measurementLayer.clearLayers();

  const points = drawingState?.points || [];

  // Need at least 2 points to draw a segment
  if (!drawingState?.isActive || points.length < 2 || drawingState.isAreaType()) return;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const distNm = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    const trueBrg = calculateTrueBearing(p1.lat, p1.lon, p2.lat, p2.lon);
    const magBrg = trueToMagnetic(trueBrg);

    // Format: "12.4 NM  245°"  — no "M" suffix, the degree sign is self-explanatory
    const labelText = `${distNm.toFixed(1)} NM  ${String(Math.round(magBrg)).padStart(3, '0')}°`;

    // Place the label at the geographic midpoint of this segment
    const midLat = (p1.lat + p2.lat) / 2;
    const midLon = (p1.lon + p2.lon) / 2;

    // DivIcon with no default Leaflet decoration — pure floating text
    const icon = L.divIcon({
      className: 'seg-measurement-label',
      html: `<span>${labelText}</span>`,
      iconSize: [0, 0],   // zero size so Leaflet doesn't offset or add padding
      iconAnchor: [0, 0]
    });

    L.marker([midLat, midLon], { icon, interactive: false, zIndexOffset: -100 })
      .addTo(_measurementLayer);
  }

  // If the user has measurements visible, make sure the layer is on the map
  if (_measurementsVisible && !mapInstance.hasLayer(_measurementLayer)) {
    _measurementLayer.addTo(mapInstance);
  }
};


// Removes ALL measurement labels and resets visibility.
// Called when a drawing session ends (save or cancel).
//
// 'mapInstance' — the Leaflet map
const clearMeasurementLabels = (mapInstance) => {
  if (_measurementLayer) {
    if (mapInstance && mapInstance.hasLayer(_measurementLayer)) {
      mapInstance.removeLayer(_measurementLayer);
    }
    _measurementLayer.clearLayers();
  }
  _measurementsVisible = false;
};


// Renders a previously saved procedure from the database onto the map as a permanent
// Leaflet LayerGroup. Called at startup (to restore saved procedures across page reloads)
// and after every save so the newly saved procedure immediately appears in View mode.
//
// Phase 10 — Multi-branch support:
// Procedures now have a 'common_route' (the shared main body) plus optional 'transitions'
// (branch routes that each reconnect at a convergence fix on the common route).
// Old saves that used a flat 'points' array are normalized by ProcedureDatabase.loadAll()
// before arriving here, so this function only needs to handle the new schema.
//
// IMPORTANT: Everything — the polyline/polygon shape AND the per-waypoint name labels
// — is collected into a single L.layerGroup(). This is what makes the Hide button work
// correctly: calling map.removeLayer(group) wipes the common route, all branches, and all
// labels in one operation, leaving no orphaned elements behind.
//
// Returns the LayerGroup so main.js can track it for toggle / delete.
//
// 'mapInstance' — the Leaflet map to draw on
// 'procedure'   — a saved procedure object (from ProcedureDatabase.loadAll())
//                 must have: name, type, color, pattern, common_route[...], transitions[...]
const renderSavedProcedure = (mapInstance, procedure) => {
  if (!mapInstance || !procedure) {
    console.warn('[MapLayers] renderSavedProcedure: mapInstance or procedure is missing.');
    return null;
  }

  // Resolve the main route points — new schema uses 'common_route', old saves use 'points'.
  // ProcedureDatabase.loadAll() normalizes old saves, but we guard here for safety.
  const mainPoints = procedure.common_route || procedure.points || [];
  const transitions = procedure.transitions || [];

  if (!mainPoints || mainPoints.length < 2) {
    console.warn(`[MapLayers] renderSavedProcedure: "${procedure.name}" needs ≥2 common-route points. Skipping.`);
    return null;
  }

  // The group holds ALL shapes AND all waypoint labels across the common route and branches.
  // Toggle visibility by adding/removing this single group from the map.
  const group = L.layerGroup();

  // Map pattern names to Leaflet dashArray strings (same mapping as updateActiveShape)
  const dashMap = { solid: null, dashed: '10, 8', dotted: '3, 6' };
  const shapeOptions = {
    color: procedure.color,
    weight: 2.5,
    opacity: 0.9,
    dashArray: dashMap[procedure.pattern] ?? null
  };

  // Area types (CTR, FIS, TMA, ATZ) use a closed polygon; routes use an open polyline.
  const AREA_TYPES_LOCAL = ['CTR', 'FIS', 'TMA', 'ATZ'];
  const isAreaType = AREA_TYPES_LOCAL.includes(procedure.type);

  // ── Draw the common route (main body of the procedure) ──────────────────────
  const mainCoords = mainPoints.map((p) => [p.lat, p.lon]);
  let mainShape;
  if (isAreaType) {
    mainShape = L.polygon(mainCoords, {
      ...shapeOptions,
      fillColor: procedure.color,
      fillOpacity: 0.15
    });
  } else {
    mainShape = L.polyline(mainCoords, shapeOptions);
  }

  // Bind hover tooltip directly to the shape (L.layerGroup does not support bindTooltip).
  const routeLabel = transitions.length > 0
    ? `${procedure.name} (common route)`
    : procedure.name;
  mainShape.bindTooltip(routeLabel, { sticky: true, className: 'proc-hover-tooltip' });
  group.addLayer(mainShape);

  // ── Helper: render waypoint circles and name labels for a point array ────────
  // Used for both the common route and each transition branch.
  //
  // 'points'   — array of { ident, lat, lon, levelCondition, ..., isHolding, ... }
  // 'skipIdents' — Set of ident strings whose LABELS should be skipped (to avoid
  //               duplicating the label of the convergence fix which already appears
  //               in the common route rendering).
  const _renderPointLabels = (points, skipIdents = new Set()) => {
    points.forEach((pt) => {
      if (!pt.ident || pt.lat == null || pt.lon == null) return;

      // Colored circle at the waypoint position.
      L.circleMarker([pt.lat, pt.lon], {
        radius: 4,
        color: '#ffffff',
        fillColor: procedure.color,
        fillOpacity: 0.95,
        weight: 1.5,
        interactive: false
      }).addTo(group);

      // Skip the text label if this fix was already labeled in another part of the procedure.
      if (skipIdents.has((pt.ident || '').toUpperCase())) return;

      // Build restriction text using ATC notation.
      const levelHtml = _tooltipLevelHtml(pt.levelCondition, pt.levelValue);
      const speedHtml = _tooltipSpeedHtml(pt.speedCondition, pt.speedValue);
      const restrParts = [levelHtml, speedHtml].filter(Boolean);
      const restrLine = restrParts.length
        ? `<div class="fix-label-restriction">${restrParts.join(' · ')}</div>`
        : '';

      const icon = L.divIcon({
        className: 'proc-fix-label',
        html: `${restrLine}`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      L.marker([pt.lat, pt.lon], { icon, interactive: false }).addTo(group);

      // "H" badge with bearing/side text for holding fixes.
      if (pt.isHolding) {
        const bearingStr = pt.holdingBearing ? `${pt.holdingBearing}°` : '---';
        const sideStr = pt.holdingSide || 'RIGHT';
        const holdingIcon = L.divIcon({
          className: 'holding-badge-marker',
          html: `<div class="holding-badge-inner"><span class="holding-badge-h" style="color:${_safeEscape(procedure.color)};">H</span></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });
        L.marker([pt.lat, pt.lon], { icon: holdingIcon, interactive: false }).addTo(group);
      }
    });
  };

  // Render labels for all common-route points. Build a Set of their idents so we
  // can suppress duplicate labels on the convergence fix in the branches below.
  const mainIdentSet = new Set(mainPoints.map((p) => (p.ident || '').toUpperCase()));
  _renderPointLabels(mainPoints);

  // ── Draw each transition branch ──────────────────────────────────────────────
  // Phase 12: Each transition is rendered as a dashed line in a slightly shifted
  // hue to visually distinguish it from the solid common route and from other
  // transitions. The branch path is direction-aware:
  //
  //   INBOUND  (STAR/IAC): draw IAF → ... → convergence fix.
  //     The convergence fix is looked up from mainPoints and appended to the
  //     rendered coordinates, but is NOT a separate labeled waypoint (it already
  //     has a label from the common route rendering above).
  //
  //   OUTBOUND (SID): draw divergence fix → ... → exit.
  //     The divergence fix is looked up from mainPoints and prepended.
  //
  //   OLD FORMAT (no direction): render the raw points array as-is (backward compat).
  transitions.forEach((transition, transitionIndex) => {
    if (!transition || !transition.points) return;

    // Determine the full coordinate sequence for this branch including the
    // connecting fix (convergence or divergence) at the appropriate end.
    let branchPoints = transition.points.slice();

    if (transition.direction === 'inbound' && transition.convergence_fix) {
      // STAR/IAC inbound: the convergence fix is the LAST segment endpoint.
      // Look it up in the common route so we can draw the connecting segment.
      const convergePt = mainPoints.find(
        (p) => (p.ident || '').toUpperCase() === transition.convergence_fix.toUpperCase()
      );
      if (convergePt) {
        branchPoints = [...branchPoints, convergePt];  // append convergence fix at end
      }
    } else if (transition.direction === 'outbound' && transition.divergence_fix) {
      // SID outbound: the divergence fix is the FIRST segment endpoint.
      const divergePt = mainPoints.find(
        (p) => (p.ident || '').toUpperCase() === transition.divergence_fix.toUpperCase()
      );
      if (divergePt) {
        branchPoints = [divergePt, ...branchPoints];  // prepend divergence fix at start
      }
    }

    // Need at least 2 points to draw a line.
    if (branchPoints.length < 2) {
      console.warn(
        `[MapLayers] Transition "${transition.name}" in "${procedure.name}" ` +
        `has fewer than 2 renderable points after resolving connecting fix — skipping.`
      );
      return;
    }

    const branchCoords = branchPoints.map((p) => [p.lat, p.lon]);

    // Use a hue-shifted version of the procedure color for visual distinction.
    const branchColor = _transitionColor(procedure.color, transitionIndex);
    const branchLine = L.polyline(branchCoords, {
      ...shapeOptions,
      color: branchColor,
      dashArray: '8, 5',   // dashed line distinguishes transitions from solid common route
      opacity: 0.80
    });
    branchLine.bindTooltip(
      `${procedure.name} — ${transition.name}`,
      { sticky: true, className: 'proc-hover-tooltip' }
    );
    group.addLayer(branchLine);

    // Render point circles and labels for the BRANCH-ONLY waypoints (i.e. transition.points,
    // which does NOT include the convergence/divergence fix). Suppress any ident that is
    // already labeled in the common route (it will be in mainIdentSet).
    _renderPointLabels(transition.points, mainIdentSet);
  });

  // ── Leg Measurement Labels ───────────────────────────────────────────────────
  // Phase 13: measurement markers are placed in their own separate layerGroup
  // (measureGroup) so the Viewer Mode toggle can hide/show them independently
  // of the polylines and fix-label markers that live in 'group'.
  const measureGroup = L.layerGroup();

  if (!isAreaType) {

    // Helper: draws measurement labels for a given array of points into measureGroup.
    const _addMeasurementLabels = (points) => {
      if (points.length < 2) return;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (p1.lat == null || p1.lon == null || p2.lat == null || p2.lon == null) continue;

        const distNm = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        const trueBrg = calculateTrueBearing(p1.lat, p1.lon, p2.lat, p2.lon);
        const magBrg = trueToMagnetic(trueBrg);
        const labelText = `${distNm.toFixed(1)} NM  ${String(Math.round(magBrg)).padStart(3, '0')}°`;

        const midLat = (p1.lat + p2.lat) / 2;
        const midLon = (p1.lon + p2.lon) / 2;

        const measureIcon = L.divIcon({
          className: 'seg-measurement-label',
          html: `<span>${_safeEscape(labelText)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });
        L.marker([midLat, midLon], { icon: measureIcon, interactive: false, zIndexOffset: -100 })
          .addTo(measureGroup);
      }
    };

    _addMeasurementLabels(mainPoints);
    transitions.forEach((t) => _addMeasurementLabels(t.points));

    const branchLegCount = transitions.reduce((sum, t) => sum + Math.max(0, t.points.length - 1), 0);
    console.log(
      `[MapLayers] Leg measurements: ${mainPoints.length - 1} on common route` +
      (branchLegCount > 0 ? `, ${branchLegCount} on transitions` : '') +
      ` for "${procedure.name}".`
    );
  }

  // Add both groups to the map. measureGroup starts visible (same behaviour as before).
  group.addTo(mapInstance);
  measureGroup.addTo(mapInstance);

  const branchSummary = transitions.length > 0
    ? `, ${transitions.length} transition branch(es)`
    : '';
  console.log(
    `[MapLayers] Rendered "${procedure.name}" (${procedure.type}): ` +
    `${mainPoints.length} common-route pts${branchSummary}.`
  );

  // Return both layers so callers can toggle measurements independently.
  // 'layer'        — polylines, fix circles, fix labels (always on when procedure is visible)
  // 'measureLayer' — leg measurement text labels (can be hidden via Viewer toggle)
  return { layer: group, measureLayer: measureGroup };
};


// ── HIGHLIGHT HELPERS ──────────────────────────────────────────────────────
// Private helpers called by the marker click handler in renderFixes().
// They intentionally do NOT touch snap-mode styles — highlight only applies
// in normal mode (no active drawing session).


// Applies or removes the highlight style on a single marker and keeps
// _highlightedFixes in sync.
//
// 'marker' — a Leaflet circleMarker from the waypoint layer
// 'active' — true = highlight the marker, false = restore default style
const _highlightFix = (marker, active) => {
  const id = (marker.fixData?.ident || '').toUpperCase();
  if (active) {
    _highlightedFixes.add(id);
    marker.setStyle({
      color: '#ffffff',
      fillColor: marker.defaultStyle?.fillColor || '#7ec8e3',
      fillOpacity: 1,
      opacity: 1,
      weight: 2.5
    });
    if (marker.setRadius) marker.setRadius(6);
  } else {
    _highlightedFixes.delete(id);
    const style = marker.defaultStyle || { color: '#7ec8e3', fillColor: '#7ec8e3', fillOpacity: 0.75, radius: 3, weight: 1 };
    marker.setStyle(style);
    if (marker.setRadius) marker.setRadius(style.radius || 3);
  }
};


// Restores default styles for every currently highlighted marker and clears the Set.
// Called when the user clicks blank map space (de-select all).
const _clearHighlights = () => {
  if (!_waypointLayerRef || _highlightedFixes.size === 0) return;
  _waypointLayerRef.eachLayer((marker) => {
    const id = (marker.fixData?.ident || '').toUpperCase();
    if (_highlightedFixes.has(id)) {
      const style = marker.defaultStyle || { color: '#7ec8e3', fillColor: '#7ec8e3', fillOpacity: 0.75, radius: 3, weight: 1 };
      marker.setStyle(style);
      if (marker.setRadius) marker.setRadius(style.radius || 3);
    }
  });
  _highlightedFixes.clear();
};


// ── CONTEXT MENU HELPERS ───────────────────────────────────────────────────


// Returns the singleton context menu DOM element, creating it on first call.
// Registers document-level listeners to close the menu when the user clicks
// elsewhere or presses Escape.
const _getOrCreateContextMenu = () => {
  if (_contextMenuEl) return _contextMenuEl;

  _contextMenuEl = document.createElement('div');
  _contextMenuEl.id = 'map-context-menu';
  _contextMenuEl.className = 'map-context-menu';
  _contextMenuEl.style.display = 'none';
  document.body.appendChild(_contextMenuEl);

  // Close when clicking anywhere outside the menu.
  document.addEventListener('click', (e) => {
    if (_contextMenuEl && !_contextMenuEl.contains(e.target)) {
      _hideContextMenu();
    }
  });

  // Also close on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideContextMenu();
  });

  return _contextMenuEl;
};


// Shows the context menu at the given screen coordinates for the given fix ident.
//
// Phase 12: if the user is NOT already in transition mode and the callbacks
// include 'onAddTransition', an extra menu item is prepended whose label adapts
// to the current procedure type:
//   STAR / IAC → "➕ Add Inbound Transition to [FIX]"
//   SID        → "➕ Add Outbound Transition from [FIX]"
//
// 'x'     — clientX of the right-click event
// 'y'     — clientY of the right-click event
// 'ident' — uppercase ICAO identifier of the right-clicked in-sequence fix
const _showContextMenu = (x, y, ident) => {
  const menu = _getOrCreateContextMenu();
  if (!_contextMenuCallbacks) { _hideContextMenu(); return; }

  // Determine whether to show the "Add Transition" option.
  // We suppress it if the user is already drawing a transition (can't nest transitions).
  const alreadyInTransition = _contextMenuCallbacks?.isInTransitionMode?.() ?? false;
  const canAddTransition = !alreadyInTransition && !!_contextMenuCallbacks?.onAddTransition;

  // Derive the procedure type (defaults to 'SID' when unknown).
  const procType = _contextMenuCallbacks?.procedureType?.() || 'SID';
  const isArrival = ['STAR', 'IAC'].includes(procType);
  const direction = isArrival ? 'inbound' : 'outbound';

  // Build the optional transition menu item.
  const transitionHtml = canAddTransition
    ? `<div class="map-context-menu-item transition-add" data-action="add-transition">
         &#10133; Add ${isArrival ? 'Inbound Transition to' : 'Outbound Transition from'} ${_safeEscape(ident)}
       </div>
       <div class="map-context-menu-separator"></div>`
    : '';

  menu.innerHTML = `
    ${transitionHtml}
    <div class="map-context-menu-item" data-action="edit">&#9998; Edit Restrictions</div>
    <div class="map-context-menu-separator"></div>
    <div class="map-context-menu-item danger" data-action="remove">&#10005; Remove Point</div>
  `;

  // Clamp position so the menu never overflows the viewport edges.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  menu.style.left = `${Math.min(x, vw - 210)}px`;
  menu.style.top = `${Math.min(y, vh - 110)}px`;
  menu.style.display = 'block';

  // Wire up item clicks.
  menu.querySelectorAll('[data-action]').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action === 'add-transition' && _contextMenuCallbacks?.onAddTransition) {
        _contextMenuCallbacks.onAddTransition(ident, direction);
      }
      if (action === 'edit' && _contextMenuCallbacks?.onEdit) _contextMenuCallbacks.onEdit(ident);
      if (action === 'remove' && _contextMenuCallbacks?.onRemove) _contextMenuCallbacks.onRemove(ident);
      _hideContextMenu();
    });
  });
};


// Hides and empties the context menu.
const _hideContextMenu = () => {
  if (_contextMenuEl) {
    _contextMenuEl.style.display = 'none';
    _contextMenuEl.innerHTML = '';
  }
};


// Registers (or clears) the callbacks used by the context menu in snap mode.
// Called by main.js after enableSnapMode() and cleared in _cleanupDrawingMode().
//
// Phase 12: three new optional fields added to the callbacks object:
//   onAddTransition(fixIdent, direction) — fired when user selects "Add Transition"
//   procedureType()                      — returns current type string ('SID','STAR','IAC',...)
//   isInTransitionMode()                 — returns true when a transition is being drawn
//
// 'callbacks' — {
//   isInSequence(ident),          onRemove(ident),     onEdit(ident),
//   onAddTransition(ident, dir),  procedureType(),     isInTransitionMode()
// }  or  null
const setContextMenuCallbacks = (callbacks) => {
  _contextMenuCallbacks = callbacks;
  if (!callbacks) _hideContextMenu();
};


// ── CUSTOM DROP OVERLAY ─────────────────────────────────────────────────────
// Allows the user to drop custom coordinate points in snap-to-fix mode by
// clicking blank map areas. Works alongside snap mode — snapping to an existing
// marker still fires _snapCallback; blank-area clicks fire _customDropCallback.


// Enables the drop overlay by attaching a click listener to the map.
// 'callback' — called with { lat, lon } when the user clicks blank map space
const enableCustomDropOverlay = (mapInstance, callback) => {
  if (!mapInstance) return;
  _customDropCallback = callback;

  _customDropMapHandler = (e) => {
    if (_customDropCallback) {
      _customDropCallback({ lat: e.latlng.lat, lon: e.latlng.lng });
    }
  };

  mapInstance.on('click', _customDropMapHandler);
  console.log('[MapLayers] Custom drop overlay ENABLED — clicking blank map drops a custom point.');
};


// Disables the drop overlay and removes the map click listener.
const disableCustomDropOverlay = (mapInstance) => {
  _customDropCallback = null;
  if (mapInstance && _customDropMapHandler) {
    mapInstance.off('click', _customDropMapHandler);
    _customDropMapHandler = null;
  }
  console.log('[MapLayers] Custom drop overlay DISABLED.');
};


// ── AERODROME ICONS ──────────────────────────────────────────────────────────


// ── Phase 35: Weather Service Bridge ─────────────────────────────────────────
// The fetchWeather function is injected from main.js at startup via
// setFetchWeatherFn(). This avoids a circular import between MapLayers ↔ services.
// It is stored here so the airport popup click handler can call it without the
// map instance or any other context needing to be passed around.

let _fetchWeatherFn = null;

// Called once from main.js after MetarService is imported.
// 'fn' — the fetchWeather function from services/MetarService.js.
const setFetchWeatherFn = (fn) => {
  _fetchWeatherFn = fn;
  console.log('[MapLayers] Weather fetch function registered.');
};


// Builds the static initial popup HTML for a Tier-1 airport.
// This renders instantly when the user clicks the airport icon.
// The weather card replaces wx-body after the user clicks "Show Weather".
//
// 'icao' — uppercase ICAO identifier, e.g. 'SBGR'
// 'name' — full airport name, e.g. 'Guarulhos International'
// 'lat'  — latitude (decimal degrees)
// 'lon'  — longitude (decimal degrees)
// 'customBody' — optional HTML to inject instead of the default button
const _buildAirportPopupHtml = (icao, name, lat, lon, customBody = null, runwaysStr = null) => {
  const bodyHtml = customBody || `<button class="wx-show-btn">🌤 <span data-i18n="map.weather.btn">${i18n.t('map.weather.btn')}</span></button>`;

  // Phase 38: Thresholds displayed in header, coordinates removed per user request.
  const rwyLine = runwaysStr ? `<div class="wx-popup-runways">RWY ${runwaysStr}</div>` : '';

  return `
    <div class="wx-popup-header">
      <span class="wx-icao">${_safeEscape(icao)}</span>
      <span class="wx-airport-name">${_safeEscape(name)}</span>
    </div>
    ${rwyLine}
    <div class="wx-body">
      ${bodyHtml}
    </div>`;
};


// Builds the full METAR + TAF weather card HTML from a normalised WeatherResult.
// Called after the API fetch resolves to replace the loading spinner in wx-body.
//
// 'data' — WeatherResult from MetarService.fetchWeather()
//
// Fallback tiers for missing decoded fields:
//   Tier 1 (decoded): normal rendering, no indicator.
//   Tier 2 (raw METAR regex): amber asterisk (*) + tooltip "Parsed from raw METAR".
//   Tier 1 (decoded): normal rendering.
//   Tier 2 (raw METAR regex): yellow styling.
//   Tier 3 (TAF first period): orange styling.
//   N/A: shown in muted grey when all three fail.
const _buildWeatherCard = (data) => {
  // ── Fallback helpers ──────────────────────────────────────────────────────

  // Wraps a value string with the appropriate tier CSS class.
  // Color alone signals the data source.
  const _wrapTier = (valueStr, tier) => {
    if (tier === 1) return `<span class="wx-value">${valueStr}</span>`;
    if (tier === 2) return `<span class="wx-value wx-value--metar-fallback">${valueStr}</span>`;
    if (tier === 3) return `<span class="wx-value wx-value--taf-fallback">${valueStr}</span>`;
    return `<span class="wx-value wx-value--na">${valueStr}</span>`;
  };

  // Parses raw METAR string for a named group using a regex.
  // Returns the match or null.
  const raw = data.raw_metar || '';

  // Raw METAR regex parsers (ICAO METAR format).
  const _rawWind = () => { const m = raw.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/); return m || null; };
  const _rawVis = () => { const m = raw.match(/\b(\d{4})\b/); return m ? m[1] : null; }; // metres
  const _rawAlt = () => { const m = raw.match(/\bQ(\d{4})\b/); return m ? m[1] : null; }; // QNH hPa
  const _rawTemp = () => { const m = raw.match(/\bM?(\d{2})\/M?(\d{2})\b/); return m || null; };
  const _rawClouds = () => {
    const matches = [...raw.matchAll(/\b(FEW|SCT|BKN|OVC|SKC|CLR|NSC|CAVOK)(\d{3})?\b/g)];
    return matches.length ? matches : null;
  };

  // TAF first-period accessors.
  const tafP0 = data.taf_forecast?.[0] || null;

  // ── Wind ────────────────────────────────────────────────────────────────
  let windStr, windTier;
  if (data.wind && (data.wind.speed_kts > 0 || data.wind.degrees > 0 || data.wind.variable)) {
    if (data.wind.variable) {
      windStr = `VRB/${data.wind.speed_kts}KT`;
    } else {
      const deg = String(data.wind.degrees).padStart(3, '0');
      windStr = `${deg}°/${data.wind.speed_kts}KT`;
      if (data.wind.gust_kts) windStr += `G${data.wind.gust_kts}`;
    }
    windTier = 1;
  } else {
    const rm = _rawWind();
    if (rm) {
      const dir = rm[1] === 'VRB' ? 'VRB' : rm[1] + '°';
      const spd = rm[2];
      const gst = rm[3] ? `G${rm[3]}` : '';
      windStr = `${dir}/${spd}${gst}KT`;
      windTier = 2;
    } else if (tafP0?.wind && (tafP0.wind.speed_kts > 0 || tafP0.wind.variable)) {
      const dir = tafP0.wind.variable ? 'VRB' : String(tafP0.wind.degrees).padStart(3, '0') + '°';
      windStr = `${dir}/${tafP0.wind.speed_kts}KT`;
      windTier = 3;
    } else {
      windStr = 'N/A';
      windTier = 0;
    }
  }

  // ── Visibility ─────────────────────────────────────────────────────────
  // All values shown in metres (ICAO standard).
  // CheckWX API returns statute miles — convert to metres. Raw METAR 4-digit is already metres.
  let visStr, visTier;
  if (data.visibility_sm != null) {
    const m = Math.round(data.visibility_sm * 1609);
    visStr = m >= 10000 ? '>=10000 m' : `${m} m`;
    visTier = 1;
  } else {
    const rv = _rawVis();
    if (rv) {
      // Raw METAR 4-digit group is already in metres.
      const mRaw = parseInt(rv, 10);
      visStr = mRaw >= 9999 ? '>=9999 m' : `${mRaw} m`;
      visTier = 2;
    } else if (tafP0?.visibility_sm != null) {
      const mTaf = Math.round(tafP0.visibility_sm * 1609);
      visStr = mTaf >= 10000 ? '>=10000 m' : `${mTaf} m`;
      visTier = 3;
    } else {
      visStr = 'N/A';
      visTier = 0;
    }
  }

  // ── Clouds ──────────────────────────────────────────────────────────────
  // 'Suspicious' = API has coverage layers (FEW/SCT/BKN/OVC) but ALL have base_ft 0.
  // CheckWX sometimes returns 0 for heights it can't decode; raw METAR is more reliable.
  const COVERAGE = ['FEW', 'SCT', 'BKN', 'OVC'];
  const apiCloudsSuspect = data.clouds?.length > 0 &&
    data.clouds.every(c => COVERAGE.includes(c.code) ? c.base_ft === 0 : true) &&
    data.clouds.some(c => COVERAGE.includes(c.code) && c.base_ft === 0);

  let cloudsStr, cloudsTier;
  if (data.clouds && data.clouds.length === 0) {
    // Decoded API returned explicitly clear → SKC.
    cloudsStr = 'SKC';
    cloudsTier = 1;
  } else if (data.clouds && data.clouds.length && !apiCloudsSuspect) {
    // Ceiling-only BKN/OVC in compact METAR format (BKN020). FEW/SCT shown as NIL.
    const ceilT1 = data.clouds.filter(function (c) { return c.code === 'BKN' || c.code === 'OVC'; });
    cloudsStr = ceilT1.length
      ? ceilT1.map(function (c) { return c.code + String(Math.round(c.base_ft / 100)).padStart(3, '0'); }).join(' ')
      : 'NIL';
    cloudsTier = 1;
  } else {
    // API is missing, empty, or has suspicious 0-height entries — parse raw METAR.
    const rc = _rawClouds();
    if (rc) {
      const hasNil = rc.some(m => ['SKC', 'CLR', 'NSC', 'CAVOK'].includes(m[1]));
      if (hasNil) {
        cloudsStr = rc[0][1];
        cloudsTier = 2;
      } else {
        // Ceiling-only, compact METAR format
        const ceilT2 = rc.filter(function (m) { return m[1] === 'BKN' || m[1] === 'OVC'; });
        cloudsStr = ceilT2.length
          ? ceilT2.map(function (m) { return m[1] + (m[2] || '///'); }).join(' ')
          : 'NIL';
        cloudsTier = 2;
      }
    } else if (tafP0?.clouds?.length) {
      const ceilT3 = tafP0.clouds.filter(function (c) { return c.code === 'BKN' || c.code === 'OVC'; });
      cloudsStr = ceilT3.length
        ? ceilT3.map(function (c) { return c.code + String(Math.round(c.base_ft / 100)).padStart(3, '0'); }).join(' ')
        : 'NIL';
      cloudsTier = 3;
    } else {
      cloudsStr = 'N/A';
      cloudsTier = 0;
    }
  }

  // ── Temp / Dew ──────────────────────────────────────────────────────────
  // altimeter_hpa defaults to 0 in _normaliseMetar when missing, so treat 0 as absent.
  let tempStr, tempTier;
  const tempC = data.temperature_c;
  const dewC = data.dewpoint_c;
  if (tempC !== 0 || dewC !== 0) {
    tempStr = `${tempC}°C/${dewC}°C`;
    tempTier = 1;
  } else {
    const rt = _rawTemp();
    if (rt) {
      // Negative temps are prefixed with M in METAR.
      const t = raw.match(/\b(M?)(\d{2})\/(M?)(\d{2})\b/);
      if (t) {
        const tc = (t[1] === 'M' ? -1 : 1) * parseInt(t[2], 10);
        const dc = (t[3] === 'M' ? -1 : 1) * parseInt(t[4], 10);
        tempStr = `${tc}°C/${dc}°C`;
        tempTier = 2;
      } else {
        tempStr = 'N/A';
        tempTier = 0;
      }
    } else {
      tempStr = 'N/A';
      tempTier = 0;
    }
  }

  // ── QNH / Altimeter ─────────────────────────────────────────────────────
  let qnhStr, qnhTier;
  if (data.altimeter_hpa && data.altimeter_hpa !== 0) {
    qnhStr = `${data.altimeter_hpa} hPa`;
    qnhTier = 1;
  } else {
    const rq = _rawAlt();
    if (rq) {
      qnhStr = `${rq} hPa`;
      qnhTier = 2;
    } else if (raw.match(/\bA(\d{4})\b/)) {
      // InHg format (A2992) — convert to hPa.
      const m = raw.match(/\bA(\d{4})\b/);
      const hpa = Math.round(parseInt(m[1], 10) / 100 * 33.8639);
      qnhStr = `${hpa} hPa`;
      qnhTier = 2;
    } else {
      qnhStr = 'N/A';
      qnhTier = 0;
    }
  }

  // ── Observed timestamp — compact "DD Mon HH:MMZ" for inline display ────────────
  let observedShort = '';
  try {
    if (data.observed) {
      const d = new Date(data.observed);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      observedShort = `${day} ${mon} ${hh}:${mm}Z`;
    }
  } catch (_) { observedShort = data.observed || ''; }

  // ── TAF block ─────────────────────────────────────────────────────
  let tafBlock;
  if (data.taf_raw) {
    tafBlock = `<div class="wx-taf-raw">${_safeEscape(data.taf_raw)}</div>`;
  } else {
    tafBlock = `<div class="wx-taf-na">${i18n.t('map.weather.taf_na')}</div>`;
  }

  // ── Flight category badge CSS class ─────────────────────────────────────────
  const catClass = `wx-cat--${(data.flight_category || 'UNK').toUpperCase()}`;

  // Layout:
  //   Header row: [VFR badge]  METAR  [09 May 23:30Z]
  //   Grid row 1 (3 cells @2 cols each): Wind | QNH | Temp/Dew
  //   Grid row 2 (2 cells @3 cols each): Clouds | Visibility
  //   Yellow raw METAR box + divider + Orange raw TAF box
  return `
    <div class="wx-card">
      <div class="wx-header-row">
        <span class="wx-flight-cat ${_safeEscape(catClass)}">${_safeEscape(data.flight_category)}</span>
        <span class="wx-section-title">METAR</span>
        ${observedShort ? `<span class="wx-obs-short">${_safeEscape(observedShort)}</span>` : ''}
      </div>
      <div class="wx-grid">
        <div class="wx-item wx-item--wind">
          <div class="wx-item-hdr"><span class="wx-icon">💨</span><span class="wx-label">WND</span></div>
          ${_wrapTier(_safeEscape(windStr), windTier)}
        </div>
        <div class="wx-item wx-item--qnh">
          <div class="wx-item-hdr"><span class="wx-icon">⬇</span><span class="wx-label">QNH</span></div>
          ${_wrapTier(_safeEscape(qnhStr), qnhTier)}
        </div>
        <div class="wx-item wx-item--temp">
          <div class="wx-item-hdr"><span class="wx-icon">🌡</span><span class="wx-label">T/D</span></div>
          ${_wrapTier(_safeEscape(tempStr), tempTier)}
        </div>
        <div class="wx-item wx-item--clouds">
          <div class="wx-item-hdr"><span class="wx-icon">☁</span><span class="wx-label">CLOUDS</span></div>
          ${_wrapTier(_safeEscape(cloudsStr), cloudsTier)}
        </div>
        <div class="wx-item wx-item--vis">
          <div class="wx-item-hdr"><span class="wx-icon">👁</span><span class="wx-label">VIS</span></div>
          ${_wrapTier(_safeEscape(visStr), visTier)}
        </div>
      </div>
      <div class="wx-metar-raw">${_safeEscape(data.raw_metar)}</div>
      <hr class="wx-divider">
      ${tafBlock}
    </div>`;
};

// Renders aerodrome markers in three independent Leaflet LayerGroups — one per tier.
// Each tier gets its own distinct icon style and default visibility:
//
//   1. Major (Tier 1): Active commercial hubs (SBSP, SBGR, SBKP). Always visible.
//   2. Regional (Tier 2): General aviation/smaller strips. Hidden by default.
//   3. Heliports (Tier 3): Helipads. Hidden by default.
//
// The 'snapCallback' argument is used when a drawing tool (like Add Waypoint)
// restricts the map interaction exclusively to selecting fixes for a procedure.
const renderAerodromes = (mapInstance, aerodromes, thresholds = []) => {
  if (!mapInstance) return;

  // Phase 38: Group thresholds by airport ICAO to display in popups.
  const rwyMap = new Map();
  thresholds.forEach(t => {
    if (!t.airport) return;
    const rwy = t.ident.split(' ')[1]; // Extract '07L' from 'VHHH 07L'
    if (!rwy) return;
    if (!rwyMap.has(t.airport)) rwyMap.set(t.airport, []);
    rwyMap.get(t.airport).push(rwy);
  });

  // Helper to format runways like "07L/07C/07R - 25R/25C/25L"
  const _formatRunways = (icao) => {
    const list = rwyMap.get(icao);
    if (!list || list.length === 0) return null;

    // Sort them. For VHHH: 07C, 07L, 07R, 25C, 25L, 25R
    list.sort();

    // Group by first two digits (the heading)
    const groups = new Map();
    list.forEach(r => {
      const head = r.substring(0, 2);
      if (!groups.has(head)) groups.set(head, []);
      groups.get(head).push(r);
    });

    // Join groups with ' - '
    const sortedHeads = Array.from(groups.keys()).sort();
    return sortedHeads.map(h => groups.get(h).join('/')).join(' - ');
  };

  // Safely destructure — fall back to empty arrays if any tier is missing.
  const { major = [], regional = [], heliports = [] } = aerodromes || {};

  const majorLayer = L.layerGroup();
  const regionalLayer = L.layerGroup();
  const heliportLayer = L.layerGroup();

  // Build the shared click handler for an aerodrome marker.
  const _makeAeroClickHandler = (marker, aerodrome) => (e) => {
    L.DomEvent.stop(e);

    // Measuring Vector tool takes priority — route this coordinate into the MV flow.
    if (isMeasuringVectorActive()) {
      handleMVClick(e.latlng, _mapRef);
      return;
    }

    if (_snapCallback) {
      // Snap-to-fix mode: pass the aerodrome's fixData to the drawing orchestrator.
      _snapCallback(marker.fixData);
    }
    // In view mode, clicking does nothing (info is shown via delayed hover).
  };

  // ── Tier 1: Major Airports ────────────────────────────────────────────────
  // Large white airplane glyph with ICAO label — the original aerodrome icon style.
  // Phase 35: replaced the delayed hover tooltip with an interactive Leaflet popup
  // that contains a "Show Weather" button, loading spinner, and METAR/TAF card.
  major.forEach((aerodrome) => {
    if (!aerodrome.icao || aerodrome.lat == null || aerodrome.lon == null) {
      console.warn('[MapLayers] Skipping major aerodrome with incomplete data:', aerodrome);
      return;
    }
    _crossLayerOccupiedCoords.push([aerodrome.lat, aerodrome.lon]);

    const isShifted = ['SBSP', 'SBSJ', 'SBKP', 'SBTA'].includes(aerodrome.icao.toUpperCase());
    const iconClass = isShifted ? 'airport-icon shifted-marker' : 'airport-icon';

    const icon = L.divIcon({
      className: iconClass,
      html: `
        <div class="airport-icon-inner">
          <div class="airport-symbol">✈</div>
          <div class="airport-label">${_safeEscape(aerodrome.icao)}</div>
        </div>
      `,
      iconSize: [40, 24],
      iconAnchor: [20, 12],
    });

    const marker = L.marker([aerodrome.lat, aerodrome.lon], { icon });
    // Attach fix data so snap mode can add this airport to a procedure sequence.
    marker.fixData = { ident: aerodrome.icao, name: aerodrome.name, lat: aerodrome.lat, lon: aerodrome.lon, tipo: 'AERODROME', isFix: false };

    // ── Phase 35: Interactive Weather Popup with 2s Hover Delay ──────────────
    const icao = aerodrome.icao.toUpperCase();
    const popupHtml = _buildAirportPopupHtml(icao, aerodrome.name, aerodrome.lat, aerodrome.lon, null, _formatRunways(icao));

    const popup = L.popup({
      className: 'airport-wx-popup',
      closeOnClick: false,
      autoClose: false,
      maxWidth: 340,
      minWidth: 260,
    }).setContent(popupHtml);

    marker.bindPopup(popup);

    // Delayed hover logic: open popup after 2 seconds of continuous hover.
    let _hoverTimer = null;
    marker.on('mouseover', () => {
      if (isAnyDrawingToolActive()) return;
      _hoverTimer = setTimeout(() => {
        if (!isAnyDrawingToolActive() && _mapRef) {
          marker.openPopup();
        }
      }, 2000);
    });

    marker.on('mouseout', () => {
      if (_hoverTimer) {
        clearTimeout(_hoverTimer);
        _hoverTimer = null;
      }
    });

    // After the popup's DOM is injected by Leaflet, wire the "Show Weather" button.
    marker.on('popupopen', (e) => {
      console.log(`[MapLayers] popupopen fired for ${icao}`);
      const container = e.popup.getElement();
      if (!container) return;

      // Phase 37 Fix: Translate the popup content every time it opens.
      i18n.updateDOM(container);

      // Phase 37 Fix: Use event delegation on the container. This guarantees the 
      // click is caught even if the button's internal DOM changes (e.g. via translations).
      container.onclick = async (clickEvent) => {
        const targetBtn = clickEvent.target.closest('.wx-show-btn');
        if (!targetBtn) return;

        // Phase 37 Fix: Prevent the click from bubbling up to the marker,
        // which would trigger marker.openPopup() and reset the popup content!
        clickEvent.stopPropagation();

        console.log(`[MapLayers] Weather button clicked for ${icao}`);

        const body = container.querySelector('.wx-body');
        if (!body) return;

        body.innerHTML = `
          <div class="wx-loading">
            <span class="wx-spinner"></span>
            <span>${i18n.t('map.weather.loading')}</span>
          </div>`;

        // Sync Leaflet's internal state so it doesn't overwrite our spinner
        const contentNode = container.querySelector('.leaflet-popup-content');
        if (contentNode) e.popup._content = contentNode.innerHTML;
        e.popup.update();

        // 2. Fetch (or return cached) METAR + TAF.
        try {
          const data = _fetchWeatherFn ? await _fetchWeatherFn(icao) : null;

          const activeBody = container.querySelector('.wx-body');
          if (activeBody) {
            if (!data) {
              activeBody.innerHTML = `<div class="wx-error">⚠ ${i18n.t('map.weather.error')} (${icao})</div>`;
            } else {
              activeBody.innerHTML = _buildWeatherCard(data);
            }
            // Sync Leaflet's internal state again before updating layout
            if (contentNode) e.popup._content = contentNode.innerHTML;
            e.popup.update();
          }
        } catch (err) {
          console.error('[MapLayers] Weather fetch error:', err);
          const activeBody = container.querySelector('.wx-body');
          if (activeBody) {
            activeBody.innerHTML = `<div class="wx-error">⚠ Network error — try again later</div>`;
            const contentNode = container.querySelector('.leaflet-popup-content');
            if (contentNode) e.popup._content = contentNode.innerHTML;
            e.popup.update();
          }
        }
      };
    });

    marker.on('click', (e) => {
      L.DomEvent.stop(e);
      if (isMeasuringVectorActive()) {
        handleMVClick(e.latlng, _mapRef);
        return;
      }
      if (_snapCallback) {
        _snapCallback(marker.fixData);
        return;
      }
      // Manual click opens the popup immediately, but only if it isn't already open.
      if (!marker.isPopupOpen()) {
        marker.openPopup();
      }
    });

    majorLayer.addLayer(marker);
  });


  // ── Tier 2: Regional Airports ─────────────────────────────────────────────
  // Smaller, muted amber airplane so they are clearly secondary to Tier 1.
  regional.forEach((aerodrome) => {
    if (!aerodrome.icao || aerodrome.lat == null || aerodrome.lon == null) return;
    _crossLayerOccupiedCoords.push([aerodrome.lat, aerodrome.lon]);

    const isShifted = ['SBSP', 'SBSJ', 'SBKP', 'SBTA'].includes(aerodrome.icao.toUpperCase());
    const icon = L.divIcon({
      className: 'airport-icon-regional',
      html: `<div class="airport-icon-inner-regional">` +
        `<span class="airport-symbol-regional">&#9992;</span>` +
        `<span class="airport-label-regional">${_safeEscape(aerodrome.icao)}</span>` +
        `</div>`,
      iconSize: [0, 0],
      iconAnchor: isShifted ? [10, 0] : [0, 0]
    });

    const marker = L.marker([aerodrome.lat, aerodrome.lon], { icon });
    marker.fixData = { ident: aerodrome.icao, name: aerodrome.name, lat: aerodrome.lat, lon: aerodrome.lon, tipo: 'AERODROME', isFix: false };

    const icao = aerodrome.icao.toUpperCase();
    const rwys = _formatRunways(icao);
    const rwyLine = rwys ? `<div style="color:#ffb547;font-size:10px;margin-top:2px;">RWY ${rwys}</div>` : '';

    const tooltipHtml =
      `<div style="font-family:'JetBrains Mono';font-size:12px;font-weight:bold;">${_safeEscape(aerodrome.icao)}</div>` +
      `<div style="font-family:Inter;font-size:11px;color:#aaa;">${_safeEscape(aerodrome.name)}</div>` +
      rwyLine;

    const ttOffset = isShifted ? [-10, -8] : [0, -8];
    _bindDelayedTooltip(marker, tooltipHtml, { direction: 'top', offset: ttOffset, className: 'fix-tooltip' });
    marker.on('click', _makeAeroClickHandler(marker, aerodrome));
    regionalLayer.addLayer(marker);
  });

  // ── Tier 3: Heliports ─────────────────────────────────────────────────────
  // Small green circle with an 'H' inside — aviation-standard heliport symbol.
  heliports.forEach((aerodrome) => {
    if (!aerodrome.icao || aerodrome.lat == null || aerodrome.lon == null) return;
    _crossLayerOccupiedCoords.push([aerodrome.lat, aerodrome.lon]);

    const icon = L.divIcon({
      className: 'heliport-icon',
      html: `<div class="heliport-icon-inner">` +
        `<span class="heliport-symbol">H</span>` +
        `</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = L.marker([aerodrome.lat, aerodrome.lon], { icon });
    marker.fixData = { ident: aerodrome.icao, name: aerodrome.name, lat: aerodrome.lat, lon: aerodrome.lon, tipo: 'AERODROME', isFix: false };
    const tooltipHtml =
      `<div style="font-family:'JetBrains Mono';font-size:12px;font-weight:bold;">${_safeEscape(aerodrome.icao)} <span style="color:#888;font-size:10px">[Heliport]</span></div>` +
      `<div style="font-family:Inter;font-size:11px;color:#ccc;">${_safeEscape(aerodrome.name)}</div>`;
    _bindDelayedTooltip(marker, tooltipHtml, { direction: 'top', offset: [0, -8], className: 'fix-tooltip' });
    marker.on('click', _makeAeroClickHandler(marker, aerodrome));
    heliportLayer.addLayer(marker);
  });

  // Only Major Airports are added to the map here (default ON).
  // Regional and Heliports start hidden — the user enables them via the layer control.
  majorLayer.addTo(mapInstance);

  console.log(
    `[MapLayers] Aerodromes rendered: ${major.length} major (ON), ` +
    `${regional.length} regional (OFF), ${heliports.length} heliports (OFF).`
  );
  return { majorLayer, regionalLayer, heliportLayer };
};


// ── NAVAID RENDERING ─────────────────────────────────────────────────────────
// Renders VOR and NDB navigation aids on the map using distinct DivIcon markers:
//   VOR family (VOR, VOR/DME, DVOR/DME, DME) — blue hexagon with centre dot.
//   NDB family (NDB)                          — magenta filled circle.
//
// Data source: MEDIA/navaids_aip.json (official AIP Brasil ENR 4.1 data).
// Type values from AIP Brasil use slash notation: 'VOR/DME', 'DVOR/DME' etc.
//
// All NAVAID markers are collected into a single Leaflet LayerGroup that is
// added to the map by default (NAVAIDs are ON by default — they are essential
// reference points for procedure building).
//
// 'mapInstance' — the Leaflet map
// 'navaids'     — array from DataLoader.loadNavaids(): [{ ident, name, type, freq, lat, lon }, ...]
//                 'freq' is in MHz for all types (NDB: e.g. 0.38 = 380 kHz)
//
// Returns: the Leaflet LayerGroup containing all NAVAID markers.
const renderNavaids = (mapInstance, navaids) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderNavaids: No map instance provided.');
    return null;
  }
  if (!navaids || navaids.length === 0) {
    console.warn('[MapLayers] renderNavaids: No NAVAID data provided.');
    return null;
  }

  // VOR-type NAVAIDs from AIP Brasil: VOR, VOR/DME, DVOR/DME, DME.
  // These use slash notation in the official data (unlike OurAirports which used hyphens).
  // Rendered as a blue hexagon to match standard chart symbology.
  const VOR_TYPES = new Set(['VOR', 'VOR/DME', 'DVOR/DME', 'DME']);

  // The combined layer group for all NAVAIDs.
  const navaidLayer = L.layerGroup();

  navaids.forEach((navaid) => {
    if (!navaid.ident || navaid.lat == null || navaid.lon == null) {
      console.warn('[MapLayers] Skipping NAVAID with incomplete data:', navaid);
      return;
    }
    _crossLayerOccupiedCoords.push([navaid.lat, navaid.lon]);

    const isVor = VOR_TYPES.has(navaid.type);

    // ── Build the frequency display string ──────────────────────────────────
    // AIP Brasil data stores all frequencies in MHz directly ('frequency_mhz').
    // VOR/DME: value is 108–118 (e.g. 116.9 → display "116.90 MHz").
    // NDB:     value is fractional MHz (e.g. 0.38 = 380 kHz → display "380 kHz").
    let freqStr = '';
    if (navaid.freq != null) {
      if (isVor) {
        // VOR/DME family: already in MHz — show with 2 decimal places.
        freqStr = `${navaid.freq.toFixed(2)} MHz`;
      } else {
        // NDB: convert fractional MHz back to kHz for display (multiply × 1000).
        freqStr = `${(navaid.freq * 1000).toFixed(0)} kHz`;
      }
    }

    // ── Build the DivIcon SVG ───────────────────────────────────────────────
    // Both icons use a 0-size anchor box (iconSize/iconAnchor [0,0]) with a CSS
    // transform inside to centre the visible glyph precisely on the lat/lon point.
    let iconHtml;

    if (isVor) {
      // Hexagon (flat-top, 6 vertices around a radius of 8 units).
      // Vertices calculated: every 60° starting at 0° (right), converted to (x,y).
      // Flat-top hexagon: vertex i at angle 60°·i gives these rounded points:
      //   (8,0) (4,6.93) (-4,6.93) (-8,0) (-4,-6.93) (4,-6.93)
      iconHtml =
        `<svg viewBox="-12 -12 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg"
              style="transform:translate(-50%,-50%);display:block;overflow:visible">` +
        `<polygon points="8,0 4,6.93 -4,6.93 -8,0 -4,-6.93 4,-6.93"` +
        ` fill="rgba(70,160,255,0.15)" stroke="#46a0ff" stroke-width="1.5"/>` +
        `<circle r="2.2" fill="#46a0ff"/>` +
        `</svg>`;
    } else {
      // NDB: a small magenta filled circle with a faint ring.
      iconHtml =
        `<svg viewBox="-10 -10 20 20" width="12" height="12" xmlns="http://www.w3.org/2000/svg"
              style="transform:translate(-50%,-50%);display:block;overflow:visible">` +
        `<circle r="6" fill="rgba(255,90,190,0.15)" stroke="#ff5abe" stroke-width="1.5"/>` +
        `<circle r="2.2" fill="#ff5abe"/>` +
        `</svg>`;
    }

    const labelClass = isVor ? 'navaid-label-inline--vor' : 'navaid-label-inline--ndb';
    const finalIconHtml =
      `<div class="navaid-icon-inner">` +
      `<span class="navaid-label-inline ${labelClass}">${_safeEscape(navaid.ident)}</span>` +
      iconHtml +
      `</div>`;

    const icon = L.divIcon({
      className: 'navaid-icon',
      html: finalIconHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = L.marker([navaid.lat, navaid.lon], { icon, interactive: true });

    // Hover popup: shows the full detail card (type, name, frequency) after 2s.
    const accentColor = isVor ? '#46a0ff' : '#ff5abe';
    const popupHtml =
      `<div style="font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7">` +
      `<b>${_safeEscape(navaid.ident)}</b>` +
      ` <span style="color:#888;font-size:10px">${_safeEscape(navaid.type)}</span><br>` +
      `<span style="font-size:11px;color:#ccc">${_safeEscape(navaid.name)}</span>` +
      (freqStr ? `<br><span style="font-size:11px;color:${accentColor}">${_safeEscape(freqStr)}</span>` : '') +
      `</div>`;

    _bindDelayedInfoPopup(marker, [navaid.lat, navaid.lon], popupHtml);

    // Pass clicks to MV tool, regular snap mode, or ghost snap mode if active.
    // Ghost snap mode (route-type builder) previously only responded to clicks on ghost
    // fix markers, making navaids un-selectable as procedure points. Both callbacks
    // now share the same ad-hoc fixData object.
    marker.on('click', (e) => {
      L.DomEvent.stop(e);
      if (isMeasuringVectorActive()) {
        handleMVClick(e.latlng, _mapRef);
        return;
      }
      const snapData = { ident: navaid.ident, name: navaid.name, lat: navaid.lat, lon: navaid.lon, tipo: 'NAVAID', isFix: false };
      if (_snapCallback) _snapCallback(snapData);
      if (_ghostSnapCallback) _ghostSnapCallback(snapData);
    });

    navaidLayer.addLayer(marker);
  });

  // NAVAIDs are ON by default — add the layer to the map now.
  // The combined 4-overlay layer control (created in buildAerodromeLayerControl)
  // will show this checkbox as checked because the layer is already on the map
  // at the time the control is instantiated.
  navaidLayer.addTo(mapInstance);

  console.log(`[MapLayers] NAVAID layer prepared: ${navaids.length} markers (ON by default).`);
  return navaidLayer;
};


// Creates the single Leaflet layer control that manages all four overlay checkboxes:
// Major Airports, Regional Airports, Heliports, and NAVAIDs.
//
// This must be called AFTER renderAerodromes() and renderNavaids() so that all
// four LayerGroup references are ready. The control automatically reflects the
// current map state: layers already on the map appear checked; layers that are
// not on the map appear unchecked. This gives us the desired default state:
//   Major Airports — checked  (majorLayer was added to map in renderAerodromes)
//   NAVAIDs        — checked  (navaidLayer was added to map in renderNavaids)
//   Regional       — unchecked (not added to map)
//   Heliports      — unchecked (not added to map)
//
// 'mapInstance'    — the Leaflet map
// 'majorLayer'     — LayerGroup returned by renderAerodromes()
// 'regionalLayer'  — LayerGroup returned by renderAerodromes()
// 'heliportLayer'  — LayerGroup returned by renderAerodromes()
// 'navaidLayer'    — LayerGroup returned by renderNavaids()
const buildAerodromeLayerControl = (mapInstance, majorLayer, regionalLayer, heliportLayer, navaidLayer) => {
  if (!mapInstance) {
    console.error('[MapLayers] buildAerodromeLayerControl: No map instance provided.');
    return;
  }

  // Build the overlays object — only include a layer if it actually exists so
  // the control doesn't show broken entries if one tier loaded zero records.
  const overlays = {};
  if (majorLayer) overlays['Major Airports'] = majorLayer;
  if (regionalLayer) overlays['Regional Airports'] = regionalLayer;
  if (heliportLayer) overlays['Heliports'] = heliportLayer;
  if (navaidLayer) overlays['NAVAIDs'] = navaidLayer;

  // Phase 10.5: The native L.control.layers panel is replaced by the custom
  // right-toolbar sub-panels. This function now only validates its inputs;
  // the actual layer references are stored in main.js and wired to the
  // Objects sub-panel checkboxes directly.
  console.log('[MapLayers] buildAerodromeLayerControl: native Leaflet control removed — layer toggling via toolbar Objects panel.');
};


// ── PHASE 10: COMMON-ROUTE GHOST LAYER ───────────────────────────────────────
// When the user is drawing a transition branch, the COMMON ROUTE (the part of the
// procedure shared by all transitions) is displayed as a semi-transparent ghost line
// so the user can see where the branch needs to reconnect. This ghost is separate
// from the active shape (which represents the current transition branch being drawn).

// The ghost layer reference — created on demand and cleared when transition ends.
let _commonRouteGhostLayer = null;


// Creates or updates the common-route ghost line on the map.
// Called by main.js when the user starts drawing a transition branch (startTransition).
// The ghost is a semi-transparent version of the common-route polyline — same color as
// the procedure but faded so the user can distinguish it from the branch being drawn.
//
// 'mapInstance'  — the Leaflet map
// 'drawingState' — the shared DrawingState singleton (must be in transition mode)
const updateCommonRouteGhost = (mapInstance, drawingState) => {
  clearCommonRouteGhost(mapInstance);

  if (!drawingState?._inTransitionMode) return;
  if (!drawingState.common_route || drawingState.common_route.length < 2) return;

  const coords = drawingState.common_route.map((p) => [p.lat, p.lon]);
  const dashMap = { solid: null, dashed: '10, 8', dotted: '3, 6' };

  _commonRouteGhostLayer = L.polyline(coords, {
    color: drawingState.metadata.color,
    weight: 2,
    opacity: 0.35,   // faded so the user focuses on the branch they are drawing
    dashArray: dashMap[drawingState.metadata.pattern] ?? null,
    interactive: false // ghost is purely visual — no click events
  }).addTo(mapInstance);

  // Bind a hover tooltip so the user knows what this faded line represents.
  _commonRouteGhostLayer.bindTooltip(
    `${drawingState.metadata.name} — common route`,
    { sticky: true, className: 'proc-hover-tooltip', opacity: 0.6 }
  );

  console.log('[MapLayers] Common-route ghost line rendered for transition drawing.');
};


// Removes the common-route ghost line from the map and clears the reference.
// Called when a transition is finished or cancelled, and during full session cleanup.
//
// 'mapInstance' — the Leaflet map (can be null — safe to call during cleanup)
const clearCommonRouteGhost = (mapInstance) => {
  if (_commonRouteGhostLayer) {
    if (mapInstance && mapInstance.hasLayer(_commonRouteGhostLayer)) {
      mapInstance.removeLayer(_commonRouteGhostLayer);
    }
    _commonRouteGhostLayer = null;
    console.log('[MapLayers] Common-route ghost line cleared.');
  }
};


// ── HOLDING PATTERN MARKERS ───────────────────────────────────────────────────
// These functions manage the "H" badge markers that appear next to waypoints
// designated as holding fixes while the user is actively building a procedure.
// They are separate from the "saved procedure" H markers (which live inside the
// procedure's own LayerGroup) so they can be rebuilt on every sequence change
// without touching the saved layers.


// Rebuilds the holding-marker overlay to match the current active sequence.
// Call this after any sequence change (point add, remove, edit, or reorder).
//
// For each point in 'activePoints' where isHolding === true, a small "H" badge
// DivIcon is placed on the map at that point's coordinates.
//
// If no points are holding, the layer is removed from the map to keep it clean.
//
// 'mapInstance'   — the Leaflet map
// 'activePoints'  — DrawingState.points array
// 'sequenceColor' — the procedure color; used to tint the badge border
const updateHoldingMarkers = (mapInstance, activePoints, sequenceColor = '#4ddb8d') => {
  if (!mapInstance) return;

  // Create a dedicated Leaflet pane for holding badges the first time it is needed.
  // z-index 700 sits above markerPane (600) and tooltipPane (650), so the "H" badge
  // is always rendered on top of any ghost fix label at the same position.
  if (!mapInstance.getPane('holdingPane')) {
    const hp = mapInstance.createPane('holdingPane');
    hp.style.zIndex = '700';
    hp.style.pointerEvents = 'none';
  }

  // Create the layer on first call.
  if (!_holdingMarkersLayer) {
    _holdingMarkersLayer = L.layerGroup();
  }

  // Wipe the old markers — we always rebuild from scratch so the markers
  // always match the live sequence perfectly, even after edits or reorders.
  _holdingMarkersLayer.clearLayers();

  // Build a marker for every point that is flagged as a holding fix.
  const holdingPoints = (activePoints || []).filter((pt) => pt.isHolding);
  const newIdents = new Set(holdingPoints.map((pt) => pt.ident?.toUpperCase()).filter(Boolean));

  // Restore ghost labels for any idents that are no longer holding.
  let labelsChanged = false;
  _suppressedGhostIdents.forEach((ident) => {
    if (!newIdents.has(ident)) {
      _suppressedGhostIdents.delete(ident);
      labelsChanged = true;
    }
  });

  holdingPoints.forEach((pt) => {
    if (pt.lat == null || pt.lon == null) return;

    const bearingStr = pt.holdingBearing ? `${pt.holdingBearing}°` : '---';
    const sideStr = pt.holdingSide || 'RIGHT';

    const icon = L.divIcon({
      className: 'holding-badge-marker',
      html: `<div class="holding-badge-inner"><span class="holding-badge-h" style="color:${_safeEscape(sequenceColor)};">H</span></div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    // Use the dedicated holdingPane so the badge always renders above ghost fix labels.
    L.marker([pt.lat, pt.lon], { icon, interactive: false, pane: 'holdingPane' })
      .addTo(_holdingMarkersLayer);
      .addTo(_holdingMarkersLayer);


    // Suppress the ghost fix label at this position so the "H" badge is the sole
    // identifier. _refreshGhostLabels() below will apply the suppression to the DOM.
    if (pt.ident) {
      const up = pt.ident.toUpperCase();
      if (!_suppressedGhostIdents.has(up)) {
        _suppressedGhostIdents.add(up);
        labelsChanged = true;
      }
    }
  });

  // Re-render ghost labels only if the suppression set changed to avoid unnecessary DOM work.
  if (labelsChanged) _refreshGhostLabels();

  // Add the layer if there are holdings; remove it if the list is empty.
  // This prevents an invisible empty layer from sitting on the map unnecessarily.
  if (holdingPoints.length > 0) {
    if (!mapInstance.hasLayer(_holdingMarkersLayer)) {
      _holdingMarkersLayer.addTo(mapInstance);
    }
  } else {
    if (mapInstance.hasLayer(_holdingMarkersLayer)) {
      mapInstance.removeLayer(_holdingMarkersLayer);
    }
  }
};


// Removes all holding markers and takes the layer off the map.
// Called when the drawing session ends (save or cancel) so no stale
// holding badges are left behind from the previous build session.
// Also restores any ghost fix labels that were suppressed by the holding badges.
//
// 'mapInstance' — the Leaflet map
const clearHoldingMarkers = (mapInstance) => {
  if (_holdingMarkersLayer) {
    if (mapInstance && mapInstance.hasLayer(_holdingMarkersLayer)) {
      mapInstance.removeLayer(_holdingMarkersLayer);
    }
    _holdingMarkersLayer.clearLayers();
  }
  // Restore ghost labels for all previously suppressed idents.
  if (_suppressedGhostIdents.size > 0) {
    _suppressedGhostIdents.clear();
    _refreshGhostLabels();
  }
};


// ── DRAGGABLE CUSTOM POINT MARKERS ───────────────────────────────────────────
// Phase 8.4: Custom points (those created by free-drawing or "Drop Custom Point")
// are displayed as draggable markers on the map. Dragging one moves the procedure's
// polyline in real time. Fixed waypoints (parsed intersections) are NOT draggable.


// Creates a visible, draggable Leaflet marker for a custom coordinate point.
// The marker is styled as a diamond "◇" in the procedure's color so it looks
// distinct from the teal fixed-waypoint circles and signals that it can be moved.
//
// 'mapInstance' — the Leaflet map to add the marker to
// 'lat'         — initial latitude of the point
// 'lon'         — initial longitude of the point
// 'color'       — the procedure's hex color (e.g. '#3b9eff')
// 'onDrag'      — function(lat, lon) called on every mouse-move event while dragging.
//                 Use this to update DrawingState and re-render the active shape.
// 'onDragEnd'   — function(lat, lon) called once when the user releases the marker.
//                 Use this to refresh the sidebar sequence list with final coordinates.
//
// Returns: the Leaflet marker object (main.js stores it in _draggableMarkers[])
// Shows a temporary, non-draggable "pending" marker at the position of a custom
// drop point while the restriction form is open. This gives the user immediate
// visual confirmation that the point was registered, before they click "Add Point".
//
// The marker uses the same diamond glyph as the real draggable marker but with a
// dashed border and a gentle pulse animation (.pending modifier class) to signal
// that the point is still awaiting confirmation.
//
// Only one pending marker can exist at a time — call clearPendingCustomMarker before
// calling this if there is already one on the map.
const showPendingCustomMarker = (mapInstance, lat, lon, color, ident) => {
  if (!mapInstance) return;
  const icon = L.divIcon({
    className: 'draggable-custom-marker',
    html: `<div class="draggable-custom-marker-inner pending" style="border-color:${_safeEscape(color)};color:${_safeEscape(color)};">` +
      `<span class="draggable-diamond">◇</span>` +
      `</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  _pendingCustomMarker = L.marker([lat, lon], { icon, draggable: false, interactive: false, zIndexOffset: 490 });
  _pendingCustomMarker.addTo(mapInstance);
  if (ident) {
    _pendingCustomMarker.bindTooltip(ident, { permanent: true, direction: 'bottom', offset: [0, 12], className: 'custom-point-label' });
  }
};

// Removes the pending custom marker from the map if one exists.
// Called when the point is committed (replaced by the real draggable marker)
// or when the session is cancelled or cleaned up.
const clearPendingCustomMarker = (mapInstance) => {
  if (_pendingCustomMarker) {
    if (mapInstance && mapInstance.hasLayer(_pendingCustomMarker)) {
      mapInstance.removeLayer(_pendingCustomMarker);
    }
    _pendingCustomMarker = null;
  }
};


const createDraggableCustomMarker = (mapInstance, lat, lon, color, onDrag, onDragEnd, ident) => {
  if (!mapInstance) {
    console.error('[MapLayers] createDraggableCustomMarker: No map instance provided.');
    return null;
  }

  // DivIcon: a small diamond glyph colored to match the procedure.
  // iconSize [24,24] / iconAnchor [12,12] tells Leaflet to center the 24×24 container
  // exactly at the coordinate using its own anchor math. This is more stable than
  // [0,0]/[0,0] + CSS translate(-50%,-50%), which can drift after zoom animations.
  const icon = L.divIcon({
    className: 'draggable-custom-marker',
    html: `<div class="draggable-custom-marker-inner" style="border-color:${color}; color:${color};">` +
      `<span class="draggable-diamond">◇</span>` +
      `</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  // draggable: true is the Leaflet built-in option that makes the marker moveable.
  const marker = L.marker([lat, lon], {
    icon,
    draggable: true,
    zIndexOffset: 500   // sit above the procedure polyline so it is easy to grab
  });

  // 'drag' fires continuously while the user is moving the marker.
  // We call onDrag with the live position so the procedure shape updates
  // in real time — this gives the user visual feedback while dragging.
  marker.on('drag', (e) => {
    const { lat: newLat, lng: newLng } = e.target.getLatLng();
    if (onDrag) onDrag(newLat, newLng);
  });

  // 'dragend' fires once when the user releases the mouse button.
  // The final position is already in DrawingState from the last 'drag' event;
  // we use 'dragend' to refresh the sidebar list so the coordinate text updates.
  marker.on('dragend', (e) => {
    const { lat: newLat, lng: newLng } = e.target.getLatLng();
    if (onDragEnd) onDragEnd(newLat, newLng);
  });

  marker.addTo(mapInstance);
  if (ident) {
    marker.bindTooltip(ident, { permanent: true, direction: 'bottom', offset: [0, 12], className: 'custom-point-label' });
  }
  console.log(`[MapLayers] Draggable custom marker created at (${lat.toFixed(4)}, ${lon.toFixed(4)}).`);
  return marker;
};


// Removes a draggable custom point marker from the map.
// Called when the corresponding point is removed from the sequence,
// or when the drawing session is cleaned up.
//
// 'mapInstance' — the Leaflet map
// 'marker'      — the Leaflet marker returned by createDraggableCustomMarker()
const removeDraggableMarker = (mapInstance, marker) => {
  if (!marker) return;
  if (mapInstance && mapInstance.hasLayer(marker)) {
    mapInstance.removeLayer(marker);
  }
};


// ── PHASE 9.8 — GLOBAL VIEWER SEARCH HIGHLIGHTS ──────────────────────────────
// When the user types in the View-mode global search bar, matching map objects
// across ALL data layers are shown as pulsing highlight markers, regardless of
// whether their parent layer is currently toggled on in the layer control. This
// "layer override" works naturally because highlights live in their own dedicated
// LayerGroup that is always added to the map during a search.
//
// Colour coding per source type (spec §3):
//   🔵 Aerodromes → #3b9eff  (blue)
//   🟣 Fixes      → #b06bff  (violet)
//   🟠 NAVAIDs    → #ff8c00  (amber)

let _globalHighlightLayer = null;


// Clears all active global search highlight markers and removes the layer from the map.
// Called when the search field is cleared, Escape is pressed, or the user switches
// away from View mode into Builder mode.
//
// 'mapInstance' — the Leaflet map
const clearGlobalSearchHighlights = (mapInstance) => {
  if (_globalHighlightLayer) {
    if (mapInstance && mapInstance.hasLayer(_globalHighlightLayer)) {
      mapInstance.removeLayer(_globalHighlightLayer);
    }
    _globalHighlightLayer.clearLayers();
  }
};


// Renders contour-highlight markers at the coordinates of every search result.
// Existing highlights are always cleared first so this function is idempotent —
// calling it repeatedly with a new query replaces the previous set of markers.
//
// Phase 15 redesign: the old pulsing "gsh-ring" blinking circle has been removed.
// Instead each marker renders the ACTUAL icon for its object type (airplane glyph for
// aerodromes, fix dot for RNAV fixes, VOR hexagon / NDB circle for NAVAIDs) at full
// opacity with a static glowing contour ring around it.
// This means hidden-layer objects become visible — the highlight IS the icon, not an
// overlay floating on top of an invisible one.
//
// Color coding per source type:
//   🔵 Aerodromes → #3b9eff  (blue)
//   🟣 Fixes      → #b06bff  (violet)
//   🟠 NAVAIDs    → #ff8c00  (amber)
//
// 'mapInstance' — the Leaflet map
// 'results'     — filtered array from the global search index:
//                 [{ ident, name?, type?, freq?, lat, lon, layer, tier? }, ...]
// 'term'        — Phase 8: the normalised (uppercase, trimmed) search query
//                 from SearchManager. When provided, the matching substring
//                 inside each result's ident/name is wrapped in a
//                 `.fix-label-highlight` span so the typed characters glow
//                 inside the map markers (same effect as Builder mode).
//                 Undefined / empty → no highlighting (labels render plain).
const renderGlobalSearchHighlights = (mapInstance, results, term) => {
  clearGlobalSearchHighlights(mapInstance);
  if (!mapInstance || !results || results.length === 0) return;

  if (!_globalHighlightLayer) _globalHighlightLayer = L.layerGroup();

  const LAYER_COLORS = {
    aerodrome: '#3b9eff',
    fix: '#b06bff',
    navaid: '#ff8c00'
  };

  // VOR-family types — same set used in renderNavaids() for consistency.
  const VOR_TYPES = new Set(['VOR', 'VOR/DME', 'DVOR/DME', 'DME']);

  // Phase 8: wraps the first case-insensitive occurrence of `term` inside
  // `rawText` with a `.fix-label-highlight` span. Each segment (before /
  // match / after) is independently HTML-escaped so the safety guarantee is
  // preserved while the span markup itself remains literal HTML in the
  // output. When `term` is empty or there's no match, the function returns
  // a fully-escaped plain string — i.e. the same output as `_safeEscape`.
  const _highlightMatch = (rawText) => {
    if (rawText == null || rawText === '') return '';
    if (!term) return _safeEscape(rawText);
    const haystack = String(rawText);
    const idx = haystack.toUpperCase().indexOf(term);
    if (idx === -1) return _safeEscape(haystack);
    const before = _safeEscape(haystack.slice(0, idx));
    const match = _safeEscape(haystack.slice(idx, idx + term.length));
    const after = _safeEscape(haystack.slice(idx + term.length));
    return `${before}<span class="fix-label-highlight">${match}</span>${after}`;
  };

  // Builds the DivIcon inner HTML for a search result.
  // Each type renders the real object's visual representation so the marker is
  // recognisable and visible even when its parent layer group is toggled off.
  //
  // 'result' — one item from the search index
  // 'color'  — hex string for this layer's highlight colour
  const _buildHighlightHtml = (result, color) => {
    // Shared glow shadow string — no pulsing, just a static warm glow.
    const glow = `0 0 6px ${color}, 0 0 14px ${color}88, 0 0 22px ${color}44`;

    // Shared helper: text label shown below an icon with a black outline so it
    // floats legibly over any map tile without a background box.
    // 'text' — the string(s) to display (already escaped by caller)
    //
    // Phase 11: `line-height: 1.2` is pinned explicitly. The ghost-fix label
    // (rendered via Leaflet tooltip with `.ghost-fix-label`) also pins the
    // same line-height. Without an explicit value, browser defaults can vary
    // slightly between fonts and force the highlight glyph baselines off the
    // ghost glyph baselines by 1-2 px — visible as a faint "doubling" halo
    // when the highlight overlays the ghost.
    const _floatingLabel = (text, textColor, fontSize = '8px') =>
      `<div style="` +
      `font-family:'JetBrains Mono',monospace;font-size:${fontSize};font-weight:600;` +
      `line-height:1.2;` +
      `color:${textColor};white-space:nowrap;text-align:center;margin-top:3px;` +
      `text-shadow:` +
      `-1px -1px 0 rgba(0,0,0,0.95),` +
      ` 1px -1px 0 rgba(0,0,0,0.95),` +
      `-1px  1px 0 rgba(0,0,0,0.95),` +
      ` 1px  1px 0 rgba(0,0,0,0.95),` +
      ` 0 0 6px rgba(0,0,0,0.8);">` +
      text +
      `</div>`;

    if (result.layer === 'fix') {
      // RNAV fix: bright filled dot (mirrors Builder's circleMarker highlight) with
      // the ident label below. Dot is 17 px border-box; translate -8.5 px centers it.
      // Phase 8: ident text now passes through `_highlightMatch` so the typed
      // characters inside the ident render with the .fix-label-highlight glow.
      const dot =
        `<div style="` +
        `width:17px;height:17px;border-radius:50%;` +
        `background:${color};border:2px solid #ffffff;` +
        `box-shadow:${glow};pointer-events:none;">` +
        `</div>`;
      const label = _floatingLabel(_highlightMatch(result.ident), color, '10px');
      return (
        `<div style="display:flex;flex-direction:column;align-items:center;` +
        `transform:translate(-50%,-8.5px);pointer-events:none;">` +
        dot + label +
        `</div>`
      );
    }

    if (result.layer === 'aerodrome') {
      if (result.tier === 'heliport') {
        // Heliport: H-ring icon (20px) + ICAO label below. Anchor offset = 10px.
        // Phase 8: both the ident and the (optional) name pass through
        // `_highlightMatch` so a query that lives in either substring lights up.
        const nameText = result.name && result.name !== result.ident
          ? `${_highlightMatch(result.ident)}&nbsp;<span style="opacity:0.7;font-weight:400;">${_highlightMatch(result.name)}</span>`
          : _highlightMatch(result.ident);
        const ring =
          `<div style="` +
          `width:20px;height:20px;border-radius:50%;` +
          `background:rgba(0,0,0,0.55);border:2px solid ${color};` +
          `box-shadow:${glow};` +
          `display:flex;align-items:center;justify-content:center;` +
          `font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;` +
          `color:${color};">H</div>`;
        const label = _floatingLabel(nameText, color);
        return (
          `<div style="display:flex;flex-direction:column;align-items:center;` +
          `transform:translate(-50%,-10px);pointer-events:none;">` +
          ring + label +
          `</div>`
        );
      }
      // Major or Regional airport: ✈ circle (26px) + ICAO + name label below.
      // Anchor offset = 13px (half the 26px circle).
      // Phase 8: ident + name both pass through `_highlightMatch` for the same
      // glow-on-match feedback as heliports above.
      const nameText = result.name && result.name !== result.ident
        ? `${_highlightMatch(result.ident)}&nbsp;<span style="opacity:0.7;font-weight:400;">${_highlightMatch(result.name)}</span>`
        : _highlightMatch(result.ident);
      const circle =
        `<div style="` +
        `width:26px;height:26px;border-radius:50%;` +
        `background:rgba(0,0,0,0.55);border:2px solid ${color};` +
        `box-shadow:${glow};` +
        `display:flex;align-items:center;justify-content:center;">` +
        `<span style="font-size:16px;color:${color};text-shadow:0 0 4px ${color};">&#9992;</span>` +
        `</div>`;
      const label = _floatingLabel(nameText, color);
      return (
        `<div style="display:flex;flex-direction:column;align-items:center;` +
        `transform:translate(-50%,-13px);pointer-events:none;">` +
        circle + label +
        `</div>`
      );
    }

    if (result.layer === 'navaid') {
      // Use the same .navaid-icon-inner / .navaid-label-inline HTML structure as
      // renderNavaids() so the highlight's geometry perfectly eclipses the base
      // marker when both are visible, rather than rendering as two distinct objects.
      // The glow is added via a drop-shadow filter on the SVG itself.
      // Only the ident is shown in the permanent label (same as the base marker);
      // the full name appears in the tooltip on hover.
      const isVor = VOR_TYPES.has(result.type);
      const labelClass = isVor ? 'navaid-label-inline--vor' : 'navaid-label-inline--ndb';

      let svgHtml;
      if (isVor) {
        // Hexagon — same viewBox and polygon geometry as renderNavaids() VOR icon.
        svgHtml =
          `<svg viewBox="-12 -12 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg"` +
          ` style="display:block;overflow:visible;` +
          `filter:drop-shadow(0 0 5px ${color}) drop-shadow(0 0 12px ${color}88);">` +
          `<polygon points="8,0 4,6.93 -4,6.93 -8,0 -4,-6.93 4,-6.93"` +
          ` fill="${color}22" stroke="${color}" stroke-width="1.5"/>` +
          `<circle r="2.2" fill="${color}"/>` +
          `</svg>`;
      } else {
        // Filled ring — same viewBox and radii as renderNavaids() NDB icon.
        svgHtml =
          `<svg viewBox="-10 -10 20 20" width="12" height="12" xmlns="http://www.w3.org/2000/svg"` +
          ` style="display:block;overflow:visible;` +
          `filter:drop-shadow(0 0 5px ${color}) drop-shadow(0 0 12px ${color}88);">` +
          `<circle r="6" fill="${color}22" stroke="${color}" stroke-width="1.5"/>` +
          `<circle r="2.2" fill="${color}"/>` +
          `</svg>`;
      }

      // The inline color override ensures the highlight colour (orange) shows instead
      // of the default --vor blue / --ndb magenta from the CSS class.
      // Phase 8: ident passes through `_highlightMatch` so the matching
      // substring inside the inline navaid label glows with .fix-label-highlight.
      return (
        `<div class="navaid-icon-inner">` +
        `<span class="navaid-label-inline ${labelClass}" style="color:${color};">${_highlightMatch(result.ident)}</span>` +
        svgHtml +
        `</div>`
      );
    }

    // Fallback for any future layer types: generic glowing dot.
    return (
      `<div style="` +
      `width:14px;height:14px;border-radius:50%;` +
      `background:${color};border:2px solid #ffffff;` +
      `box-shadow:${glow};` +
      `transform:translate(-50%,-50%);pointer-events:none;">` +
      `</div>`
    );
  };

  results.forEach((result) => {
    if (result.lat == null || result.lon == null) return;

    const color = LAYER_COLORS[result.layer] || '#ffffff';

    const icon = L.divIcon({
      className: 'global-search-highlight',
      html: _buildHighlightHtml(result, color),
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const marker = L.marker([result.lat, result.lon], {
      icon,
      interactive: true,
      zIndexOffset: 1000   // always float above the normal data markers
    });

    // Build the tooltip — ident is always shown; name, type, freq appear when available.
    const tooltipLines = [`<b>${_safeEscape(result.ident)}</b>`];
    if (result.name && result.name !== result.ident) {
      tooltipLines.push(`<span style="font-size:10px;color:#ccc">${_safeEscape(result.name)}</span>`);
    }
    if (result.type) {
      tooltipLines.push(`<span style="font-size:10px;color:#aaa">${_safeEscape(result.type)}</span>`);
    }
    if (result.freq != null) {
      // Use the same MHz/kHz display logic as renderNavaids: VOR ≥ 100 MHz, NDB < 1 MHz.
      const freqDisplay = result.freq >= 100
        ? `${result.freq.toFixed(2)} MHz`
        : `${(result.freq * 1000).toFixed(0)} kHz`;
      tooltipLines.push(`<span style="font-size:10px;color:#46a0ff">${_safeEscape(freqDisplay)}</span>`);
    }
    const layerLabel = { aerodrome: 'Aerodrome', fix: 'RNAV Fix', navaid: 'NAVAID' }[result.layer] || result.layer;
    tooltipLines.push(`<span style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.06em">${_safeEscape(layerLabel)}</span>`);

    marker.bindTooltip(tooltipLines.join('<br>'), {
      direction: 'top',
      offset: [0, -14],
      className: 'fix-tooltip',
      permanent: false
    });

    // Click: fly to the result at a sensible zoom level and open its tooltip.
    marker.on('click', (e) => {
      L.DomEvent.stop(e);
      mapInstance.flyTo([result.lat, result.lon], Math.max(mapInstance.getZoom(), 11), {
        duration: 0.5
      });
      marker.openTooltip();
    });

    _globalHighlightLayer.addLayer(marker);
  });

  _globalHighlightLayer.addTo(mapInstance);
  console.log(`[MapLayers] Global search: ${results.length} contour-highlight markers rendered.`);
};


// ── PHASE 10.5 PART A: AIRSPACE POLYGON OVERLAYS ─────────────────────────────
// Renders the Hong Kong TMA sector polygons and CTR zones from the
// pre-generated MEDIA/airspaces_aip.json file onto the Leaflet map.
//
// Each airspace type gets its own distinct visual style:
//   TMA — subtle blue fill + dashed blue stroke (major controlled airspace sectors)
//   CTR — subtle amber fill + dashed amber stroke (control zone around an airport)
//   ATZ — subtle green fill + dotted green stroke (aerodrome traffic zone, future)
//
// Two independent LayerGroups are returned so the user can toggle TMA and CTR/ATZ
// separately via the right toolbar Airspaces sub-panel.
//
// 'mapInstance' — the Leaflet map
// 'airspaces'   — array from loadAirspaces(): [{ name, type, coordinates }]
//
// Returns: { tmaLayer, ctrLayer } — both added to the map by default (ON).
// Computes the 2D convex hull of an array of [lat, lon] points using
// Andrew's monotone chain algorithm. Returns a smaller array of the
// outermost points in counter-clockwise order.
//
// This is used to draw the TMA Outer Boundary — a single clean polygon
// that wraps all TMA sector vertices without showing internal sector lines.
//
// 'points' — array of [lat, lon] pairs collected from all TMA polygons



// ── Phase 7: Airspace hover-tooltip helper ───────────────────────────────────
// Builds and binds a delayed-show tooltip that fires when the cursor rests
// over an airspace **border** (not the fill) for `_AIRSPACE_HOVER_DELAY_MS`
// milliseconds. Each airspace owns its own timer + tooltip object so
// overlapping airspaces don't fight each other.
//
// Why border-only? Hong Kong airspace polygons heavily overlap (TMA + FIR +
// sectors all cover the same ground). Hovering over the fills triggered every
// underlying polygon at once — chaotic. Restricting interaction to the stroke
// gives the user a clear, deliberate target for each airspace.
//
// How border-only is implemented:
//   1. The visible polygon stays `interactive: false` (no events from fill).
//   2. We draw a sibling "hit polyline" (`L.polyline`) along the same vertex
//      ring, with a wide stroke (8 px) and a near-invisible paint
//      (`color: 'rgba(0,0,0,0.001)'`) so the SVG has visible-painted hit area
//      without showing on screen. CSS class `airspace-border-hit` also forces
//      `pointer-events: stroke` as a belt-and-suspenders fallback in case
//      Leaflet's default hit-test doesn't latch on.
//   3. The polyline is added to / removed from the map in lock-step with the
//      polygon via the polygon's own 'add' / 'remove' events, so the toolbar
//      visibility checkboxes still drive everything through the polygon
//      reference (no public API change for callers).
//
// Tooltip behaviour:
//   • `mouseover` on the hit polyline starts a 2-second timer.
//   • `mousemove` updates the latest cursor latlng so the tooltip can render
//     at the cursor's *current* position when the timer fires (not at the
//     position captured when hover began).
//   • `mouseout` cancels the pending timer and removes any open tooltip.
//   • While visible, mousemove also keeps the tooltip glued to the cursor.
//
// 'mapInstance' — the Leaflet map (needed to add/remove the tooltip overlay)
// 'polygon'     — the visible L.polygon (stays non-interactive)
// 'name'        — display name, e.g. "HK TMA"
// 'type'        — classification, e.g. "TMA"
// 'coordinates' — array of [lat, lon] vertices (used to draw the hit polyline)
const _AIRSPACE_HOVER_DELAY_MS = 2000;
// Phase 12: Airspace stacking panes — five dedicated Leaflet panes placed
// between the tile layer (z=200) and ghost fix layer (z=390) so airspace fills
// are always visually below all markers, fixes, and symbols.  Within the group,
// z-index order mirrors ATC significance (bottom-most = widest extent):
//   FIR + FIZ + SEC (201) → TMA (202) → CTR (203) → ATZ (204) → UCARA (205)
const _ensureAirspacePanes = (mapInstance) => {
  const panes = [
    { name: 'airspaceFIRPane', z: 201 },  // HK FIR + FIZ + SEC (bottom-most)
    { name: 'airspaceTMAPane', z: 202 },  // TMA + outer boundary
    { name: 'airspaceCTRPane', z: 203 },  // CTR
    { name: 'airspaceATZPane', z: 204 },  // ATZ
    { name: 'airspaceUCARAPane', z: 205 },  // UCARA (top of airspace group)
  ];
  panes.forEach(({ name, z }) => {
    if (!mapInstance.getPane(name)) {
      const pane = mapInstance.createPane(name);
      pane.style.zIndex = String(z);
      pane.style.pointerEvents = 'none';   // visible fills are non-interactive
    }
  });
};

// Returns the correct Leaflet pane name for a given airspace type string.
const _getAirspacePaneName = (type) => {
  if (type === 'TMA') return 'airspaceTMAPane';
  if (type === 'CTR') return 'airspaceCTRPane';
  if (type === 'ATZ') return 'airspaceATZPane';
  if (type === 'UCARA') return 'airspaceUCARAPane';
  return 'airspaceFIRPane';   // FIR, FIZ, SEC all sit in the bottom tier
};


// Streamlined tooltip body: Name, Type, Class, Vertical Boundaries.
//
// Phase 7 (data integration): `airspaces_aip.json` now carries real `class`
// and `limits` values per airspace (e.g. `"C"`, `"A/C/G"`, `"SFC - 4500 FT"`,
// `"SFC - UNL"`). We render those directly. The `—` em-dash fallback remains
// in place for any record that's missing a field, so the tooltip is robust if
// a future airspace is added without complete metadata.
const _buildAirspaceTooltipHtml = (name, type, airspaceClass, limits) => {
  const PLACEHOLDER = '—';
  const classStr = (airspaceClass && String(airspaceClass).trim()) || PLACEHOLDER;
  const limitsStr = (limits && String(limits).trim()) || PLACEHOLDER;
  return (
    `<span class="ah-name">${name}</span>` +
    `<span class="ah-row"><span class="ah-key">Type:</span>${type}</span>` +
    `<span class="ah-row"><span class="ah-key">Class:</span>${classStr}</span>` +
    `<span class="ah-row"><span class="ah-key">Vertical Boundaries:</span>${limitsStr}</span>`
  );
};

const _attachAirspaceHoverTooltip = (mapInstance, polygon, name, type, coordinates, airspaceClass, limits) => {
  // Pre-compute the tooltip body once — name/type/class/limits are immutable
  // at runtime. The two new args (`airspaceClass`, `limits`) come straight
  // from the airspaces_aip.json record; either may be undefined for older
  // entries, and the builder renders `—` in that case.
  const html = _buildAirspaceTooltipHtml(name, type, airspaceClass, limits);

  // Build the invisible "hit polyline" that traces the polygon border.
  // We close the ring (push the first point at the end) so the user can hover
  // along the entire boundary, not just the open edge between first and last
  // vertices. Coordinates come in as [lat, lon] pairs, which is the same
  // shape L.polyline expects.
  const ring = coordinates.slice();
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  }

  const borderHit = L.polyline(ring, {
    color: 'rgba(0,0,0,0.001)',  // near-zero paint so SVG hit-tests but nothing shows
    weight: 8,                     // generous hit area along the stroke
    opacity: 1,                     // we already use a transparent colour above
    interactive: true,
    bubblingMouseEvents: true,           // clicks still bubble to the map (MV tool flow)
    className: 'airspace-border-hit'
  });

  // Per-airspace state. `_timer` is the dwell handle; `_tooltip` is the
  // currently-open L.tooltip overlay (null when hidden); `_lastLatLng` is the
  // most recent cursor position seen on the border (used both for first show
  // and for follow-the-cursor while visible).
  let _timer = null;
  let _tooltip = null;
  let _lastLatLng = null;

  const _hideTooltip = () => {
    if (_tooltip) {
      mapInstance.removeLayer(_tooltip);
      _tooltip = null;
    }
  };

  borderHit.on('mouseover', (e) => {
    _lastLatLng = e.latlng;
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
      _timer = null;
      if (_tooltip) return;   // already open from a previous hover cycle
      _tooltip = L.tooltip({
        sticky: false,
        direction: 'top',
        opacity: 1,
        className: 'airspace-hover-tooltip',
        offset: [0, -8]
      })
        .setLatLng(_lastLatLng)
        .setContent(html)
        .addTo(mapInstance);
    }, _AIRSPACE_HOVER_DELAY_MS);
  });

  borderHit.on('mousemove', (e) => {
    _lastLatLng = e.latlng;
    // While the tooltip is visible, keep it glued to the cursor so the spec's
    // "renders exactly next to the current mouse position" holds even after
    // the user moves along the border.
    if (_tooltip) _tooltip.setLatLng(_lastLatLng);
  });

  borderHit.on('mouseout', () => {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _hideTooltip();
  });

  // Mirror polygon visibility on the hit polyline. When the user toggles a
  // layer off in the toolbar, the polygon fires 'remove' — cleanup matches.
  polygon.on('add', () => {
    if (!mapInstance.hasLayer(borderHit)) borderHit.addTo(mapInstance);
  });
  polygon.on('remove', () => {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _hideTooltip();
    if (mapInstance.hasLayer(borderHit)) mapInstance.removeLayer(borderHit);
  });
};


// Renders all airspace polygons from the pre-parsed airspaces_aip.json data.
// Returns an object with references for each polygon so main.js can wire the
// Airspaces sub-panel checkboxes to addTo/removeLayer calls:
//   • tmaOuterLayer — L.polygon for the outer TMA boundary (convex hull of sectors 1-8, 13)
//   • tmaSectors    — { [name]: L.polygon } for each individual TMA sector + SP2
//   • ctrPolygons   — { [name]: L.polygon } for each CTR zone
//   • fizPolygons   — { [name]: L.polygon } for each FIZ zone
//   • atzPolygons   — { [name]: L.polygon } for each ATZ zone
//
// Default visibility on startup:
//   • TMA sectors (T-01 through T-13): ON
//   • TMA SP2, FIZ, ATZ:               OFF (group toggles default off in panel)
//   • CTR:                              ON
//   • TMA outer boundary:               ON
//
// Per Phase 10.5: no cursor-following tooltips — names shown via click popup only.
//
// 'mapInstance' — the Leaflet map returned by initMap()
// 'airspaces'   — array of { name, type, coordinates, class, limits }
//                 from loadAirspaces(). `class` (e.g. "C", "A/C/G") and
//                 `limits` (e.g. "SFC - 4500 FT") come from the AIP and feed
//                 the hover tooltip — both are optional and will fall back
//                 to a `—` placeholder if a record omits them.
const renderAirspaces = (mapInstance, airspaces) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderAirspaces: No map instance provided.');
    return { tmaOuterLayer: null, tmaSectors: {}, ctrPolygons: {}, fizPolygons: {}, atzPolygons: {}, firPolygons: {}, sectorPolygons: {}, ucaraPolygons: {} };
  }

  if (!airspaces || airspaces.length === 0) {
    console.warn('[MapLayers] renderAirspaces: No airspace data provided.');
    return { tmaOuterLayer: null, tmaSectors: {}, ctrPolygons: {}, fizPolygons: {}, atzPolygons: {}, firPolygons: {}, sectorPolygons: {}, ucaraPolygons: {} };
  }

  // Phase 12: Create dedicated panes for each airspace tier.
  _ensureAirspacePanes(mapInstance);
  // Per-polygon reference maps — keyed by the exact name string from the JSON.
  const tmaSectors = {};
  const ctrPolygons = {};
  const fizPolygons = {};
  const atzPolygons = {};
  const firPolygons = {};
  const sectorPolygons = {};
  const ucaraPolygons = {};

  // Only sectors 1-8 and 13 define the outer TMA envelope.
  // Sub-sectors 02F, 03F and inner sectors 09-12 are excluded from the hull so the
  // outer boundary traces the real TMA perimeter, not a larger convex approximation.
  const OUTER_HULL_SECTORS = new Set([
    'HK TMA',
  ]);

  // Short display labels used in click popups. Using T-XX keeps labels compact
  // and consistent with ATC sector notation in Brazilian airspace charts.
  const TMA_SHORT_NAMES = {
    'HK TMA': 'HK-TMA',
  };



  airspaces.forEach((airspace) => {
    // Phase 7 data integration: `class` and `limits` are pulled from the
    // updated `airspaces_aip.json` schema. Both are optional — older or
    // future records without them will simply render the `—` placeholder
    // inside the hover tooltip body.
    const { name, type, coordinates, class: airspaceClass, limits } = airspace;

    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      console.warn(`[MapLayers] renderAirspaces: "${name}" has fewer than 3 coordinates. Skipping.`);
      return;
    }

    // Phase 26: Visual style per airspace classification.
    let fillColor, strokeColor, fillOpacity, weight, dashArray;
    if (type === 'TMA') {
      // Slate-100 fill / Slate-400 stroke — neutral, doesn't compete with CTR blue.
      fillColor = '#f1f5f9';
      strokeColor = 'rgba(148,163,184,0.4)';
      fillOpacity = 0.05;
      weight = 1.5;
      dashArray = '6,4';
    } else if (type === 'CTR') {
      // Light blue — primary visual landmark for controlled terminal areas.
      fillColor = '#0ea5e9';
      strokeColor = 'rgba(14,165,233,0.5)';
      fillOpacity = 0.08;
      weight = 1.5;
      dashArray = '4,3';
    } else if (type === 'FIZ') {
      // Purple — kept from Phase 10; doesn't clash with the new blue CTRs.
      fillColor = '#a855f7';
      strokeColor = 'rgba(168,85,247,0.5)';
      fillOpacity = 0.07;
      weight = 1;
      dashArray = '4,4';
    } else if (type === 'ATZ') {
      // ATZ — orange; retains good contrast against both the gray TMA and blue CTR.
      fillColor = '#f97316';
      strokeColor = 'rgba(249,115,22,0.55)';
      fillOpacity = 0.07;
      weight = 1;
      dashArray = '3,3';
    } else if (type === 'FIR') {
      // Light green, very transparent — background layer for the entire FIR.
      fillColor = '#4ade80';
      strokeColor = 'rgba(74,222,128,0.3)';
      fillOpacity = 0.03;
      weight = 1;
      dashArray = null;
    } else if (type === 'SEC') {
      // FIR Sectors — dashed border, very light green fill.
      fillColor = '#4ade80';
      strokeColor = 'rgba(74,222,128,0.5)';
      fillOpacity = 0.04;
      weight = 1.5;
      dashArray = '5, 5';
    } else if (type === 'UCARA') {
      // Uncontrolled Airspace Reporting Areas — Yellowish/Amber, dashed.
      fillColor = '#facc15';
      strokeColor = 'rgba(250,204,21,0.5)';
      fillOpacity = 0.06;
      weight = 1.2;
      dashArray = '4, 2';
    } else {
      // Unknown types - fallback to a neutral gray
      fillColor = '#94a3b8';
      strokeColor = 'rgba(148,163,184,0.5)';
      fillOpacity = 0.05;
      weight = 1;
      dashArray = '2,2';
    }

    // Phase 7 (border-only follow-up): the visible polygon is back to
    // `interactive: false` — fills no longer fire events. Hover detection is
    // delegated to a sibling "hit polyline" along the border, created inside
    // `_attachAirspaceHoverTooltip`. This eliminates the chaos of multiple
    // overlapping polygons all firing mouseover from the same fill area.
    const polygon = L.polygon(coordinates, {
      color: strokeColor,
      fillColor: fillColor,
      fillOpacity: fillOpacity,
      weight: weight,
      dashArray: dashArray,
      interactive: false,
      pane: _getAirspacePaneName(type)
    });

    // Phase 7: hover-tooltip wiring.
    // Helper sets up a non-interactive sibling polyline that catches mouseover
    // along the border only, with a 2 s dwell delay before showing the tooltip.
    // Tooltip body shows Name / Type / Class / Vertical Boundaries — Class and
    // Vertical Boundaries now come from the AIP-enriched `class` and `limits`
    // fields on the JSON record (see destructure above).
    _attachAirspaceHoverTooltip(mapInstance, polygon, name, type, coordinates, airspaceClass, limits);

    // Phase 31/40: Default visibility profile.
    // ON:  TMA sectors, CTR, FIZ, ATZ, FIR, SEC, UCARA.
    const defaultVisible = (type === 'TMA') || (type === 'CTR') || (type === 'FIZ') || (type === 'ATZ') || (type === 'FIR') || (type === 'SEC') || (type === 'UCARA');
    if (defaultVisible) {
      polygon.addTo(mapInstance);
    }

    if (type === 'TMA') {
      tmaSectors[name] = polygon;

    } else if (type === 'CTR') {
      ctrPolygons[name] = polygon;
    } else if (type === 'FIZ') {
      fizPolygons[name] = polygon;
    } else if (type === 'FIR') {
      firPolygons[name] = polygon;
    } else if (type === 'SEC') {
      sectorPolygons[name] = polygon;
    } else if (type === 'UCARA') {
      ucaraPolygons[name] = polygon;
    } else {
      atzPolygons[name] = polygon;
    }
  });

  const tmaPolygons = [];

  airspaces.forEach(as => {
    if (as.type === 'TMA' && OUTER_HULL_SECTORS.has(as.name)) {
      let ring = as.coordinates.map(c => [c[1], c[0]]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }
      tmaPolygons.push(turf.polygon([ring]));
    }
  });

  let tmaOuterLayer = null;
  if (tmaPolygons.length > 0) {
    let masterFeature = tmaPolygons[0];
    for (let i = 1; i < tmaPolygons.length; i++) {
      masterFeature = turf.union(turf.featureCollection([masterFeature, tmaPolygons[i]]));
    }
    const finalCoords = masterFeature.geometry.coordinates[0].map(c => [c[1], c[0]]);
    // Phase 26: Outer boundary — white/gray stroke, no fill, clearly delineates
    // the TMA envelope without obscuring the sector fills underneath.
    tmaOuterLayer = L.polygon(finalCoords, {
      color: '#cbd5e1',
      fillOpacity: 0,
      opacity: 0.7,
      weight: 2.5,
      interactive: false
    });
    tmaOuterLayer.addTo(mapInstance);
  }

  const tmaCount = Object.keys(tmaSectors).length;
  const ctrCount = Object.keys(ctrPolygons).length;
  const fizCount = Object.keys(fizPolygons).length;
  const atzCount = Object.keys(atzPolygons).length;
  console.log(
    `[MapLayers] Airspace overlays rendered: ${tmaCount} TMA sector(s), ` +
    `${ctrCount} CTR(s), ${fizCount} FIZ(s), ${atzCount} ATZ(s). ` +
    `TMA outer boundary: ${tmaOuterLayer ? 'yes' : 'no'}.`
  );

  return { tmaOuterLayer, tmaSectors, ctrPolygons, fizPolygons, atzPolygons, firPolygons, sectorPolygons, ucaraPolygons };
};


// Phase 28: Apply a global symbol scale factor to all currently-visible RNAV fix markers.
//
// Leaflet L.circleMarker radius is specified in screen pixels via the options object;
// it does NOT respond to CSS variables or font-size changes. This function is the
// escape hatch: it walks every marker in _fixMarkerMap and calls setRadius() with
// a scaled version of each marker's original (default) radius.
//
// 'scale' — a float from 0.5 to 2.0. At 1.0 the markers stay at their built-in 3px radius.
//           Called from main.js _wireSettingsPanel() on the 'change' event so we only
//           iterate markers when the user releases the slider, not on every drag frame.
const applySymbolScale = (scale) => {
  _fixMarkerMap.forEach((marker) => {
    // Each marker stores its original radius in defaultStyle so we can scale from the
    // true baseline rather than compounding previous scale calls.
    const baseRadius = marker.defaultStyle?.radius ?? 3;
    // Math.max(1, ...) prevents the radius from collapsing to 0 at the low end.
    marker.setRadius(Math.max(1, Math.round(baseRadius * scale)));
  });
};


// Phase 39: REA (Special Aircraft Routes) Layer Control
// ─────────────────────────────────────────────────────────────────────────────
// Toggles the visibility of REA corridor polylines and ensures that mandatory
// VFR waypoints (gates/positions) are rendered while the layer is active.
const renderREA = async (mapInstance, visible) => {
  if (!_vfrLayersInitialized) await _initVfrLayers(mapInstance);

  if (visible) {
    _reaLayerGroup.addTo(mapInstance);
  } else {
    mapInstance.removeLayer(_reaLayerGroup);
  }
  _updateVfrWaypointsVisibility(mapInstance);
};

// Phase 39: REH (Helicopter Routes) Layer Control
// ─────────────────────────────────────────────────────────────────────────────
// Toggles the visibility of REH corridor polylines and ensures that mandatory
// helicopter-specific waypoints are rendered while the layer is active.
const renderREH = async (mapInstance, visible) => {
  if (!_vfrLayersInitialized) await _initVfrLayers(mapInstance);

  if (visible) {
    _rehLayerGroup.addTo(mapInstance);
  } else {
    mapInstance.removeLayer(_rehLayerGroup);
  }
  _updateVfrWaypointsVisibility(mapInstance);
};

// Private: Initializes VFR data and LayerGroups.
const _initVfrLayers = async (mapInstance) => {
  if (_vfrLayersInitialized) return;

  const data = await loadVfrData();
  _vfrData = data;

  _reaLayerGroup = L.layerGroup();
  _rehLayerGroup = L.layerGroup();
  _vfrWaypointsLayer = L.layerGroup();

  _drawVfrCorridors();

  _vfrLayersInitialized = true;
};

// Private: Synchronizes the visibility of VFR-specific waypoints.
// If either REA or REH is active, the waypoints layer must be on the map.
const _updateVfrWaypointsVisibility = (mapInstance) => {
  const reaOn = mapInstance.hasLayer(_reaLayerGroup);
  const rehOn = mapInstance.hasLayer(_rehLayerGroup);

  if (reaOn || rehOn) {
    if (!mapInstance.hasLayer(_vfrWaypointsLayer)) {
      _vfrWaypointsLayer.addTo(mapInstance);
    }
    _drawVfrWaypoints(reaOn, rehOn);
  } else {
    if (mapInstance.hasLayer(_vfrWaypointsLayer)) {
      mapInstance.removeLayer(_vfrWaypointsLayer);
    }
    _vfrWaypointsLayer.clearLayers();
    if (_vfrFlowLayer) _vfrFlowLayer.clearLayers();
  }
};

// Private: Renders the actual VFR waypoint markers with distinct aesthetics.
const _drawVfrWaypoints = (reaOn, rehOn) => {
  _vfrWaypointsLayer.clearLayers();

  if (reaOn && _vfrData?.reaWaypoints) {
    _vfrData.reaWaypoints.forEach(wp => {
      const icon = L.divIcon({
        className: 'vfr-waypoint-rea',
        html: `<div class="vfr-triangle"></div><div class="vfr-label">${_safeEscape(wp.name)}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      L.marker([wp.lat, wp.lon], { icon, interactive: false }).addTo(_vfrWaypointsLayer);
    });
  }

  if (rehOn && _vfrData?.rehFixes) {
    _vfrData.rehFixes.forEach(wp => {
      const icon = L.divIcon({
        className: 'vfr-waypoint-reh',
        html: `<div class="vfr-circle"></div><div class="vfr-label">${_safeEscape(wp.name)}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      L.marker([wp.lat, wp.lon], { icon, interactive: false }).addTo(_vfrWaypointsLayer);
    });
  }
};

// Private: Renders VFR corridor segments as parallel 'axis' lines.
const _drawVfrCorridors = () => {
  if (!_reaLayerGroup || !_rehLayerGroup) return;

  _reaLayerGroup.clearLayers();
  _rehLayerGroup.clearLayers();

  const NM_TO_KM = 1.852;
  const OFFSET_NM = 1.0;  // 2.0NM total width (1.0NM each side)

  const vfrLineStyle = {
    color: '#cbd5e1',
    weight: 1.5,
    opacity: 0.5,
    interactive: false
  };

  // ── REA Corridors (Fixed-Wing) ─────────────────────────────────────────────
  if (_vfrData?.reaSegments) {
    _vfrData.reaSegments.forEach(seg => {
      if (!seg.pointA || !seg.pointB) return;
      try {
        const coords = [[seg.pointA.lon, seg.pointA.lat], [seg.pointB.lon, seg.pointB.lat]];
        const line = turf.lineString(coords);
        const left = turf.lineOffset(line, OFFSET_NM * NM_TO_KM, { units: 'kilometers' });
        const right = turf.lineOffset(line, -OFFSET_NM * NM_TO_KM, { units: 'kilometers' });

        L.polyline(left.geometry.coordinates.map(c => [c[1], c[0]]), vfrLineStyle).addTo(_reaLayerGroup);
        L.polyline(right.geometry.coordinates.map(c => [c[1], c[0]]), vfrLineStyle).addTo(_reaLayerGroup);

        // Invisible hit area
        L.polyline([[seg.pointA.lat, seg.pointA.lon], [seg.pointB.lat, seg.pointB.lon]], {
          color: 'transparent',
          weight: 20,
          interactive: true
        }).addTo(_reaLayerGroup);
      } catch (err) { }
    });
  }

  // ── REH Corridors (Helicopter) ──────────────────────────────────────────────
  if (_vfrData?.rehSegments) {
    const rehStyle = { ...vfrLineStyle, dashArray: '4, 4' };
    _vfrData.rehSegments.forEach(seg => {
      if (!seg.pointA || !seg.pointB) return;
      try {
        const coords = [[seg.pointA.lon, seg.pointA.lat], [seg.pointB.lon, seg.pointB.lat]];
        const line = turf.lineString(coords);
        const left = turf.lineOffset(line, OFFSET_NM * NM_TO_KM, { units: 'kilometers' });
        const right = turf.lineOffset(line, -OFFSET_NM * NM_TO_KM, { units: 'kilometers' });

        L.polyline(left.geometry.coordinates.map(c => [c[1], c[0]]), rehStyle).addTo(_rehLayerGroup);
        L.polyline(right.geometry.coordinates.map(c => [c[1], c[0]]), rehStyle).addTo(_rehLayerGroup);
      } catch (err) { }
    });
  }
};

/**
 * Helper: Adds a small stemmed directional arrow on the corridor centerline.
 */
const _addArrow = (lat, lon, angleDeg, layerGroup) => {
  const arrowIcon = L.divIcon({
    className: 'vfr-arrow-icon',
    html: `
      <svg width="24" height="24" viewBox="0 0 24 24" style="transform: rotate(${angleDeg - 90}deg); opacity: 0.8;">
        <!-- Stemmed Arrow Design -->
        <line x1="2" y1="12" x2="20" y2="12" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" />
        <path d="M14 6L21 12L14 18" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  L.marker([lat, lon], { icon: arrowIcon, interactive: false }).addTo(layerGroup);
};

/**
 * Helper: Calculates heading between two points.
 */
const _calculateHeading = (p1, p2) => {
  const dy = p2.lat - p1.lat;
  const dx = Math.cos(Math.PI / 180 * p1.lat) * (p2.lon - p1.lon);
  let angle = Math.atan2(dx, dy) * 180 / Math.PI;
  return (angle + 360) % 360;
};




// ── Phase 10: Ghost Fix Pane Setup ────────────────────────────────────────────
// The ghost pane sits at z-index 390 — just below the default overlayPane (400)
// where interactive fix circleMarkers live. Ghost dots are always visually
// beneath the active markers so they never intercept mouse events that belong
// to the interactive layer above.
//
// pointerEvents: 'none' on the pane element ensures no mouse activity reaches
// these decorative dots even if the individual marker options were somehow wrong.

// Renders a violet glow DivIcon at the ghost dot's position so the user gets clear
// visual feedback before clicking. The DivIcon itself is non-interactive (pointer-events:none
// on inner HTML) so the ghost dot underneath still receives the click.
const _showGhostHoverGlow = (fix) => {
  if (!_ghostMapRef) return;
  _removeGhostHoverGlow();
  const color = '#b06bff';
  const glow = `0 0 6px ${color}, 0 0 14px ${color}88, 0 0 22px ${color}44`;
  const dot =
    `<div style="width:17px;height:17px;border-radius:50%;` +
    `background:${color};border:2px solid #ffffff;` +
    `box-shadow:${glow};pointer-events:none;"></div>`;
  const label =
    `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;` +
    `line-height:1.2;color:${color};white-space:nowrap;text-align:center;margin-top:3px;` +
    `text-shadow:-1px -1px 0 rgba(0,0,0,0.95), 1px -1px 0 rgba(0,0,0,0.95),` +
    `-1px 1px 0 rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95),` +
    `0 0 6px rgba(0,0,0,0.8);">${_safeEscape(fix.ident)}</div>`;
  const html =
    `<div style="display:flex;flex-direction:column;align-items:center;` +
    `transform:translate(-50%,-8.5px);pointer-events:none;">` +
    dot + label + `</div>`;
  const icon = L.divIcon({ className: 'ghost-hover-glow', html, iconSize: [0, 0], iconAnchor: [0, 0] });
  _ghostHoverMarker = L.marker([fix.lat, fix.lon], { icon, interactive: false, zIndexOffset: 500 });
  _ghostHoverMarker.addTo(_ghostMapRef);
};

const _removeGhostHoverGlow = () => {
  if (_ghostHoverMarker && _ghostMapRef) {
    _ghostMapRef.removeLayer(_ghostHoverMarker);
    _ghostHoverMarker = null;
  }
};

// Re-evaluates ghost fix label visibility using a zoom-dependent quantum.
// Low zoom (≤9): coarse 667 quantum (~165 m cells) — avoids label noise.
// High zoom (≥10): fine 3333 quantum (~30 m cells) — resolves close threshold fixes.
// Skips the expensive DOM pass if the quantum hasn't changed since last call.
const _applyGhostLabels = (quantum) => {
  if (quantum === _currentLabelQuantum) return;
  _currentLabelQuantum = quantum;

  const cellKey = (lat, lon) =>
    `${Math.round(lat * quantum)}|${Math.round(lon * quantum)}`;

  // Pre-seed from navaid/aerodrome positions (re-quantized at current zoom level).
  const seen = new Set(
    _crossLayerOccupiedCoords.map(([lat, lon]) => cellKey(lat, lon))
  );

  for (const marker of _ghostMarkers) {
    marker.unbindTooltip();
    const fix = marker._fixData;
    if (!fix) continue;
    const key = cellKey(fix.lat, fix.lon);
    // Skip if already claimed by the dedup grid, OR if suppressed by a holding badge —
    // the "H" marker is the primary label for holding fixes; showing both clutters the map.
    if (!seen.has(key) && !_suppressedGhostIdents.has(fix.ident?.toUpperCase())) {
      seen.add(key);
      marker.bindTooltip(fix.ident, {
        permanent: true,
        direction: 'bottom',
        className: 'ghost-fix-label',
        offset: [0, 12]
      });
    }
  }
};


// Forces _applyGhostLabels to run again on the next call even if the quantum
// has not changed. Used after _suppressedGhostIdents is mutated so the DOM
// immediately reflects the updated suppression state.
const _refreshGhostLabels = () => {
  const saved = _currentLabelQuantum;
  _currentLabelQuantum = null;
  if (saved !== null) _applyGhostLabels(saved);
};

const _ensureGhostFixPane = (mapInstance) => {
  if (mapInstance.getPane('ghostFixPane')) return;   // already created — nothing to do
  const pane = mapInstance.createPane('ghostFixPane');
  pane.style.zIndex = '390';    // just below overlayPane=400
  pane.style.pointerEvents = 'none';  // purely decorative — no mouse interaction
};


// Renders all RNAV fixes as faint, non-interactive ghost dots permanently visible
// on the map. The ghost dots share the same radius (3 px) and screen position as
// the interactive fix markers, so a search-result highlight marker visually
// "activates" the ghost dot beneath it — zero extra click targets, clean pop-in effect.
//
// Design intent:
//   • Very low opacity so they read as a subtle positional reference, not noise.
//   • No labels, no tooltips, no mouse handlers — just SVG circles.
//   • All placed in 'ghostFixPane' (z-index 390) so they never compete with the
//     interactive waypointLayer (overlayPane, z-index 400).
//
// 'mapInstance'  — the Leaflet map
// 'waypointData' — array of { ident, lat, lon } objects from loadWaypoints()
//
// Returns: the L.layerGroup holding all ghost markers, already added to the map.
//          Returns null on bad input (caller can skip wiring the toggle).
const renderGhostFixes = (mapInstance, waypointData) => {
  if (!mapInstance) {
    console.error('[MapLayers] renderGhostFixes: No map instance provided.');
    return null;
  }
  if (!waypointData || waypointData.length === 0) {
    console.warn('[MapLayers] renderGhostFixes: No waypoint data provided. Nothing to render.');
    return null;
  }

  _ensureGhostFixPane(mapInstance);
  _ghostMarkers = [];         // reset so re-render (unlikely) doesn't leak stale refs
  _currentLabelQuantum = null; // force full label pass on first zoomend call

  const t1Layer = L.layerGroup(); // High Airways
  const t2Layer = L.layerGroup(); // Low Airways
  const t3Layer = L.layerGroup(); // TMA
  const t4Layer = L.layerGroup(); // Other

  const layerMap = { 1: t1Layer, 2: t2Layer, 3: t3Layer, 4: t4Layer };

  const validFixes = waypointData.filter((f) => f.ident && f.lat != null && f.lon != null);

  // ── Phase 11: Proximity de-cluttering ───────────────────────────────────────
  // Some fix records share identical or near-identical coordinates (legacy
  // duplicates, named procedure points stacked at a single waypoint, etc.). At
  // the 8 px label size their text labels overlap into an illegible smear.
  //
  // CSS alone cannot solve this because the labels live in independent
  // marker DOM nodes — there is no parent–sibling relationship that a CSS
  // selector could use to detect or hide collisions. The lightest viable
  // approach is a single bucket-dedup pass at render time:
  //
  //   1. Quantise each fix's coordinates into a grid cell (quantum is zoom-dependent).
  //   2. The FIRST fix that lands in a given cell gets its label rendered.
  //   3. Subsequent fixes in the same cell render their DOT only — no label.
  //
  // Labels are applied by _applyGhostLabels() rather than inline, so the quantum
  // can be adjusted on zoomend without re-rendering all markers.

  for (const fix of validFixes) {
    const tier = fix.tier || 4;

    // Unified ghost style: same teal color as active fixes but faded.
    const baseColor = '#7ec8e3';

    const marker = L.circleMarker([fix.lat, fix.lon], {
      radius: 3.6,
      color: baseColor,
      fillColor: baseColor,
      fillOpacity: 0.45,
      weight: 1,
      opacity: 0.45,
      interactive: true,   // SVG path responds when pane pointer-events is 'auto'
      bubblingMouseEvents: false,
      pane: 'ghostFixPane',
      className: `ghost-fix-marker ghost-fix-t${tier}`
    });

    // Store fix data for _applyGhostLabels() to rebind tooltips on zoom changes.
    // Tooltip label alignment: direction:'bottom' offset:[0,12] matches the highlight
    // overlay geometry (transform:-8.5px wrapper + 17px dot + 3px margin ≈ +12px top).
    marker._fixData = fix;
    marker.tier = tier;
    layerMap[tier].addLayer(marker);

    // Builder snap mode: hover shows glow, click adds fix.
    // Handlers are bound once at render time and guarded by _ghostSnapCallback.
    marker.on('mouseover', () => {
      if (!_ghostSnapCallback) return;
      _ghostMapRef = mapInstance;
      _showGhostHoverGlow(fix);
    });
    marker.on('mouseout', () => {
      if (!_ghostSnapCallback) return;
      _removeGhostHoverGlow();
    });
    marker.on('click', (e) => {
      L.DomEvent.stop(e);
      if (!_ghostSnapCallback) return;
      _removeGhostHoverGlow();
      _ghostSnapCallback({ ident: fix.ident, lat: fix.lat, lon: fix.lon, isFix: true });
    });
    _ghostMarkers.push(marker);
  }

  // Phase 30: Zoom filtering for Tier 4 (generic) ghost markers only.
  // Instead of re-styling every marker (which is expensive for 884 nodes), 
  // we rely on CSS classes driven by a zoom-level class on the map container.
  const updateZoomClasses = () => {
    const zoom = mapInstance.getZoom();
    const container = mapInstance.getContainer();

    // CSS-driven Tier 4 decluttering (unchanged).
    container.classList.toggle('zoom-hide-generic-ghosts', zoom < 9);

    // Zoom-aware label quantum: coarse at low zoom, fine at high zoom so
    // closely-spaced threshold fixes (VHHH07L/07C/07R etc.) each get a label.
    _applyGhostLabels(zoom >= 10 ? 3333 : 667);
  };

  mapInstance.on('zoomend', updateZoomClasses);
  updateZoomClasses();



  // Default: T1-T3 are ON. T4 is OFF by default.
  t1Layer.addTo(mapInstance);
  t2Layer.addTo(mapInstance);
  t3Layer.addTo(mapInstance);
  // t4Layer is off by default per user request

  console.log(`[MapLayers] Rendered ghost fixes across 4 tier layers.`);
  return { t1Layer, t2Layer, t3Layer, t4Layer };
};


// Activates ghost-dot click/hover mode for builder snap-to-fix.
// Enables pointer events on the ghostFixPane so the interactive SVG paths respond.
// 'mapInstance' — the Leaflet map (used to look up the pane and manage hover glows)
// 'callback'    — called with { ident, lat, lon, isFix:true } when a ghost dot is clicked
const enableGhostSnapMode = (mapInstance, callback) => {
  _ghostSnapCallback = callback;
  _ghostMapRef = mapInstance;
  const pane = mapInstance.getPane('ghostFixPane');
  if (pane) pane.style.pointerEvents = 'auto';
  console.log('[MapLayers] Ghost snap mode ENABLED.');
};

// Deactivates ghost-dot snap mode and restores the pane to its default
// non-interactive state. Removes any hover glow left on screen.
const disableGhostSnapMode = () => {
  _ghostSnapCallback = null;
  _removeGhostHoverGlow();
  if (_ghostMapRef) {
    const pane = _ghostMapRef.getPane('ghostFixPane');
    if (pane) pane.style.pointerEvents = 'none';
  }
  _ghostMapRef = null;
  console.log('[MapLayers] Ghost snap mode DISABLED.');
};

export {
  renderAirports,
  renderFixes,
  renderSID,
  renderSTAR,
  addThresholdsToLayer,
  filterWaypoints,
  enableSnapMode,
  disableSnapMode,
  enableFreeDrawMode,
  disableFreeDrawMode,
  enableCustomDropOverlay,
  disableCustomDropOverlay,
  setContextMenuCallbacks,
  updateActiveShape,
  clearActiveShape,
  setMeasurementsVisible,
  updateMeasurementLabels,
  clearMeasurementLabels,
  renderSavedProcedure,
  renderAerodromes,
  renderNavaids,
  buildAerodromeLayerControl,
  updateHoldingMarkers,
  clearHoldingMarkers,
  createDraggableCustomMarker,
  removeDraggableMarker,
  renderGlobalSearchHighlights,
  clearGlobalSearchHighlights,
  updateCommonRouteGhost,
  clearCommonRouteGhost,
  renderAirspaces,
  applySymbolScale,
  setFetchWeatherFn,
  renderREA,
  renderREH,
  renderGhostFixes,
  enableGhostSnapMode,
  disableGhostSnapMode,
  getFilteredFixes,
  showPendingCustomMarker,
  clearPendingCustomMarker
};

