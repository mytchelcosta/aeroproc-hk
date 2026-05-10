// ============================================================
// main.js - The Application Entry Point & Drawing Orchestrator
// ============================================================
// This file has two jobs:
//
//   1. STARTUP — initializes the map, loads waypoint data, and
//      wires all modules together in the correct order.
//
//   2. ORCHESTRATION — manages the drawing workflow. When the
//      user interacts with the sidebar or the map, these handler
//      functions coordinate between Sidebar.js (UI), MapLayers.js
//      (map interactions), and DrawingState.js (data).
//
// The flow for building a procedure:
//   showMetadataForm → handleStartDrawing → [user clicks map/markers]
//   → handlePointAdded → showRestrictionModal → DrawingState.addPoint
//   → updateActiveShape + refreshSequenceList → ... → handleSave
// ============================================================

import './styles/variables.css';
import './styles/main.css';

import { i18n } from './utils/i18n.js';
import { calculateDistance, calculateTrueBearing, trueToMagnetic } from './utils/Helpers.js';
import { initMap }                                    from './map/MapCore.js';
import { renderFixes, addThresholdsToLayer,
         filterWaypoints,
         enableSnapMode, disableSnapMode,
         enableGhostSnapMode, disableGhostSnapMode,
         enableFreeDrawMode, disableFreeDrawMode,
         enableCustomDropOverlay, disableCustomDropOverlay,
         setContextMenuCallbacks,
         updateActiveShape, clearActiveShape,
         setMeasurementsVisible, updateMeasurementLabels,
         clearMeasurementLabels,
         renderSavedProcedure,
         renderAerodromes,
         renderNavaids,
         renderAirspaces,
         updateHoldingMarkers, clearHoldingMarkers,
         createDraggableCustomMarker, removeDraggableMarker,
         renderGlobalSearchHighlights,
         clearGlobalSearchHighlights,
         getFilteredFixes,
         updateCommonRouteGhost,
         clearCommonRouteGhost,
         applySymbolScale,
         setFetchWeatherFn,
         renderGhostFixes }                         from './map/MapLayers.js';
import { fetchWeather }                             from './services/MetarService.js';
import { loadWaypoints, loadRunwayThresholds,
         loadAerodromes, loadNavaids,
         loadDataManifest, loadAirspaces,
         lookupAircraft, lookupAirline, lookupAirport } from './data/DataLoader.js';
import { initDataStatusModal, showDataStatusModal,
         updateStatusBadge, getWorstStatus,
         processManifest }                            from './components/DataStatusModal.js';
import { loadAll, saveProc, deleteProc }              from './data/ProcedureDatabase.js';
import { exportToJSON, importFromJSON }               from './data/ProcedureDB.js';
import { DrawingState }                               from './state/DrawingState.js';
import { initModal, showRestrictionModal }            from './components/Modal.js';
import { initSidebar, buildLayerControls,
         showViewTab, showMainMenu, showMetadataForm,
         showDrawingPanel, refreshSequenceList,
         clearSearch,
         updateViewTab, refreshBuilderSavedList,
         setViewGlobalSearchCallback,
         updateViewGlobalSearchCount,
         getGlobalSearchCategoryFilter,
         updateTransitionUI,
         setJSONCallbacks,
         setBuilderUnlockCallback,
         showPendingPointRestrictions,
         clearPendingPointRestrictions,
         collectInlineRestrictions }                  from './components/Sidebar.js';
import { initMeasuringVector,
         enableMeasuringVector,
         disableMeasuringVector,
         clearAllVectors,
         clearSelectedVector,
         cycleSelectedVector,
         deselectAllVectors,
         updateCursorLatLng,
         setOriginAtCursor,
         setFinalAtCursor,
         updateAttachedVectors,
         isMeasuringVectorActive,
         setVectorSnapProvider }                      from './map/MeasuringVector.js';
import { initLiveTraffic,
          enableLiveTraffic,
          disableLiveTraffic,
          setAircraftLabels,
          setPositionUpdateCallback,
          setLabelState,
          setAutoDeclutter,
          isLiveTrafficEnabled }                           from './traffic/LiveTraffic.js';
import { initEphemeralDraw,
         enableEphemeralPolygon,
         enableEphemeralCircle,
         enableEphemeralLine,
         disableEphemeralDraw,
         isEphemeralDrawActive,
         isEphemeralPolygonActive,
         isEphemeralCircleActive,
         isEphemeralLineActive,
         isDrawingInProgress,
         setShapeChangeCallback,
         toggleShapeVisibility,
         renameShape,
         deleteShapeById,
         zoomToShape }                                from './map/EphemeralDraw.js';
import { initNotationTool,
         enableNotationTool,
         disableNotationTool,
         isNotationActive,
         setNoteChangeCallback,
         getNotes,
         toggleNoteVisibility,
         deleteNoteById,
         editNoteById }                                 from './map/NotationTool.js';
import { initGeoPointTool,
         enableGeoPointTool,
         disableGeoPointTool,
         isGeoPointActive,
         setGeoPointChangeCallback,
         getGeoPoints,
         deleteGeoPointById,
         clearAllGeoPoints,
         toggleGeoPointVisibility }                   from './map/GeoPointTool.js';
import { initRangeTool,
         enableRangeTool,
         disableRangeTool,
         isRangeToolActive,
         setRangeChangeCallback,
         getRanges,
         deleteRangeById,
         clearAllRanges,
         toggleRangeVisibility }                      from './map/RangeTool.js';
import { buildSearchIndex, handleGlobalSearch, getSearchIndex }   from './ui/SearchManager.js';
import { 
  initToolbarManager, updateToolbarHighlights, syncMapCursor, 
  stopAllActiveTools, toggleToolbarPanel, wireToolbarPanels, 
  wireSettingsPanel, wireResearchPanel,
  refreshGeoPointPanel, refreshNotationPanel, refreshRangePanel, refreshShapePanels
} from './ui/ToolbarManager.js';

// ── Module-level references ──────────────────────────────────────────
// Declared here so all handler functions below can access them
// without them being passed around as arguments everywhere.
let _map          = null;  // the Leaflet map instance
let _waypointLayer = null; // the waypoint LayerGroup from renderFixes()

// Tracks the Leaflet layers for each saved procedure so we can toggle
// visibility and delete them without re-querying the database.
// Phase 13: measureLayer is stored separately so the Viewer toggle can hide leg
// measurements without affecting the procedure polyline/labels.
// Structure: { [procedureId]: { layer, measureLayer, visible: boolean } }
let _savedProcLayers = {};

// Phase 13: when a procedure is opened for editing its id is stored here instead
// of being deleted from the database immediately. deleteProc() is deferred to
// handleSave() so a mid-edit tab switch never loses the procedure from LocalStorage.
let _editingOriginalProcId = null;

// Phase 14: holds the raw fix/point data for the point currently awaiting
// restriction entry in the inline form. Null when no point is pending.
// Committed to DrawingState by _commitPendingPoint() when "Add Point" is clicked.
let _pendingPoint = null;

// Phase 13: controls whether leg measurement labels are shown in Viewer mode.
// Toggled by the "Leg Measurements" button in the Viewer tab header.
let _viewerMeasVisible = true;

// Phase 8.4 — Draggable Custom Points
// A parallel array that mirrors DrawingState.points. Each slot holds either:
//   • null  — for a fixed waypoint (snapped from the waypoint database), which is NOT draggable
//   • a Leaflet marker — for a custom coordinate point (free-draw / drop / manual), which IS draggable
// When points are removed or reordered, we splice/swap this array in sync with DrawingState.
let _draggableMarkers = [];

// Phase 9.7 — Data Currency Warning System
// Stores the processed manifest data so the badge button's click handler can
// re-open the modal at any time without re-fetching the manifest.
let _statusData = [];

// Phase 10.5 — Toolbar sub-panel layer references.
// These are populated after renderAerodromes(), renderNavaids(), and renderAirspaces()
// complete at startup so the Objects and Airspaces sub-panel checkboxes can
// add/remove the correct Leaflet LayerGroups when the user interacts with them.
let _majorLayer    = null;  // Tier-1 major airports (ON by default)
let _regionalLayer = null;  // Tier-2 regional airports (OFF by default)
let _heliportLayer = null;  // Tier-3 heliports (OFF by default)
let _navaidLayer   = null;  // VOR/NDB NAVAIDs (ON by default)

// Phase 10.5 (revised) — holds all per-polygon references from renderAirspaces().
// Structure: { tmaOuterLayer, tmaSectors, ctrPolygons, fizPolygons, atzPolygons }
// Each inner map is { [jsonName]: L.polygon }, toggled via addTo/removeLayer per the
// Airspaces sub-panel checkboxes and group toggles wired in wireToolbarPanels().
let _airspaceLayers = null;

// Phase 10 — Ghost Fix Layer.
// L.layerGroup containing one faint, non-interactive circleMarker per RNAV fix.
// Placed in ghostFixPane (z-index 390) so the dots always sit below interactive
// fix markers. Toggled by the "All Fixes (FIR)" checkbox in the Objects panel.
let _ghostFixLayers = null;

// Tracks whether the user wants RNAV fixes shown in Builder mode.
// Defaults to true (checked in Objects panel). The tab-switch logic
// respects this flag: Builder mode only shows the fix layer if _fixesEnabled.
// View mode always hides the fix layer regardless of this flag.
let _fixesEnabled = true;

// Phase 20 — cursor coordinate overlay div.
// Created in DOMContentLoaded; shown/hidden in the mousemove handler
// based on whether any drawing or notation tool is currently active.
let _cursorCoordsEl = null;


// ── GLOBAL SEARCH ────────────────────────────────────────────────────
// Logic extracted to SearchManager.js


// ── TOOLBAR HIGHLIGHT & TEXT SYNC ──────────────────────────────────────────
// ── TOOLBAR & UI ORCHESTRATION ──────────────────────────────────────────
// Logic extracted to ToolbarManager.js




// ── PHASE 36: LANGUAGE TOGGLE WIRING ───────────────────────────────────


// Sub-panel refresh logic extracted to ToolbarManager.js


// ── PHASE 36: LANGUAGE TOGGLE WIRING ───────────────────────────────────
const _initI18nToggle = () => {
  // Use event delegation so that toggles injected later (like in modals) still work.
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-btn');
    if (!btn) return;

    const lang = btn.dataset.lang;
    i18n.setLanguage(lang);
    
    // Synchronize all toggle buttons on the page (Sidebar and Modal)
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  });

  // Initial UI state sync
  const currentLang = i18n.currentLang;
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  // Perform initial DOM translation right on boot
  i18n.updateDOM();

  // Phase 36: Refresh dynamic toolbar strings and highlights whenever language changes.
  window.addEventListener('languageChanged', () => {
    updateToolbarHighlights();

    // Refresh Research panel placeholder and empty state if open
    const inputEl = document.getElementById('research-input');
    const activeTab = document.querySelector('#panel-research .research-tab-btn.active');
    if (inputEl && activeTab) {
      const category = activeTab.dataset.category;
      inputEl.placeholder = i18n.t(`ui.panels.research.placeholder_${category}`);
      
      // If the result card is currently showing the "empty" message, refresh its translation too.
      const resultCard = document.getElementById('research-result-card');
      if (resultCard && resultCard.querySelector('.research-result-empty')) {
        resultCard.innerHTML = `<div class="research-result-empty">${i18n.t('ui.panels.research.empty_msg')}</div>`;
      }
    }
  });
};


// ── PHASE 13: JSON I/O HANDLERS ──────────────────────────────────────────────


// Exports all procedures currently in the database to a downloadable JSON file.
// Always exports everything in localStorage — there is no partial-export option.
const handleSaveJSON = () => {
  const all = loadAll();
  if (all.length === 0) {
    // Nothing to export — let the user know rather than producing an empty file.
    window.alert('There are no saved procedures to export.\nCreate and save at least one procedure first.');
    return;
  }
  exportToJSON(all);
  console.log(`[AeroProc] JSON export triggered for ${all.length} procedure(s).`);
};


// Imports procedures from a user-selected JSON file.
// The user is asked to confirm before any existing data is affected.
// On confirm, all current procedures are removed and replaced with those from the file.
// Each imported procedure is re-saved via saveProc() so it receives a fresh ID and timestamp.
const handleLoadJSON = async () => {
  let importedProcs;
  try {
    importedProcs = await importFromJSON();
  } catch (err) {
    // The file was unreadable or failed validation — show the plain-English error.
    window.alert(`Could not load the file:\n\n${err.message}`);
    return;
  }

  // null means the user dismissed the file picker without selecting anything.
  if (importedProcs === null) return;

  const currentCount  = loadAll().length;
  const incomingCount = importedProcs.length;

  if (incomingCount === 0) {
    window.alert('The selected file contains no procedures.');
    return;
  }

  // Confirm before replacing existing data — this cannot be undone.
  const confirmed = window.confirm(
    `Load ${incomingCount} procedure${incomingCount !== 1 ? 's' : ''} from file?\n\n` +
    (currentCount > 0
      ? `This will REPLACE your current ${currentCount} procedure${currentCount !== 1 ? 's' : ''}. This cannot be undone.`
      : 'Your database is currently empty — this will add the imported procedures.')
  );
  if (!confirmed) return;

  // ── Step 1: Remove all existing procedures from the map and the database ──
  Object.keys(_savedProcLayers).forEach((id) => {
    const entry = _savedProcLayers[id];
    if (entry) {
      _map.removeLayer(entry.layer);
      if (entry.measureLayer && _map.hasLayer(entry.measureLayer)) {
        _map.removeLayer(entry.measureLayer);
      }
    }
  });
  _savedProcLayers = {};

  // Wipe localStorage by calling deleteProc for every existing procedure.
  loadAll().forEach((p) => deleteProc(p.id));

  // ── Step 2: Save and render each imported procedure ───────────────────────
  let successCount = 0;
  importedProcs.forEach((proc) => {
    // saveProc handles backward-compat normalization for old schema shapes.
    const saved = saveProc({
      name:    proc.name    || '(unnamed)',
      type:    proc.type    || 'SID',
      airport: proc.airport || '',
      runway:  proc.runway  || '',
      lineStyle: {
        pattern: proc.pattern || proc.lineStyle?.pattern || 'solid',
        color:   proc.color   || proc.lineStyle?.color   || '#3b9eff'
      },
      common_route: proc.common_route || proc.points || [],
      transitions:  proc.transitions  || []
    });

    if (!saved) {
      console.warn(`[AeroProc] Failed to save imported procedure "${proc.name}".`);
      return;
    }

    const result = renderSavedProcedure(_map, saved);
    if (result) {
      if (!_viewerMeasVisible && result.measureLayer) _map.removeLayer(result.measureLayer);
      _savedProcLayers[saved.id] = { layer: result.layer, measureLayer: result.measureLayer, visible: true };
    }
    successCount++;
  });

  // ── Step 3: Refresh both sidebar panels so they reflect the new state ─────
  _refreshViewTab();
  _refreshBuilderSavedList();

  console.log(`[AeroProc] JSON import complete: ${successCount}/${incomingCount} procedure(s) loaded.`);
};


// ── STARTUP ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[AeroProc] App starting up...');

  // Phase 36: Initialize i18n right away so the UI translates
  _initI18nToggle();
  
  // Phase 38: Initialize sidebar collapse functionality
  _initSidebarCollapse();

  // Step 1: Initialize the Leaflet map.
  _map = initMap();
  if (!_map) {
    console.error('[AeroProc] CRITICAL: Map failed to initialize. Check index.html and CDN links.');
    return;
  }

  // Step 1b: Initialize UI Managers
  initToolbarManager(_map);

  // Step 1c: Initialise the Live Traffic module so it holds a map reference.
  // Polling only starts when the user enables it via the toolbar sub-panel.
  initLiveTraffic(_map);

  // Phase 32: Wire the position-update callback so LiveTraffic notifies MeasuringVector
  // after each poll cycle. This decouples the two modules — MeasuringVector already
  // imports from LiveTraffic, so LiveTraffic cannot import back without a circular dep.
  setPositionUpdateCallback(updateAttachedVectors);

  // Step 2: Show the sidebar loading state immediately while data fetches.
  initSidebar(_map);

  // Phase 13: Register JSON I/O callbacks so the Builder main menu buttons
  // can trigger export and import without Sidebar.js importing from main.js.
  setJSONCallbacks(handleSaveJSON, handleLoadJSON);

  // Auto-enable ghost fix layer checkboxes when the builder is unlocked,
  // so ghost dots are visible as snap targets without the user having to
  // manually toggle them on.
  setBuilderUnlockCallback(() => {
    ['chk-ghost-t1', 'chk-ghost-t2', 'chk-ghost-t3', 'chk-ghost-t4'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.checked) {
        el.checked = true;
        el.dispatchEvent(new Event('change'));
      }
    });
  });

  // Step 3: Initialize the restriction modal HTML (injected once into <body>).
  initModal();

  // Step 3b: Initialize the Measuring Vector tool DOM elements (telemetry label
  // and context menu). The module now manages its own button state directly via
  // document.getElementById('btn-mv-tool') — no callback needed.
  initMeasuringVector();

  // Phase 34 / Phase 7: Wire the global snap provider so the Measuring Vector
  // tool can snap to NAVAIDs, FIXes, and Airports.
  //
  // Phase 7 changes:
  //   • Visibility-aware: each candidate is rejected if its layer is currently
  //     toggled OFF on the map. Hidden NAVAIDs / fixes / airport tiers are no
  //     longer "ghost-snappable" — they only attract the cursor when actually
  //     drawn. We test visibility with `_map.hasLayer(...)`, which is the
  //     authoritative source (the toolbar checkboxes call addTo / removeLayer
  //     directly, so the map's own state is always the truth).
  //   • Aerodromes are split into three tiers in the search index
  //     (`tier: 'major' | 'regional' | 'heliport'`) and each tier maps to a
  //     different LayerGroup. We pick the right LayerGroup for the entry's tier
  //     before testing visibility.
  //   • Airspaces remain excluded — the search index never holds airspace
  //     entries (see SearchManager.buildSearchIndex), so the layer filter
  //     below already rules them out by construction.
  //   • The MeasuringVector caller now passes 0.4 NM for static targets
  //     (was 1.0 NM) — the previous radius felt too "magnetic". Aircraft
  //     keep their generous 1.0 NM hitbox via getNearestAircraft.
  setVectorSnapProvider((latlng, maxNm = 0.4) => {
    // Resolve the correct LayerGroup for one search-index entry. Returns null
    // when no layer is known, in which case the entry is treated as hidden.
    const _layerForEntry = (entry) => {
      if (entry.layer === 'navaid')    return _navaidLayer;
      if (entry.layer === 'fix')       return _waypointLayer;
      if (entry.layer === 'aerodrome') {
        if (entry.tier === 'major')    return _majorLayer;
        if (entry.tier === 'regional') return _regionalLayer;
        if (entry.tier === 'heliport') return _heliportLayer;
      }
      return null;
    };

    // An entry is snappable only if its parent LayerGroup is currently on the
    // map. `_map.hasLayer` is cheap (a Set lookup) so calling it once per
    // candidate inside the loop is fine even with thousands of fixes.
    const _isVisible = (entry) => {
      const layer = _layerForEntry(entry);
      return !!layer && !!_map && _map.hasLayer(layer);
    };

    let bestNavaid = null, bestNavaidDist = maxNm;
    let bestFix    = null, bestFixDist    = maxNm;
    let bestApt    = null, bestAptDist    = maxNm;

    getSearchIndex().forEach(entry => {
      if (!_isVisible(entry)) return;   // hidden layer → not snappable
      const d = calculateDistance(latlng.lat, latlng.lng, entry.lat, entry.lon);
      if (d < maxNm) {
        if (entry.layer === 'navaid' && d < bestNavaidDist) { bestNavaid = entry; bestNavaidDist = d; }
        else if (entry.layer === 'fix' && d < bestFixDist) { bestFix = entry; bestFixDist = d; }
        else if (entry.layer === 'aerodrome' && d < bestAptDist) { bestApt = entry; bestAptDist = d; }
      }
    });

    if (bestNavaid) return { isAircraft: false, lat: bestNavaid.lat, lon: bestNavaid.lon, type: 'NAVAID', id: bestNavaid.ident };
    if (bestFix)    return { isAircraft: false, lat: bestFix.lat,    lon: bestFix.lon,    type: 'FIX',    id: bestFix.ident };
    if (bestApt)    return { isAircraft: false, lat: bestApt.lat,    lon: bestApt.lon,    type: 'APT',    id: bestApt.ident };

    return null;
  });

  // Step 3b2: Initialize the Ephemeral Draw tool with the map instance so it can
  // attach and detach Leaflet event handlers when the user toggles it on/off.
  initEphemeralDraw(_map);

  // Phase 20: Create the fixed cursor coordinate overlay div and append it to
  // <body>. It is shown/hidden inside the mousemove handler based on which tool
  // is currently active. The CSS class is defined in main.css (#cursor-coords).
  _cursorCoordsEl    = document.createElement('div');
  _cursorCoordsEl.id = 'cursor-coords';
  document.body.appendChild(_cursorCoordsEl);

  // Register the shape-change callback so each per-tool sub-panel stays in sync
  // with EphemeralDraw's internal state whenever shapes are added, deleted, renamed,
  // or toggled.
  setShapeChangeCallback(refreshShapePanels);

  // Register the note-change callback so the Notation sub-panel stays in sync
  // with NotationTool's internal state (add, delete, visibility toggle).
  setNoteChangeCallback(() => {
    refreshNotationPanel(getNotes());
    updateToolbarHighlights();
  });

  // Register the geo point change callback so the Geo Point sub-panel list stays
  // in sync with GeoPointTool's internal state.
  setGeoPointChangeCallback(() => {
    refreshGeoPointPanel(getGeoPoints());
    updateToolbarHighlights();
  });

  // Register the range change callback so the Range Tool sub-panel list stays
  // in sync with RangeTool's internal state (add, delete, visibility toggle).
  setRangeChangeCallback(() => {
    refreshRangePanel(getRanges());
    updateToolbarHighlights();
  });

  // Step 3b3: Initialize the Notation Tool. Creates the shared context-menu DOM
  // element and stores the map reference. Placement mode is activated via the
  // sub-panel checkbox, not automatically at startup.
  initNotationTool(_map);

  // Step 3b4: Initialize the Geo Point Tool. Creates the shared context-menu DOM
  // element and stores the map reference. Drop mode is activated via the panel button.
  initGeoPointTool(_map);

  // Step 3b5: Initialize the Range Tool. Creates the shared context-menu DOM
  // element and stores the map reference. Drop mode is activated via the panel button.
  initRangeTool(_map);

  // Phase 35: Inject the MetarService fetch function into MapLayers so that
  // Tier-1 airport popup "Show Weather" buttons can request METAR/TAF data
  // without creating a circular import (MapLayers ↔ services).
  setFetchWeatherFn(fetchWeather);

  // Step 3c: Initialize the Data Currency Modal skeleton and fetch the manifest.
  // Done early so the modal is ready before any heavy data loads complete.
  initDataStatusModal();

  // Load the data manifest, calculate staleness, and show the startup modal.
  // The manifest is stored in _statusData at module level so the badge button
  // can re-open the modal at any time via showDataStatusModal(_statusData, true).
  const rawManifest = await loadDataManifest();
  _statusData = rawManifest ? processManifest(rawManifest) : [];

  if (_statusData.length > 0) {
    // Update the badge color immediately so users see it while the rest of the
    // app is still loading its data files.
    updateStatusBadge(getWorstStatus(_statusData));
    // Show the modal (respects the sessionStorage "don't show again" flag).
    showDataStatusModal(_statusData);
  }

  // Wire the sidebar badge button: clicking it always re-opens the modal,
  // bypassing the sessionStorage flag so the user can review status on demand.
  const _btnDataStatus = document.getElementById('btn-data-status');
  if (_btnDataStatus) {
    _btnDataStatus.addEventListener('click', () => {
      showDataStatusModal(_statusData, true);
    });
  }

  // Wire the floating toolbar's MV button to toggle the tool on/off.
  // The button's 'active' CSS class is managed by MeasuringVector.js itself
  // (it reads #btn-mv-tool from the DOM directly), so here we only need to
  // read the current class to decide which direction to toggle.
  const _btnMvTool = document.getElementById('btn-mv-tool');
  if (_btnMvTool) {
    _btnMvTool.addEventListener('click', () => {
      if (_btnMvTool.classList.contains('active')) {
        disableMeasuringVector(_map);
      } else {
        enableMeasuringVector(_map);
      }
    });
  }

  // Note: Buttons 5-8 (draw tools) are now panel buttons wired inside
  // wireToolbarPanels(). The "Draw New" buttons inside each panel handle
  // the actual draw-mode toggling. No additional wiring is needed here.

  // ── RIGHT-CLICK TO CANCEL ─────────────────────────────────────────────────
  // Phase 25: Implement an intuitive way to stop any active drawing/notation tool.
  // Right-clicking anywhere on the map while a tool is active will disable it.
  _map.on('contextmenu', (e) => {
    if (stopAllActiveTools()) {
      // Prevent the browser's default context menu from appearing.
      if (e.originalEvent) e.originalEvent.preventDefault();
    }
  });


  // Phase 25: Global keyboard shortcuts.
  window.addEventListener('keydown', (e) => {
    // 1. ESC: De-activate any currently armed tool.
    if (e.key === 'Escape') {
      // Don't stop tools if the user is typing in a modal or notation note.
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SPAN'].includes(document.activeElement.tagName) || 
                             document.activeElement.isContentEditable;
      
      if (!isInputFocused) {
        // Phase 36: Double-functioning ESC logic
        // If drawing is in progress, ESC cancels the current shape but stays in the tool mode.
        // If NO drawing is in progress, ESC stops the tool and CLOSES the panel.
        if (isEphemeralDrawActive() && isDrawingInProgress()) {
          // Store which mode was active so we can restore it after force-cancelling
          const wasPolygon = isEphemeralPolygonActive();
          const wasCircle  = isEphemeralCircleActive();
          const wasLine    = isEphemeralLineActive();

          disableEphemeralDraw(true); // Discard current points (sets mode to null)
          
          // Re-enable the same mode to continue drawing a new one if desired
          if (wasPolygon) enableEphemeralPolygon();
          else if (wasCircle) enableEphemeralCircle();
          else if (wasLine) enableEphemeralLine();
          
          console.log('[main.js] ESC: Cancelled in-progress drawing.');
        } else {
          // No drawing in progress -> Stop tools AND ensure panel is closed
          stopAllActiveTools(true);
          toggleToolbarPanel(null);
          console.log('[main.js] ESC: Tools de-activated and panel closed.');
        }
      }
    }
  });

  // Track cursor position continuously on the map for:
  //   1. O/F keyboard shortcuts (MV tool origin/destination placement).
  //   2. Phase 20 cursor coordinate overlay (shown when any drawing tool is active).
  _map.on('mousemove', (e) => {
    updateCursorLatLng(e.latlng);

    // Show live lat/lng next to the cursor whenever any drawing or notation tool
    // is active. Hide it otherwise so it doesn't distract during normal navigation.
    if (
      isEphemeralPolygonActive() ||
      isEphemeralCircleActive()  ||
      isEphemeralLineActive()    ||
      isNotationActive()         ||
      isGeoPointActive()         ||
      isRangeToolActive()
    ) {
      if (_cursorCoordsEl) {
        // Phase 25: UI Collision Detection
        // If the mouse is over the sidebar or toolbar, hide the coordinate badge.
        const target = e.originalEvent.target;
        const isOverUI = target.closest('.map-toolbar') || 
                         target.closest('.sidebar') || 
                         target.closest('.toolbar-subpanel') ||
                         target.closest('.mv-context-menu') ||
                         target.closest('.notation-floating-bar') ||
                         target.closest('#notation-context-menu') ||
                         target.closest('.modal-overlay');

        if (isOverUI) {
          _cursorCoordsEl.classList.add('ui-collision');
        } else {
          _cursorCoordsEl.classList.remove('ui-collision');
        }

        _cursorCoordsEl.innerHTML = `
          ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}
          <div class="cursor-hint">Right-click to stop</div>
        `;
        _cursorCoordsEl.style.left    = `${e.originalEvent.clientX + 18}px`;
        _cursorCoordsEl.style.top     = `${e.originalEvent.clientY + 14}px`;
        _cursorCoordsEl.style.display = 'block';
      }
    } else if (_cursorCoordsEl) {
      _cursorCoordsEl.style.display = 'none';
      _cursorCoordsEl.classList.remove('ui-collision');
    }
  });

  // Phase 25.2: Hide the coordinate overlay when the cursor leaves the map area entirely.
  // Without this, moving quickly from the map to the sidebar would leave the overlay
  // stuck at its last position because Leaflet's mousemove stops firing outside the map.
  _map.getContainer().addEventListener('mouseleave', () => {
    if (_cursorCoordsEl) {
      _cursorCoordsEl.style.display = 'none';
      _cursorCoordsEl.classList.remove('ui-collision');
    }
  });

  // Global deselection: clicking an empty area of the map clears any red
  // measuring-vector selection — but ONLY when the MV tool is inactive.
  // When the tool is active, blank-area clicks place origin/destination nodes
  // (handled inside MeasuringVector.js) and must not also drop the selection.
  _map.on('click', () => {
    if (!isMeasuringVectorActive()) deselectAllVectors();
  });

  // Global keyboard shortcuts.
  //   ESC = Stop any active drawing/notation tool
  //   O = place/reset MV origin at cursor
  //   F = finalize MV vector at cursor
  //   X = clear ALL measuring vectors
  //   Z = clear only the currently selected (red) measuring vector
  //   C = cycle selection through all finalized measuring vectors
  // Skip when the user is typing in an input, textarea, or select field.
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'o' || e.key === 'O') {
      setOriginAtCursor(_map);
    } else if (e.key === 'f' || e.key === 'F') {
      setFinalAtCursor(_map);
    } else if (e.key === 'x' || e.key === 'X') {
      clearAllVectors(_map);
    } else if (e.key === 'z' || e.key === 'Z') {
      clearSelectedVector(_map);
    } else if (e.key === 'c' || e.key === 'C') {
      cycleSelectedVector();
    }
  });


  // Step 4: Fetch and parse the waypoints Excel file asynchronously.
  console.log('[AeroProc] Fetching waypoints...');
  const waypoints = await loadWaypoints();
  if (waypoints.length === 0) {
    console.warn('[AeroProc] No waypoints loaded. Check MEDIA/waypoint_aisweb.xlsx.');
  }

  // Step 5: Render the waypoints as circle markers grouped in a LayerGroup.
  _waypointLayer = renderFixes(_map, waypoints);

  // Phase 10: Render the full FIR fix dataset as faint, non-interactive ghost dots.
  // These dots are always visible in View mode as a positional reference overlay.
  // They sit in ghostFixPane (z-index 390) — below interactive markers — and have
  // no labels or click handlers, so they never interfere with the drawing workflow.
  _ghostFixLayers = renderGhostFixes(_map, waypoints);

  // Step 5b: Load the hardcoded runway threshold data and add those markers
  // to the same LayerGroup so thresholds are toggled by the same tab switch.
  // Thresholds are rendered as amber circles, visually distinct from teal fixes.
  const thresholds = loadRunwayThresholds();
  if (_waypointLayer) {
    addThresholdsToLayer(_waypointLayer, thresholds);
  }

  // Step 5c: Fetch and render airport markers from the OurAirports CSV dataset.
  // loadAerodromes() returns { major, regional, heliports } — three categorized arrays.
  // renderAerodromes creates three separate LayerGroups and adds only majorLayer to the map.
  // Regional airports and heliports start hidden; the Objects sub-panel enables them.
  console.log('[AeroProc] Fetching airports...');
  const aerodromes = await loadAerodromes();
  const aeroLayers = renderAerodromes(_map, aerodromes, thresholds);
  // Store refs so the Objects sub-panel checkboxes can toggle each tier.
  _majorLayer    = aeroLayers.majorLayer;
  _regionalLayer = aeroLayers.regionalLayer;
  _heliportLayer = aeroLayers.heliportLayer;

  // Step 5d: Fetch and render NAVAIDs (VOR/NDB family) from the AIP Brasil JSON.
  // NAVAIDs are ON by default (added to map by renderNavaids).
  console.log('[AeroProc] Fetching NAVAIDs...');
  const navaids = await loadNavaids();
  _navaidLayer = renderNavaids(_map, navaids);

  // Step 5e: Phase 10.5 — Fetch and render airspace polygons (TMA sectors + CTR/ATZ zones).
  // All polygons are ON by default. The Airspaces sub-panel controls each one individually.
  // renderAirspaces() now returns per-polygon references instead of grouped LayerGroups.
  console.log('[AeroProc] Fetching airspaces...');
  const airspaces = await loadAirspaces();
  _airspaceLayers = renderAirspaces(_map, airspaces);

  // Phase 9.8: Build the global search index now that all three data sources are loaded.
  // Register the search callback with the sidebar so the View-mode search bar fires it.
  // Phase 8: also pull the current category-toggle state from the legend chips
  // (`getGlobalSearchCategoryFilter()` reads them directly from the DOM) and
  // hand it to the search engine so disabled categories drop out of the result set.
  const searchIndex = buildSearchIndex(waypoints, aerodromes, navaids);
  setViewGlobalSearchCallback((term) => handleGlobalSearch(_map, term, getGlobalSearchCategoryFilter()));

  // Phase 10.5: Wire the 3-button right toolbar sub-panels and their layer checkboxes.
  // Must run AFTER all layers are created (majorLayer, navaidLayer, _airspaceLayers, etc.)
  // so the checkbox handlers have valid polygon references to add/remove.
  wireToolbarPanels(
    {
      waypointLayer:  _waypointLayer,
      majorLayer:     _majorLayer,
      regionalLayer:  _regionalLayer,
      heliportLayer:  _heliportLayer,
      navaidLayer:    _navaidLayer,
      airspaceLayers: _airspaceLayers,
      ghostFixLayers: _ghostFixLayers    // Phase 10.5: tiered ghost FIR fix dots
    },
    { fixesEnabled: _fixesEnabled }
  );

  // Phase 28: Wire the Settings panel sliders (label scale + symbol scale).
  // Must run after wireToolbarPanels so toggleToolbarPanel is already defined.
  wireSettingsPanel();

  // Phase 27: Wire the Research panel (tabs, input, search button, result card).
  // This is intentionally called after wireToolbarPanels so the panel's DOM is
  // already guaranteed to exist in the document by the time we attach listeners.
  wireResearchPanel();

  // Step 5c: Restore any procedures that were saved in a previous session.
  // These are rendered on the map BEFORE buildLayerControls so the View tab
  // immediately shows them when it first loads.
  const existingProcs = loadAll();
  existingProcs.forEach((proc) => {
    const result = renderSavedProcedure(_map, proc);
    if (result) {
      _savedProcLayers[proc.id] = { layer: result.layer, measureLayer: result.measureLayer, visible: true };
    }
  });
  if (existingProcs.length > 0) {
    console.log(`[AeroProc] Restored ${existingProcs.length} saved procedure(s) from database.`);
  }

  // Step 6: Build the tab bar and wire up callbacks.
  // 'handleTabChange'    controls waypoint visibility when the user switches tabs.
  // 'handleNewProcedure' is called when the user clicks "+ New Procedure" in Builder mode.
  if (_waypointLayer) {
    buildLayerControls(_map, _waypointLayer, waypoints.length, handleTabChange, handleNewProcedure);
  }

  console.log(`[AeroProc] Startup complete. ${waypoints.length} waypoints on map.`);
});


// ── DRAWING ORCHESTRATION ─────────────────────────────────────────────


// Called by the sidebar whenever the user clicks the View or Builder tab.
// Controls waypoint layer visibility based on which tab is active:
//   • Builder tab → show waypoints so the user can click them to snap to fixes.
//   • View tab    → hide waypoints, cancel any in-progress drawing, and refresh the
//                   saved-procedure list so it always reflects the current DB state.
//
// 'tab' — either 'view' or 'builder'
const handleTabChange = (tab) => {
  if (tab === 'builder') {
    // Show the waypoint layer only if the RNAV Fixes checkbox in the Objects panel
    // is currently checked. If the user explicitly turned it off, respect that choice.
    if (_fixesEnabled && _waypointLayer && _map) {
      _waypointLayer.addTo(_map);
      console.log('[AeroProc] Builder tab active — waypoints layer shown.');
    }
    // Phase 9.8: Clear any active global search highlights when entering Builder mode.
    // The highlight markers belong to View mode only — they would be confusing in Builder.
    clearGlobalSearchHighlights(_map);
    updateViewGlobalSearchCount(0);
    // Populate the saved procedures list that showMainMenu() just rendered.
    _refreshBuilderSavedList();
  } else {
    // Hide the waypoint layer in View mode
    if (_waypointLayer && _map) {
      _map.removeLayer(_waypointLayer);
      console.log('[AeroProc] View tab active — waypoints layer hidden.');
    }

    // If the user switches away mid-draw, cancel the active drawing session
    // to avoid orphaned shapes and stuck drawing modes.
    if (DrawingState.isActive) {
      clearActiveShape(_map, DrawingState);
      _cleanupDrawingMode();
      clearMeasurementLabels(_map);
      DrawingState.reset();
      console.log('[AeroProc] Active drawing session cancelled on tab switch.');

      // Phase 13: if this was an edit session, the original procedure is still
      // in LocalStorage. Re-render its layer so it reappears in the View tab.
      if (_editingOriginalProcId) {
        const orig = loadAll().find((p) => p.id === _editingOriginalProcId);
        if (orig) {
          const result = renderSavedProcedure(_map, orig);
          if (result) {
            if (!_viewerMeasVisible && result.measureLayer) _map.removeLayer(result.measureLayer);
            _savedProcLayers[orig.id] = { layer: result.layer, measureLayer: result.measureLayer, visible: true };
          }
        }
        _editingOriginalProcId = null;
      }
    }

    // Refresh the View tab content with the current saved-procedure list.
    _refreshViewTab();
  }
};


// Builds the standard procStates array from the DB + layer visibility tracking.
// Used by both refresh helpers below.
// Phase 12: now includes common_route and transitions so the accordion renderer
// in Sidebar.js can show the route preview and per-branch sub-items.
const _buildProcStates = () => {
  return loadAll().map((proc) => ({
    id:           proc.id,
    name:         proc.name,
    type:         proc.type,
    airport:      proc.airport || '',
    runway:       proc.runway  || '',
    visible:      _savedProcLayers[proc.id]?.visible ?? true,
    common_route: proc.common_route || [],   // for accordion preview
    transitions:  proc.transitions  || []    // for accordion sub-item list
  }));
};


// Rebuilds the View tab list. Guards against accidentally overwriting Builder UI:
// only runs when the View tab button is actually marked active.
const _refreshViewTab = () => {
  const viewTab = document.querySelector('.tab[data-tab="view"]');
  if (!viewTab?.classList.contains('active')) return;
  updateViewTab(_buildProcStates(), {
    onToggle:             handleToggleProcedure,
    onToggleMeasurements: handleToggleViewerMeasurements,
    measVisible:          _viewerMeasVisible
  });
};


// Rebuilds just the #builder-saved-list container inside the Builder main menu.
// If the container doesn't exist (user is in Drawing panel etc.) this is a no-op.
const _refreshBuilderSavedList = () => {
  refreshBuilderSavedList(_buildProcStates(), {
    onToggle:          handleToggleProcedure,
    onDelete:          handleDeleteProcedure,
    onEdit:            handleEditProcedure,
    onDeleteTransition: handleDeleteTransition  // Phase 12: per-branch delete
  });
};


// Called when the user clicks "+ New Procedure" in the sidebar.
// Opens the metadata form.
const handleNewProcedure = () => {
  showMetadataForm(handleStartDrawing);
};


// Called when the user clicks the Edit (✎) button next to a saved procedure
// in the Builder tab. This loads the procedure back into the Builder so the
// user can add, remove, or reorder its points and then save again.
//
// The flow is:
//   1. Cancel any currently active drawing session (safety cleanup).
//   2. Remove the procedure's visual layer from the map — it will be re-created
//      when the user saves after editing.
//   3. Delete the procedure from the database so the edited version can be
//      re-saved fresh (avoids having two copies with different ids).
//   4. Copy the procedure's metadata and points into DrawingState.
//   5. Enable the correct drawing mode so the user can click new points.
//   6. Render the existing sequence as the active shape on the map.
//   7. Highlight the in-sequence waypoints on the fix layer.
//   8. Open the Drawing Panel in the sidebar so the user sees the loaded sequence.
//
// 'id' — the unique id string assigned when the procedure was originally saved
const handleEditProcedure = (id) => {
  // Find the procedure in the database
  const proc = loadAll().find((p) => p.id === id);
  if (!proc) {
    console.warn(`[AeroProc] handleEditProcedure: procedure id "${id}" not found in database.`);
    return;
  }

  // If the user was mid-draw on something else, cancel it cleanly first
  if (DrawingState.isActive) {
    clearActiveShape(_map, DrawingState);
    _cleanupDrawingMode();
    clearMeasurementLabels(_map);
    DrawingState.reset();
    console.log('[AeroProc] Cancelled active drawing session before loading edit.');
  }

  // Remove the procedure's rendered layer from the map — the active-shape system
  // will draw it as the live shape while the user edits.
  const entry = _savedProcLayers[id];
  if (entry) {
    _map.removeLayer(entry.layer);
    if (entry.measureLayer && _map.hasLayer(entry.measureLayer)) {
      _map.removeLayer(entry.measureLayer);
    }
    delete _savedProcLayers[id];
    console.log(`[AeroProc] Removed layer for procedure "${proc.name}" from map (edit mode).`);
  }

  // Phase 13: Defer deleteProc() to handleSave(). Keeping the record in LocalStorage
  // means a mid-edit tab switch can re-render it instead of losing it permanently.
  _editingOriginalProcId = id;

  // Load the procedure's metadata into a fresh DrawingState session
  DrawingState.start(
    proc.name,
    proc.type,
    proc.pattern || 'solid',
    proc.color   || '#3b9eff',
    proc.airport || '',
    proc.runway  || ''
  );

  // Re-populate the points array from the saved data.
  // Phase 10: use 'common_route' (new schema); fall back to 'points' for old saves.
  // ProcedureDatabase.loadAll() normalizes old saves so common_route is always present,
  // but we guard here for safety.
  // Guard against missing fields: levelCondition/speedCondition may be null in
  // older saves, so we fall back to empty strings which the modal handles correctly.
  // Phase 8.2: holdingBearing/holdingSide fall back to empty/'RIGHT' for old saves.
  _draggableMarkers = [];  // reset the parallel array before repopulating
  const editPoints = proc.common_route || proc.points || [];
  editPoints.forEach((pt) => {
    DrawingState.addPoint({
      ident:          pt.ident,
      lat:            pt.lat,
      lon:            pt.lon,
      isFix:          pt.isFix ?? true,
      tipo:           pt.tipo  || 'ICAO',
      levelCondition: pt.levelCondition || '',
      levelValue:     pt.levelValue     || '',
      speedCondition: pt.speedCondition || '',
      speedValue:     pt.speedValue     || '',
      isHolding:      pt.isHolding      || false,
      holdingBearing: pt.holdingBearing || '',
      holdingSide:    pt.holdingSide    || 'RIGHT'
    });

    // Phase 8.4: recreate draggable markers for any custom (non-fix) points in the
    // procedure being edited. We use the same closure trick as _afterPointAdded:
    // savedMarker is assigned after createDraggableCustomMarker returns but before
    // any drag event can fire, so the indexOf lookup inside onDrag/onDragEnd is safe.
    if (!(pt.isFix ?? true)) {
      let savedMarker = null;
      savedMarker = createDraggableCustomMarker(
        _map,
        pt.lat,
        pt.lon,
        proc.color || '#3b9eff',
        (newLat, newLng) => {
          const idx = _draggableMarkers.indexOf(savedMarker);
          if (idx !== -1 && idx < DrawingState.points.length) {
            DrawingState.updatePointCoords(idx, newLat, newLng);
            updateActiveShape(_map, DrawingState);
            updateMeasurementLabels(_map, DrawingState);
          }
        },
        (newLat, newLng) => {
          const idx = _draggableMarkers.indexOf(savedMarker);
          console.log(`[AeroProc] (Edit) Custom point at index ${idx} drag completed: (${newLat.toFixed(6)}, ${newLng.toFixed(6)}).`);
          refreshSequenceList(DrawingState, _sequenceCallbacks());
          updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);
        }
      );
      _draggableMarkers.push(savedMarker);
    } else {
      _draggableMarkers.push(null);  // fixed waypoint — not draggable
    }
  });

  // Phase 8.2: Rebuild holding markers now that the sequence is fully loaded.
  // This ensures any existing holding fixes in the procedure show their "H" badge
  // on the map immediately when the user opens a procedure for editing.
  updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);

  // Enable the drawing mode that matches the procedure type.
  // Route types (SID/STAR/IAC) use snap-to-fix; area types use free-draw.
  if (DrawingState.isAreaType()) {
    enableFreeDrawMode(_map, (latLon) => {
      _triggerPointAdded({ ident: 'Custom Point', lat: latLon.lat, lon: latLon.lon, isFix: false });
    });
  } else {
    enableGhostSnapMode(_map, (fixData) => {
      _triggerPointAdded({
        ident: fixData.ident,
        lat:   fixData.lat,
        lon:   fixData.lon,
        tipo:  fixData.tipo || 'ICAO',
        isFix: true
      });
    });

    setContextMenuCallbacks({
      isInSequence:     (ident) => DrawingState.points.some(
        (p) => p.ident.toUpperCase() === ident.toUpperCase()
      ),
      onRemove:         handleContextMenuRemove,
      onEdit:           handleContextMenuEdit,
      onAddTransition:  handleContextMenuAddTransition,
      procedureType:    () => DrawingState.metadata.type,
      isInTransitionMode: () => DrawingState._inTransitionMode
    });
  }

  // Draw the loaded sequence as the live active shape on the map
  updateActiveShape(_map, DrawingState);

  // Highlight the in-sequence fixes on the waypoint layer so the user can see
  // which points are already part of the procedure while adding more
  if (_waypointLayer) {
    filterWaypoints(_waypointLayer, '', DrawingState.points, DrawingState.metadata.color);
  }

  // Open the Drawing Panel with the full sequence already populated
  showDrawingPanel(DrawingState, {
    onPointRemove:        handlePointRemove,
    onPointMoveUp:        handlePointMoveUp,
    onPointMoveDown:      handlePointMoveDown,
    onPointEdit:          handlePointEdit,
    onManualAdd:          handleManualAdd,
    onSave:               handleSave,
    onCancel:             handleCancel,
    onSearch:             handleSearch,
    onSearchEnter:        handleSearchEnter,
    onMeasurementsToggle: handleMeasurementsToggle,
    onDropCustomToggle:   handleDropCustomToggle
  });

  // Phase 10: Restore any previously saved transition branches back into DrawingState.
  // These are loaded as already-completed branches — the user can add NEW transitions
  // on top of them, but existing ones are preserved as read-only history.
  DrawingState.transitions = (proc.transitions || []).map((t) => ({
    name:   t.name,
    points: (t.points || []).slice()  // defensive copy
  }));

  if (DrawingState.transitions.length > 0) {
    console.log(`[AeroProc] Restored ${DrawingState.transitions.length} transition(s) for "${proc.name}".`);
  }

  // Refresh the transition section so the restored branches appear in the sidebar.
  updateTransitionUI(DrawingState, _sequenceCallbacks());

  const loadedPts = (proc.common_route || proc.points || []).length;
  console.log(`[AeroProc] Procedure "${proc.name}" (${proc.type}) loaded for editing with ${loadedPts} common-route points.`);
};


// Called when the user clicks the eye-toggle button next to a saved procedure
// in the View tab. Flips the layer's visibility on the map and refreshes the list.
//
// 'id' — the unique id string assigned by ProcedureDatabase.saveProc()
const handleToggleProcedure = (id) => {
  const entry = _savedProcLayers[id];
  if (!entry) {
    console.warn(`[AeroProc] handleToggleProcedure: no layer found for id "${id}".`);
    return;
  }

  entry.visible = !entry.visible;
  if (entry.visible) {
    entry.layer.addTo(_map);
    // Restore measure layer only if the global measurement toggle is currently on.
    if (_viewerMeasVisible && entry.measureLayer) entry.measureLayer.addTo(_map);
  } else {
    _map.removeLayer(entry.layer);
    if (entry.measureLayer && _map.hasLayer(entry.measureLayer)) {
      _map.removeLayer(entry.measureLayer);
    }
  }

  _refreshViewTab();
  _refreshBuilderSavedList();
  console.log(`[AeroProc] Procedure "${id}" visibility set to ${entry.visible}.`);
};


// Called when the user clicks the delete (×) button next to a saved procedure
// in the View tab. Removes the layer from the map, wipes it from the tracking
// object, deletes it from localStorage, and refreshes the View tab list.
//
// 'id' — the unique id string assigned by ProcedureDatabase.saveProc()
const handleDeleteProcedure = (id) => {
  const entry = _savedProcLayers[id];
  if (entry) {
    _map.removeLayer(entry.layer);
    if (entry.measureLayer && _map.hasLayer(entry.measureLayer)) {
      _map.removeLayer(entry.measureLayer);
    }
    delete _savedProcLayers[id];
  }

  deleteProc(id);
  _refreshViewTab();
  _refreshBuilderSavedList();
  console.log(`[AeroProc] Procedure "${id}" deleted from database and map.`);
};


// Phase 13: Toggles leg measurement labels on/off for ALL currently visible procedures.
// Fires from the "Leg Measurements" button in the Viewer tab header.
// The flag is persisted in _viewerMeasVisible so new renders respect the current setting.
const handleToggleViewerMeasurements = () => {
  _viewerMeasVisible = !_viewerMeasVisible;

  Object.values(_savedProcLayers).forEach((entry) => {
    if (!entry.measureLayer) return;
    if (!entry.visible) return;  // never show if the procedure itself is hidden

    if (_viewerMeasVisible) {
      if (!_map.hasLayer(entry.measureLayer)) entry.measureLayer.addTo(_map);
    } else {
      if (_map.hasLayer(entry.measureLayer)) _map.removeLayer(entry.measureLayer);
    }
  });

  _refreshViewTab();
  console.log(`[AeroProc] Viewer leg measurements set to ${_viewerMeasVisible ? 'visible' : 'hidden'}.`);
};


// Called when the user clicks "Start Drawing" in the metadata form.
// Starts the DrawingState session, enables the correct map interaction
// mode, and switches the sidebar to the drawing panel view.
//
// 'metadata' — { name, type, pattern, color } from the form
const handleStartDrawing = (metadata) => {
  DrawingState.start(
    metadata.name, metadata.type, metadata.pattern, metadata.color,
    metadata.airport || '', metadata.runway || ''
  );

  if (DrawingState.isAreaType()) {
    // Area types (CTR, FIS, TMA, ATZ) use free-draw mode:
    // the user clicks anywhere on the map to place polygon vertices.
    enableFreeDrawMode(_map, (latLon) => {
      _triggerPointAdded({
        ident: 'Custom Point',
        lat:   latLon.lat,
        lon:   latLon.lon,
        isFix: false
      });
    });
  } else {
    // Route types (SID, STAR, IAC) use ghost snap mode:
    // hovering a ghost dot shows a glow; clicking adds the fix.
    enableGhostSnapMode(_map, (fixData) => {
      _triggerPointAdded({
        ident: fixData.ident,
        lat:   fixData.lat,
        lon:   fixData.lon,
        tipo:  fixData.tipo || 'ICAO',
        isFix: true
      });
    });

    // Wire context-menu callbacks for right-click on in-sequence markers.
    setContextMenuCallbacks({
      isInSequence:     (ident) => DrawingState.points.some(
        (p) => p.ident.toUpperCase() === ident.toUpperCase()
      ),
      onRemove:         handleContextMenuRemove,
      onEdit:           handleContextMenuEdit,
      onAddTransition:  handleContextMenuAddTransition,
      procedureType:    () => DrawingState.metadata.type,
      isInTransitionMode: () => DrawingState._inTransitionMode
    });
  }

  // Show the drawing panel in the sidebar with all required callbacks.
  showDrawingPanel(DrawingState, {
    onPointRemove:        handlePointRemove,
    onPointMoveUp:        handlePointMoveUp,
    onPointMoveDown:      handlePointMoveDown,
    onPointEdit:          handlePointEdit,
    onManualAdd:          handleManualAdd,
    onSave:               handleSave,
    onCancel:             handleCancel,
    onSearch:             handleSearch,
    onSearchEnter:        handleSearchEnter,
    onMeasurementsToggle: handleMeasurementsToggle,
    onDropCustomToggle:   handleDropCustomToggle
  });
};


// Called on every keystroke in the Builder search bar.
// Ghost dots are the interactive click targets; this function only manages the
// DivIcon glow overlay so the user can see which fixes match the search term.
// filterWaypoints is NOT called here — it is called once at build/edit start
// and again after each point is added or removed (via _afterPointAdded etc.).
//
// 'searchTerm' — the current string in the search input (can be empty)
const handleSearch = (searchTerm) => {
  const term = searchTerm.trim();
  if (term.length > 0) {
    const hits = getFilteredFixes(term).map((f) => ({ ...f, layer: 'fix' }));
    renderGlobalSearchHighlights(_map, hits, term);
  } else {
    clearGlobalSearchHighlights(_map);
  }
};


// Phase 15: Called when the user presses Enter in the Builder search bar.
// If exactly one fix matches the current search term, it is selected immediately
// (same as clicking that fix's marker) without requiring a mouse click.
//
// 'searchTerm' — the current value in the search input
const handleSearchEnter = (searchTerm) => {
  const hits = getFilteredFixes(searchTerm.trim());
  if (hits.length !== 1) return;   // 0 = nothing to select; >1 = ambiguous, wait for more typing
  _triggerPointAdded({
    ident: hits[0].ident,
    lat:   hits[0].lat,
    lon:   hits[0].lon,
    isFix: true
  });
};


// Called when the user clicks "+ Add" for manual coordinates in the drawing panel.
// Validates the numbers, then feeds the point through the same restriction prompt
// that snap/free-draw points go through.
//
// 'lat' — parsed float from the Lat input
// 'lon' — parsed float from the Lon input
const handleManualAdd = (lat, lon) => {
  _triggerPointAdded({
    ident: 'Custom Point',
    lat,
    lon,
    isFix: false
  });
};


// Internal helper called whenever ANY new point is ready to be added,
// regardless of whether it came from snapping, free-drawing, or manual input.
//
// Phase 12 AUTO-FINISH INTERCEPT:
// For INBOUND transitions (STAR/IAC), clicking the convergence fix should NOT
// add it to DrawingState.points — the fix is stored separately as 'convergence_fix'
// in the transition schema. So we intercept BEFORE showing the restriction modal
// and immediately call handleEndTransition() instead.
//
// For OUTBOUND transitions (SID), there is no convergence click — the user ends
// the branch manually via "End Transition" in the sidebar. So we let those clicks
// pass through to the normal flow.
//
// 'rawData' — { ident, lat, lon, isFix }
const _triggerPointAdded = (rawData) => {
  // ── Phase 12: Inbound transition auto-finish ─────────────────────────────────
  // If the user is drawing a STAR/IAC (inbound) transition and clicks the
  // convergence fix, finish the transition WITHOUT adding the fix to points.
  // The convergence fix is already in the common route and will be stored as
  // 'convergence_fix' in the transition schema by DrawingState.finishTransition().
  if (
    DrawingState._inTransitionMode &&
    DrawingState._transitionDirection === 'inbound' &&
    rawData.isFix &&
    rawData.ident?.toUpperCase() === DrawingState.convergencePointIdent?.toUpperCase()
  ) {
    console.log(`[AeroProc] Convergence fix "${rawData.ident}" clicked — auto-finishing inbound transition.`);
    handleEndTransition();
    return;
  }

  // Duplicate check: if the same named fix is already in the sequence, ask the
  // user to confirm before allowing the add. We do NOT block it outright — some
  // valid procedures (e.g. racetrack holds, closed paths) legitimately reuse a
  // fix. Custom points (isFix = false) are never checked because two identical
  // free-draw coordinates are always intentional.
  if (rawData.isFix) {
    const isDuplicate = DrawingState.points.some(
      (p) => p.ident.toUpperCase() === rawData.ident.toUpperCase()
    );
    if (isDuplicate) {
      const proceed = window.confirm(
        `"${rawData.ident}" is already in the procedure sequence.\n\nAre you sure you want to add it again?`
      );
      if (!proceed) return;
    }
  }

  // Phase 14: if a point is already pending (user clicked another fix before committing
  // the first one), auto-commit it with whatever restrictions are currently in the form.
  if (_pendingPoint) {
    const autoRestrictions = collectInlineRestrictions();
    _commitPendingPoint(autoRestrictions, false);  // false = don't re-focus search yet
  }

  // Phase 14: store the new point as pending and show the inline restriction form.
  // The modal (showRestrictionModal) is no longer used for new point additions.
  _pendingPoint = rawData;

  // Define callbacks as a named object so onErase can re-open the same form
  // (resetting all fields) by calling showPendingPointRestrictions again with the
  // same callbacks reference — forming a self-referential but non-recursive cycle.
  const _inlineCallbacks = {
    // "Add Point / Next Point" — commits the pending point with collected restrictions,
    // clears the form, and re-focuses the search field for the next fix.
    onAdd: (restrictions) => {
      _commitPendingPoint(restrictions);
    },

    // "Erase / Reset" — clears only the restriction fields (keeps the pending fix selected).
    // Requires a brief confirmation so accidental clicks don't wipe entered data.
    onErase: () => {
      const confirmed = window.confirm(
        `Clear restriction fields for "${rawData.ident}"?\n\nThe fix remains selected; only the restriction values will be reset.`
      );
      if (!confirmed) return;
      // Re-render the form with all fields empty by passing the same callbacks.
      showPendingPointRestrictions(rawData, _inlineCallbacks);
    },

    // "Create Procedure" (from pending state) — commits the pending point first,
    // then immediately saves the whole procedure.
    onCreate: (restrictions) => {
      _commitPendingPoint(restrictions, false);
      handleSave();
    }
  };
  showPendingPointRestrictions(rawData, _inlineCallbacks);
};


// Phase 14: Commits _pendingPoint to DrawingState with the supplied restrictions,
// then runs _afterPointAdded to update the map/sidebar.
//
// 'restrictions' — object from collectInlineRestrictions() or auto-collected on second click
// 'refocusSearch' — when true (default), clearPendingPointRestrictions() refocuses the
//                   search field; pass false when another action (save/cancel) follows.
const _commitPendingPoint = (restrictions, refocusSearch = true) => {
  if (!_pendingPoint) return;
  const point = _pendingPoint;
  _pendingPoint = null;

  DrawingState.addPoint({
    ident:           point.ident,
    lat:             point.lat,
    lon:             point.lon,
    isFix:           point.isFix,
    altReq:          restrictions.altReq          ?? null,
    altVal:          restrictions.altVal          ?? null,
    spdReq:          restrictions.spdReq          ?? null,
    spdVal:          restrictions.spdVal          ?? null,
    isHolding:       restrictions.isHolding       ?? false,
    holdingBearing:  restrictions.holdingBearing  ?? null,
    holdingTurn:     restrictions.holdingTurn     ?? null,
    holdingOBS:      restrictions.holdingOBS      ?? null,
  });

  _afterPointAdded(point);
  clearPendingPointRestrictions(refocusSearch);
};


// Private helper called by both onConfirm and onSkip in _triggerPointAdded.
// Handles everything that must happen AFTER the point has been added to DrawingState:
//   1. If the new point is a custom (non-fix) coordinate AND we are NOT in transition
//      mode, spawn a draggable marker; transitions use snap-to-fix only.
//   2. If the new point is a fixed waypoint, push null to keep the arrays in sync.
//   3. Redraw the active shape and measurement labels.
//   4. Rebuild holding markers in case the new point is a holding fix.
//   5. Phase 10: if in transition mode and this point is the convergence fix,
//      auto-finish the transition branch immediately.
//   6. Refresh the sidebar sequence list.
//   7. Clear the search bar so the user can type the next waypoint name immediately.
//
// 'rawData' — the original { ident, lat, lon, isFix } object that was passed to
//             _triggerPointAdded before the restriction modal was shown.
const _afterPointAdded = (rawData) => {
  if (!rawData.isFix && !DrawingState._inTransitionMode) {
    // Phase 8.4: custom coordinate point in COMMON-ROUTE mode — create a draggable marker.
    // We suppress draggable markers in transition mode because transitions should only
    // use named fixes, and the draggable infrastructure would conflict with the mode switch.
    let savedMarker = null;

    savedMarker = createDraggableCustomMarker(
      _map,
      rawData.lat,
      rawData.lon,
      DrawingState.metadata.color,

      // onDrag: fires continuously while the user moves the marker.
      // We update the DrawingState coordinate and immediately re-render the shape
      // so the polyline follows the marker in real time.
      (newLat, newLng) => {
        const idx = _draggableMarkers.indexOf(savedMarker);
        if (idx !== -1 && idx < DrawingState.points.length) {
          DrawingState.updatePointCoords(idx, newLat, newLng);
          updateActiveShape(_map, DrawingState);
          updateMeasurementLabels(_map, DrawingState);
        }
      },

      // onDragEnd: fires once when the user releases the mouse.
      (newLat, newLng) => {
        const idx = _draggableMarkers.indexOf(savedMarker);
        console.log(`[AeroProc] Custom point at index ${idx} drag completed: (${newLat.toFixed(6)}, ${newLng.toFixed(6)}).`);
        refreshSequenceList(DrawingState, _sequenceCallbacks());
        updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);
      }
    );

    _draggableMarkers.push(savedMarker);
  } else {
    // Fixed waypoint OR we are in transition mode — no draggable marker.
    // Push null to keep _draggableMarkers in sync with DrawingState.points.
    _draggableMarkers.push(null);
  }

  // Redraw the procedure line and measurement labels.
  updateActiveShape(_map, DrawingState);
  updateMeasurementLabels(_map, DrawingState);

  // Rebuild holding markers — the new point may be a holding fix.
  updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);

  // Refresh the sidebar sequence list.
  refreshSequenceList(DrawingState, _sequenceCallbacks());

  // Clear the search bar so the user can type the NEXT waypoint immediately.
  clearSearch();

  // Update the waypoint layer highlighting so the newly added fix becomes fully
  // opaque (if it's a real waypoint) and other unrelated fixes stay faded.
  if (_waypointLayer) {
    filterWaypoints(_waypointLayer, '', DrawingState.points, DrawingState.metadata.color);
  }
};


// Called when the user clicks the "×" button next to a point in the sequence list.
// Removes that point from the DrawingState, the draggable marker (if any), and
// updates the map shape, holding markers, and sequence list.
//
// 'index' — the zero-based index of the point to remove
const handlePointRemove = (index) => {
  // Phase 8.4: remove the draggable marker for this index (may be null for fixed waypoints).
  if (_draggableMarkers[index]) {
    removeDraggableMarker(_map, _draggableMarkers[index]);
  }
  _draggableMarkers.splice(index, 1);

  DrawingState.removePoint(index);
  updateActiveShape(_map, DrawingState);
  updateMeasurementLabels(_map, DrawingState);
  updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);
  if (_waypointLayer) {
    filterWaypoints(_waypointLayer, '', DrawingState.points, DrawingState.metadata.color);
  }
  refreshSequenceList(DrawingState, _sequenceCallbacks());
};


// Called when the user clicks the "↑" (move up) button on a sequence item.
// Swaps the draggable marker slot alongside the DrawingState entry so the
// _draggableMarkers array stays in sync with the new point order.
//
// 'index' — the zero-based index of the point to move up
const handlePointMoveUp = (index) => {
  // Phase 8.4: keep _draggableMarkers in sync with DrawingState after the move.
  if (index > 0) {
    [_draggableMarkers[index], _draggableMarkers[index - 1]] =
    [_draggableMarkers[index - 1], _draggableMarkers[index]];
  }
  DrawingState.movePoint(index, 'up');
  updateActiveShape(_map, DrawingState);
  updateMeasurementLabels(_map, DrawingState);
  updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);
  refreshSequenceList(DrawingState, _sequenceCallbacks());
};


// Called when the user clicks the "↓" (move down) button on a sequence item.
// Swaps the draggable marker slot alongside the DrawingState entry.
//
// 'index' — the zero-based index of the point to move down
const handlePointMoveDown = (index) => {
  // Phase 8.4: keep _draggableMarkers in sync.
  if (index < _draggableMarkers.length - 1) {
    [_draggableMarkers[index], _draggableMarkers[index + 1]] =
    [_draggableMarkers[index + 1], _draggableMarkers[index]];
  }
  DrawingState.movePoint(index, 'down');
  updateActiveShape(_map, DrawingState);
  updateMeasurementLabels(_map, DrawingState);
  updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);
  refreshSequenceList(DrawingState, _sequenceCallbacks());
};


// Called when the user clicks the "✎" (edit) button on a sequence item.
// Re-opens the restriction modal pre-populated with the point's current values.
// On confirm, updates only the restriction data — not the ident or coordinates.
//
// 'index' — the zero-based index of the point to edit
const handlePointEdit = (index) => {
  const pt = DrawingState.points[index];
  if (!pt) return;

  showRestrictionModal(
    pt.ident,

    // onConfirm: update the point's restrictions (including holding data) and refresh.
    (restrictions) => {
      DrawingState.updatePoint(index, restrictions);
      // Rebuild holding markers — the user may have just toggled a holding designation.
      updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);
      if (_waypointLayer) {
        filterWaypoints(_waypointLayer, '', DrawingState.points, DrawingState.metadata.color);
      }
      refreshSequenceList(DrawingState, _sequenceCallbacks());
    },

    // onSkip: user cancelled the edit — no changes to anything.
    () => {},

    // initialValues: pre-populate all modal fields with the point's current values.
    // Phase 8.2: holding fields are now included so the user sees the existing holding
    // designation when editing, not just a blank checkbox every time.
    {
      levelCondition: pt.levelCondition || '',
      levelValue:     pt.levelValue     || '',
      speedCondition: pt.speedCondition || '',
      speedValue:     pt.speedValue     || '',
      isHolding:      pt.isHolding      || false,
      holdingBearing: pt.holdingBearing || '',
      holdingSide:    pt.holdingSide    || 'RIGHT'
    }
  );
};


// Called when the user toggles the "Show leg measurements" checkbox.
// 'visible' — boolean from the checkbox state
const handleMeasurementsToggle = (visible) => {
  setMeasurementsVisible(_map, visible);
  if (visible) {
    // Rebuild labels immediately so the user sees them right away
    updateMeasurementLabels(_map, DrawingState);
  }
};


// Internal helper that returns the full set of sequence-list callbacks.
// Used by handlers that need to refresh the list without duplicating the object literal.
// Phase 12: onAddTransition is no longer used by the sidebar (right-click replaces it),
// but onEndTransition is still needed for the sidebar's "End Transition" button.
const _sequenceCallbacks = () => ({
  onPointRemove:   handlePointRemove,
  onPointMoveUp:   handlePointMoveUp,
  onPointMoveDown: handlePointMoveDown,
  onPointEdit:     handlePointEdit,
  onEndTransition: handleEndTransition
});


// ── PHASE 12: TRANSITION HANDLERS ────────────────────────────────────────────


// Called from the context menu when the user right-clicks an in-sequence fix and
// selects "Add Inbound Transition to [FIX]" or "Add Outbound Transition from [FIX]".
//
// Phase 12: the transition name is NOT collected upfront — the user is prompted
// for it at COMPLETION (handleEndTransition). The direction is determined by the
// procedure type: STAR/IAC → inbound, SID → outbound.
//
// 'fixIdent'  — IDENT of the right-clicked fix (all uppercase from the context menu)
// 'direction' — 'inbound' (STAR/IAC) or 'outbound' (SID)
const handleAddTransition = (fixIdent, direction) => {
  // Remove the current active shape — it belongs to the common route and will be
  // replaced by the ghost line for the duration of transition drawing.
  clearActiveShape(_map, DrawingState);  // also clears any existing ghost

  // Lock the common route and prepare DrawingState for the new branch.
  DrawingState.startTransition(fixIdent, direction);

  // Show the locked common route as a semi-transparent ghost so the user can see
  // exactly where the transition branch will connect.
  updateCommonRouteGhost(_map, DrawingState);

  // Clear draggable custom-point markers — they belonged to the common route
  // which is now locked. Transitions use snap-to-fix mode only.
  _draggableMarkers.forEach((m) => { if (m) removeDraggableMarker(_map, m); });
  _draggableMarkers = [];

  // updateActiveShape will draw nothing yet (DrawingState.points is empty).
  updateActiveShape(_map, DrawingState);

  // Refresh the sidebar: sequence list (now empty) + transition UI (now "in progress").
  refreshSequenceList(DrawingState, _sequenceCallbacks());

  const dirLabel = direction === 'inbound'
    ? `inbound to "${fixIdent}"`
    : `outbound from "${fixIdent}"`;
  console.log(`[AeroProc] Transition started: ${dirLabel}.`);
};


// Called when the user clicks "End Transition" in the sidebar OR when the
// convergence fix is clicked (STAR/IAC inbound auto-finish via _triggerPointAdded).
//
// Phase 12: if the transition has points, we prompt the user for a name
// BEFORE saving. The name is passed to DrawingState.finishTransition(name).
// A cancelled prompt defaults to "T{n}" so the branch is never silently lost.
const handleEndTransition = () => {
  if (!DrawingState._inTransitionMode) return;

  if (DrawingState.points.length === 0) {
    // Nothing was drawn — quietly cancel the transition without saving it.
    console.log('[AeroProc] Transition cancelled (no points added).');
    DrawingState._inTransitionMode     = false;
    DrawingState._activeTransitionName = '';
    DrawingState._transitionDirection  = null;
    DrawingState.convergencePointIdent = null;
    DrawingState.points                = DrawingState.common_route.slice();
    DrawingState.activeShape           = null;
  } else {
    // Prompt the user for the transition name at completion.
    // Pre-fill with a sensible default (T1, T2, …) in case they just press Enter.
    const defaultName = `T${DrawingState.transitions.length + 1}`;
    const name = window.prompt(
      `Name this transition branch (e.g. "via CELSO", "via COSMO"):`,
      defaultName
    );
    // If the user pressed Cancel on the prompt, 'name' is null — use the default.
    DrawingState.finishTransition(name ?? defaultName);
  }

  // Remove the transition's active shape from the map (may be null if no points drawn).
  if (DrawingState.activeShape) {
    _map.removeLayer(DrawingState.activeShape);
    DrawingState.activeShape = null;
  }

  // Remove the ghost line — the common route is no longer "locked".
  clearCommonRouteGhost(_map);

  // Reset the draggable markers array to match the restored common-route size.
  // Custom points in the common route lose their draggable markers during transition
  // drawing (see handleAddTransition). We restore nulls here as placeholders.
  // Phase 11 could improve this by re-creating the draggable markers.
  _draggableMarkers.forEach((m) => { if (m) removeDraggableMarker(_map, m); });
  _draggableMarkers = new Array(DrawingState.points.length).fill(null);

  // Redraw the common route as the live active shape.
  updateActiveShape(_map, DrawingState);
  updateMeasurementLabels(_map, DrawingState);
  updateHoldingMarkers(_map, DrawingState.points, DrawingState.metadata.color);

  // Restore waypoint layer highlight for the common-route sequence.
  if (_waypointLayer) {
    filterWaypoints(_waypointLayer, '', DrawingState.points, DrawingState.metadata.color);
  }

  // Refresh the sidebar: sequence list + transition UI (back to "Add Transition" form).
  refreshSequenceList(DrawingState, _sequenceCallbacks());

  console.log('[AeroProc] Transition ended. Returned to common-route editing mode.');
};


// Called when the user clicks "Save & Export" in the drawing panel.
// Persists the procedure to localStorage, renders it on the map as a permanent
// layer, then switches to the View tab so the user immediately sees their
// saved procedure in the list.
const handleSave = () => {
  // Phase 14: if the user hits "Create Procedure" while a point is pending in the
  // inline form but BEFORE clicking "Add Point", auto-commit with current field values.
  if (_pendingPoint) {
    const restrictions = collectInlineRestrictions();
    _commitPendingPoint(restrictions, false);
  }

  if (DrawingState.points.length === 0) {
    console.warn('[AeroProc] Cannot save: the procedure has no points. Add at least one point first.');
    return;
  }

  const json = DrawingState.toJSON();

  // Phase 13: if this is an edit session the original is still in LocalStorage
  // (we deferred deleteProc from handleEditProcedure). Remove it now so we don't
  // end up with two copies of the same procedure after saving the updated version.
  if (_editingOriginalProcId) {
    deleteProc(_editingOriginalProcId);
    _editingOriginalProcId = null;
  }

  // Persist to the LocalStorage database.
  // saveProc normalizes lineStyle → flat color/pattern so renderSavedProcedure works.
  const saved = saveProc(json);
  if (!saved) {
    console.error('[AeroProc] Save failed — procedure not stored. Check browser storage quota.');
    return;
  }

  // Render the newly saved procedure on the map as a permanent layer and register
  // it in _savedProcLayers so toggle/delete operations can find it by id.
  const saveResult = renderSavedProcedure(_map, saved);
  if (saveResult) {
    // Hide the measure layer immediately if the viewer toggle is currently off.
    if (!_viewerMeasVisible && saveResult.measureLayer) {
      _map.removeLayer(saveResult.measureLayer);
    }
    _savedProcLayers[saved.id] = { layer: saveResult.layer, measureLayer: saveResult.measureLayer, visible: true };
  }

  // Item 5a fix: remove the live drawing shape from the map BEFORE resetting state.
  // Without this call, the polyline/polygon drawn during the session stayed on the map
  // as a ghost layer even after save, because DrawingState.reset() only clears the
  // reference — it does not call map.removeLayer() on the shape object.
  clearActiveShape(_map, DrawingState);
  _cleanupDrawingMode();
  clearMeasurementLabels(_map);
  DrawingState.reset();

  // Switch to the View tab. showViewTab() fires handleTabChange('view') internally,
  // which calls _refreshViewTab() to populate the list with the newly saved procedure.
  showViewTab();

  console.log(`[AeroProc] Procedure "${saved.name}" saved to database and rendered on map.`);
};


// Called when the user clicks "Cancel" in the drawing panel.
// Removes the partial shape from the map, disables drawing modes,
// resets the DrawingState, and returns to the main menu.
const handleCancel = () => {
  clearActiveShape(_map, DrawingState);
  _cleanupDrawingMode();
  clearMeasurementLabels(_map);
  DrawingState.reset();

  // Phase 13: if cancelling an edit session the original procedure is still in
  // LocalStorage (deferred delete). Re-render its layer so it becomes visible again.
  if (_editingOriginalProcId) {
    const orig = loadAll().find((p) => p.id === _editingOriginalProcId);
    if (orig) {
      const result = renderSavedProcedure(_map, orig);
      if (result) {
        if (!_viewerMeasVisible && result.measureLayer) _map.removeLayer(result.measureLayer);
        _savedProcLayers[orig.id] = { layer: result.layer, measureLayer: result.measureLayer, visible: true };
      }
    }
    _editingOriginalProcId = null;
  }

  showMainMenu();
  _refreshBuilderSavedList();
};


// Internal cleanup: disables whichever drawing mode is currently active and
// removes all per-session overlays (draggable markers, holding badges, ghost line) from the map.
// Called by handleSave, handleCancel, and tab switches.
const _cleanupDrawingMode = () => {
  // Phase 14: discard any pending point without committing it.
  _pendingPoint = null;
  clearPendingPointRestrictions(false);

  // Phase 15: clear any DivIcon glow highlights left from the builder search bar.
  clearGlobalSearchHighlights(_map);

  disableSnapMode(_waypointLayer);
  disableGhostSnapMode();
  disableFreeDrawMode(_map);
  disableCustomDropOverlay(_map);   // stop any active drop-point overlay
  setContextMenuCallbacks(null);    // clear right-click callbacks so old session doesn't leak

  // Phase 8.4: remove every draggable custom-point marker from the map.
  _draggableMarkers.forEach((marker) => {
    if (marker) removeDraggableMarker(_map, marker);
  });
  _draggableMarkers = [];

  // Phase 8.2: remove all holding "H" badge markers from the map.
  clearHoldingMarkers(_map);

  // Phase 10: remove the common-route ghost line if the session ended mid-transition.
  clearCommonRouteGhost(_map);
};


// ── CONTEXT MENU HANDLERS ────────────────────────────────────────────────────
// These translate an ident string (from MapLayers context menu) into a DrawingState
// index before delegating to the existing per-index handlers.


// Called when the user selects "Remove Point" from the right-click context menu
// on an in-sequence fix. Finds the sequence index by ident and removes it.
//
// 'ident' — ICAO identifier of the fix to remove (uppercase from MapLayers)
const handleContextMenuRemove = (ident) => {
  const idx = DrawingState.points.findIndex(
    (p) => p.ident.toUpperCase() === ident.toUpperCase()
  );
  if (idx !== -1) handlePointRemove(idx);
};


// Called when the user selects "Edit Restrictions" from the right-click context menu.
// Finds the sequence index by ident and opens the restriction modal.
//
// 'ident' — ICAO identifier of the fix to edit (uppercase from MapLayers)
const handleContextMenuEdit = (ident) => {
  const idx = DrawingState.points.findIndex(
    (p) => p.ident.toUpperCase() === ident.toUpperCase()
  );
  if (idx !== -1) handlePointEdit(idx);
};


// Phase 12: Called when the user selects "Add Inbound/Outbound Transition to/from [FIX]"
// from the right-click context menu. Delegates directly to handleAddTransition.
//
// 'ident'     — ICAO identifier of the right-clicked fix (the convergence or divergence fix)
// 'direction' — 'inbound' (STAR/IAC) or 'outbound' (SID) — determined by MapLayers
//               based on the current procedure type
const handleContextMenuAddTransition = (ident, direction) => {
  handleAddTransition(ident, direction);
};


// Phase 12: Called when the user clicks the Delete button on an individual transition
// branch in the accordion list. Removes only that branch, then re-saves the procedure
// with a new id and re-renders it on the map.
//
// 'procId'          — the id of the parent procedure in the database
// 'transitionIndex' — the zero-based index of the transition branch to delete
const handleDeleteTransition = (procId, transitionIndex) => {
  const proc = loadAll().find((p) => p.id === procId);
  if (!proc) {
    console.warn(`[AeroProc] handleDeleteTransition: procedure "${procId}" not found.`);
    return;
  }
  if (transitionIndex < 0 || transitionIndex >= (proc.transitions || []).length) {
    console.warn(`[AeroProc] handleDeleteTransition: transition index ${transitionIndex} out of range.`);
    return;
  }

  // Remove the old rendered layers from the map.
  const oldEntry = _savedProcLayers[procId];
  if (oldEntry) {
    _map.removeLayer(oldEntry.layer);
    if (oldEntry.measureLayer && _map.hasLayer(oldEntry.measureLayer)) {
      _map.removeLayer(oldEntry.measureLayer);
    }
    delete _savedProcLayers[procId];
  }

  // Delete the old record from the database.
  deleteProc(procId);

  // Build an updated procedure object without the deleted transition branch.
  const updatedTransitions = (proc.transitions || []).filter((_, i) => i !== transitionIndex);

  // Re-save using the same metadata. saveProc() assigns a new id automatically.
  const newProc = saveProc({
    name:    proc.name,
    type:    proc.type,
    airport: proc.airport || '',
    runway:  proc.runway  || '',
    lineStyle: { pattern: proc.pattern || 'solid', color: proc.color || '#3b9eff' },
    common_route: proc.common_route || [],
    transitions:  updatedTransitions
  });

  if (newProc) {
    const newResult = renderSavedProcedure(_map, newProc);
    if (newResult) {
      if (!_viewerMeasVisible && newResult.measureLayer) _map.removeLayer(newResult.measureLayer);
      _savedProcLayers[newProc.id] = { layer: newResult.layer, measureLayer: newResult.measureLayer, visible: true };
    }
    console.log(
      `[AeroProc] Deleted transition at index ${transitionIndex} from "${proc.name}". ` +
      `Re-saved with ${updatedTransitions.length} remaining transition(s).`
    );
  }

  _refreshViewTab();
  _refreshBuilderSavedList();
};


// Called when the user clicks the "Drop Custom Point" toggle button in the Drawing Panel.
// Enables or disables a map-click overlay that lets the user drop free-coordinate
// points alongside snapped waypoints in the same route procedure.
//
// 'active' — true = drop overlay is now ON, false = it was toggled off
const handleDropCustomToggle = (active) => {
  if (active) {
    enableCustomDropOverlay(_map, (latLon) => {
      _triggerPointAdded({
        ident: 'Custom Point',
        lat:   latLon.lat,
        lon:   latLon.lon,
        isFix: false
      });
    });
  } else {
    disableCustomDropOverlay(_map);
  }
};
// Phase 38: Sidebar Collapse Logic
const _initSidebarCollapse = () => {
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('btn-sidebar-toggle');
  if (!sidebar || !toggleBtn) return;

  // Restore state from LocalStorage
  const isCollapsed = localStorage.getItem('aeroproc_sidebar_collapsed') === 'true';
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const collapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('aeroproc_sidebar_collapsed', collapsed);
    
    // Leaflet needs to know the map size changed. 
    // We update it smoothly during the 300ms transition to avoid "jumping".
    const startTime = performance.now();
    const duration = 300;
    const smoothResize = (now) => {
      if (_map) _map.invalidateSize();
      if (now - startTime < duration + 50) {
        requestAnimationFrame(smoothResize);
      }
    };
    requestAnimationFrame(smoothResize);
  });
};
