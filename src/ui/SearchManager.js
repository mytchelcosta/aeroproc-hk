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
 */
export const handleGlobalSearch = (map, term) => {
  clearTimeout(_globalSearchTimer);

  _globalSearchTimer = setTimeout(() => {
    if (!term || !term.trim()) {
      clearGlobalSearchHighlights(map);
      updateViewGlobalSearchCount(0);
      return;
    }

    const q = term.trim().toUpperCase();

    // Filter: match ident OR name (case-insensitive, substring match).
    // Cap at 50 results to prevent the map from being overwhelmed with markers.
    const results = _searchIndex
      .filter((entry) => {
        const identMatch = entry.ident.toUpperCase().includes(q);
        const nameMatch  = entry.name ? entry.name.toUpperCase().includes(q) : false;
        return identMatch || nameMatch;
      })
      .slice(0, 50);

    renderGlobalSearchHighlights(map, results);
    updateViewGlobalSearchCount(results.length);
  }, 150);
};

/**
 * Returns the current search index.
 */
export const getSearchIndex = () => _searchIndex;
