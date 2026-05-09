/**
 * SearchManager.js - Global Search Orchestrator
 * Handles indexing of aerodromes, fixes, and NAVAIDs for real-time substring search.
 */

import { renderGlobalSearchHighlights, clearGlobalSearchHighlights } from '../map/MapLayers.js';
import { updateViewGlobalSearchCount } from '../components/Sidebar.js';

let _searchIndex = [];
let _globalSearchTimer = null;

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
      return;
    }

    const q = term.trim().toUpperCase();

    // Filter and score matches:
    // 0 = Exact ident match
    // 1 = Ident starts with query
    // 2 = Name starts with query
    // 3 = Ident contains query
    // 4 = Name contains query
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
        scoredResults.push({ entry, score });
      }
    }

    // Sort by score (lower is better), then alphabetically by ident.
    // Finally, slice the top 50 to prevent map overload.
    scoredResults.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.entry.ident.localeCompare(b.entry.ident);
    });

    const results = scoredResults.slice(0, 50).map(s => s.entry);

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
