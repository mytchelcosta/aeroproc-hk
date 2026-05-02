// ============================================================
// EphemeralDraw.js - Ephemeral Shape Drawing Tool
// ============================================================
// Lets instructors draw temporary highlight shapes directly
// on the map during a live teaching session. Shapes are purely
// in-memory — they are NOT saved to any database, and vanish on
// page reload.
//
// Three shape types are supported:
//   Polygon — click vertices one by one, double-click to close.
//   Circle  — click to set centre, move cursor to size, click to fix.
//   Line    — click vertices one by one, double-click to finalize
//              as an open polyline (does NOT close like a polygon).
//
// Drawing flow (polygon):
//   1. Enable polygon mode (btn-draw-polygon or enableEphemeralPolygon()).
//   2. Click the map to place vertices.
//   3. Double-click to close and finalize.
//   4. Escape or toggling off mid-draw auto-saves (>= 3 pts) or cancels.
//
// Drawing flow (circle):
//   1. Enable circle mode (btn-draw-circle or enableEphemeralCircle()).
//   2. Click to place the centre point.
//   3. Move the cursor — the circle radius follows live in Nautical Miles.
//   4. Click again to fix the circle.
//   5. Escape or toggling off mid-draw cancels the in-progress circle.
//
// Drawing flow (line):
//   1. Enable line mode (btn-draw-line or enableEphemeralLine()).
//   2. Click the map to place vertices.
//   3. Double-click to finalize as an open polyline (does not close).
//   4. Escape or toggling off mid-draw auto-saves (>= 2 pts) or cancels.
//
// Shapes remain on the map when the tool is toggled off.
// Right-click any finalized shape → "Delete Shape" context menu.
//
// Hard limit: _MAX_SHAPES = 50 total shapes (all types combined).
//
// Public API:
//   initEphemeralDraw(mapInstance)  — call once at startup
//   enableEphemeralPolygon()        — activate polygon draw mode
//   enableEphemeralCircle()         — activate circle draw mode
//   enableEphemeralLine()           — activate line draw mode
//   disableEphemeralDraw()          — deactivate (shapes remain on map)
//   clearAllShapes()                — remove every shape from the map
//   isEphemeralDrawActive()         — true when any draw mode is on
//   isEphemeralPolygonActive()      — true when polygon mode is specifically on
//   isEphemeralCircleActive()       — true when circle mode is specifically on
//   isEphemeralLineActive()         — true when line mode is specifically on
// ============================================================


// ── Visual constants ──────────────────────────────────────────────────────────
// Violet/purple palette chosen to be visually distinct from procedure lines
// (blue SIDs, amber STARs, green IACs) and from the orange MV tool.
const _STROKE_COLOR = '#c77dff';
const _FILL_COLOR   = '#c77dff';
const _FILL_OPACITY = 0.12;

// Maximum number of simultaneous shapes allowed on the map.
const _MAX_SHAPES = 50;

// 1 Nautical Mile = 1852 metres (exact ICAO definition).
const _METRES_PER_NM = 1852;


// ── Module-level state ────────────────────────────────────────────────────────
let _map  = null;    // Leaflet map instance (set by initEphemeralDraw)
let _mode = null;    // null | 'polygon' | 'circle' | 'line'  — active draw mode


// ── Polygon drawing state ─────────────────────────────────────────────────────
// Points collected so far for the polygon currently being drawn.
let _currentPts = [];   // Array of L.LatLng

// Leaflet layers for the in-progress polygon preview.
let _ghostLine   = null;  // dashed line from last vertex to cursor
let _previewPoly = null;  // solid polyline connecting placed vertices

// Timestamp of the last single click — used by BOTH polygon and line modes to skip
// the second click Leaflet fires as part of every double-click sequence.
let _lastClickTime = 0;
const _DBLCLICK_THRESHOLD_MS = 300;


// ── Circle drawing state ──────────────────────────────────────────────────────
let _circleCenterLatLng   = null;  // centre point set by first click
let _circleGhost          = null;  // L.circle preview layer (grows with cursor)
let _circleRadius         = 0;     // current radius in metres


// ── Line drawing state ────────────────────────────────────────────────────────
// Separate from polygon so both sets of preview layers never conflict.
let _linePts       = [];   // Array of L.LatLng for the in-progress line
let _lineGhostLine = null; // dashed ghost from last vertex to cursor
let _linePreview   = null; // solid polyline connecting placed line vertices


// ── Shared shape collection ───────────────────────────────────────────────────
// All finalized shapes (polygons, circles, and lines).
// Each entry: { id, name, type, layer, visible }
//   name    — auto-numbered display name, e.g. "Polygon 1" (renameable via sub-panel)
//   type    — 'polygon' | 'circle' | 'line'
//   visible — whether the layer is currently shown on the map
let _shapes = [];
let _nextId = 1;

// Shape right-click context menu DOM element.
// Created once in initEphemeralDraw and reused for every right-click.
let _shapeContextMenuEl = null;

// Circle radius label — a floating div shown next to the cursor while the user
// is sizing a circle. Displays the current radius in Nautical Miles.
let _circleRadiusLabelEl = null;

// Shape naming counters — each geometry type has its own incrementing counter
// so auto-names read "Polygon 1", "Circle 2", "Line 1", etc.
let _polyCount   = 0;
let _circleCount = 0;
let _lineCount   = 0;

// Callback invoked whenever _shapes changes (add, delete, rename, visibility toggle).
// Registered by main.js to keep the Shapes sub-panel in sync.
let _onShapeChange = null;

// Temporary DivIcon markers that engrave vertex coordinates on the map while a
// polygon or line is actively being drawn. Cleared on finalization or cancellation.
let _engravingLabels = [];


// ── Stored event handler references ──────────────────────────────────────────
let _clickHandler    = null;
let _dblClickHandler = null;
let _moveHandler     = null;
let _keyHandler      = null;


// ── Private: haversine distance in metres ─────────────────────────────────────
// Used to calculate the circle radius from centre to cursor in real-world metres.
const _haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R    = 6371000;  // Earth mean radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};


// ── Public API ────────────────────────────────────────────────────────────────


// Stores the Leaflet map reference and creates shared DOM overlays (context menu
// and circle radius label). Must be called once before any other function.
// Does NOT activate draw mode.
//
// 'mapInstance' — the Leaflet map returned by MapCore.initMap()
const initEphemeralDraw = (mapInstance) => {
  _map = mapInstance;

  // Shape context menu: one element reused for every right-click on a finalized shape.
  _shapeContextMenuEl             = document.createElement('div');
  _shapeContextMenuEl.id          = 'ed-context-menu';
  _shapeContextMenuEl.className   = 'mv-context-menu ed-context-menu';
  _shapeContextMenuEl.style.display = 'none';
  document.body.appendChild(_shapeContextMenuEl);

  // Dismiss the context menu when the user clicks anywhere outside it.
  document.addEventListener('click', (e) => {
    if (_shapeContextMenuEl && !_shapeContextMenuEl.contains(e.target)) {
      _hideShapeContextMenu();
    }
  });

  // Also dismiss context menu on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideShapeContextMenu();
  });

  // Circle radius label: follows the cursor while the user sizes a circle and shows
  // the current radius in NM. Created once here, updated in _handleMove.
  _circleRadiusLabelEl               = document.createElement('div');
  _circleRadiusLabelEl.id            = 'ed-radius-label';
  _circleRadiusLabelEl.style.cssText =
    'position:fixed;z-index:9999;pointer-events:none;display:none;' +
    'color:#c77dff;font:700 11px "JetBrains Mono",monospace;' +
    'text-shadow:0 0 5px rgba(0,0,0,0.9),0 0 2px rgba(0,0,0,1);' +
    'white-space:nowrap;';
  document.body.appendChild(_circleRadiusLabelEl);

  console.log('[EphemeralDraw] Initialized.');
};


// Activates polygon draw mode. If another mode was previously active it is cleanly
// cancelled first (in-progress shapes auto-save or cancel per the rules in _disableInternal).
// Calling this when polygon mode is already on is a no-op.
const enableEphemeralPolygon = () => {
  if (!_map) return;
  if (_mode === 'polygon') return;

  _disableInternal();
  _mode = 'polygon';
  _attachHandlers();

  _map.getContainer().style.cursor = 'crosshair';
  _map.doubleClickZoom.disable();

  // Mark the "Draw New" button inside the Polygon sub-panel as active so the user
  // gets visual confirmation that drawing mode is running.
  document.getElementById('btn-start-polygon')?.classList.add('active');

  console.log('[EphemeralDraw] Polygon mode ENABLED — click to place vertices, double-click to close.');
};


// Activates circle draw mode. If another mode was previously active it is cleanly
// cancelled first.
const enableEphemeralCircle = () => {
  if (!_map) return;
  if (_mode === 'circle') return;

  _disableInternal();
  _mode = 'circle';
  _attachHandlers();

  _map.getContainer().style.cursor = 'crosshair';
  _map.doubleClickZoom.disable();

  // Mark the "Draw New" button inside the Circle sub-panel as active.
  document.getElementById('btn-start-circle')?.classList.add('active');

  console.log('[EphemeralDraw] Circle mode ENABLED — click to set centre, move cursor, click to fix.');
};


// Activates line draw mode. Lines are open polylines — they do NOT close the way
// a polygon does. If another mode was previously active it is cleanly cancelled first.
// Auto-finalizes with >= 2 vertices when the tool is toggled off.
const enableEphemeralLine = () => {
  if (!_map) return;
  if (_mode === 'line') return;

  _disableInternal();
  _mode = 'line';
  _attachHandlers();

  _map.getContainer().style.cursor = 'crosshair';
  _map.doubleClickZoom.disable();

  // Mark the "Draw New" button inside the Line sub-panel as active.
  document.getElementById('btn-start-line')?.classList.add('active');

  console.log('[EphemeralDraw] Line mode ENABLED — click to place vertices, double-click to finalize.');
};


// Deactivates whichever draw mode is currently active.
// Any shape currently being drawn follows auto-finalize rules unless forceCancel is true.
// All FINALIZED shapes remain visible on the map.
// Calling this when no mode is active is a no-op.
const disableEphemeralDraw = (forceCancel = false) => {
  if (!_map || _mode === null) return;
  _disableInternal(forceCancel);
  console.log('[EphemeralDraw] Draw mode DISABLED.');
};


// Removes every finalized shape from the map and empties the tracking array.
// Can be called regardless of whether a draw mode is active.
const clearAllShapes = () => {
  _shapes.forEach(({ layer, hitLayer }) => {
    if (_map && _map.hasLayer(layer)) _map.removeLayer(layer);
    if (hitLayer && _map && _map.hasLayer(hitLayer)) _map.removeLayer(hitLayer);
  });
  _shapes = [];
  console.log('[EphemeralDraw] All shapes cleared from map.');
};


// Returns true when any draw mode (polygon, circle, or line) is currently active.
const isEphemeralDrawActive    = () => _mode !== null;

// Phase 36: Returns true if there is an in-progress shape (at least one point placed).
const isDrawingInProgress = () => {
  if (_mode === 'polygon') return _currentPts.length > 0;
  if (_mode === 'circle')  return _circleCenterLatLng !== null;
  if (_mode === 'line')    return _linePts.length > 0;
  return false;
};

// Returns true specifically when polygon mode is active.
const isEphemeralPolygonActive = () => _mode === 'polygon';

// Returns true specifically when circle mode is active.
const isEphemeralCircleActive  = () => _mode === 'circle';

// Returns true specifically when line mode is active.
const isEphemeralLineActive    = () => _mode === 'line';


// ── Private: core disable logic ───────────────────────────────────────────────


// Internal disable — auto-finalizes any in-progress shape that has enough data,
// then detaches handlers and restores the cursor. Does NOT touch finalized shapes.
// Called by the public disable and by enable functions when switching modes.
//
// Auto-finalize rules:
//   Polygon with >= 3 placed vertices → finalize (saves the user's work).
//   Circle with centre + radius > 0   → finalize at current radius.
//   Line with >= 2 placed vertices    → finalize as open polyline.
const _disableInternal = (forceCancel = false) => {
  if (!forceCancel) {
    if (_mode === 'polygon' && _currentPts.length >= 3) {
      _finalizePolygon();
    } else if (_mode === 'circle' && _circleCenterLatLng && _circleRadius > 0) {
      _finalizeCircle(_circleCenterLatLng, _circleRadius);
    } else if (_mode === 'line' && _linePts.length >= 2) {
      _finalizeLine();
    }
  }

  // Clean up any leftover preview layers not removed by finalization.
  _cancelCurrentDraw();
  _detachHandlers();

  if (_map) {
    _map.getContainer().style.cursor = '';
    _map.doubleClickZoom.enable();
  }

  // Remove the active highlight from all three "Draw New" buttons inside their panels.
  // Whichever tool was active, its button now returns to its default violet appearance.
  document.getElementById('btn-start-polygon')?.classList.remove('active');
  document.getElementById('btn-start-circle')?.classList.remove('active');
  document.getElementById('btn-start-line')?.classList.remove('active');

  _mode = null;
};


// ── Private: event handler wiring ────────────────────────────────────────────


// Attaches the four map/keyboard handlers needed for drawing.
// Called whenever a draw mode is activated.
const _attachHandlers = () => {
  _clickHandler = (e) => _handleClick(e.latlng);

  // The dblclick handler behavior varies by mode:
  //   Polygon mode → closes the polygon (L.polygon).
  //   Line mode    → finalizes the open polyline (L.polyline).
  //   Circle mode  → the second SINGLE click finalizes the shape, so dblclick is ignored.
  _dblClickHandler = (e) => {
    L.DomEvent.stop(e);
    if (_mode === 'polygon') {
      _handleDblClick();
    } else if (_mode === 'line') {
      _handleDblClickLine();
    }
  };

  // Pass the full Leaflet event so _handleMove can access originalEvent.clientX/Y
  // for positioning the circle radius label near the cursor.
  _moveHandler = (e) => _handleMove(e.latlng, e.originalEvent);

  _map.on('click',     _clickHandler);
  _map.on('dblclick',  _dblClickHandler);
  _map.on('mousemove', _moveHandler);
};


// Precisely removes only the handlers this module registered.
// Called on disable so we never accidentally strip unrelated map listeners.
const _detachHandlers = () => {
  if (_clickHandler)    { _map.off('click',     _clickHandler);    _clickHandler    = null; }
  if (_dblClickHandler) { _map.off('dblclick',  _dblClickHandler); _dblClickHandler = null; }
  if (_moveHandler)     { _map.off('mousemove', _moveHandler);     _moveHandler     = null; }
};


// ── Private: click / move / dblclick handlers ─────────────────────────────────


// Routes a map click to the correct handler based on the active draw mode.
//
// Polygon & line modes: the timestamp threshold skips the second click in a double-click
//   sequence so we don't add an extra vertex right before the shape finalizes.
// Circle mode: first click = centre, second click = finalize (no threshold needed).
//
// 'latlng' — Leaflet LatLng of the click
const _handleClick = (latlng) => {
  if (_mode === 'polygon') {
    const now = Date.now();
    if (now - _lastClickTime < _DBLCLICK_THRESHOLD_MS) return;
    _lastClickTime = now;

    _currentPts.push(latlng);
    _addEngravingLabel(latlng);
    _updatePreview();

  } else if (_mode === 'line') {
    const now = Date.now();
    if (now - _lastClickTime < _DBLCLICK_THRESHOLD_MS) return;
    _lastClickTime = now;

    _linePts.push(latlng);
    _addEngravingLabel(latlng);
    _updateLinePreview();

  } else if (_mode === 'circle') {
    if (!_circleCenterLatLng) {
      // First click: place the centre of the circle.
      _circleCenterLatLng = latlng;
      _circleRadius       = 1;   // minimal non-zero radius; grows with mousemove

      _circleGhost = L.circle(latlng, {
        radius:      1,
        color:       _STROKE_COLOR,
        weight:      1.5,
        opacity:     0.75,
        fillColor:   _FILL_COLOR,
        fillOpacity: _FILL_OPACITY,
        interactive: false
      }).addTo(_map);
    } else {
      // Second click: finalize the circle at whatever radius the cursor set.
      if (_circleRadius > 0) _finalizeCircle(_circleCenterLatLng, _circleRadius);
      _cleanupCircleGhost();
      _circleCenterLatLng = null;
      _circleRadius       = 0;
    }
  }
};


// Handles a double-click in polygon mode: closes and finalizes the shape.
// Requires at least 3 distinct vertices; fewer cancels the draw.
const _handleDblClick = () => {
  if (_currentPts.length < 3) {
    console.warn('[EphemeralDraw] Need at least 3 vertices to close a polygon. Draw cancelled.');
    _cancelCurrentDraw();
    return;
  }
  _finalizePolygon();
};


// Handles a double-click in line mode: finalizes the open polyline.
// Requires at least 2 distinct vertices; fewer cancels the draw.
// The Leaflet dblclick-threshold guard in _handleClick prevents the spurious
// second single-click from adding a phantom vertex before this fires.
const _handleDblClickLine = () => {
  if (_linePts.length < 2) {
    console.warn('[EphemeralDraw] Need at least 2 vertices to finalize a line. Draw cancelled.');
    _cancelCurrentDraw();
    return;
  }
  _finalizeLine();
};


// Updates live drawing previews as the cursor moves.
//
// Polygon mode: stretches the dashed ghost line from the last placed vertex.
// Line mode:    same as polygon — stretches the ghost from the last placed vertex.
// Circle mode:  resizes the ghost circle; also updates the NM radius label next to cursor.
//
// 'latlng'        — current cursor position as a Leaflet LatLng
// 'originalEvent' — the native MouseEvent (used for clientX/Y for label positioning)
const _handleMove = (latlng, originalEvent) => {
  if (_mode === 'polygon') {
    if (_currentPts.length === 0) return;
    const last = _currentPts[_currentPts.length - 1];
    if (_ghostLine) {
      _ghostLine.setLatLngs([last, latlng]);
    } else {
      _ghostLine = L.polyline([last, latlng], {
        color:       _STROKE_COLOR,
        weight:      1,
        opacity:     0.55,
        dashArray:   '5, 4',
        interactive: false
      }).addTo(_map);
    }

  } else if (_mode === 'line') {
    if (_linePts.length === 0) return;
    const last = _linePts[_linePts.length - 1];
    if (_lineGhostLine) {
      _lineGhostLine.setLatLngs([last, latlng]);
    } else {
      _lineGhostLine = L.polyline([last, latlng], {
        color:       _STROKE_COLOR,
        weight:      1,
        opacity:     0.55,
        dashArray:   '5, 4',
        interactive: false
      }).addTo(_map);
    }

  } else if (_mode === 'circle') {
    if (!_circleCenterLatLng || !_circleGhost) return;
    _circleRadius = _haversineMeters(
      _circleCenterLatLng.lat, _circleCenterLatLng.lng,
      latlng.lat, latlng.lng
    );
    _circleGhost.setRadius(Math.max(1, _circleRadius));
    _updateCircleRadiusLabel(originalEvent);
  }
};


// ── Private: preview helpers ──────────────────────────────────────────────────


// Redraws the solid preview polyline that connects all placed POLYGON vertices.
// Called every time a new polygon vertex is added.
const _updatePreview = () => {
  if (_previewPoly && _map.hasLayer(_previewPoly)) _map.removeLayer(_previewPoly);

  if (_currentPts.length >= 2) {
    _previewPoly = L.polyline(_currentPts, {
      color:       _STROKE_COLOR,
      weight:      1.5,
      opacity:     0.75,
      interactive: false
    }).addTo(_map);
  }
};


// Redraws the solid preview polyline that connects all placed LINE vertices.
// Called every time a new line vertex is added.
const _updateLinePreview = () => {
  if (_linePreview && _map.hasLayer(_linePreview)) _map.removeLayer(_linePreview);

  if (_linePts.length >= 2) {
    _linePreview = L.polyline(_linePts, {
      color:       _STROKE_COLOR,
      weight:      1.5,
      opacity:     0.75,
      interactive: false
    }).addTo(_map);
  }
};


// ── Private: circle radius label helpers ──────────────────────────────────────


// Positions the radius label near the cursor and updates its text to the current
// radius in Nautical Miles. The label is a fixed-position div so it floats on top
// of all map content without being affected by the map's transform or projection.
//
// 'originalEvent' — the native MouseEvent from the Leaflet mousemove event
const _updateCircleRadiusLabel = (originalEvent) => {
  if (!_circleRadiusLabelEl || !originalEvent) return;
  const nm = (_circleRadius / _METRES_PER_NM).toFixed(1);
  _circleRadiusLabelEl.textContent    = `${nm} NM`;
  _circleRadiusLabelEl.style.left     = `${originalEvent.clientX + 16}px`;
  _circleRadiusLabelEl.style.top      = `${originalEvent.clientY - 10}px`;
  _circleRadiusLabelEl.style.display  = 'block';
};


// Hides the circle radius label. Called when circle finalization or cancellation occurs.
const _hideCircleRadiusLabel = () => {
  if (_circleRadiusLabelEl) _circleRadiusLabelEl.style.display = 'none';
};


// ── Private: shape finalization ───────────────────────────────────────────────


// Creates a permanent filled polygon from the collected vertices.
// Preview lines are removed and replaced by the finalized polygon.
// A transparent 15px hitLayer is added over the same geometry so right-clicking
// anywhere inside the polygon or near its boundary triggers the context menu.
const _finalizePolygon = () => {
  if (_shapes.length >= _MAX_SHAPES) {
    console.warn(`[EphemeralDraw] Shape limit (${_MAX_SHAPES}) reached. Delete existing shapes first.`);
    _cancelCurrentDraw();
    return;
  }

  const id  = _nextId++;
  const pts = [..._currentPts];

  // Visible polygon — non-interactive so the hitLayer below handles all events.
  const polygon = L.polygon(pts, {
    color:       _STROKE_COLOR,
    weight:      1.5,
    opacity:     0.90,
    fillColor:   _FILL_COLOR,
    fillOpacity: _FILL_OPACITY,
    interactive: false
  }).addTo(_map);

  // Invisible interaction buffer (Phase 18 hitbox). Near-zero fillOpacity (not 0)
  // is required so SVG pointer-events fire on the polygon interior — if fillOpacity
  // were exactly 0 many browsers would ignore interior clicks.
  const hitLayer = L.polygon(pts, {
    weight:      15,
    opacity:     0,
    fillColor:   _FILL_COLOR,
    fillOpacity: 0.001,
    interactive: true
  }).addTo(_map);

  hitLayer.on('contextmenu', (e) => {
    L.DomEvent.stop(e);
    _showShapeContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id);
  });

  _shapes.push({ id, name: 'Polygon ' + (++_polyCount), type: 'polygon', layer: polygon, hitLayer, visible: true });
  _cleanupPreview();
  _clearEngravingLabels();
  _currentPts    = [];
  _lastClickTime = 0;

  _onShapeChange?.(_shapes);
  console.log(`[EphemeralDraw] Polygon #${id} finalized (${pts.length} vertices).`);
};


// Creates a permanent filled circle from the centre point and radius.
// The circle radius label is hidden after finalization.
// Circles have a large clickable area by default so no separate hitLayer is needed.
//
// 'centreLatLng' — Leaflet LatLng of the circle centre
// 'radiusMeters' — circle radius in metres as measured by _haversineMeters
const _finalizeCircle = (centreLatLng, radiusMeters) => {
  if (_shapes.length >= _MAX_SHAPES) {
    console.warn(`[EphemeralDraw] Shape limit (${_MAX_SHAPES}) reached. Delete existing shapes first.`);
    return;
  }

  const id = _nextId++;

  const circle = L.circle(centreLatLng, {
    radius:      radiusMeters,
    color:       _STROKE_COLOR,
    weight:      1.5,
    opacity:     0.90,
    fillColor:   _FILL_COLOR,
    fillOpacity: _FILL_OPACITY,
    interactive: true
  }).addTo(_map);

  circle.on('contextmenu', (e) => {
    L.DomEvent.stop(e);
    _showShapeContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id);
  });

  // hitLayer: null — circles are already easy to right-click due to their large area.
  _shapes.push({ id, name: 'Circle ' + (++_circleCount), type: 'circle', layer: circle, hitLayer: null, visible: true });

  const radiusNm  = (radiusMeters / _METRES_PER_NM).toFixed(1);
  _onShapeChange?.(_shapes);
  console.log(`[EphemeralDraw] Circle #${id} finalized (radius: ${radiusNm} NM).`);
};


// Creates a permanent open polyline (NOT a closed polygon) from the collected line vertices.
// Preview layers are removed and replaced by the finalized polyline.
// A transparent 15px hitLayer is added over the same path so right-clicking anywhere
// near the thin line triggers the context menu (Phase 18 hitbox requirement).
const _finalizeLine = () => {
  if (_shapes.length >= _MAX_SHAPES) {
    console.warn(`[EphemeralDraw] Shape limit (${_MAX_SHAPES}) reached. Delete existing shapes first.`);
    _cancelCurrentDraw();
    return;
  }

  const id  = _nextId++;
  const pts = [..._linePts];

  // Visible polyline — non-interactive so the hitLayer below handles all events.
  const polyline = L.polyline(pts, {
    color:       _STROKE_COLOR,
    weight:      1.5,
    opacity:     0.90,
    interactive: false
  }).addTo(_map);

  // Invisible 15px interaction buffer. Thin lines are very hard to right-click
  // precisely; this wide transparent layer makes right-clicking forgiving.
  const hitLayer = L.polyline(pts, {
    weight:      15,
    opacity:     0,
    interactive: true
  }).addTo(_map);

  hitLayer.on('contextmenu', (e) => {
    L.DomEvent.stop(e);
    _showShapeContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id);
  });

  _shapes.push({ id, name: 'Line ' + (++_lineCount), type: 'line', layer: polyline, hitLayer, visible: true });
  _cleanupLinePreview();
  _clearEngravingLabels();
  _linePts       = [];
  _lastClickTime = 0;

  _onShapeChange?.(_shapes);
  console.log(`[EphemeralDraw] Line #${id} finalized (${pts.length} vertices).`);
};


// ── Private: cancellation and cleanup ────────────────────────────────────────


// Cancels any shape currently being drawn (polygon, circle, or line) and removes
// all preview graphics. Does NOT affect finalized shapes.
// Called on Escape key press or when disabling draw mode mid-draw with < threshold pts.
const _cancelCurrentDraw = () => {
  _cleanupPreview();
  _currentPts    = [];
  _lastClickTime = 0;

  _cleanupCircleGhost();
  _circleCenterLatLng = null;
  _circleRadius       = 0;

  _cleanupLinePreview();
  _linePts = [];

  // Clear any engraving labels left over from a cancelled draw session.
  _clearEngravingLabels();
};


// Removes polygon ghost line and preview polyline from the map.
const _cleanupPreview = () => {
  if (_ghostLine   && _map && _map.hasLayer(_ghostLine))   _map.removeLayer(_ghostLine);
  if (_previewPoly && _map && _map.hasLayer(_previewPoly)) _map.removeLayer(_previewPoly);
  _ghostLine   = null;
  _previewPoly = null;
};


// Removes line ghost line and preview polyline from the map.
const _cleanupLinePreview = () => {
  if (_lineGhostLine && _map && _map.hasLayer(_lineGhostLine)) _map.removeLayer(_lineGhostLine);
  if (_linePreview   && _map && _map.hasLayer(_linePreview))   _map.removeLayer(_linePreview);
  _lineGhostLine = null;
  _linePreview   = null;
};


// Removes the circle preview layer from the map and hides the radius label.
const _cleanupCircleGhost = () => {
  if (_circleGhost && _map && _map.hasLayer(_circleGhost)) _map.removeLayer(_circleGhost);
  _circleGhost = null;
  _hideCircleRadiusLabel();
};


// ── Private: shape context menu ───────────────────────────────────────────────


// Displays the "Delete Shape" context menu at the given screen coordinates.
// Rebuilds the menu HTML on every open so click listeners never accumulate.
//
// 'x'       — clientX from the right-click event
// 'y'       — clientY from the right-click event
// 'shapeId' — id of the shape that was right-clicked
const _showShapeContextMenu = (x, y, shapeId) => {
  if (!_shapeContextMenuEl) return;

  _shapeContextMenuEl.innerHTML =
    `<div class="mv-ctx-item" data-action="delete">&#10005;&nbsp; Delete Shape</div>`;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _shapeContextMenuEl.style.left    = `${Math.min(x, vw - 180)}px`;
  _shapeContextMenuEl.style.top     = `${Math.min(y, vh - 60)}px`;
  _shapeContextMenuEl.style.display = 'block';

  _shapeContextMenuEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
    _deleteShape(shapeId);
    _hideShapeContextMenu();
  });
};


// Hides the shape context menu and clears its content.
const _hideShapeContextMenu = () => {
  if (_shapeContextMenuEl) {
    _shapeContextMenuEl.style.display = 'none';
    _shapeContextMenuEl.innerHTML     = '';
  }
};


// Removes a single finalized shape from the map, identified by its numeric id.
//
// 'id' — the id assigned when the shape was finalized
const _deleteShape = (id) => {
  const idx = _shapes.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const { layer, hitLayer } = _shapes[idx];
  if (_map && _map.hasLayer(layer))    _map.removeLayer(layer);
  if (hitLayer && _map && _map.hasLayer(hitLayer)) _map.removeLayer(hitLayer);
  _shapes.splice(idx, 1);
  _onShapeChange?.(_shapes);
  console.log(`[EphemeralDraw] Shape #${id} deleted.`);
};


// ── Private: vertex engraving helpers ────────────────────────────────────────


// Places a small coordinate label at the given vertex position.
// Labels appear as each vertex is clicked while drawing a polygon or line
// and are removed when the shape is finalized or the draw is cancelled.
//
// 'latlng' — Leaflet LatLng of the vertex that was just placed
const _addEngravingLabel = (latlng) => {
  if (!_map) return;
  const lat    = latlng.lat.toFixed(4);
  const lng    = latlng.lng.toFixed(4);
  const marker = L.marker(latlng, {
    icon: L.divIcon({
      className:  'engraving-label',
      html:       `<span class="engraving-text">${lat}, ${lng}</span>`,
      iconSize:   null,
      iconAnchor: [0, 16]    // bottom-left of the text sits at the vertex point
    }),
    interactive:  false,
    zIndexOffset: -100
  }).addTo(_map);
  _engravingLabels.push(marker);
};


// Removes all engraving labels from the map and empties the tracking array.
// Safe to call even when the array is already empty.
const _clearEngravingLabels = () => {
  _engravingLabels.forEach((m) => {
    if (_map && _map.hasLayer(m)) _map.removeLayer(m);
  });
  _engravingLabels = [];
};


// ── Public: Session Shape Manager API ────────────────────────────────────────


// Registers a callback that fires whenever the shapes collection changes.
// 'cb' — function(shapes) called with the current internal _shapes array.
const setShapeChangeCallback = (cb) => { _onShapeChange = cb; };


// Returns a shallow-copy array of shape descriptors (without the internal layer).
// Safe to iterate in the UI without risk of accidentally mutating layer state.
const getShapes = () =>
  _shapes.map((s) => ({ id: s.id, name: s.name, type: s.type, visible: s.visible }));


// Toggles a shape's visibility. Hidden shapes are removed from the map but kept in
// the session array so they can be shown again without re-drawing.
// The hitLayer (if present) is also removed when hidden so invisible hit-zones
// don't persist and accidentally trigger context menus on hidden shapes.
//
// 'id' — numeric id of the shape to toggle
const toggleShapeVisibility = (id) => {
  const shape = _shapes.find((s) => s.id === id);
  if (!shape || !_map) return;
  shape.visible = !shape.visible;
  if (shape.visible) {
    shape.layer.addTo(_map);
    if (shape.hitLayer) shape.hitLayer.addTo(_map);
  } else {
    _map.removeLayer(shape.layer);
    if (shape.hitLayer && _map.hasLayer(shape.hitLayer)) _map.removeLayer(shape.hitLayer);
  }
  _onShapeChange?.(_shapes);
};


// Renames a shape. The new name is displayed in the Shapes sub-panel.
//
// 'id'      — numeric id of the shape to rename
// 'newName' — the replacement name string
const renameShape = (id, newName) => {
  const shape = _shapes.find((s) => s.id === id);
  if (!shape) return;
  shape.name = newName;
  _onShapeChange?.(_shapes);
};


// Removes a shape by id. Delegates to the internal helper which fires the callback.
//
// 'id' — numeric id of the shape to remove
const deleteShapeById = (id) => { _deleteShape(id); };


// Pans and zooms the map to fit the bounds of the given shape.
// Works for polygons (getBounds) and circles (getBounds). Silently skips if
// bounds are unavailable (e.g., a degenerate or zero-radius circle).
//
// 'id' — numeric id of the shape to zoom to
const zoomToShape = (id) => {
  const shape = _shapes.find((s) => s.id === id);
  if (!shape || !_map) return;
  try {
    const bounds = shape.layer.getBounds ? shape.layer.getBounds() : null;
    if (bounds && bounds.isValid()) {
      _map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  } catch {
    console.warn(`[EphemeralDraw] zoomToShape: could not get bounds for shape #${id}.`);
  }
};


export {
  initEphemeralDraw,
  enableEphemeralPolygon,
  enableEphemeralCircle,
  enableEphemeralLine,
  disableEphemeralDraw,
  clearAllShapes,
  isEphemeralDrawActive,
  isEphemeralPolygonActive,
  isEphemeralCircleActive,
  isEphemeralLineActive,
  isDrawingInProgress,
  setShapeChangeCallback,
  getShapes,
  toggleShapeVisibility,
  renameShape,
  deleteShapeById,
  zoomToShape
};
