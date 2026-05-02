// ============================================================
// RangeTool.js - DME Range Rings Tool (Phase 22)
// ============================================================
// Creates concentric nautical-mile distance rings (DME circles)
// around a user-selected center point on the map.
//
// Drawing flow:
//   1. User sets Interval (NM) and Ring Count in the sub-panel inputs.
//   2. Click "Place Range" to activate drop mode (cursor turns to crosshair).
//   3. Click anywhere on the map to drop a center and instantly draw the rings.
//   4. Repeat to drop additional ranges (maximum 5 per session).
//   5. Alternatively, type lat/lon manually and click "Place Here" to avoid
//      clicking on the map directly.
//   6. Right-click the center dot of any range to delete it or clear all.
//
// Visual style: very thin white circles at ~40% opacity.
// Each ring carries a small "X NM" text label placed due north.
//
// Hard limit: _MAX_RANGES = 5 per session.
//
// Public API:
//   initRangeTool(mapInstance)          — call once at startup
//   enableRangeTool()                   — activate click-to-drop mode
//   disableRangeTool()                  — deactivate (rings remain on map)
//   isRangeToolActive()                 — true while drop mode is on
//   setRangeChangeCallback(cb)          — register callback for list changes
//   getRanges()                         — returns [{ id, lat, lon, interval, count, visible }]
//   deleteRangeById(id)                 — remove a specific range
//   clearAllRanges()                    — remove every range from the map
//   toggleRangeVisibility(id)           — show / hide a specific range
// ============================================================


// Maximum number of range sets allowed simultaneously in one session.
const _MAX_RANGES = 5;


// ── Module-level state ────────────────────────────────────────────────────────
let _map           = null;   // Leaflet map instance (set by initRangeTool)
let _mode          = null;   // null | 'range'
let _ranges        = [];     // Array of { id, lat, lon, interval, count, group, visible }
let _nextId        = 1;
let _clickHandler  = null;   // map 'click' handler (detached on disable)
let _contextMenuEl = null;   // shared context-menu DOM element (reused per right-click)

// Callback invoked whenever the ranges collection changes (add, delete, visibility toggle).
// Registered by main.js via setRangeChangeCallback() to keep the panel list in sync.
let _onRangeChange = null;


// ── Public API ────────────────────────────────────────────────────────────────


// Stores the map reference and creates the shared context-menu DOM element.
// Must be called once before any other function. Does NOT activate drop mode.
//
// 'mapInstance' — the Leaflet map returned by MapCore.initMap()
const initRangeTool = (mapInstance) => {
  _map = mapInstance;

  // Single context-menu element reused on every right-click to avoid accumulating nodes.
  _contextMenuEl             = document.createElement('div');
  _contextMenuEl.id          = 'range-context-menu';
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

  console.log('[RangeTool] Initialized.');
};


// Activates range drop mode. Every subsequent map click drops a range center and draws rings.
// Calling this when drop mode is already active is a no-op.
const enableRangeTool = () => {
  if (!_map || _mode === 'range') return;
  _mode = 'range';

  _clickHandler = (e) => { _dropRange(e.latlng); };
  _map.on('click', _clickHandler);
  _map.getContainer().style.cursor = 'crosshair';

  // Mark the "Place Range" button inside the sub-panel as active.
  document.getElementById('btn-start-range')?.classList.add('active');

  console.log('[RangeTool] Drop mode ENABLED — click the map to place a DME range center.');
};


// Deactivates drop mode. All placed range rings remain visible on the map.
// Calling this when drop mode is off is a no-op.
const disableRangeTool = () => {
  if (!_map || _mode === null) return;

  if (_clickHandler) { _map.off('click', _clickHandler); _clickHandler = null; }
  _map.getContainer().style.cursor = '';
  _mode = null;

  document.getElementById('btn-start-range')?.classList.remove('active');

  // Fire the change callback so main.js knows to update toolbar highlights.
  _onRangeChange?.(_ranges);

  console.log('[RangeTool] Drop mode DISABLED.');
};


// Returns true while range drop mode is active.
const isRangeToolActive = () => _mode === 'range';


// Registers a callback that fires whenever the ranges collection changes.
//
// 'cb' — function(_ranges) called with the current internal array
const setRangeChangeCallback = (cb) => { _onRangeChange = cb; };


// Returns a shallow-copy snapshot of all current ranges, safe for UI iteration.
// Each entry contains id, lat, lon, interval, count, and visible — no internal Leaflet refs.
//
// Returns Array<{ id, lat, lon, interval, count, visible }>
const getRanges = () =>
  _ranges.map(({ id, lat, lon, interval, count, visible }) =>
    ({ id, lat, lon, interval, count, visible }));


// Removes a single range by its numeric id.
//
// 'id' — the id assigned when the range was created
const deleteRangeById = (id) => { _deleteRange(id); };


// Removes every range from the map and empties the session array.
// Safe to call when no ranges exist.
const clearAllRanges = () => {
  _ranges.forEach(({ group }) => {
    if (_map && _map.hasLayer(group)) _map.removeLayer(group);
  });
  _ranges = [];
  _onRangeChange?.(_ranges);
  console.log('[RangeTool] All ranges cleared from map.');
};


// Toggles a range's visibility. Hidden ranges are removed from the Leaflet map
// but kept in the session array so they can be shown again without re-clicking.
//
// 'id' — numeric id of the range to toggle
const toggleRangeVisibility = (id) => {
  const rng = _ranges.find((r) => r.id === id);
  if (!rng || !_map) return;
  rng.visible = !rng.visible;
  if (rng.visible) {
    rng.group.addTo(_map);
  } else {
    _map.removeLayer(rng.group);
  }
  _onRangeChange?.(_ranges);
  console.log(`[RangeTool] Range #${id} ${rng.visible ? 'shown' : 'hidden'}.`);
};


// ── Private: geometry helper ──────────────────────────────────────────────────


// Calculates the geographic destination point when traveling from an origin
// in a given bearing for a given distance in nautical miles.
// Uses the spherical Earth model (radius = 3440.065 NM), which gives accurate
// results for the distances involved in a TMA (up to ~300 NM).
//
// 'origin'  — Leaflet LatLng of the starting point
// 'distNM'  — distance to travel, in nautical miles
// 'bearing' — compass direction in degrees (0 = north, 90 = east, etc.)
//
// Returns a Leaflet L.latLng of the computed destination.
const _offsetByNM = (origin, distNM, bearing) => {
  const R    = 3440.065;                              // Earth radius in nautical miles
  const d    = distNM / R;                            // angular distance in radians
  const lat1 = (origin.lat * Math.PI) / 180;
  const lon1 = (origin.lng * Math.PI) / 180;
  const brng = (bearing    * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return L.latLng((lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI);
};


// ── Private: range placement ──────────────────────────────────────────────────


// Creates a full set of concentric range rings at the given latlng.
// Reads the interval (NM) and ring count from the sub-panel inputs at drop time
// so the user can vary them between drops without any extra UI steps.
//
// 'latlng' — Leaflet LatLng of the map click (or manual coordinate entry)
const _dropRange = (latlng) => {
  if (_ranges.length >= _MAX_RANGES) {
    console.warn(`[RangeTool] Session limit of ${_MAX_RANGES} ranges reached. Delete one to add more.`);
    return;
  }

  // Read and validate user-configured values from the sub-panel inputs.
  const rawInterval = parseInt(document.getElementById('range-interval')?.value, 10);
  const rawCount    = parseInt(document.getElementById('range-count')?.value,    10);

  // Clamp to sensible aviation bounds: interval 1–300 NM, count 1–20 rings.
  const interval = Math.max(1, Math.min(300, isNaN(rawInterval) ? 10 : rawInterval));
  const count    = Math.max(1, Math.min(20,  isNaN(rawCount)    ? 5  : rawCount));

  const id    = _nextId++;
  const group = L.layerGroup();

  // Center pin — small white dot so the user can see exactly where the origin is.
  const centerMarker = L.circleMarker(latlng, {
    radius:      3,
    color:       'rgba(255,255,255,0.7)',
    weight:      1,
    fillColor:   'rgba(255,255,255,0.7)',
    fillOpacity: 0.7,
    interactive: true   // must be true so it can receive contextmenu events
  });

  // Right-click on the center dot → context menu with delete options.
  centerMarker.on('contextmenu', (e) => {
    L.DomEvent.stop(e.originalEvent);
    _showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, id);
  });

  centerMarker.addTo(group);

  // Draw each concentric ring from the innermost (i=1) to the outermost (i=count).
  for (let i = 1; i <= count; i++) {
    const radiusNM = i * interval;
    const radiusM  = radiusNM * 1852;   // 1 nautical mile = exactly 1852 metres

    // The ring: thin, white, ~40% opacity, no fill so the map shows through.
    L.circle(latlng, {
      radius:      radiusM,
      color:       '#ffffff',
      opacity:     0.4,
      weight:      0.8,
      fill:        false,
      interactive: false   // rings are visual only — they must not intercept mouse clicks
    }).addTo(group);

    // NM distance label positioned due north of the center at the ring's edge.
    // "Due north" is bearing 0° — the label sits at the top of each circle.
    const labelLatLng = _offsetByNM(latlng, radiusNM, 0);
    L.marker(labelLatLng, {
      icon: L.divIcon({
        className:  'range-label-icon',
        html:       `<div class="range-label">${radiusNM} NM</div>`,
        iconSize:   [50, 14],
        iconAnchor: [25, 7]   // horizontally centred on the label text
      }),
      interactive: false
    }).addTo(group);
  }

  group.addTo(_map);
  _ranges.push({ id, lat: latlng.lat, lon: latlng.lng, interval, count, group, visible: true });
  _onRangeChange?.(_ranges);

  console.log(
    `[RangeTool] Range #${id} placed at (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}) ` +
    `— ${count} × ${interval} NM rings.`
  );
};


// ── Private: context menu ─────────────────────────────────────────────────────


// Builds and shows the right-click context menu for a range center dot.
// Menu content is rebuilt on every open so event listeners never accumulate.
//
// 'x'  — clientX from the right-click event
// 'y'  — clientY from the right-click event
// 'id' — id of the range that was right-clicked
const _showContextMenu = (x, y, id) => {
  if (!_contextMenuEl) return;

  _contextMenuEl.innerHTML =
    `<div class="mv-ctx-item" data-action="delete">&#10005;&nbsp; Delete Range</div>` +
    `<div class="mv-ctx-item mv-ctx-item--danger" data-action="clear">` +
    `&#10006;&nbsp; Clear All Ranges</div>`;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  _contextMenuEl.style.left    = `${Math.min(x, vw - 195)}px`;
  _contextMenuEl.style.top     = `${Math.min(y, vh - 75)}px`;
  _contextMenuEl.style.display = 'block';

  _contextMenuEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
    _deleteRange(id);
    _hideContextMenu();
  });

  _contextMenuEl.querySelector('[data-action="clear"]').addEventListener('click', () => {
    clearAllRanges();
    _hideContextMenu();
  });
};


// Hides and clears the context menu without triggering any action.
const _hideContextMenu = () => {
  if (_contextMenuEl) {
    _contextMenuEl.style.display = 'none';
    _contextMenuEl.innerHTML     = '';
  }
};


// Removes a single range from the map and the session array.
//
// 'id' — numeric id of the range to remove
const _deleteRange = (id) => {
  const rng = _ranges.find((r) => r.id === id);
  if (!rng) return;
  if (_map && _map.hasLayer(rng.group)) _map.removeLayer(rng.group);
  _ranges = _ranges.filter((r) => r.id !== id);
  _onRangeChange?.(_ranges);
  console.log(`[RangeTool] Range #${id} deleted.`);
};


export {
  initRangeTool,
  enableRangeTool,
  disableRangeTool,
  isRangeToolActive,
  setRangeChangeCallback,
  getRanges,
  deleteRangeById,
  clearAllRanges,
  toggleRangeVisibility
};
