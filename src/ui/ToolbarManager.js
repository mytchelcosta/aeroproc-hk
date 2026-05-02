/**
 * ToolbarManager.js - Vertical Toolbar and Sub-Panel Orchestrator
 * Manages tool switching, sub-panel visibility, and UI state synchronization.
 */

import { i18n } from '../utils/i18n.js';
import { 
  isEphemeralPolygonActive, isEphemeralCircleActive, isEphemeralLineActive, 
  isEphemeralDrawActive, disableEphemeralDraw, enableEphemeralPolygon, 
  enableEphemeralCircle, enableEphemeralLine,
  renameShape, zoomToShape, toggleShapeVisibility, deleteShapeById
} from '../map/EphemeralDraw.js';
import { isNotationActive, disableNotationTool, enableNotationTool } from '../map/NotationTool.js';
import { isGeoPointActive, disableGeoPointTool, enableGeoPointTool, toggleGeoPointVisibility, deleteGeoPointById } from '../map/GeoPointTool.js';
import { isRangeToolActive, disableRangeTool, enableRangeTool, toggleRangeVisibility, deleteRangeById } from '../map/RangeTool.js';
import { isLiveTrafficEnabled } from '../traffic/LiveTraffic.js';
import { isMeasuringVectorActive, disableMeasuringVector } from '../map/MeasuringVector.js';
import { applySymbolScale, renderREA, renderREH } from '../map/MapLayers.js';
import { lookupAircraft, lookupAirline, lookupAirport } from '../data/DataLoader.js';

// Internal State
let _openPanelId = null;
let _map = null;

/**
 * Initializes the ToolbarManager with the map instance.
 */
export const initToolbarManager = (mapInstance) => {
  _map = mapInstance;
};

/**
 * Ensures the vertical toolbar buttons remain highlighted based on panel or tool state.
 */
export const updateToolbarHighlights = () => {
  const mapping = [
    { 
      btnId: 'btn-draw-polygon', panelId: 'panel-polygon', 
      isActive: isEphemeralPolygonActive, 
      subBtnId: 'btn-start-polygon', 
      onText: i18n.t('ui.shortcuts.stop_draw'), 
      offText: i18n.t('ui.panels.polygon.btn_draw') 
    },
    { 
      btnId: 'btn-draw-circle', panelId: 'panel-circle', 
      isActive: isEphemeralCircleActive, 
      subBtnId: 'btn-start-circle', 
      onText: i18n.t('ui.shortcuts.stop_draw'), 
      offText: i18n.t('ui.panels.circle.btn_draw') 
    },
    { 
      btnId: 'btn-draw-line', panelId: 'panel-line', 
      isActive: isEphemeralLineActive, 
      subBtnId: 'btn-start-line', 
      onText: i18n.t('ui.shortcuts.stop_draw'), 
      offText: i18n.t('ui.panels.line.btn_draw') 
    },
    { 
      btnId: 'btn-notation', panelId: 'panel-notation', 
      isActive: isNotationActive, 
      subBtnId: 'btn-start-notation', 
      onText: i18n.t('ui.shortcuts.stop_tool'), 
      offText: i18n.t('ui.panels.notation.btn_place') 
    },
    {
      btnId: 'btn-geopoint', panelId: 'panel-geopoint',
      isActive: isGeoPointActive,
      subBtnId: 'btn-start-geopoint', 
      onText: i18n.t('ui.shortcuts.stop_tool'), 
      offText: i18n.t('ui.panels.geopoint.btn_drop') 
    },
    {
      btnId: 'btn-range', panelId: 'panel-range',
      isActive: isRangeToolActive,
      subBtnId: 'btn-start-range', 
      onText: i18n.t('ui.shortcuts.stop_tool'), 
      offText: i18n.t('ui.panels.range.btn_place') 
    },
    { btnId: 'btn-objects', panelId: 'panel-objects', isActive: () => false },
    { btnId: 'btn-airspaces', panelId: 'panel-airspaces', isActive: () => false },
    { btnId: 'btn-research', panelId: 'panel-research', isActive: () => false },
    { btnId: 'btn-live-traffic', panelId: 'panel-live-traffic', isActive: isLiveTrafficEnabled },
    { btnId: 'btn-settings', panelId: 'panel-settings', isActive: () => false }
  ];

  mapping.forEach(({ btnId, panelId, isActive, subBtnId, onText, offText }) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      const toolActive = isActive();
      const panelOpen  = (_openPanelId === panelId);
      btn.classList.toggle('active', panelOpen);
      btn.classList.toggle('mode-active', toolActive);
    }

    const subBtn = document.getElementById(subBtnId);
    if (subBtn) {
      const toolActive = isActive();
      subBtn.innerHTML = toolActive ? onText : offText;
      subBtn.classList.toggle('tool-active', toolActive);
    }
  });

  syncMapCursor();
};

/**
 * Synchronizes the map's cursor icon with the active tool.
 */
export const syncMapCursor = () => {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  mapEl.classList.remove('cursor-draw', 'cursor-text', 'cursor-crosshair', 'cursor-range');

  if (isNotationActive()) {
    mapEl.classList.add('cursor-text');
  } else if (isGeoPointActive()) {
    mapEl.classList.add('cursor-crosshair');
  } else if (isRangeToolActive()) {
    mapEl.classList.add('cursor-range');
  } else if (isEphemeralDrawActive()) {
    mapEl.classList.add('cursor-draw');
  }
};

/**
 * Stops any tool that is currently capturing map clicks.
 */
export const stopAllActiveTools = (forceCancel = false) => {
  let stopped = false;

  if (isNotationActive()) {
    disableNotationTool();
    stopped = true;
  }
  if (isGeoPointActive()) {
    disableGeoPointTool();
    stopped = true;
  }
  if (isRangeToolActive()) {
    disableRangeTool();
    stopped = true;
  }
  if (isEphemeralDrawActive()) {
    disableEphemeralDraw(forceCancel);
    stopped = true;
  }
  if (isMeasuringVectorActive()) {
    disableMeasuringVector(_map);
    stopped = true;
  }

  if (stopped) {
    toggleToolbarPanel(null);
    updateToolbarHighlights();
  }
  return stopped;
};

/**
 * Internal helper to stop all tools EXCEPT the category currently being armed.
 * This ensures that starting "Drawing" stops "Notation" but doesn't immediately 
 * stop itself if it was already "partially" active (like switching between polygon/circle).
 */
const _stopAllToolsBefore = (category) => {
  if (category !== 'notation' && isNotationActive())      disableNotationTool();
  if (category !== 'geopoint' && isGeoPointActive())      disableGeoPointTool();
  if (category !== 'range'    && isRangeToolActive())     disableRangeTool();
  if (category !== 'draw'     && isEphemeralDrawActive()) disableEphemeralDraw();
  // Measuring vector is always stopped when any other tool starts
  if (isMeasuringVectorActive()) disableMeasuringVector(_map);
};

/**
 * Opens or closes a toolbar sub-panel.
 */
export const toggleToolbarPanel = (panelId, btnEl) => {
  const prevOpenId = _openPanelId;

  document.querySelectorAll('.toolbar-subpanel').forEach((p) => p.classList.add('hidden'));
  _openPanelId = null;

  if (prevOpenId) {
    if (prevOpenId === 'panel-polygon' || prevOpenId === 'panel-circle' || prevOpenId === 'panel-line') {
      disableEphemeralDraw();
    } else if (prevOpenId === 'panel-notation') {
      disableNotationTool();
    } else if (prevOpenId === 'panel-geopoint') {
      disableGeoPointTool();
    } else if (prevOpenId === 'panel-range') {
      disableRangeTool();
    }
  }

  if (prevOpenId === panelId || !panelId) {
    updateToolbarHighlights();
    return;
  }

  const panel = document.getElementById(panelId);
  if (panel && btnEl) {
    panel.classList.remove('hidden');

    const viewportHeight  = window.innerHeight;
    const toolbarEl       = btnEl.closest('.map-toolbar');
    const toolbarTop      = toolbarEl ? toolbarEl.getBoundingClientRect().top : 130;
    const safeBottom      = 12;

    let topPos = btnEl.offsetTop;
    const panelTopInViewport = toolbarTop + topPos;
    const availableHeight = viewportHeight - panelTopInViewport - safeBottom;

    if (availableHeight < 200) {
      topPos = Math.max(0, topPos - (200 - availableHeight));
    }

    panel.style.top       = `${topPos}px`;
    const finalTopInViewport = toolbarTop + topPos;
    const finalAvailable     = viewportHeight - finalTopInViewport - safeBottom;
    panel.style.maxHeight    = `${Math.max(180, finalAvailable)}px`;

    _openPanelId = panelId;
  }

  updateToolbarHighlights();
};

/**
 * Wires the settings panel sliders.
 */
export const wireSettingsPanel = () => {
  const labelSlider  = document.getElementById('settings-label-scale');
  const labelVal     = document.getElementById('settings-label-scale-val');
  const symbolSlider = document.getElementById('settings-symbol-scale');
  const symbolVal    = document.getElementById('settings-symbol-scale-val');
  const uiSlider     = document.getElementById('settings-ui-scale');
  const uiVal        = document.getElementById('settings-ui-scale-val');

  if (!labelSlider || !symbolSlider || !uiSlider) return;

  labelSlider.addEventListener('input', () => {
    const v = parseFloat(labelSlider.value);
    document.documentElement.style.setProperty('--map-label-scale', v);
    if (labelVal) labelVal.textContent = v.toFixed(1);
  });

  symbolSlider.addEventListener('input', () => {
    const v = parseFloat(symbolSlider.value);
    document.documentElement.style.setProperty('--map-symbol-scale', v);
    if (symbolVal) symbolVal.textContent = v.toFixed(1);
  });

  symbolSlider.addEventListener('change', () => {
    applySymbolScale(parseFloat(symbolSlider.value));
  });

  uiSlider.addEventListener('input', () => {
    const v = parseFloat(uiSlider.value);
    document.documentElement.style.setProperty('--ui-scale', v);
    if (uiVal) uiVal.textContent = v.toFixed(2);
  });
};

/**
 * Wires the research panel tabs and search.
 */
export const wireResearchPanel = () => {
  let _activeCategory = 'aircraft';

  const tabBtns = document.querySelectorAll('#panel-research .research-tab-btn');
  const inputEl  = document.getElementById('research-input');
  const searchBtn = document.getElementById('btn-research-search');
  const resultCard = document.getElementById('research-result-card');

  if (!inputEl || !searchBtn || !resultCard || !tabBtns.length) return;

  const _setResult = (html) => { resultCard.innerHTML = html; };

  const _row = (label, value) =>
    `<div class="research-result-row"><span class="research-result-label">${label}</span><span class="research-result-value">${value ?? '—'}</span></div>`;

  const _renderAircraft = (r) =>
    _row(i18n.t('ui.panels.research.labels.icao'), r.icao) +
    _row(i18n.t('ui.panels.research.labels.manufacturer'), r.manufacturer) +
    _row(i18n.t('ui.panels.research.labels.model'), r.model) +
    _row(i18n.t('ui.panels.research.labels.wtc'), r.wtc);

  const _renderAirline = (r) =>
    _row(i18n.t('ui.panels.research.labels.icao'), r.icao) +
    _row(i18n.t('ui.panels.research.labels.name'), r.name) +
    _row(i18n.t('ui.panels.research.labels.callsign'), r.callsign) +
    _row(i18n.t('ui.panels.research.labels.country'), r.country);

  const _renderAirport = (r) =>
    _row(i18n.t('ui.panels.research.labels.icao'), r.icao) +
    _row(i18n.t('ui.panels.research.labels.name'), r.name) +
    _row(i18n.t('ui.panels.research.labels.country'), r.country);

  const _doSearch = async () => {
    const code = inputEl.value.trim().toUpperCase();
    if (!code) {
      _setResult(`<div class="research-result-empty">${i18n.t('ui.panels.research.empty_msg')}</div>`);
      return;
    }

    _setResult(`<div class="research-result-empty">${i18n.t('ui.panels.research.searching')}</div>`);

    try {
      let record = null;
      if (_activeCategory === 'aircraft') record = await lookupAircraft(code);
      else if (_activeCategory === 'airline') record = await lookupAirline(code);
      else record = await lookupAirport(code);

      if (!record) {
        _setResult(`<div class="research-result-not-found">${i18n.t('ui.panels.research.not_found').replace('{code}', code).replace('{category}', i18n.t(`ui.panels.research.tab_${_activeCategory}`).toLowerCase())}</div>`);
        return;
      }

      let rows = '';
      if (_activeCategory === 'aircraft') rows = _renderAircraft(record);
      else if (_activeCategory === 'airline') rows = _renderAirline(record);
      else rows = _renderAirport(record);
      _setResult(rows);
    } catch (err) {
      console.error('[Research] Lookup failed:', err);
      _setResult(`<div class="research-result-not-found">${i18n.t('ui.panels.research.lookup_error')}</div>`);
    }
  };

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      _activeCategory = btn.dataset.category;
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      inputEl.placeholder = i18n.t(`ui.panels.research.placeholder_${_activeCategory}`);
      _setResult(`<div class="research-result-empty">${i18n.t('ui.panels.research.empty_msg')}</div>`);
    });
  });

  searchBtn.addEventListener('click', _doSearch);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') _doSearch(); });
};

/**
 * Wires the toolbar buttons and sub-panel toggles.
 */
export const wireToolbarPanels = (layers, state) => {
  const { 
    waypointLayer, majorLayer, regionalLayer, heliportLayer, navaidLayer, airspaceLayers 
  } = layers;

  // -- Main Toolbar Buttons --
  const mapping = [
    { id: 'btn-draw-polygon', panel: 'panel-polygon' },
    { id: 'btn-draw-circle',  panel: 'panel-circle' },
    { id: 'btn-draw-line',    panel: 'panel-line' },
    { id: 'btn-notation',     panel: 'panel-notation' },
    { id: 'btn-objects',      panel: 'panel-objects' },
    { id: 'btn-airspaces',    panel: 'panel-airspaces' },
    { id: 'btn-live-traffic', panel: 'panel-live-traffic' },
    { id: 'btn-research',     panel: 'panel-research' },
    { id: 'btn-geopoint',     panel: 'panel-geopoint' },
    { id: 'btn-range',        panel: 'panel-range' },
    { id: 'btn-settings',     panel: 'panel-settings' }
  ];

  mapping.forEach(({ id, panel }) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => toggleToolbarPanel(panel, btn));
  });

  // ── INTERNAL PANEL BUTTONS ───────────────────────────────────────────

  document.getElementById('btn-start-polygon')?.addEventListener('click', () => {
    if (isEphemeralPolygonActive()) disableEphemeralDraw();
    else { _stopAllToolsBefore('draw'); enableEphemeralPolygon(); }
    updateToolbarHighlights();
  });

  document.getElementById('btn-start-circle')?.addEventListener('click', () => {
    if (isEphemeralCircleActive()) disableEphemeralDraw();
    else { _stopAllToolsBefore('draw'); enableEphemeralCircle(); }
    updateToolbarHighlights();
  });

  document.getElementById('btn-start-line')?.addEventListener('click', () => {
    if (isEphemeralLineActive()) disableEphemeralDraw();
    else { _stopAllToolsBefore('draw'); enableEphemeralLine(); }
    updateToolbarHighlights();
  });

  document.getElementById('btn-start-notation')?.addEventListener('click', () => {
    if (isNotationActive()) disableNotationTool();
    else { _stopAllToolsBefore('notation'); enableNotationTool(); }
    updateToolbarHighlights();
  });

  document.getElementById('btn-start-geopoint')?.addEventListener('click', () => {
    if (isGeoPointActive()) disableGeoPointTool();
    else { _stopAllToolsBefore('geopoint'); enableGeoPointTool(); }
    updateToolbarHighlights();
  });

  document.getElementById('btn-start-range')?.addEventListener('click', () => {
    if (isRangeToolActive()) disableRangeTool();
    else { _stopAllToolsBefore('range'); enableRangeTool(); }
    updateToolbarHighlights();
  });

  // ── OBJECTS PANEL WIRING ───────────────────────────────────────────
  document.getElementById('chk-rnav-fixes')?.addEventListener('change', (e) => {
    state.fixesEnabled = e.target.checked;
    if (!waypointLayer) return;
    if (!state.fixesEnabled) {
      _map.removeLayer(waypointLayer);
    } else {
      // Re-add only if in Builder mode (handled by handleTabChange in main.js, 
      // but we force a refresh here if already in builder)
      const builderTab = document.querySelector('.tab[data-tab="builder"]');
      if (builderTab?.classList.contains('active')) waypointLayer.addTo(_map);
    }
  });

  document.getElementById('chk-major-airports')?.addEventListener('change', (e) => {
    if (majorLayer) e.target.checked ? majorLayer.addTo(_map) : _map.removeLayer(majorLayer);
  });
  document.getElementById('chk-regional-airports')?.addEventListener('change', (e) => {
    if (regionalLayer) e.target.checked ? regionalLayer.addTo(_map) : _map.removeLayer(regionalLayer);
  });
  document.getElementById('chk-heliports')?.addEventListener('change', (e) => {
    if (heliportLayer) e.target.checked ? heliportLayer.addTo(_map) : _map.removeLayer(heliportLayer);
  });
  document.getElementById('chk-navaids')?.addEventListener('change', (e) => {
    if (navaidLayer) e.target.checked ? navaidLayer.addTo(_map) : _map.removeLayer(navaidLayer);
  });

  // ── AIRSPACES PANEL WIRING ─────────────────────────────────────────
  _wireAirspaceToggles(airspaceLayers);

  // ── LIVE TRAFFIC PANEL WIRING ──────────────────────────────────────
  _wireLiveTrafficToggles();

  // ── GLOBAL MAP CLICK ───────────────────────────────────────────────
  document.getElementById('map')?.addEventListener('click', () => {
    // Phase 37 fix: Only close panels on map click if NO tool is actively 
    // capturing map interactions (drawing, dropping points, etc).
    const anyToolActive = isEphemeralDrawActive() || isNotationActive() || 
                         isGeoPointActive() || isRangeToolActive() || 
                         isMeasuringVectorActive();
    if (!anyToolActive) {
      toggleToolbarPanel(null);
    }
  });
};


/**
 * Internal helper to wire airspace checkboxes.
 */
const _wireAirspaceToggles = (airspaceLayers) => {
  // TMA Sectors
  const TMA_SECTOR_MAP = [
    { id: 'chk-tma-hk', name: 'HK TMA' }
  ];

  const CTR_MAP = [
    { id: 'chk-ctr-hk', name: 'HK CTR' }
  ];

  const FIZ_MAP = [];

  const ATZ_MAP = [
    { id: 'chk-atz-hk', name: 'HK ATZ' }
  ];

  // TMA Outer & SP2
  document.getElementById('chk-tma-outer')?.addEventListener('change', (e) => {
    const poly = airspaceLayers?.tmaOuterLayer;
    if (poly) e.target.checked ? poly.addTo(_map) : _map.removeLayer(poly);
  });
  document.getElementById('chk-tma-sp2')?.addEventListener('change', (e) => {
    const poly = airspaceLayers?.tmaSectors?.['São Paulo 2 TMA'];
    if (poly) e.target.checked ? poly.addTo(_map) : _map.removeLayer(poly);
  });

  // TMA Sectors Group Toggle
  document.getElementById('chk-tma-sectors-all')?.addEventListener('change', (e) => {
    const masterOn = e.target.checked;
    TMA_SECTOR_MAP.forEach(({ id, name }) => {
      const poly = airspaceLayers?.tmaSectors?.[name];
      const chk = document.getElementById(id);
      if (!poly) return;
      if (masterOn && chk?.checked) poly.addTo(_map);
      else if (!masterOn) _map.removeLayer(poly);
    });
  });

  TMA_SECTOR_MAP.forEach(({ id, name }) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      if (!document.getElementById('chk-tma-sectors-all')?.checked) return;
      const poly = airspaceLayers?.tmaSectors?.[name];
      if (poly) e.target.checked ? poly.addTo(_map) : _map.removeLayer(poly);
    });
  });

  // CTRs
  document.getElementById('chk-ctr-group')?.addEventListener('change', (e) => {
    const masterOn = e.target.checked;
    CTR_MAP.forEach(({ id, name }) => {
      const poly = airspaceLayers?.ctrPolygons?.[name];
      const chk = document.getElementById(id);
      if (!poly) return;
      if (masterOn && chk?.checked) poly.addTo(_map);
      else if (!masterOn) _map.removeLayer(poly);
    });
  });

  CTR_MAP.forEach(({ id, name }) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      if (!document.getElementById('chk-ctr-group')?.checked) return;
      const poly = airspaceLayers?.ctrPolygons?.[name];
      if (poly) e.target.checked ? poly.addTo(_map) : _map.removeLayer(poly);
    });
  });

  // FIZs
  document.getElementById('chk-fiz-group')?.addEventListener('change', (e) => {
    const masterOn = e.target.checked;
    FIZ_MAP.forEach(({ id, name }) => {
      const poly = airspaceLayers?.fizPolygons?.[name];
      const chk = document.getElementById(id);
      if (!poly) return;
      if (masterOn && chk?.checked) poly.addTo(_map);
      else if (!masterOn) _map.removeLayer(poly);
    });
  });

  FIZ_MAP.forEach(({ id, name }) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      if (!document.getElementById('chk-fiz-group')?.checked) return;
      const poly = airspaceLayers?.fizPolygons?.[name];
      if (poly) e.target.checked ? poly.addTo(_map) : _map.removeLayer(poly);
    });
  });

  // ATZs
  document.getElementById('chk-atz-group')?.addEventListener('change', (e) => {
    const masterOn = e.target.checked;
    ATZ_MAP.forEach(({ id, name }) => {
      const poly = airspaceLayers?.atzPolygons?.[name];
      const chk = document.getElementById(id);
      if (!poly) return;
      if (masterOn && chk?.checked) poly.addTo(_map);
      else if (!masterOn) _map.removeLayer(poly);
    });
  });

  ATZ_MAP.forEach(({ id, name }) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      if (!document.getElementById('chk-atz-group')?.checked) return;
      const poly = airspaceLayers?.atzPolygons?.[name];
      if (poly) e.target.checked ? poly.addTo(_map) : _map.removeLayer(poly);
    });
  });

  // VFR Corridors (Phase 39)
  document.getElementById('chk-vfr-rea')?.addEventListener('change', (e) => {
    renderREA(_map, e.target.checked);
  });
  document.getElementById('chk-vfr-reh')?.addEventListener('change', (e) => {
    renderREH(_map, e.target.checked);
  });
};

/**
 * Internal helper to wire Live Traffic toggles.
 */
import { enableLiveTraffic, disableLiveTraffic, setAircraftLabels, setLabelState, setAutoDeclutter } from '../traffic/LiveTraffic.js';

const _wireLiveTrafficToggles = () => {
  document.getElementById('chk-live-traffic')?.addEventListener('change', (e) => {
    const labelsRow = document.getElementById('row-ac-labels');
    const labelsChk = document.getElementById('chk-ac-labels');
    const labelsGroup = document.getElementById('ac-labels-group');
    const declutterRow = document.getElementById('row-auto-declutter');
    const declutterChk = document.getElementById('chk-auto-declutter');
    const subChks = labelsGroup ? labelsGroup.querySelectorAll('input[type="checkbox"]') : [];

    if (e.target.checked) {
      enableLiveTraffic();
      if (labelsRow) { labelsRow.style.opacity = '1'; labelsRow.style.pointerEvents = ''; }
      if (labelsChk) labelsChk.disabled = false;
      if (declutterRow) { declutterRow.style.opacity = '1'; declutterRow.style.pointerEvents = ''; }
      if (declutterChk) declutterChk.disabled = false;
      const labelsEnabled = labelsChk ? labelsChk.checked : true;
      if (labelsGroup) {
        labelsGroup.style.opacity = labelsEnabled ? '1' : '0.4';
        labelsGroup.style.pointerEvents = labelsEnabled ? '' : 'none';
        subChks.forEach(chk => chk.disabled = !labelsEnabled);
      }
    } else {
      disableLiveTraffic();
      if (labelsRow) { labelsRow.style.opacity = '0.4'; labelsRow.style.pointerEvents = 'none'; }
      if (labelsChk) labelsChk.disabled = true;
      if (declutterRow) { declutterRow.style.opacity = '0.4'; declutterRow.style.pointerEvents = 'none'; }
      if (declutterChk) declutterChk.disabled = true;
      if (labelsGroup) { labelsGroup.style.opacity = '0.4'; labelsGroup.style.pointerEvents = 'none'; subChks.forEach(chk => chk.disabled = true); }
    }
    updateToolbarHighlights();
  });

  document.getElementById('chk-ac-labels')?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    setAircraftLabels(enabled);
    const labelsGroup = document.getElementById('ac-labels-group');
    if (labelsGroup) {
      labelsGroup.style.opacity = enabled ? '1' : '0.4';
      labelsGroup.style.pointerEvents = enabled ? '' : 'none';
      const subChks = labelsGroup.querySelectorAll('input[type="checkbox"]');
      subChks.forEach(chk => chk.disabled = !enabled);
    }
  });

  document.getElementById('chk-lbl-callsign')?.addEventListener('change', (e) => setLabelState('callsign', e.target.checked));
  document.getElementById('chk-lbl-type')?.addEventListener('change', (e) => setLabelState('type', e.target.checked));
  document.getElementById('chk-lbl-altspd')?.addEventListener('change', (e) => setLabelState('altSpd', e.target.checked));
  document.getElementById('chk-lbl-track')?.addEventListener('change', (e) => setLabelState('track', e.target.checked));
  document.getElementById('chk-auto-declutter')?.addEventListener('change', (e) => setAutoDeclutter(e.target.checked));
};

/**
 * Refreshes the Geo Point sub-panel list.
 */
export const refreshGeoPointPanel = (points) => {
  const list = document.getElementById('geopoint-list');
  if (!list) return;
  list.innerHTML = points.length === 0 ? `<div class="panel-empty-msg">${i18n.t('ui.panels.geopoint.empty_msg')}</div>` : '';
  points.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'panel-list-item';
    item.innerHTML = `
      <div class="panel-list-item-info">
        <div class="panel-list-item-name">${p.name || 'Unnamed Point'}</div>
        <div class="panel-list-item-meta">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</div>
      </div>
      <div class="panel-list-item-actions">
        <button class="panel-action-btn delete-btn" title="Delete">×</button>
      </div>
    `;
    // Note: Event listeners for delete/zoom would be wired here if needed, 
    // but for now we follow the existing pattern in main.js
    list.appendChild(item);
  });
};

/**
 * Refreshes the Notation sub-panel list.
 */
export const refreshNotationPanel = (notes) => {
  const list = document.getElementById('notation-list');
  if (!list) return;
  list.innerHTML = notes.length === 0 ? `<div class="panel-empty-msg">${i18n.t('ui.panels.notation.empty_msg')}</div>` : '';
  notes.forEach((n) => {
    const item = document.createElement('div');
    item.className = 'panel-list-item';
    item.innerHTML = `
      <div class="panel-list-item-info">
        <div class="panel-list-item-name">${n.text}</div>
        <div class="panel-list-item-meta">${n.lat.toFixed(4)}, ${n.lon.toFixed(4)}</div>
      </div>
    `;
    list.appendChild(item);
  });
};

/**
 * Refreshes the Range Tool sub-panel list.
 */
export const refreshRangePanel = (ranges) => {
  const list = document.getElementById('range-list');
  if (!list) return;
  list.innerHTML = ranges.length === 0 ? `<div class="panel-empty-msg">${i18n.t('ui.panels.range.empty_msg')}</div>` : '';
  ranges.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'panel-list-item';
    item.innerHTML = `
      <div class="panel-list-item-info">
        <div class="panel-list-item-name">${r.name || 'Unnamed Range'}</div>
        <div class="panel-list-item-meta">${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</div>
      </div>
    `;
    list.appendChild(item);
  });
};

/**
 * Shared helper that renders a list of shapes into a container.
 */
const _renderShapeList = (listId, shapes, emptyMsg, typeIconChar) => {
  const listEl = document.getElementById(listId);
  if (!listEl) return;

  if (!shapes || shapes.length === 0) {
    listEl.innerHTML = `<div class="shapes-empty-msg">${emptyMsg}</div>`;
    return;
  }

  listEl.innerHTML = '';
  shapes.forEach((shape) => {
    const item = document.createElement('div');
    item.className = 'shape-list-item';
    item.dataset.shapeId = shape.id;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'shape-list-icon';
    iconSpan.textContent = typeIconChar;
    item.appendChild(iconSpan);

    const nameEl = document.createElement('span');
    nameEl.className = 'shape-list-name';
    nameEl.textContent = shape.name;
    nameEl.contentEditable = 'true';
    nameEl.spellcheck = false;

    nameEl.addEventListener('blur', () => {
      const newName = nameEl.textContent.trim();
      if (newName && newName !== shape.name) renameShape(shape.id, newName);
      else nameEl.textContent = shape.name;
    });

    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      e.stopPropagation();
    });
    item.appendChild(nameEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'shape-list-actions';

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'shape-action-btn';
    zoomBtn.textContent = '⊙';
    zoomBtn.addEventListener('click', (e) => { e.stopPropagation(); zoomToShape(shape.id); });

    const visBtn = document.createElement('button');
    visBtn.className = 'shape-action-btn' + (shape.visible ? '' : ' action-hidden');
    visBtn.textContent = shape.visible ? '◉' : '○';
    visBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleShapeVisibility(shape.id); });

    const delBtn = document.createElement('button');
    delBtn.className = 'shape-action-btn action-delete';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteShapeById(shape.id); });

    actionsEl.appendChild(zoomBtn);
    actionsEl.appendChild(visBtn);
    actionsEl.appendChild(delBtn);
    item.appendChild(actionsEl);

    listEl.appendChild(item);
  });
};

/**
 * Refreshes the Shape panels (Polygon/Circle/Line).
 */
export const refreshShapePanels = (shapes) => {
  const polygons = (shapes || []).filter((s) => s.type === 'polygon');
  _renderShapeList('polygon-shapes-list', polygons, i18n.t('ui.panels.polygon.empty_msg'), '▱');

  const circles = (shapes || []).filter((s) => s.type === 'circle');
  _renderShapeList('circle-shapes-list', circles, i18n.t('ui.panels.circle.empty_msg'), '○');

  const lines = (shapes || []).filter((s) => s.type === 'line');
  _renderShapeList('line-shapes-list', lines, i18n.t('ui.panels.line.empty_msg'), '╱');
  
  updateToolbarHighlights();
};
