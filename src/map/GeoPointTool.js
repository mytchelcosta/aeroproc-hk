// ============================================================
// GeoPointTool.js - Precision Geo Point Marker Tool
// ============================================================
// A precision reference tool that lets users drop distinctive
// coordinate markers on the map without building a full procedure.
// Each dropped point automatically displays its decimal degree
// coordinates as a permanent floating label.
//
// Drawing flow:
//   1. Enable drop mode (btn-start-geopoint or enableGeoPointTool()).
//   2. Click anywhere on the map to place a precision marker.
//   3. The marker shows lat/lon to 4 decimal places (~11 m precision).
//   4. Right-click any marker → "Delete Point" or "Clear All Geo Points".
//
// Hard limit: _MAX_POINTS = 30 per session.
//
// Public API:
//   initGeoPointTool(mapInstance)        — call once at startup
//   enableGeoPointTool()                 — activate drop mode
//   disableGeoPointTool()                — deactivate (points remain on map)
//   isGeoPointActive()                   — true while drop mode is on
//   setGeoPointChangeCallback(cb)        — register a callback for list changes
//   getGeoPoints()                       — returns [{ id, lat, lon, visible }]
//   deleteGeoPointById(id)               — remove a specific point
//   clearAllGeoPoints()                  — remove every point
//   toggleGeoPointVisibility(id)         — show / hide a specific point
// ============================================================


// Maximum number of geo points allowed simultaneously in one session.
const _MAX_POINTS = 30;


// ── Module-level state ────────────────────────────────────────────────────────
let _map           = null;   // Leaflet map instance (set by initGeoPointTool)
let _mode          = null;   // null | 'geopoint'
let _points        = [];     // Array of { id, lat, lon, marker, visible }
let _nextId        = 1;
let _clickHandler  = null;   // map 'click' handler (detached on disable)
let _contextMenuEl = null;   // shared context-menu DOM element (reused per right-click)

// Callback invoked whenever the points collection changes (add, delete, visibility toggle).
// Registered by main.js via setGeoPointChangeCallback() to keep the panel list in sync.
let _onPointChange = null;


// ── Public API ────────────────────────────────────────────────────────────────


// Stores the map reference and creates the shared context-menu DOM element.
// Must be called once before any other function. Does NOT activate drop mode.
//
// 'mapInstance' — the Leaflet map returned by MapCore.initMap()
const initGeoPointTool = (mapInstance) => {
  _map = mapInstance;

  // Single context-menu element reused on every right-click to avoid accumulating nodes.
  _contextMenuEl             = document.createElement('div');
  _contextMenuEl.id          = 'geo-context-menu';
  _contextMenuEl.className   = 'mv-context-menu';
  _contextMenuEl.style.display = 'none';
  document.body.appendChild(_contextMenuEl);

  // Dismiss the context menu when clicking anywhere outside it.
  document.addEventListener('click', (e) => {
    if (_contextMenuEl && !_contextMenuEl.contains(e.target)) _hideContextMenu();
  });

  // Dismiss on Escape as well.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _hideContextMenu();
  });

  console.log('[GeoPointTool] Initialized.');
};


// Activates geo point drop mode. Every subsequent map click drops a precision marker.
// Calling this when drop mode is already active is a no-op.
const enableGeoPointTool = () => {
  if (!_map || _mode === 'geopoint') return;
  _mode = 'geopoint';

  // The click handler is registered on the Leaflet map so it receives LatLng directly.
  // It fires before the native DOM click event that closes sub-panels, which means
  // the point is always recorded even if the panel closes immediately after.
  _clickHandler = (e) => {
    _dropPoint(e.latlng);
  };

  _map.on('click', _clickHandler);
  _map.getContainer().style.cursor = 'crosshair';

  // Mark the "Drop Point" button inside the Geo Point sub-panel as active.
  document.getElementById('btn-start-geopoint')?.classList.add('active');

  console.log('[GeoPointTool] Drop mode ENABLED — click the map to place a precision marker.');
};


// Deactivates drop mode. All placed markers remain visible on the map.
// Calling this when drop mode is off is a no-op.
const disableGeoPointTool = () => {
  if (!_map || _mode === null) return;

  if (_clickHandler) { _map.off('click', _clickHandler); _clickHandler = null; }
  _map.getContainer().style.cursor = '';
  _mode = null;

  document.getElementById('btn-start-geopoint')?.classList.remove('active');

  // Fire the change callback so main.js knows to update toolbar highlights (de-highlight).
  _onPointChange?.(_points);

  console.log('[GeoPointTool] Drop mode DISABLED.');
};


// Returns true while geo point drop mode is active.
const isGeoPointActive = () => _mode === 'geopoint';


// Registers a callback that fires whenever the points collection changes.
//
// 'cb' — function(_points) called with the current internal array
const setGeoPointChangeCallback = (cb) => { _onPointChange = cb; };


// Returns a shallow-copy snapshot of all current points, safe for UI iteration.
// Each entry contains id, lat, lon, and visible — no internal Leaflet refs.
//
// Returns Array<{ id, lat, lon, visible }>
const getGeoPoints = () =>
  _points.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, visible: p.visible }));


// Removes a single geo point by its numeric id.
//
// 'id' — the id assigned when the point was created
const deleteGeoPointById = (id) => { _deletePoint(id); };


// Removes every geo point from the map and empties the session array.
// Safe to call when no points exist.
const clearAllGeoPoints = () => {
  _points.forEach(({ marker }) => {
    if (_map && _map.hasLayer(marker)) _map.removeLayer(marker);
  });
  _points = [];
  _onPointChange?.(_points);
  console.log('[GeoPointTool] All geo points cleared from map.');
};


// Toggles a point's visibility. Hidden points are removed from the Leaflet map
// but kept in the session array so they can be shown again without re-clicking.
//
// 'id' — numeric id of the point to toggle
const toggleGeoPointVisibility = (id) => {
  const pt = _points.find((p) => p.id === id);
  if (!pt || !_map) return;
  pt.visible = !pt.visible;
  if (pt.visible) {
    pt.marker.addTo(_map);
  } else {
    _map.removeLayer(pt.marker);
  }
  _onPointChange?.(_points);
  console.log(`[GeoPointTool] Geo point #${id} ${pt.visible ? 'shown' : 'hidden'}.`);
};


// ── Private: point placement ──────────────────────────────────────────────────


// Creates a geo point marker at the given latlng and adds it to the map.
// The DivIcon shows a precision crosshair SVG with the decimal coordinates below it.
//
// 'latlng' — Leaflet LatLng of the map click that triggered placement
const _dropPoint = (latlng) => {
  if (_points.length >= _MAX_POINTS) {
    console.warn(`[GeoPointTool] Session limit of ${_MAX_POINTS} geo points reached.`);
    return;
  }

  const id  = _nextId++;
  const lat = latlng.lat;
  const lon = latlng.lng;

  // DivIcon positions the SVG crosshair so its geometric centre sits exactly at
  // the clicked coordinate. iconAnchor [7, 7] = centre of the 14×14 SVG.
  const icon = L.divIcon({
    className:  'geo-marker-icon',
    html:       _buildMarkerHtml(id, lat, lon),
    iconSize:   null,
    iconAnchor: [0, 7]
  });

  const marker = L.marker(latlng, { icon, interactive: true }).addTo(_map);

  // Right-click on the marker's DivIcon opens the context menu.
  marker.on('contextmenu', (e) => {
    L.DomEvent.stop(e.originalEvent);
    _showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id);
  });

  _points.push({ id, lat, lon, marker, visible: true });
  _onPointChange?.(_points);

  console.log(`[GeoPointTool] Geo point #${id} placed at (${lat.toFixed(4)}, ${lon.toFixed(4)}).`);
};


// Returns the inner HTML string for a geo point DivIcon.
// The layout is: SVG crosshair (14×14 px) with the lat/lon text directly below it.
// Cyan (#00d4ff) colour matches the tool-active theme used throughout the toolbar.
//
// 'id'  — numeric id stored as a data attribute for potential future DOM lookup
// 'lat' — latitude in decimal degrees
// 'lon' — longitude in decimal degrees
const _buildMarkerHtml = (id, lat, lon) => {
  const latStr = lat.toFixed(4);
  const lonStr = lon.toFixed(4);
  return (
    `<div class="geo-marker-wrap" data-geo-id="${id}">` +

    // Precision crosshair: two crossing lines + small centre circle.
    `<svg class="geo-marker-cross" width="14" height="14" viewBox="0 0 14 14" ` +
    `fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<line x1="7" y1="0" x2="7" y2="14" stroke="#00d4ff" stroke-width="1.4"/>` +
    `<line x1="0" y1="7" x2="14" y2="7" stroke="#00d4ff" stroke-width="1.4"/>` +
    `<circle cx="7" cy="7" r="2.5" fill="rgba(0,212,255,0.15)" ` +
    `stroke="#00d4ff" stroke-width="1.2"/>` +
    `</svg>` +

    // Coordinate label — displayed directly below the crosshair.
    `<div class="geo-marker-label">${latStr},&nbsp;${lonStr}</div>` +
    `</div>`
  );
};


// ── Private: context menu ─────────────────────────────────────────────────────


// Builds and shows the right-click context menu for a geo point.
// Menu content is rebuilt on every open so event listeners never accumulate.
//
// 'x'  — clientX from the right-click event
// 'y'  — clientY from the right-click event
// 'id' — id of the point that was right-clicked
const _showContextMenu = (x, y, id) => {
  if (!_contextMenuEl) return;

  _contextMenuEl.innerHTML =
    `<div class="mv-ctx-item" data-action="delete">&#10005;&nbsp; Delete Point</div>` +
    `<div class="mv-ctx-item mv-ctx-item--danger" data-action="clear">` +
    `&#10006;&nbsp; Clear All Geo Points</div>`;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _contextMenuEl.style.left    = `${Math.min(x, vw - 195)}px`;
  _contextMenuEl.style.top     = `${Math.min(y, vh - 75)}px`;
  _contextMenuEl.style.display = 'block';

  _contextMenuEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
    _deletePoint(id);
    _hideContextMenu();
  });

  _contextMenuEl.querySelector('[data-action="clear"]').addEventListener('click', () => {
    clearAllGeoPoints();
    _hideContextMenu();
  });
};


// Hides and clears the context menu.
const _hideContextMenu = () => {
  if (_contextMenuEl) {
    _contextMenuEl.style.display = 'none';
    _contextMenuEl.innerHTML     = '';
  }
};


// Removes a single geo point from the map and the session array.
//
// 'id' — numeric id of the point to remove
const _deletePoint = (id) => {
  const pt = _points.find((p) => p.id === id);
  if (!pt) return;
  if (_map && _map.hasLayer(pt.marker)) _map.removeLayer(pt.marker);
  _points = _points.filter((p) => p.id !== id);
  _onPointChange?.(_points);
  console.log(`[GeoPointTool] Geo point #${id} deleted.`);
};


export {
  initGeoPointTool,
  enableGeoPointTool,
  disableGeoPointTool,
  isGeoPointActive,
  setGeoPointChangeCallback,
  getGeoPoints,
  deleteGeoPointById,
  clearAllGeoPoints,
  toggleGeoPointVisibility
};
