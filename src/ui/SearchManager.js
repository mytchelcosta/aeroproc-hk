/**
 * SearchManager.js - Global Search Orchestrator
 * Handles indexing of aerodromes, fixes, and NAVAIDs for real-time substring search.
 */

import { renderGlobalSearchHighlights, clearGlobalSearchHighlights } from '../map/MapLayers.js';
import { updateViewGlobalSearchCount, updateCategoryChipCounts } from '../components/Sidebar.js';

let _searchIndex = [];
let _globalSearchTimer = null;

// Phase 8 UX polish: VHHH centre point, used as the distance reference for
// tiebreaking results that share the same match-score. Closer to VHHH wins.
// Coordinates match the existing `_CENTRE_LAT / _CENTRE_LON` constants in
// LiveTraffic.js — kept as plain literals here to avoid a cross-module
// import for two numbers.
const _VHHH_LAT = 22.3089;
const _VHHH_LON = 113.9153;
const _RESULT_CAP = 200;   // raised from 50 — still high enough to keep the map readable

// Local haversine in nautical miles. Inlined (rather than importing the
// Helpers.js version) because we only need it for the distance tiebreak
// and the dependency chain stays leaner this way — SearchManager has no
// other reason to import Helpers.
const _haversineNM = (lat1, lon1, lat2, lon2) => {
  const R    = 3440.065;   // Earth mean radius in nautical miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};

/**
 * Builds the single flat in-memory search index from all loaded data sources.
 * Called once after waypoints, aerodromes, and NAVAIDs are all loaded.
 */
export const buildSearchIndex = (waypoints, aerodromes, navaids) => {
  const index = [];

  // -- Aerodromes --
  const { major = [], regional = [], heliports = [] } = aerodromes || {};
  major.forEach((a) =>
    index.push({ ident: a.icao, name: a.name, lat: a.lat, lon: a.lon, layer: 'aerodrome', tier: 'major' }));
  regional.forEach((a) =>
    index.push({ ident: a.icao, name: a.name, lat: a.lat, lon: a.lon, layer: 'aerodrome', tier: 'regional' }));
  heliports.forEach((a) =>
    index.push({ ident: a.icao, name: a.name, lat: a.lat, lon: a.lon, layer: 'aerodrome', tier: 'heliport' }));

  // -- RNAV Fixes --
  waypoints.forEach((w) =>
    index.push({ ident: w.ident, lat: w.lat, lon: w.lon, layer: 'fix' }));

  // -- NAVAIDs --
  navaids.forEach((n) =>
    index.push({ ident: n.ident, name: n.name, type: n.type, freq: n.freq, lat: n.lat, lon: n.lon, layer: 'navaid' }));

  console.log(
    `[SearchManager] Index built: ` +
    `${major.length + regional.length + heliports.length} aerodromes, ` +
    `${waypoints.length} fixes, ${navaids.length} NAVAIDs — ${index.length} total entries.`
  );
  _searchIndex = index;
  return index;
};

/**
 * Handles a global search term submitted from the View-mode search bar.
 *
 * Phase 8 (advanced filtering): the optional third argument
 * `categoryFilter = { aerodrome, fix, navaid }` lets the caller suppress
 * entire layer types from the result set. Each key is a boolean; when omitted
 * (or set to true) that layer participates in the search. Defaults to all-on.
 *
 * The toggle UI lives in the global-search legend chips; main.js reads the
 * current chip state via `getGlobalSearchCategoryFilter()` and forwards it
 * here on every keystroke and on every chip click.
 */
export const handleGlobalSearch = (map, term, categoryFilter) => {
  clearTimeout(_globalSearchTimer);

  // Default to all-on when no filter is provided so older call sites keep
  // working unchanged. Each lookup below is short-circuited by `=== false`,
  // which means missing keys (undefined) are treated as enabled.
  const filter = categoryFilter || { aerodrome: true, fix: true, navaid: true };

  _globalSearchTimer = setTimeout(() => {
    if (!term || !term.trim()) {
      clearGlobalSearchHighlights(map);
      updateViewGlobalSearchCount(0);
      // Phase 8 UX polish: hide all per-category count badges when no search.
      updateCategoryChipCounts(null);
      return;
    }

    const q = term.trim().toUpperCase();

    // Filter and score matches:
    // 0 = Exact ident match
    // 1 = Ident starts with query
    // 2 = Name starts with query
    // 3 = Ident contains query
    // 4 = Name contains query
    //
    // Phase 8 UX polish: also pre-compute each match's great-circle distance
    // (NM) from VHHH so the sort below can use it as a tiebreaker — closer
    // to VHHH wins when scores are equal.
    const scoredResults = [];
    for (const entry of _searchIndex) {
      // Phase 8: skip entries whose layer is currently toggled OFF in the
      // legend chips. The check is at the top of the loop so we don't waste
      // work scoring things we'll never show.
      if (filter[entry.layer] === false) continue;

      const identUpper = entry.ident.toUpperCase();
      const nameUpper = entry.name ? entry.name.toUpperCase() : '';

      let score = -1;

      if (identUpper === q) {
        score = 0;
      } else if (identUpper.startsWith(q)) {
        score = 1;
      } else if (nameUpper.startsWith(q)) {
        score = 2;
      } else if (identUpper.includes(q)) {
        score = 3;
      } else if (nameUpper.includes(q)) {
        score = 4;
      }

      if (score !== -1) {
        const distNm = _haversineNM(_VHHH_LAT, _VHHH_LON, entry.lat, entry.lon);
        scoredResults.push({ entry, score, distNm });
      }
    }

    // Phase 8 UX polish: per-category counts are taken from the FULL match
    // set (before slicing/sorting) so the chip badges show the true total
    // for each layer, not just what's plotted on the map. We compute these
    // before the sort/slice so re-ordering doesn't change the totals.
    const catCounts = { aerodrome: 0, fix: 0, navaid: 0 };
    for (const r of scoredResults) {
      if (r.entry.layer in catCounts) catCounts[r.entry.layer] += 1;
    }
    updateCategoryChipCounts(catCounts);

    // Sort by score (lower is better); break ties first by distance from
    // VHHH (closer first), then alphabetically by ident as a stable
    // final fallback. Phase 8 UX polish: distance tiebreak prioritises
    // local airspace results over far-away matches with the same score.
    scoredResults.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.distNm !== b.distNm) return a.distNm - b.distNm;
      return a.entry.ident.localeCompare(b.entry.ident);
    });

    // Phase 8 UX polish: cap raised from 50 → 200 (`_RESULT_CAP`). Plenty
    // of headroom now that distance-priority sort means the closest hits
    // always make it into the displayed slice.
    const results = scoredResults.slice(0, _RESULT_CAP).map(s => s.entry);

    // Phase 8: forward the normalised query string (uppercase, trimmed) to the
    // renderer so each highlight label can wrap the matching substring in a
    // `.fix-label-highlight` span — same incremental-feedback effect as the
    // Builder-mode search. We pass `q` (already trimmed/uppercased) rather
    // than the raw `term` so MapLayers does one less normalisation pass.
    renderGlobalSearchHighlights(map, results, q);
    updateViewGlobalSearchCount(results.length);
  }, 150);
};

/**
 * Returns the current search index.
 */
export const getSearchIndex = () => _searchIndex;
