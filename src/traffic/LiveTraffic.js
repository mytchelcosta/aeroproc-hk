// ============================================================
// LiveTraffic.js — Real-Time ADS-B Aircraft Overlay
// ============================================================
// Fetches live aircraft positions from free, open ADS-B
// aggregators and renders them on the Leaflet map as
// rotated SVG aircraft icons.
//
// Three data sources are tried in fallback order on each poll.
// No API keys are required for any of them:
//   1. adsb.lol
//   2. airplanes.live
//   3. adsb.fi
//
// Aircraft are colour-coded by which of the three major SP
// airports they are associated with, determined by proximity:
//   SBSP (Congonhas)   → orange
//   SBGR (Guarulhos)   → soft yellow
//   SBKP (Viracopos)   → green
//   Other / overflight → grey
//
// Public API (all exported below):
//   initLiveTraffic(mapInstance)  — call once at app startup
//   enableLiveTraffic()           — start polling + show layer
//   disableLiveTraffic()          — stop polling + clear layer
//   setAircraftLabels(visible)    — show/hide callsign labels
//   isLiveTrafficEnabled()        — returns boolean state
// ============================================================
import { i18n } from '../utils/i18n.js';
import { trueToMagnetic } from '../utils/Helpers.js';


// ── Reference centre point (VHHH — Hong Kong Intl) ───────────
// All three APIs accept a lat/lon/radius query. We centre on
// VHHH and use 250 NM radius to cover the full HK TMA + surroundings.
const _CENTRE_LAT =  22.3089;
const _CENTRE_LON =  113.9146;
const _RADIUS_NM  =  250;

// ── API sources — tried in order until one succeeds ──────────
const _SOURCES = [
  {
    name: 'adsb.lol',
    url:  `https://api.adsb.lol/v2/point/${_CENTRE_LAT}/${_CENTRE_LON}/${_RADIUS_NM}`
  },
  {
    name: 'airplanes.live',
    url:  `https://api.airplanes.live/v2/point/${_CENTRE_LAT}/${_CENTRE_LON}/${_RADIUS_NM}`
  },
  {
    name: 'adsb.fi',
    url:  `https://opendata.adsb.fi/api/v2/lat/${_CENTRE_LAT}/lon/${_CENTRE_LON}/dist/${_RADIUS_NM}`
  }
];

// ── Airport proximity data ────────────────────────────────────
// Each aircraft is coloured by the nearest major HK airport within
// _PROX_NM nautical miles. Free ADS-B feeds don't reliably carry
// departure/destination fields, so proximity is the best heuristic.
//
// Radius of 35 NM covers the full approach and departure corridors
// for all three airports without overcounting high-altitude overflights
// that happen to pass nearby.
const _HK_AIRPORTS = {
  VHHH: { lat: 22.3089, lon: 113.9146 },   // Hong Kong Intl
  VMMC: { lat: 22.1495, lon: 113.5915 },   // Macau Intl
  ZGSZ: { lat: 22.6393, lon: 113.8107 }    // Shenzhen Bao'an
};
const _PROX_NM = 35;   // maximum distance to associate an aircraft with an airport

// ── Airport → fill colour ─────────────────────────────────────
const _COLOUR = {
  VHHH:  '#ffd84a',   // soft yellow     — Hong Kong traffic
  VMMC:  '#e07b39',   // orange/brownish — Macau traffic
  ZGSZ:  '#22c55e',   // green           — Shenzhen traffic
  other: '#94a3b8',   // grey            — overflights / other aerodromes
  ground:'#6b7280'    // dark grey       — surface movement
};

// ── Polling interval ──────────────────────────────────────────
const _POLL_MS = 4000;   // 4 seconds, same as the reference app

// ── Module-level state ────────────────────────────────────────
let _map         = null;   // Leaflet map instance (set by initLiveTraffic)
let _layer       = null;   // L.layerGroup holding all aircraft markers
let _timer       = null;   // setInterval handle; null when polling is stopped
let _enabled     = false;  // whether live traffic is currently on
let _showLabels  = true;   // whether callsign labels are shown on markers

// Phase 32: optional callback registered by main.js to decouple LiveTraffic from
// MeasuringVector (which already imports LiveTraffic, so a direct import would be circular).
// Called after every position update for each aircraft that was already on the map.
// Signature: (hex: string, lat: number, lon: number) => void
let _positionUpdateCb = null;

// Phase 33: per-line label visibility.
// Each flag controls whether that content line is included in the aircraft tooltip.
// Users can toggle lines independently via checkboxes in the Live Traffic sub-panel.
let _labelState = { callsign: true, type: true, altSpd: true, track: true };

// Phase 33: when true, each poll cycle attempts to assign each aircraft's tooltip
// the direction (of 8 possible) that has the least overlap with nearby aircraft icons.
let _autoDeclutter = false;

// Maps hex → last assigned direction angle (0–315 in 45° steps).
// Lets _applyDeclutter skip tooltip rebinds when the optimal direction hasn't changed.
const _directionCache = new Map();

// Maps ICAO hex code → { marker, airport, ac } for the currently visible aircraft.
// 'ac' is the latest normalised aircraft object — stored here so getNearestAircraft()
// can iterate it without maintaining a separate array.
// Used to diff new API data against what is on the map so we can update positions
// without tearing down and recreating every marker on each poll cycle.
const _markerMap = new Map();

// ── Route cache (callsign → { orig, dest }) ───────────────────
// Populated asynchronously by _fetchRouteAsync() using adsbdb.com.
// A callsign maps to { orig: 'SBGR', dest: 'SBSP' } once the API responds,
// or { orig: '', dest: '' } if the API returned nothing (unknown route).
// 'null' means the fetch is still in-flight (avoid duplicate requests).
const _routeCache    = new Map();   // callsign → { orig, dest } | null (pending)
const _routeFetching = new Set();   // callsigns whose fetch is currently in-flight


// ── Private: normalise raw API aircraft object ───────────────
// Different aggregators use the same field names (Readsb format)
// but some fields may be missing. This function fills in safe defaults
// so the rest of the code never has to null-check individual fields.
//
// 'raw' — a single aircraft entry from the API JSON (ac[] array)
// Returns a clean, consistent aircraft object.
// ── Private: HTML escape helper ──────────────────────────────
// Escapes characters that would break innerHTML to prevent XSS
// when rendering external data (like ADS-B callsigns or aircraft types).
const _safeEscape = (str) =>
  String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');


const _normalise = (raw) => ({
  id:       raw.hex || raw.r || `unknown_${Math.random().toString(36).slice(2, 6)}`,
  callsign: (raw.flight || '').trim() || (raw.r || ''),
  lat:      raw.lat,
  lon:      raw.lon,
  track:    raw.track ?? raw.true_heading ?? 0,
  altFt:    (raw.alt_baro === 'ground' || raw.alt_baro == null) ? 0 : (raw.alt_baro ?? raw.alt_geom ?? 0),
  gsKts:    raw.gs   ?? 0,
  vsFpm:    raw.baro_rate ?? raw.geom_rate ?? 0,
  onGround: raw.alt_baro === 'ground' || raw.on_ground === true,
  acType:   raw.t   || '',
  reg:      raw.r   || ''
});


// ── Private: haversine distance in nautical miles ────────────
// Calculates the great-circle distance between two lat/lon points.
// Used as a fallback classifier while the route lookup is still in-flight.
//
// Returns: distance in nautical miles (Number)
const _haversineNM = (lat1, lon1, lat2, lon2) => {
  const R    = 3440.065;  // Earth mean radius in nautical miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};


// ── Private: background route fetch via adsbdb.com ────────────
// Requests the origin and destination ICAO codes for one callsign
// and stores them in _routeCache so future poll cycles can use them
// for colour classification without re-fetching.
//
// Uses `cache: 'force-cache'` so the browser reuses the response for
// the same callsign throughout the session — adsbdb.com data is stable.
//
// 'callsign' — the flight number string (e.g. 'GLO1234')
const _fetchRouteAsync = (callsign) => {
  if (!callsign || _routeFetching.has(callsign) || _routeCache.has(callsign)) return;

  _routeFetching.add(callsign);

  fetch(
    `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`,
    { cache: 'force-cache' }
  )
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const fr = data?.response?.flightroute;
      _routeCache.set(callsign, {
        orig: fr?.origin?.icao_code      || '',
        dest: fr?.destination?.icao_code || ''
      });
    })
    .catch(() => {
      // Network error or rate-limit — store empty so we don't retry this session.
      _routeCache.set(callsign, { orig: '', dest: '' });
    })
    .finally(() => {
      _routeFetching.delete(callsign);
    });
};


// ── Private: classify an aircraft by its associated SP airport ──
// Classification priority (Phase 16 spec):
//
//   1. ground — aircraft is on the surface.
//   2. Route data available (adsbdb.com lookup complete):
//      Check if origin OR destination is VHHH/VMMC/ZGSZ. First match wins.
//      If neither is an HK major airport → 'other' (grey).
//   3. Route data pending (fetch still in-flight):
//      Fall back to proximity heuristic — nearest airport within _PROX_NM.
//      When the route arrives on a future poll cycle the colour updates.
//
// 'ac' — normalised aircraft object from _normalise()
// Returns: 'ground' | 'SBSP' | 'SBGR' | 'SBKP' | 'other'
const _classifyAirport = (ac) => {
  if (ac.onGround) return 'ground';

  // ── Route-based classification (primary) ─────────────────────
  const route = _routeCache.get(ac.callsign);
  if (route) {
    // Route is known — use O&D, not position.
    for (const icao of ['VHHH', 'VMMC', 'ZGSZ']) {
      if (route.orig === icao || route.dest === icao) return icao;
    }
    return 'other';   // route known but neither endpoint is an SP major airport
  }

  // ── Proximity fallback (route fetch still in-flight) ─────────
  let nearest     = null;
  let nearestDist = Infinity;

  for (const [icao, pos] of Object.entries(_HK_AIRPORTS)) {
    const dist = _haversineNM(ac.lat, ac.lon, pos.lat, pos.lon);
    if (dist < _PROX_NM && dist < nearestDist) {
      nearest     = icao;
      nearestDist = dist;
    }
  }

  return nearest || 'other';
};


// ── Private: format altitude for the tooltip ─────────────────
// Shows FL notation for high altitudes, feet for lower altitudes,
// and 'GND' when on the ground.
//
// 'altFt'    — altitude in feet (0 if on ground)
// 'onGround' — boolean ground flag
const _formatAlt = (altFt, onGround) => {
  if (onGround || altFt === 0) return i18n.t('ui.panels.traffic.units.gnd');
  if (altFt >= 18000) return `FL${String(Math.round(altFt / 100)).padStart(3, '0')}`;
  return `${altFt.toLocaleString()} ${i18n.t('ui.panels.traffic.units.ft')}`;
};


// ── Private: vertical speed arrow ────────────────────────────
// Returns ↑ for climbing, ↓ for descending, → for level flight.
//
// 'vsFpm' — vertical speed in feet per minute
const _vsArrow = (vsFpm) => {
  if (vsFpm >  256) return '↑';
  if (vsFpm < -256) return '↓';
  return '→';
};


// ── Private: build the HTML string for the callsign label ─────
// Displayed as a permanent Leaflet tooltip attached to the marker.
// The label uses floating transparent typography — background is
// fully transparent (Phase 16 spec) with a text-shadow outline so
// the text is readable over any map content.
//
// Shows ORIG→DEST on a dedicated line when route data is available.
// Falls back to "----→----" while the route fetch is pending.
//
// 'ac'      — normalised aircraft object
// 'airport' — classification key (not directly used in label, but kept for signature parity)
const _buildTooltipHtml = (ac, airport) => {
  const label   = _safeEscape(ac.callsign || ac.reg || ac.id);
  const altStr  = _formatAlt(ac.altFt, ac.onGround);
  const arrow   = _vsArrow(ac.vsFpm);
  const gsStr   = `${Math.round(ac.gsKts)} ${i18n.t('ui.panels.traffic.units.kt')}`;
  // ADS-B `ac.track` is True North; convert to Magnetic for parity with the
  // Measuring Vector tool, which displays bearings in the same magnetic frame.
  // The aircraft icon's rotation continues to use `ac.track` (True) — that's
  // correct because the rotation is applied directly in screen space relative
  // to the map's geographic-north orientation, not a controller's compass rose.
  const trkStr  = `${String(Math.round(trueToMagnetic(ac.track))).padStart(3, '0')}°`;
  const route   = _routeCache.get(ac.callsign);
  const orig    = _safeEscape(route?.orig) || '----';
  const dest    = _safeEscape(route?.dest) || '----';
  const typeStr = ac.acType ? `<span class="ac-type">${_safeEscape(ac.acType)}</span> ` : '';

  // Build each of the four label lines conditionally.
  // Phase 33: each line can be individually hidden via _labelState toggles.
  const callsignHtml = _labelState.callsign
    ? `<div class="ac-callsign">${label}</div>` : '';
  const typeHtml     = _labelState.type
    ? `<div class="ac-detail">${typeStr}${orig}<span class="ac-route-arrow">→</span>${dest}</div>` : '';
  const altSpdHtml   = _labelState.altSpd
    ? `<div class="ac-detail">${altStr} ${arrow}&nbsp;&nbsp;GS ${gsStr}</div>` : '';
  const trackHtml    = _labelState.track
    ? `<div class="ac-detail ac-trk">${i18n.t('ui.panels.traffic.lbl_track')} ${trkStr}</div>` : '';

  return `
    <div class="ac-tooltip-inner">
      ${callsignHtml}${typeHtml}${altSpdHtml}${trackHtml}
    </div>`.trim();
};


// ── Private: build a Leaflet DivIcon for one aircraft ─────────
// The icon is a top-down aircraft SVG silhouette rotated to match
// the aircraft's ground track. Smaller icon for ground traffic,
// larger for airborne.
//
// 'ac'      — normalised aircraft object (needs .track + .onGround)
// 'airport' — classification key into _COLOUR ('SBSP'|'SBGR'|'SBKP'|'other'|'ground')
const _buildIcon = (ac, airport) => {
  const colour = _COLOUR[airport] || '#ffffff';
  const sz     = ac.onGround ? 18 : 26;
  const half   = sz / 2;

  // Top-down aircraft silhouette as an SVG polygon.
  // The path points define a fuselage + swept wings + tail in a
  // -10..10 viewBox coordinate system; the rotation is applied
  // to the wrapper div so the anchor point stays centred.
  const svg = `
    <svg viewBox="-10 -12 20 24" width="${sz}" height="${sz}"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon
        points="0,-11 2,-3 10,2 10,4.5 2,3.5 1.5,9 4,10.5 4,12 0,11 -4,12 -4,10.5 -1.5,9 -2,3.5 -10,4.5 -10,2 -2,-3"
        fill="${colour}"
        stroke="rgba(0,0,0,0.45)"
        stroke-width="0.6"
        stroke-linejoin="round"
      />
    </svg>`.trim();

  return L.divIcon({
    className: '',   // empty so Leaflet doesn't add its white-box default styles
    html: `<div class="ac-marker" data-airport="${airport}"
                style="width:${sz}px;height:${sz}px;transform:rotate(${ac.track}deg)">${svg}</div>`,
    iconSize:   [sz, sz],
    iconAnchor: [half, half]   // centre of the icon is the aircraft position
  });
};


// ── Private: update the status bar in the toolbar sub-panel ───
// Called after every successful or failed fetch to keep the user
// informed about which data source is active.
//
// 'state'  — 'off' | 'ok' | 'err'
// 'source' — source name string (e.g. 'adsb.lol') or empty
// 'count'  — number of aircraft currently on map
const _updateStatus = (state, source, count) => {
  const dotEl  = document.getElementById('traffic-dot');
  const textEl = document.getElementById('traffic-status-text');
  if (!dotEl || !textEl) return;

  dotEl.className  = `traffic-dot traffic-dot--${state}`;

  if (state === 'ok') {
    textEl.textContent = `${source} · ${count} AC`;
  } else if (state === 'err') {
    textEl.textContent = i18n.t('ui.panels.traffic.status_no_feed');
  } else {
    textEl.textContent = i18n.t('ui.panels.traffic.status_offline');
  }
};


// ── Private: attempt one fetch from a given API URL ───────────
// Returns the parsed array of raw aircraft objects, or throws if
// the request fails or the response has no aircraft array.
//
// 'url' — full API endpoint string
const _tryFetch = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // All three providers put aircraft in an 'ac' array.
  if (!Array.isArray(json?.ac)) throw new Error('No ac[] array in response');
  return json.ac;
};


// ── Private: one complete poll cycle ─────────────────────────
// Tries each API source in order. On success: diffs new aircraft
// against the existing marker map (add new, update moved, remove
// stale). On total failure: clears the status indicator.
const _poll = async () => {
  if (!_enabled) return;

  let rawAircraft = null;
  let usedSource  = '';

  // Try each source in order until one works.
  for (const src of _SOURCES) {
    try {
      rawAircraft = await _tryFetch(src.url);
      usedSource  = src.name;
      break;
    } catch (err) {
      console.warn(`[LiveTraffic] ${src.name} failed: ${err.message}. Trying next source.`);
    }
  }

  if (!rawAircraft) {
    console.error('[LiveTraffic] All ADS-B sources failed. No aircraft data available.');
    _updateStatus('err', '', 0);
    return;
  }

  // Normalise and filter to valid positions only.
  const aircraft = rawAircraft
    .map(_normalise)
    .filter((ac) => ac.lat != null && ac.lon != null);

  // Build a fast lookup for the new data: id → normalised aircraft.
  const newDataMap = new Map(aircraft.map((ac) => [ac.id, ac]));

  // ── Remove aircraft that are no longer in the feed ────────────
  const toRemove = [];
  _markerMap.forEach((_, id) => { if (!newDataMap.has(id)) toRemove.push(id); });
  toRemove.forEach((id) => {
    const entry = _markerMap.get(id);
    if (entry?.marker) _layer.removeLayer(entry.marker);
    _markerMap.delete(id);
  });

  // ── Kick off background route lookups for uncached callsigns ─────
  // _fetchRouteAsync is a no-op for callsigns already cached or in-flight,
  // so it is safe to call on every poll without duplication.
  aircraft.forEach((ac) => {
    if (ac.callsign) _fetchRouteAsync(ac.callsign);
  });

  // ── Add new aircraft or update existing ones ──────────────────
  aircraft.forEach((ac) => {
    // Classify by O&D route data (primary) or proximity fallback.
    const airport  = _classifyAirport(ac);
    const existing = _markerMap.get(ac.id);

    if (existing) {
      // Update position and heading without recreating the marker.
      existing.marker.setLatLng([ac.lat, ac.lon]);

      // Update the rotation div and fill colour if airport classification changed.
      const el = existing.marker.getElement?.()?.querySelector('.ac-marker');
      if (el) {
        el.style.transform   = `rotate(${ac.track}deg)`;
        el.dataset.airport   = airport;
        const polygon = el.querySelector('polygon');
        if (polygon) polygon.setAttribute('fill', _COLOUR[airport] || '#ffffff');
      }

      // Update the tooltip content with fresh altitude/speed data.
      existing.marker.setTooltipContent(_buildTooltipHtml(ac, airport));
      existing.airport = airport;
      existing.ac      = ac;   // keep ac current so getNearestAircraft always has fresh data

      // Phase 32: notify MeasuringVector (via the registered callback) that this
      // aircraft's position changed, so any vectors following it can be redrawn.
      if (_positionUpdateCb) _positionUpdateCb(ac.id, ac.lat, ac.lon);

    } else {
      // First time we see this aircraft — create a new marker.
      const icon   = _buildIcon(ac, airport);
      const marker = L.marker([ac.lat, ac.lon], { icon, keyboard: false });

      // Bind the permanent callsign label.
      // The tooltip element's visibility is controlled by _showLabels.
      marker.bindTooltip(_buildTooltipHtml(ac, airport), {
        permanent:  true,
        direction:  'right',
        className:  'ac-tooltip',
        offset:     [14, 0]
      });

      _layer.addLayer(marker);
      _markerMap.set(ac.id, { marker, airport, ac });

      // Apply the current label visibility setting to this new marker.
      if (!_showLabels) {
        const tipEl = marker.getTooltip()?.getElement();
        if (tipEl) tipEl.style.display = 'none';
      }
    }
  });

  _updateStatus('ok', usedSource, _markerMap.size);
  if (_autoDeclutter) _applyDeclutter();
  console.log(`[LiveTraffic] Poll OK (${usedSource}): ${_markerMap.size} aircraft on map.`);
};


// ── Private: rebuild every aircraft tooltip with the current _labelState ────
// Called after any label visibility toggle so all aircraft instantly reflect the change.
const _rebuildAllTooltips = () => {
  _markerMap.forEach(({ marker, ac, airport }) => {
    marker.setTooltipContent(_buildTooltipHtml(ac, airport));
  });
};


// ── Private: assign the least-crowded of 8 directions to each tooltip ────────
// Converts all aircraft positions to screen pixels, then for each aircraft finds
// the direction (E, NE, N, NW, W, SW, S, SE) whose 135° cone contains the fewest
// nearby aircraft. Only rebinds a tooltip when its optimal direction changes,
// so this function causes zero DOM work when aircraft are spread out.
const _applyDeclutter = () => {
  if (!_map || !_autoDeclutter) return;

  // Capture screen-space positions once so the inner loop doesn't re-project.
  const pts = [];
  _markerMap.forEach(({ marker, ac }) => {
    pts.push({ hex: ac.id, pt: _map.latLngToContainerPoint(marker.getLatLng()) });
  });

  // 8 candidate tooltip positions (direction + pixel offset fed directly to Leaflet).
  const CANDIDATES = [
    { dir: 'right',  off: L.point(14,   0), angle:   0 },  // E
    { dir: 'right',  off: L.point(10, -14), angle:  45 },  // NE
    { dir: 'top',    off: L.point( 0,   0), angle:  90 },  // N
    { dir: 'left',   off: L.point(-10, -14),angle: 135 },  // NW
    { dir: 'left',   off: L.point(-14,  0), angle: 180 },  // W
    { dir: 'left',   off: L.point(-10,  14),angle: 225 },  // SW
    { dir: 'bottom', off: L.point( 0,   0), angle: 270 },  // S
    { dir: 'right',  off: L.point(10,  14), angle: 315 },  // SE
  ];

  _markerMap.forEach(({ marker, ac, airport }) => {
    const myPt   = _map.latLngToContainerPoint(marker.getLatLng());
    const RADIUS = 90;  // screen pixels — collision detection radius

    let bestCand  = CANDIDATES[0];
    let bestScore = Infinity;

    CANDIDATES.forEach((cand) => {
      let score = 0;
      pts.forEach(({ hex, pt }) => {
        if (hex === ac.id) return;
        const dx   = pt.x - myPt.x;
        const dy   = myPt.y - pt.y;    // screen Y is inverted vs map Y
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > RADIUS) return;
        // Penalise aircraft that fall inside this candidate's 135° cone.
        const bearing  = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        let   angleDiff = Math.abs(bearing - cand.angle);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        if (angleDiff > 67.5) return;
        score += (RADIUS - dist) * (1 - angleDiff / 67.5);
      });
      if (score < bestScore) { bestScore = score; bestCand = cand; }
    });

    // Skip the tooltip rebind if the optimal direction hasn't changed.
    if (_directionCache.get(ac.id) === bestCand.angle) return;
    _directionCache.set(ac.id, bestCand.angle);

    marker.unbindTooltip();
    marker.bindTooltip(_buildTooltipHtml(ac, airport), {
      permanent: true,
      direction: bestCand.dir,
      className: 'ac-tooltip',
      offset:    bestCand.off
    });
    if (!_showLabels) {
      const tipEl = marker.getTooltip()?.getElement();
      if (tipEl) tipEl.style.display = 'none';
    }
  });
};


// ── Public: initialise the module ─────────────────────────────
// Must be called once after the Leaflet map is created, before
// enableLiveTraffic() can be used. Creates the internal LayerGroup
// but does NOT start polling or add the layer to the map.
//
// 'mapInstance' — the Leaflet map returned by MapCore.initMap()
const initLiveTraffic = (mapInstance) => {
  _map   = mapInstance;
  _layer = L.layerGroup();
  console.log('[LiveTraffic] Module initialised.');
};


// ── Public: start live traffic ────────────────────────────────
// Adds the layer to the map, fires one immediate poll, then
// schedules repeating polls every _POLL_MS milliseconds.
// Calling this when already enabled is a no-op.
const enableLiveTraffic = () => {
  if (_enabled || !_map || !_layer) return;

  _enabled = true;
  _layer.addTo(_map);

  // Run immediately so the user sees aircraft without waiting 4 s.
  _poll();
  _timer = setInterval(_poll, _POLL_MS);

  console.log('[LiveTraffic] Live traffic ENABLED.');
};


// ── Public: stop live traffic ─────────────────────────────────
// Clears the interval, removes all markers, and hides the layer.
// Calling this when already disabled is a no-op.
const disableLiveTraffic = () => {
  if (!_enabled) return;

  _enabled = false;
  if (_timer) { clearInterval(_timer); _timer = null; }

  // Remove all aircraft markers and reset the tracking map.
  _layer.clearLayers();
  _markerMap.clear();

  if (_map && _map.hasLayer(_layer)) _map.removeLayer(_layer);

  _updateStatus('off', '', 0);
  console.log('[LiveTraffic] Live traffic DISABLED.');
};


// ── Public: toggle callsign label visibility ──────────────────
// Iterates the current marker set and hides or shows each
// tooltip element without disrupting the marker itself.
//
// 'visible' — true = show labels, false = hide labels
const setAircraftLabels = (visible) => {
  _showLabels = visible;
  _markerMap.forEach(({ marker }) => {
    const tipEl = marker.getTooltip()?.getElement();
    if (tipEl) tipEl.style.display = visible ? '' : 'none';
  });
  console.log(`[LiveTraffic] Aircraft labels set to ${visible ? 'visible' : 'hidden'}.`);
};


// ── Public: query current enabled state ───────────────────────
const isLiveTrafficEnabled = () => _enabled;


// ── Public: look up the current normalised aircraft object by hex id ─────────────
// Used by MeasuringVector.js to read the live ground speed of a tracked aircraft
// when computing ETA labels without creating a circular import.
// Returns the ac object (with lat, lon, gsKts, callsign, etc.) or null if not found.
//
// 'hex' — ICAO hex identifier of the aircraft
const getAircraftData = (hex) => {
  const entry = _markerMap.get(hex);
  return entry ? entry.ac : null;
};


// ── Public: toggle visibility of individual label lines (Phase 33) ────────────
// Changes one flag in _labelState and immediately rebuilds every tooltip so the
// change is visible without waiting for the next poll cycle.
//
// 'key'   — one of: 'callsign' | 'type' | 'altSpd' | 'track'
// 'value' — boolean: true = show that line, false = hide it
const setLabelState = (key, value) => {
  if (!(key in _labelState)) {
    console.warn(`[LiveTraffic] setLabelState: unknown key "${key}". Valid keys: callsign, type, altSpd, track.`);
    return;
  }
  _labelState[key] = Boolean(value);
  _rebuildAllTooltips();
  console.log(`[LiveTraffic] Label state: ${key} = ${value}.`);
};


// ── Public: toggle auto de-clutter mode (Phase 33) ────────────────────────────
// When enabled, each poll cycle reassigns tooltip directions to minimise overlap.
// When disabled, all tooltips are reset to the default 'right' position.
//
// 'enabled' — boolean
const setAutoDeclutter = (enabled) => {
  _autoDeclutter = Boolean(enabled);

  if (!enabled) {
    // Reset all tooltips back to the default right-side direction.
    _directionCache.clear();
    _markerMap.forEach(({ marker, ac, airport }) => {
      marker.unbindTooltip();
      marker.bindTooltip(_buildTooltipHtml(ac, airport), {
        permanent: true,
        direction: 'right',
        className: 'ac-tooltip',
        offset:    [14, 0]
      });
      if (!_showLabels) {
        const tipEl = marker.getTooltip()?.getElement();
        if (tipEl) tipEl.style.display = 'none';
      }
    });
  } else {
    // Run an immediate de-clutter pass so the change is visible right away.
    _applyDeclutter();
  }
  console.log(`[LiveTraffic] Auto de-clutter: ${enabled ? 'ON' : 'OFF'}.`);
};


// ── Public: register a position-update callback (Phase 32) ───────────────────
// Registers a function to be called on every poll cycle for each aircraft whose
// position was already tracked (i.e., existing entries in _markerMap).
// Used by main.js to forward position updates to MeasuringVector.js without
// creating a circular module dependency.
//
// 'fn' — function(hex: string, lat: number, lon: number) => void
//        Pass null to unregister.
const setPositionUpdateCallback = (fn) => {
  _positionUpdateCb = fn || null;
};


// ── Public: find the nearest aircraft within a given radius ───────────────────
// Used by MeasuringVector.js to snap the vector endpoint to a live aircraft.
// Returns the normalised aircraft object (with lat, lon, gsKts, callsign, etc.)
// if one exists within radiusNM of the given map position, or null otherwise.
// Always returns null when live traffic is disabled.
//
// 'latlng'   — Leaflet LatLng (or any object with .lat / .lng properties)
// 'radiusNM' — snap radius in nautical miles; only aircraft closer than this are candidates
const getNearestAircraft = (latlng, radiusNM) => {
  if (!_enabled || _markerMap.size === 0) return null;

  let nearest     = null;
  let nearestDist = radiusNM;   // initialise threshold so only closer aircraft win

  _markerMap.forEach(({ ac }) => {
    if (!ac) return;
    const dist = _haversineNM(latlng.lat, latlng.lng, ac.lat, ac.lon);
    if (dist < nearestDist) {
      nearest     = ac;
      nearestDist = dist;
    }
  });

  return nearest;
};


export {
  initLiveTraffic,
  enableLiveTraffic,
  disableLiveTraffic,
  setAircraftLabels,
  isLiveTrafficEnabled,
  getNearestAircraft,
  setPositionUpdateCallback,
  getAircraftData,
  setLabelState,
  setAutoDeclutter
};
