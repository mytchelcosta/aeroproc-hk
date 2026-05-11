// ============================================================
// Sidebar.js - The Multilayered Sidebar UI Controller
// ============================================================
import { i18n } from '../utils/i18n.js';
// ============================================================

// ── Module-level references ──────────────────────────────────────────
// These are set once during initialization and used by all views.

let _map = null;  // the Leaflet map instance
let _waypointLayer = null;  // the waypoint LayerGroup (controlled by tab switching)
let _onNewProcedure = null;  // callback from main.js: fired when "+ New" is clicked
let _onTabChange = null;  // callback from main.js: fired when View/Builder tab changes

// ── Persistent event-listener tracking ──────────────────────────────
// We use delegated click listeners on stable container elements.
// Storing a reference to the current handler lets us call removeEventListener
// before re-adding, which prevents listeners from accumulating on the same
// element across re-renders. Without this, any click on a non-button area
// would silently consume a { once: true } handler and break all future clicks
// until the UI happened to re-render.
let _builderSavedListEl = null;  // the #builder-saved-list element being listened to
let _builderSavedListHandler = null;  // the handler currently attached to that element
let _viewTabEl = null;  // the #tab-content element being listened to
let _viewTabHandler = null;  // the handler currently attached to that element
let _sequenceListWrapperEl = null;  // the #sequence-list-wrapper element being listened to
let _sequenceListHandler = null;  // the handler currently attached to that element
let _isEditSession = false; // true when the drawing panel is open for an existing procedure (edit flow)

// Master Lock state. When true, the "+ New Procedure" button is disabled and
// the user cannot accidentally start a new build session. Toggle with the lock
// icon in the Builder main menu.
// Phase 8.5.1: Default is now LOCKED so that opening the Builder tab never
// immediately exposes the creation button — the user must consciously unlock first.
let _builderLocked = true;

// Phase 13: JSON I/O callbacks registered by main.js.
// Fired when the user clicks "Save to JSON" or "Load from JSON" in the Builder main menu.
let _onSaveJSON = null;
let _onLoadJSON = null;

// Fired once each time the builder transitions from locked → unlocked.
// main.js uses this to auto-enable ghost fix layers on the map.
let _onBuilderUnlock = null;

// Phase 9.8 — Global Viewer Search
// Callback registered by main.js. Fired on every keystroke in the global search
// bar (after debounce in main.js handles the timing).
let _onGlobalSearch = null;

// Tracks whether the "Drop Custom Point" overlay is currently active.
// Reset to false each time showDrawingPanel() is called so new sessions
// always start with the overlay off.
let _dropCustomActive = false;

// Phase 14: Cached callbacks from the last showDrawingPanel() call.
// Used by clearPendingPointRestrictions() to re-wire the idle-state buttons
// without requiring main.js to pass callbacks a second time.
let _drawingCallbacks = null;

// Phase 13: Viewer sort preference. Persists while the tab is open.
// Allowed values: 'aerodrome-type' | 'type-aerodrome' | 'alpha-asc' | 'alpha-desc'
let _viewerSortMode = 'aerodrome-type';

// Cached args from the last updateViewTab() call so the sort dropdown can
// re-render without requiring a round-trip through main.js.
let _lastViewProcStates = null;
let _lastViewCallbacks = null;

// The type → default color mapping. When the user changes the Type dropdown,
// the matching color preset is auto-selected.
const _TYPE_COLOR_MAP = {
  SID: '#3b9eff', STAR: '#ffb547', IAC: '#4ddb8d',
  CTR: '#ff6b6b', FIS: '#c084fc', TMA: '#fb923c', ATZ: '#facc15'
};

// ── Private helpers ──────────────────────────────────────────────────

// Converts a level restriction (condition + value) into an ATC-standard
// HTML string for display in the sidebar sequence list.
//
// ATC notation rules:
//   Altitude Above → underline   (aircraft must be AT OR ABOVE this altitude)
//   Altitude Below → overline    (aircraft must be AT OR BELOW this altitude)
//   Altitude At    → plain text  (aircraft must be EXACTLY at this altitude)
//   No restriction → empty string
//
// 'condition' — '' | 'At' | 'Above' | 'Below'
// 'value'     — altitude string, e.g. 'FL100', '5000ft'
const _formatLevelHtml = (condition, value) => {
  if (!condition || !value) return '';
  const safe = _escapeHtml(value);
  if (condition === 'Above') return `<u>${safe}</u>`;
  if (condition === 'Below') return `<span style="text-decoration:overline">${safe}</span>`;
  return safe; // 'At' — plain text
};

// Converts a speed restriction (condition + value) into an ATC-standard
// HTML string for display in the sidebar sequence list.
//
// ATC notation rules:
//   Speed At        → "@" prefix  (aircraft must maintain EXACTLY this speed)
//   Speed At Least  → ">" prefix  (aircraft must fly AT LEAST this speed)
//   Speed Less Than → "<" prefix  (aircraft must fly LESS THAN this speed)
//   No restriction  → empty string
//
// 'condition' — '' | 'At' | 'At Least' | 'Less Than'
// 'value'     — speed string, e.g. '250kt'
const _formatSpeedHtml = (condition, value) => {
  if (!condition || !value) return '';
  const safe = _escapeHtml(value);
  if (condition === 'At') return `@${safe}`;
  if (condition === 'Less Than') return `&lt;${safe}`;
  if (condition === 'Less Than Or Equal') return `&le;${safe}`;
  if (condition === 'Greater Than') return `&gt;${safe}`;
  if (condition === 'At Least') return `&ge;${safe}`;
  return safe;
};

// Returns the HTML fragment for the Phase 9.8 Global Search bar.
// This is injected at the TOP of every View-tab render so it appears both
// when procedures exist and when the empty placeholder is shown.
// The result-count badge is hidden until results arrive (set by main.js via
// updateViewGlobalSearchCount). Its color matches the layer color legend.
//
// Phase 8 (advanced filtering):
// The three legend entries (Aerodrome / Fix / NAVAID) are now clickable
// toggle chips (`<button class="gsl-chip active" data-category="...">`).
// All three default to ON. Toggling a chip OFF instantly drops that layer
// type out of the search-result set — read by `SearchManager.handleGlobalSearch`
// via `getGlobalSearchCategoryFilter()` below.
//
// Phase 8 (UX polish):
// The chip strip is now a *vertical* stack (`.global-search-legend` flex column).
// Each chip row contains: coloured dot + label + per-category count badge
// (`.gsl-cat-count`, right-aligned via `margin-left: auto`). Counts come from
// `updateCategoryChipCounts({aerodrome,fix,navaid})` and reflect the FULL
// pre-slice match count, not the displayed top-N. The total-results badge
// (`#global-search-count`) was moved BELOW the legend so its show/hide can
// never displace the chips above it. The chip container also carries a
// `min-height` floor so a sibling can't push it around either.
const _globalSearchHtml = () => `
  <div class="global-search-section" id="global-search-section">
    <div class="global-search-row">
      <span class="global-search-icon">&#128269;</span>
      <input
        type="text"
        id="global-search"
        class="global-search-input"
        placeholder="${i18n.t('sidebar.view.search_placeholder')}"
        data-i18n-placeholder="sidebar.view.search_placeholder"
        autocomplete="off"
        spellcheck="false"
      >
      <button class="global-search-clear" id="global-search-clear" title="Clear search" style="display:none;">&#10005;</button>
    </div>
    <div class="global-search-meta">
      <span class="global-search-legend">
        <button type="button" class="gsl-chip active" data-category="aerodrome"
                title="${i18n.t('sidebar.view.legend.aerodrome')}"
                aria-pressed="true">
          <span class="gsl-dot" style="background:#3b9eff;"></span>
          <span class="gsl-label" data-i18n="sidebar.view.legend.aerodrome">${i18n.t('sidebar.view.legend.aerodrome')}</span>
          <span class="gsl-cat-count" data-cat-count="aerodrome" style="display:none;"></span>
        </button>
        <button type="button" class="gsl-chip active" data-category="fix"
                title="${i18n.t('sidebar.view.legend.fix')}"
                aria-pressed="true">
          <span class="gsl-dot" style="background:#b06bff;"></span>
          <span class="gsl-label" data-i18n="sidebar.view.legend.fix">${i18n.t('sidebar.view.legend.fix')}</span>
          <span class="gsl-cat-count" data-cat-count="fix" style="display:none;"></span>
        </button>
        <button type="button" class="gsl-chip active" data-category="navaid"
                title="${i18n.t('sidebar.view.legend.navaid')}"
                aria-pressed="true">
          <span class="gsl-dot" style="background:#ff8c00;"></span>
          <span class="gsl-label" data-i18n="sidebar.view.legend.navaid">${i18n.t('sidebar.view.legend.navaid')}</span>
          <span class="gsl-cat-count" data-cat-count="navaid" style="display:none;"></span>
        </button>
      </span>
      <span class="global-search-count" id="global-search-count" style="display:none;"></span>
    </div>
  </div>
`;


// Phase 8: returns the current ON/OFF state of the three category toggle
// chips inside the global-search legend. Reading from the DOM keeps a single
// source of truth (the chip's `.active` class) without a parallel JS state
// object that could drift out of sync. When the chips aren't in the DOM yet
// (e.g. before View-tab renders), we default everything to ON so the very
// first search isn't accidentally filtered down to zero results.
//
// Returns: { aerodrome: bool, fix: bool, navaid: bool }
const getGlobalSearchCategoryFilter = () => {
  const filter = { aerodrome: true, fix: true, navaid: true };
  const chips = document.querySelectorAll('.gsl-chip[data-category]');
  if (chips.length === 0) return filter;   // no chips rendered yet → all ON
  chips.forEach((chip) => {
    const cat = chip.dataset.category;
    if (cat in filter) filter[cat] = chip.classList.contains('active');
  });
  return filter;
};

// Wires event listeners to the global search bar after it has been injected
// into the DOM. Safe to call multiple times — the listeners are re-attached
// to freshly rendered DOM elements each time the View tab renders.
const _wireGlobalSearch = () => {
  const input = document.getElementById('global-search');
  const clearBtn = document.getElementById('global-search-clear');
  if (!input) return;

  // Fire the search callback on every keystroke; main.js debounces the actual search.
  input.addEventListener('input', () => {
    if (clearBtn) clearBtn.style.display = input.value ? 'flex' : 'none';
    if (_onGlobalSearch) _onGlobalSearch(input.value);
  });

  // Escape clears the field and removes highlights immediately.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (_onGlobalSearch) _onGlobalSearch('');
    }
  });

  // The ✕ clear button resets the field and fires an empty search.
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      if (_onGlobalSearch) _onGlobalSearch('');
      input.focus();
    });
  }

  // Phase 8: category toggle chips in the legend row. Clicking a chip flips
  // its `.active` class (and `aria-pressed` for screen readers) and re-fires
  // the search callback with the current input value, so the result set
  // updates instantly without the user having to retype the query. The
  // category state is read by `getGlobalSearchCategoryFilter()` directly
  // from the DOM, so there's no separate JS object to keep in sync.
  const chips = document.querySelectorAll('.gsl-chip[data-category]');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const isOn = chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', String(isOn));
      if (_onGlobalSearch) _onGlobalSearch(input.value);
    });
  });
};

// Returns the #tab-content DOM element, logging an error if it's missing.
// This is the single swappable zone inside the sidebar — all views render into it.
const _getBuilderPanel = () => {
  const panel = document.getElementById('tab-content');
  if (!panel) console.error('[Sidebar] #tab-content not found. Was buildLayerControls() called?');
  return panel;
};

// Replaces the entire content of #builder-panel with new HTML.
const _renderBuilderPanel = (html) => {
  const panel = _getBuilderPanel();
  if (panel) {
    panel.innerHTML = html;
    i18n.updateDOM();
  }
};

// Escapes special HTML characters in a string so it is safe to insert
// into innerHTML. Prevents XSS when user-typed text (like procedure names)
// is shown inside the sidebar HTML.
const _escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');


// ── PUBLIC API ───────────────────────────────────────────────────────


// Stage 1: Called immediately at startup before any data has loaded.
// Stores the map reference and shows a loading indicator in the sidebar.
const initSidebar = (mapInstance) => {
  if (!mapInstance) {
    console.error('[Sidebar] initSidebar: No map instance provided. Sidebar will not function.');
    return;
  }
  _map = mapInstance;

  const contentArea = document.querySelector('.sidebar-content');
  if (!contentArea) {
    console.error('[Sidebar] initSidebar: .sidebar-content element not found in index.html.');
    return;
  }

  // Show a loading indicator while data is being fetched in the background.
  contentArea.innerHTML = `
    <div class="loading-state">
      <div class="loading-dot"></div>
      <span data-i18n="sidebar.loading">Loading waypoints...</span>
    </div>
  `;
  i18n.updateDOM();

  console.log('[Sidebar] Sidebar initialized. Showing loading state.');
};


// Stage 2: Called after waypoints have been loaded and rendered on the map.
// Replaces the loading state with a top-level tab bar (View / Builder) and a
// single #tab-content zone that swaps views when tabs are clicked.
//
// The Measuring Vector tool button now lives in the floating toolbar over the
// map (#map-toolbar in index.html), not in this sidebar — so it is always
// visible regardless of which tab is active.
//
// 'mapInstance'    — the Leaflet map
// 'waypointLayer'  — the LayerGroup returned by renderFixes()
// 'count'          — number of waypoints loaded (logged for debugging)
// 'onTabChange'    — callback from main.js: called with 'view' or 'builder'
//                    so main.js can show/hide the waypoint layer accordingly
// 'onNewProcedure' — callback from main.js: fired when "+ New Procedure" is clicked
const buildLayerControls = (mapInstance, waypointLayer, count, onTabChange, onNewProcedure) => {
  if (!mapInstance || !waypointLayer) {
    console.error('[Sidebar] buildLayerControls: mapInstance or waypointLayer is missing.');
    return;
  }
  _map = mapInstance;
  _waypointLayer = waypointLayer;
  _onTabChange = onTabChange;
  _onNewProcedure = onNewProcedure;

  const contentArea = document.querySelector('.sidebar-content');
  if (!contentArea) {
    console.error('[Sidebar] buildLayerControls: .sidebar-content not found.');
    return;
  }

  // Build the tab bar + single swappable content zone.
  // The tab bar stays permanently at the top; #tab-content switches between views.
  contentArea.innerHTML = `
    <div class="tab-bar">
      <button class="tab" data-tab="view" data-i18n="sidebar.tabs.view">View</button>
      <button class="tab" data-tab="builder" data-i18n="sidebar.tabs.builder">Builder</button>
    </div>
    <div id="tab-content"></div>
  `;
  i18n.updateDOM();

  // Wire up tab button clicks so each tab navigates to the correct view.
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'view') {
        showViewTab();
      } else {
        showBuilderTab();
      }
    });
  });

  // Start on the View tab with waypoints hidden — the user must switch to
  // Builder mode before waypoints are shown on the map.
  showViewTab();

  console.log(`[Sidebar] Tab bar built. ${count} waypoints available in Builder mode.`);
};


// Switches the sidebar to the View tab.
// Shows a placeholder since no saved procedures are loaded yet.
// Calls _onTabChange('view') so main.js can hide the waypoint layer.
const showViewTab = () => {
  // Highlight the View tab and remove highlight from Builder tab
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === 'view');
  });

  const content = document.getElementById('tab-content');
  if (!content) {
    console.error('[Sidebar] showViewTab: #tab-content not found.');
    return;
  }

  // Render the global search bar + friendly placeholder for the procedures section.
  // updateViewTab() will replace the placeholder with the procedures list if any exist,
  // but the global search bar is included here so it is visible immediately on tab switch.
  content.innerHTML =
    _globalSearchHtml() +
    `<div class="view-placeholder">
      <div class="view-placeholder-icon">&#9992;</div>
      <div class="view-placeholder-title" data-i18n="sidebar.view.empty.title">No Procedures</div>
      <div class="view-placeholder-text" data-i18n="sidebar.view.empty.text">
        Saved procedures will appear here. Switch to the Builder tab to create one.
      </div>
    </div>`;
  i18n.updateDOM();

  _wireGlobalSearch();

  // Tell main.js the user is now in View mode so it can hide waypoints
  if (_onTabChange) _onTabChange('view');

  console.log('[Sidebar] Switched to View tab.');
};

// Phase 36: Listen for language changes to update any currently visible sidebar elements
window.addEventListener('languageChanged', () => {
  i18n.updateDOM();
});


// Switches the sidebar to the Builder tab.
// Shows the main builder menu with the "+ New Procedure" button.
// Calls _onTabChange('builder') so main.js can show the waypoint layer.
const showBuilderTab = () => {
  // Highlight the Builder tab and remove highlight from View tab
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === 'builder');
  });

  // Render the main menu into #tab-content
  showMainMenu();

  // Tell main.js the user is now in Builder mode so it can show waypoints
  if (_onTabChange) _onTabChange('builder');

  console.log('[Sidebar] Switched to Builder tab.');
};


// Renders the main menu view in the builder panel.
// Shows the "+ New Procedure" button followed by an empty #builder-saved-list
// container. main.js calls refreshBuilderSavedList() right after to populate
// that container with the current database entries.
// Automatically called after cancel, export, and on initial load.
const showMainMenu = () => {
  // Phase 16: Locked vs Unlocked render completely different UIs.
  // Locked  → full-width lock screen (no procedures list visible, emphasis on security).
  // Unlocked → small discrete icon in the top-right; full content below.

  // SVG: closed padlock (locked state large icon)
  const SVG_LOCKED =
    `<svg class="builder-lock-svg" width="52" height="52" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="3" y="11" width="18" height="12" rx="2"/>` +
    `<path d="M7 11V7a5 5 0 0 1 10 0v4"/>` +
    `<circle cx="12" cy="16.5" r="1.2" fill="currentColor" stroke="none"/>` +
    `</svg>`;

  // SVG: open padlock (small corner icon when unlocked — invites re-locking)
  const SVG_UNLOCKED_SMALL =
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `<rect x="3" y="11" width="18" height="12" rx="2"/>` +
    `<path d="M7 11V7a5 5 0 0 1 9.9-1"/>` +
    `</svg>`;

  if (_builderLocked) {
    _renderBuilderPanel(`
      <div class="builder-section builder-locked-view">
        <button class="builder-locked-screen" id="btn-master-lock">
          ${SVG_LOCKED}
          <div class="builder-locked-title">Builder Locked</div>
          <div class="builder-locked-sub">Click to unlock</div>
        </button>
      </div>
    `);
  } else {
    _renderBuilderPanel(`
      <div class="builder-section">
        <div class="builder-section-topbar">
          <button class="builder-unlock-icon" id="btn-master-lock" title="Lock builder">
            ${SVG_UNLOCKED_SMALL}
          </button>
        </div>
        <button class="new-procedure-btn" id="btn-new-procedure">
          <span class="new-btn-plus">+</span>
          <span data-i18n="sidebar.builder.btn_new">New Procedure</span>
        </button>
        <div class="json-io-row">
          <button class="json-io-btn" id="btn-save-json" title="Download all procedures as a JSON file">
            &#8595; Save to JSON
          </button>
          <button class="json-io-btn" id="btn-load-json" title="Import procedures from a JSON file on your computer">
            &#8593; Load from JSON
          </button>
        </div>
        <div id="builder-saved-list"></div>
      </div>
    `);

    // New Procedure and JSON buttons only wired when unlocked.
    const btn = document.getElementById('btn-new-procedure');
    if (btn && _onNewProcedure) btn.addEventListener('click', _onNewProcedure);

    const saveBtn = document.getElementById('btn-save-json');
    if (saveBtn && _onSaveJSON) saveBtn.addEventListener('click', _onSaveJSON);

    const loadBtn = document.getElementById('btn-load-json');
    if (loadBtn && _onLoadJSON) loadBtn.addEventListener('click', _onLoadJSON);
  }

  // Lock toggle always wired — flips state and re-renders.
  document.getElementById('btn-master-lock').addEventListener('click', () => {
    const wasLocked = _builderLocked;
    _builderLocked = !_builderLocked;
    showMainMenu();
    if (wasLocked && !_builderLocked && _onBuilderUnlock) _onBuilderUnlock();
  });
};


// Renders the metadata form view in the builder panel.
// The user fills in: name, type, line pattern, and color.
// When the user clicks "Start Drawing", 'onStart' is called with the metadata.
//
// 'onStart' — callback: ({ name, type, pattern, color }) => void
const showMetadataForm = (onStart) => {
  _renderBuilderPanel(`
    <div class="builder-section">

      <div class="builder-section-title">
        <button class="back-btn" id="btn-back">&#8592;</button>
        <span data-i18n="sidebar.builder.form.title_new">New Procedure</span>
      </div>

      <div class="form-field">
        <label class="form-label" for="proc-name" data-i18n="sidebar.builder.form.name">Name</label>
        <input class="form-input" type="text" id="proc-name"
               placeholder="e.g. ASPAT1A" autocomplete="off">
      </div>

      <div class="form-field">
        <label class="form-label" for="proc-type" data-i18n="sidebar.builder.form.type">Type</label>
        <select class="form-select" id="proc-type">
          <option value="SID">SID — Standard Instrument Departure</option>
          <option value="STAR">STAR — Standard Terminal Arrival</option>
          <option value="IAC">IAC — Instrument Approach Chart</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label" for="proc-airport" data-i18n="sidebar.builder.form.airport">Airport</label>
        <select class="form-select" id="proc-airport">
          <optgroup label="Hong Kong FIR">
            <option value="VHHH">VHHH — Hong Kong International</option>
            <option value="VMMC">VMMC — Macao International</option>
            <option value="ZGSZ">ZGSZ — Shenzhen Bao'an International</option>
            <option value="ZGGG">ZGGG — Guangzhou Baiyun International</option>
            <option value="ZGHK">ZGHK — Zhuhai Jinwan</option>
          </optgroup>
          <option value="">Other</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label" for="proc-runway" data-i18n="sidebar.builder.form.runway">Runway(s)</label>
        <input class="form-input" type="text" id="proc-runway"
               placeholder="e.g. 10L/28R or ALL" autocomplete="off">
      </div>

      <div class="form-field">
        <label class="form-label" for="proc-pattern" data-i18n="sidebar.builder.form.line_style">Line Style</label>
        <select class="form-select" id="proc-pattern">
          <option value="solid">Solid ─────────</option>
          <option value="dashed">Dashed  - - - - -</option>
          <option value="dotted">Dotted  · · · · ·</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label" data-i18n="sidebar.builder.form.color">Color</label>
        <div class="color-preset-row" id="color-preset-row">
          <button class="color-swatch active" data-color="#3b9eff" style="background:#3b9eff;" title="SID Blue"></button>
          <button class="color-swatch" data-color="#ffb547" style="background:#ffb547;" title="STAR Amber"></button>
          <button class="color-swatch" data-color="#4ddb8d" style="background:#4ddb8d;" title="IAC Green"></button>
          <button class="color-swatch" data-color="#ff6b6b" style="background:#ff6b6b;" title="CTR Red"></button>
          <button class="color-swatch" data-color="#c084fc" style="background:#c084fc;" title="FIS Purple"></button>
          <button class="color-swatch" data-color="#fb923c" style="background:#fb923c;" title="TMA Orange"></button>
          <button class="color-swatch" data-color="#facc15" style="background:#facc15;" title="ATZ Yellow"></button>
          <label class="color-swatch color-custom-label" title="Custom color" id="custom-swatch-label">
            <span class="custom-plus">+</span>
            <input type="color" id="custom-color-picker" value="#ffffff">
          </label>
        </div>
      </div>

      <button class="builder-action-btn primary" id="btn-start-drawing" data-i18n="sidebar.builder.form.btn_start">▶ Start Drawing</button>

    </div>
  `);

  // ── Wire up form interactions ─────────────────────────────────────

  // Auto-focus the name field so the user can type immediately without clicking.
  setTimeout(() => document.getElementById('proc-name')?.focus(), 60);

  // Force uppercase so the stored procedure name always matches ATC convention.
  const _nameInput = document.getElementById('proc-name');
  if (_nameInput) {
    _nameInput.addEventListener('input', () => {
      const pos = _nameInput.selectionStart;
      _nameInput.value = _nameInput.value.toUpperCase();
      _nameInput.setSelectionRange(pos, pos);
    });
  }

  // Enter-key navigation: pressing Enter in a field advances to the next logical step.
  const _advanceOnEnter = (fromId, toId) => {
    document.getElementById(fromId)?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = document.getElementById(toId);
      if (next) next.focus();
    });
  };
  _advanceOnEnter('proc-name', 'proc-type');
  _advanceOnEnter('proc-type', 'proc-airport');
  _advanceOnEnter('proc-airport', 'proc-runway');

  // Enter on the runway field fires Start Drawing
  document.getElementById('proc-runway')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-start-drawing')?.click();
    }
  });

  // Track the currently selected color (starts with the SID blue default)
  let selectedColor = '#3b9eff';

  // Clicking a preset swatch selects its color
  const swatchRow = document.getElementById('color-preset-row');
  swatchRow.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch[data-color]');
    if (!swatch) return;
    selectedColor = swatch.dataset.color;
    document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
  });

  // Custom color picker: selecting a custom color marks the "+" swatch active
  const customPicker = document.getElementById('custom-color-picker');
  const customLabel = document.getElementById('custom-swatch-label');
  customPicker.addEventListener('input', () => {
    selectedColor = customPicker.value;
    document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    customLabel.classList.add('active');
  });

  // Back button returns to main menu
  document.getElementById('btn-back').addEventListener('click', showMainMenu);

  // Start Drawing: validate and fire the onStart callback
  document.getElementById('btn-start-drawing').addEventListener('click', () => {
    const nameInput = document.getElementById('proc-name');
    const name = nameInput.value.trim();

    if (!name) {
      // Highlight the name field to signal it's required
      nameInput.classList.add('input-error');
      nameInput.focus();
      nameInput.placeholder = 'Name is required!';
      return;
    }

    onStart({
      name,
      type: document.getElementById('proc-type').value,
      pattern: document.getElementById('proc-pattern').value,
      color: selectedColor,
      airport: document.getElementById('proc-airport').value,
      runway: document.getElementById('proc-runway').value.trim()
    });
  });
};


// Renders the drawing panel view in the builder panel.
// Shows the procedure being built, a manual coordinate input, and the sequence list.
// For route types (SID/STAR/IAC) a search bar is shown at the top so the user
// can filter the map waypoints by typing and find fixes quickly.
//
// Phase 10: Route procedures also show a "Transitions" section at the bottom where
// the user can start drawing branch routes that connect to a shared convergence fix.
//
// 'drawingState' — the shared DrawingState singleton
// 'callbacks'    — object with: { onPointRemove, onManualAdd, onSave, onCancel,
//                                 onSearch, onMeasurementsToggle, onDropCustomToggle,
//                                 onAddTransition, onEndTransition }
// 'options' — optional: { isEdit: boolean } — when true the finalize button reads
//             "Save Procedure" instead of "Create Procedure".
const showDrawingPanel = (drawingState, callbacks, options = {}) => {
  // Always reset the drop-custom state when opening a new drawing panel so the
  // button starts un-toggled for every session (fresh draw or edit).
  _dropCustomActive = false;

  // Track whether this is an edit session so button labels update accordingly.
  _isEditSession = !!options.isEdit;

  // Cache the callbacks so the inline restriction panel can re-wire them after
  // clearing a pending point without requiring another call from main.js.
  _drawingCallbacks = callbacks;

  const isRoute = !drawingState.isAreaType();
  // Area procedures show a brief usage hint; route procedures have a search bar
  // directly above the sequence list so the hint text there was redundant.
  const modeHint = drawingState.isAreaType()
    ? 'Click anywhere on the map to place area vertices.'
    : '';
  const modeHintHtml = modeHint
    ? `<div class="drawing-mode-hint">${modeHint}</div>`
    : '';

  // The search bar is only useful for route procedures (snap-to-fix mode).
  // Area types use free-draw (click anywhere) and don't need waypoint filtering.
  const searchHtml = isRoute ? `
    <div class="waypoint-search-wrapper">
      <input
        type="text"
        class="waypoint-search-input"
        id="waypoint-search"
        placeholder="${i18n.t('sidebar.builder.panel.search_placeholder')}"
        data-i18n-placeholder="sidebar.builder.panel.search_placeholder"
        autocomplete="off"
        spellcheck="false"
      >
      <span class="search-icon">&#128269;</span>
    </div>
  ` : '';

  // The "Drop Custom Point" toggle and lat/lon coordinate fields are only shown for
  // route procedures. Activating "Drop Custom Point" sets a crosshair cursor and
  // mirrors live cursor coords into the Lat/Lon fields. The user can also type exact
  // coordinates and click "+" to place a point without using the map cursor.
  const dropPointHtml = isRoute ? `
    <div class="drop-point-section">
      <button class="drop-point-btn" id="btn-drop-custom" title="Toggle: click anywhere on map to drop a custom point">
        <span class="drop-point-dot"></span>
        <span data-i18n="sidebar.builder.panel.drop_custom">Drop Custom Point</span>
      </button>
      <div class="drop-coords-row" id="drop-coords-row">
        <input type="number" id="drop-lat" class="drop-coord-input" placeholder="Lat" step="any" tabindex="-1">
        <input type="number" id="drop-lon" class="drop-coord-input" placeholder="Lon" step="any" tabindex="-1">
        <button class="drop-coord-add-btn" id="btn-drop-coords" title="Add point at these coordinates">+</button>
      </div>
    </div>
  ` : '';

  // Phase 10: The transitions section is only shown for route procedures (not areas).
  // It starts empty; updateTransitionUI() fills it in based on the current state.
  const transitionSectionHtml = isRoute
    ? `<div id="transition-section" class="transition-section"></div>`
    : '';

  _renderBuilderPanel(`
    <div class="builder-section" id="drawing-panel">

      <div class="builder-section-title building">
        <span class="building-type-badge">${_escapeHtml(drawingState.metadata.type)}</span>
        <span class="building-name">${_escapeHtml(drawingState.metadata.name)}</span>
      </div>

      ${searchHtml}

      ${dropPointHtml}

      ${modeHintHtml}

      <div id="sequence-list-wrapper"></div>

      ${transitionSectionHtml}

      <div class="measurement-toggle-row">
        <label class="measurement-toggle-label" for="toggle-measurements">
          <input type="checkbox" id="toggle-measurements" class="toggle-checkbox">
          <span data-i18n="sidebar.builder.panel.chk_measurements">Show leg measurements</span>
        </label>
      </div>

      <div id="inline-restriction-panel" class="inline-restriction-panel inline-panel-idle">
        <div class="inline-action-row">
          <button class="builder-action-btn primary" id="btn-create-procedure">✓ ${_isEditSession ? 'Save Procedure' : 'Create Procedure'}</button>
          <button class="builder-action-btn danger"  id="btn-cancel-drawing">✕ Cancel</button>
        </div>
      </div>

    </div>
  `);

  // Wire up the waypoint search bar (only present for route types)
  const searchInput = document.getElementById('waypoint-search');
  if (searchInput && callbacks.onSearch) {
    searchInput.addEventListener('input', () => {
      callbacks.onSearch(searchInput.value);
    });

    // Phase 15: pressing Enter while a term is typed selects the single matching fix
    // (if exactly one result exists). The actual lookup happens in main.js via onSearchEnter.
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        e.preventDefault();
        if (callbacks.onSearchEnter) callbacks.onSearchEnter(searchInput.value.trim());
      }
    });
  }

  // Wire up the Drop Custom Point toggle (only present for route types).
  // Each click flips _dropCustomActive, updates the button appearance, and
  // notifies main.js so it can enable or disable the map drop overlay.
  const dropBtn = document.getElementById('btn-drop-custom');
  if (dropBtn && callbacks.onDropCustomToggle) {
    dropBtn.addEventListener('click', () => {
      _dropCustomActive = !_dropCustomActive;
      dropBtn.classList.toggle('active', _dropCustomActive);
      callbacks.onDropCustomToggle(_dropCustomActive);
    });
  }

  // Phase 21: Wire the inline lat/lon coordinate fields. Pressing Enter in the Lat
  // field moves focus to Lon; Enter in Lon (or clicking "+") submits the coordinates.
  // main.js validates range and feeds the point through the restriction panel.
  const _submitDropCoords = () => {
    const latEl = document.getElementById('drop-lat');
    const lonEl = document.getElementById('drop-lon');
    const lat = parseFloat(latEl?.value);
    const lon = parseFloat(lonEl?.value);
    if (isNaN(lat) || isNaN(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
    if (callbacks.onManualAdd) callbacks.onManualAdd(lat, lon);
  };

  document.getElementById('btn-drop-coords')?.addEventListener('click', _submitDropCoords);

  document.getElementById('drop-lat')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('drop-lon')?.focus(); }
  });

  document.getElementById('drop-lon')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _submitDropCoords(); }
  });

  // Wire up the measurement toggle checkbox
  const measureToggle = document.getElementById('toggle-measurements');
  if (measureToggle && callbacks.onMeasurementsToggle) {
    measureToggle.addEventListener('change', () => {
      callbacks.onMeasurementsToggle(measureToggle.checked);
    });
  }

  // Wire the idle-state Create Procedure and Cancel buttons.
  // These are replaced by showPendingPointRestrictions() when a fix is pending,
  // and restored by clearPendingPointRestrictions() after the point is committed.
  document.getElementById('btn-create-procedure')?.addEventListener('click', () => {
    if (callbacks.onSave) callbacks.onSave();
  });
  document.getElementById('btn-cancel-drawing')?.addEventListener('click', () => {
    if (callbacks.onCancel) callbacks.onCancel();
  });

  // Render the (initially empty) sequence list
  refreshSequenceList(drawingState, callbacks);

  // Auto-focus the waypoint search bar immediately so the user can type a fix name
  // without having to click the field first. Route procedures only — area types
  // use free-draw clicks, not a search bar.
  if (!drawingState.isAreaType()) {
    setTimeout(() => document.getElementById('waypoint-search')?.focus(), 80);
  }
};


// Updates ONLY the sequence list portion of the drawing panel.
// Called after every point add, remove, reorder, or edit — without
// re-rendering the entire drawing panel (which would lose input state).
//
// Each sequence item has four action buttons:
//   ↑ (move up)  — disabled for the first point
//   ↓ (move down) — disabled for the last point
//   ✎ (edit)     — re-opens the restriction modal for that point
//   × (remove)   — deletes the point from the sequence
//
// 'drawingState' — the shared DrawingState singleton
// 'callbacks'    — object with: { onPointRemove, onPointMoveUp, onPointMoveDown, onPointEdit }
const refreshSequenceList = (drawingState, callbacks) => {
  const wrapper = document.getElementById('sequence-list-wrapper');
  if (!wrapper) return;  // drawing panel not visible — harmless no-op

  // Remove any stale listener before mutating the DOM or re-attaching.
  // Without this, { once: true } listeners were consumed by any click on the wrapper
  // (even on non-button areas), silently breaking all subsequent button clicks.
  if (_sequenceListWrapperEl && _sequenceListHandler) {
    _sequenceListWrapperEl.removeEventListener('click', _sequenceListHandler);
  }
  _sequenceListWrapperEl = wrapper;
  _sequenceListHandler = null;

  const points = drawingState.points;
  const lastIdx = points.length - 1;

  if (points.length === 0) {
    // In transition mode, tell the user specifically what to do and where the branch ends.
    const emptyMsg = drawingState._inTransitionMode
      ? i18n.t('sidebar.builder.panel.transition_hint').replace('{ident}', `<strong>${_escapeHtml(drawingState.convergencePointIdent || '?')}</strong>`)
      : i18n.t('sidebar.builder.panel.empty_msg');

    wrapper.innerHTML = `<div class="sequence-empty">${emptyMsg}</div>`;
    updateTransitionUI(drawingState, callbacks);
    return;
  }

  // Build one HTML row per point in the sequence
  const itemsHtml = points.map((pt, i) => {
    // Format level and speed using ATC notation HTML (underline/overline/prefix)
    const levelHtml = _formatLevelHtml(pt.levelCondition, pt.levelValue);
    const speedHtml = _formatSpeedHtml(pt.speedCondition, pt.speedValue);
    const hasRestrictions = levelHtml || speedHtml;

    // Restriction display — raw HTML so underline/overline tags render correctly
    let restrictionHtml;
    if (hasRestrictions) {
      const parts = [levelHtml, speedHtml].filter(Boolean).join(' · ');
      restrictionHtml = `<div class="seq-restrictions">${parts}</div>`;
    } else {
      restrictionHtml = `<div class="seq-restrictions empty">No restrictions</div>`;
    }

    // ▬ RWY threshold  ✈ airport  ◆ snapped fix  ◇ custom/free-draw point
    const typeIcon = pt.tipo === 'RWY'
      ? '▬'
      : pt.tipo === 'AERODROME'
        ? '&#9992;'
        : (pt.isFix ? '◆' : '◇');

    // Up/Down buttons are disabled at the boundary positions to prevent out-of-bounds moves
    const upDisabled = i === 0 ? 'disabled' : '';
    const downDisabled = i === lastIdx ? 'disabled' : '';

    return `
      <div class="seq-item">
        <span class="seq-number">${i + 1}</span>
        <span class="seq-type-icon" title="${pt.isFix ? 'Fix' : 'Custom Point'}">${typeIcon}</span>
        <div class="seq-info">
          <div class="seq-ident">${_escapeHtml(pt.ident)}</div>
          ${restrictionHtml}
        </div>
        <div class="seq-actions">
          <button class="seq-btn seq-move-up"   data-move-up="${i}"   ${upDisabled}   title="Move up">&#8593;</button>
          <button class="seq-btn seq-move-down" data-move-down="${i}" ${downDisabled} title="Move down">&#8595;</button>
          <button class="seq-btn seq-edit"      data-edit-index="${i}"                title="Edit restrictions">&#9998;</button>
          <button class="seq-btn seq-remove"    data-remove-index="${i}"              title="Remove point">&#10005;</button>
        </div>
      </div>
    `;
  }).join('');

  // When in transition mode, label the section with the branch name so the user
  // always knows whether they are editing the common route or a branch.
  const sequenceLabel = drawingState._inTransitionMode
    ? `Transition: ${_escapeHtml(drawingState._activeTransitionName)}`
    : 'Sequence';

  wrapper.innerHTML = `
    <div class="sequence-header">
      <span class="section-label" style="padding: 12px 0 6px;">${sequenceLabel}</span>
      <span class="layer-count">${points.length} pt${points.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="sequence-list">${itemsHtml}</div>
  `;

  // Persistent delegated click listener — NOT { once: true }.
  // A { once: true } listener was consumed by any click on the wrapper (even on
  // empty space), silently breaking all subsequent button clicks until the next
  // re-render. The module-level _sequenceListHandler reference lets us cleanly
  // remove the old listener before the next refreshSequenceList call.
  _sequenceListHandler = (e) => {
    const upBtn = e.target.closest('[data-move-up]');
    const downBtn = e.target.closest('[data-move-down]');
    const editBtn = e.target.closest('[data-edit-index]');
    const removeBtn = e.target.closest('[data-remove-index]');

    if (upBtn && callbacks.onPointMoveUp) callbacks.onPointMoveUp(parseInt(upBtn.dataset.moveUp, 10));
    if (downBtn && callbacks.onPointMoveDown) callbacks.onPointMoveDown(parseInt(downBtn.dataset.moveDown, 10));
    if (editBtn && callbacks.onPointEdit) callbacks.onPointEdit(parseInt(editBtn.dataset.editIndex, 10));
    if (removeBtn && callbacks.onPointRemove) callbacks.onPointRemove(parseInt(removeBtn.dataset.removeIndex, 10));
  };
  wrapper.addEventListener('click', _sequenceListHandler);

  // Phase 10: always refresh the transition section after the sequence list changes.
  // The convergence-point dropdown must reflect the current live sequence, so this
  // call ensures the options stay in sync with every add/remove/reorder operation.
  updateTransitionUI(drawingState, callbacks);
};


// Renders the export result view in the builder panel.
// Shows the finished JSON and provides a "Copy" button and a "New Procedure" button.
//
// 'json'           — the plain object returned by DrawingState.toJSON()
// 'onNewProcedure' — callback to restart the build flow
const showExportResult = (json, onNewProcedure) => {
  const jsonString = JSON.stringify(json, null, 2);

  _renderBuilderPanel(`
    <div class="builder-section">

      <div class="builder-section-title">
        <span style="color: var(--color-success);">&#10003;</span> Exported
      </div>

      <div class="export-hint">Copy the JSON below into your procedure database.</div>

      <pre class="export-json">${_escapeHtml(jsonString)}</pre>

      <button class="builder-action-btn secondary" id="btn-copy-json">Copy JSON</button>
      <button class="builder-action-btn primary"   id="btn-new-after-export">+ New Procedure</button>

    </div>
  `);

  // Copy button uses the Clipboard API with a graceful fallback
  document.getElementById('btn-copy-json').addEventListener('click', () => {
    const copyBtn = document.getElementById('btn-copy-json');
    navigator.clipboard.writeText(jsonString)
      .then(() => {
        if (copyBtn) {
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            const b = document.getElementById('btn-copy-json');
            if (b) b.textContent = 'Copy JSON';
          }, 2000);
        }
      })
      .catch(() => {
        console.warn('[Sidebar] Clipboard API unavailable. The JSON was logged to the console — copy it from there.');
      });
  });

  document.getElementById('btn-new-after-export').addEventListener('click', () => {
    if (onNewProcedure) onNewProcedure();
  });
};


// Phase 15: Opens a small modal for typing an exact lat/lon coordinate.
// Replaces the old inline manual-point-section fields inside the drawing panel.
// The modal is created dynamically, positioned in the center of the screen,
// and removed from the DOM on confirm or cancel.
//
// 'onConfirm' — function(lat, lon) called when the user submits valid coordinates
const _showManualPointModal = (onConfirm) => {
  // Guard: don't open two at once.
  if (document.getElementById('manual-pt-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'manual-pt-modal';
  overlay.className = 'modal-overlay is-visible';
  overlay.innerHTML = `
    <div class="modal-box manual-pt-modal-box">
      <div class="modal-header">
        <span class="modal-tag">MANUAL POINT</span>
        <div class="modal-point-name">Enter Coordinates</div>
      </div>
      <div class="manual-pt-fields">
        <div class="manual-pt-row">
          <label class="manual-pt-label">Latitude</label>
          <input type="number" id="mpt-lat" class="manual-pt-input" placeholder="e.g. 22.3089" step="any">
        </div>
        <div class="manual-pt-row">
          <label class="manual-pt-label">Longitude</label>
          <input type="number" id="mpt-lon" class="manual-pt-input" placeholder="e.g. 113.9146" step="any">
        </div>
        <div class="manual-pt-error hidden" id="mpt-error"></div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn--cancel" id="mpt-cancel">Cancel</button>
        <button class="modal-btn modal-btn--confirm" id="mpt-confirm">Add Point</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const latInput = document.getElementById('mpt-lat');
  const lonInput = document.getElementById('mpt-lon');
  const errDiv = document.getElementById('mpt-error');

  const _close = () => overlay.remove();

  const _submit = () => {
    const latVal = parseFloat(latInput.value);
    const lonVal = parseFloat(lonInput.value);
    errDiv.className = 'manual-pt-error hidden';

    if (isNaN(latVal) || isNaN(lonVal)) {
      errDiv.textContent = 'Latitude and Longitude must be valid numbers.';
      errDiv.className = 'manual-pt-error';
      return;
    }
    if (latVal < -90 || latVal > 90) {
      errDiv.textContent = `Latitude ${latVal} is out of range (−90 to 90).`;
      errDiv.className = 'manual-pt-error';
      return;
    }
    if (lonVal < -180 || lonVal > 180) {
      errDiv.textContent = `Longitude ${lonVal} is out of range (−180 to 180).`;
      errDiv.className = 'manual-pt-error';
      return;
    }

    _close();
    if (onConfirm) onConfirm(latVal, lonVal);
  };

  document.getElementById('mpt-confirm').addEventListener('click', _submit);
  document.getElementById('mpt-cancel').addEventListener('click', _close);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _close(); });

  // Enter key submits, Escape cancels
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); _submit(); }
    if (e.key === 'Escape') { e.preventDefault(); _close(); }
  });

  // Auto-focus the Lat field
  setTimeout(() => latInput?.focus(), 50);
};


// Clears the waypoint search input (if visible) and resets its value.
// Called by main.js after a point is added so the user can immediately
// search for the next waypoint without manually clearing the field.
const clearSearch = () => {
  const input = document.getElementById('waypoint-search');
  if (input) {
    input.value = '';
    // Phase 24 fix: trigger the input event logic so main.js clears highlights
    input.dispatchEvent(new Event('input'));
  }
};


// Displays a brief warning banner inside the sequence list area.
// Used to alert the user when they try to add a duplicate fix.
// The banner animates in and auto-dismisses after 3 seconds.
//
// 'message' — plain-text warning message (will be HTML-escaped for safety)
const showSequenceWarning = (message) => {
  const wrapper = document.getElementById('sequence-list-wrapper');
  if (!wrapper) return;

  // Remove any existing banner before adding a new one so they don't stack.
  const existing = document.getElementById('seq-warning-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'seq-warning-banner';
  banner.className = 'seq-warning-banner';
  banner.textContent = message;  // textContent auto-escapes, no XSS risk
  wrapper.prepend(banner);

  // Auto-dismiss after 3 seconds so it doesn't clutter the UI permanently.
  setTimeout(() => {
    const el = document.getElementById('seq-warning-banner');
    if (el) el.remove();
  }, 3000);
};


// Populates the #builder-saved-list div inside the Builder main menu.
// Called by main.js after showMainMenu() renders the container, and again whenever
// a procedure is toggled, edited, or deleted so the list stays in sync with the database.
//
// Each row has three action buttons:
//   ✎ Edit   — loads the procedure back into the Builder so the user can modify it
//   👁 Toggle — shows or hides the procedure's layer on the map
//   × Delete — permanently removes the procedure from the database and map
//
// IMPORTANT: We deliberately avoid { once: true } on the event listener here.
// { once: true } causes the handler to be silently consumed the first time ANY click
// fires — even clicks that hit non-button areas and return early. This breaks all
// subsequent button clicks until the UI re-renders. Instead we track the listener
// reference in module-level variables and call removeEventListener before re-adding
// so there is never more than one handler on the element at a time.
//
// Builds an accordion row for a single saved procedure.
// Shows the procedure header (type badge, name, action buttons) and — if the
// procedure has transition branches — an expandable transitions sub-list.
//
// 'proc'          — state object: { id, name, type, airport, runway, visible,
//                                   common_route, transitions }
// 'showDelete'    — whether to render the Delete button (true for Builder, false for Viewer)
// 'showEdit'      — whether to render the Edit button (true for Builder, false for Viewer)
// 'showDelTrans'  — whether to render per-transition delete buttons (Builder only)
const _buildProcAccordionRow = (proc, showDelete, showEdit, showDelTrans) => {
  const eyeIcon = proc.visible ? '&#128065;' : '&#128683;';
  const subLabel = [proc.airport, proc.runway].filter(Boolean).join(' · ');
  const transitions = proc.transitions || [];

  // Build a short "Common: FIX1 → FIX2 → FIX3" preview (max 5 fixes before truncating).
  // Phase 29: fullRoute contains ALL idents for the title attribute so the user can
  // hover over a truncated preview and see the complete sequence in a native tooltip.
  const routePts = proc.common_route || [];
  const previewPts = routePts.slice(0, 5).map((p) => _escapeHtml(p.ident || '?')).join(' → ');
  const fullRoute = routePts.map((p) => p.ident || '?').join(' → ');
  const commonPreview = routePts.length > 0
    ? `<div class="proc-common-preview" title="${fullRoute}">
         <span data-i18n="sidebar.view.proc_item.common">${i18n.t('sidebar.view.proc_item.common')}</span>: ${previewPts}${routePts.length > 5 ? ` … +${routePts.length - 5}` : ''}
       </div>`
    : '';

  // Build per-transition sub-items (only if transitions exist).
  const transitionsHtml = transitions.length > 0
    ? `<div class="proc-transitions-list">
         ${transitions.map((t, tIdx) => {
      const dirIcon = t.direction === 'inbound' ? '&#8594;' :
        t.direction === 'outbound' ? '&#8592;' : '&#8906;';
      const keyFix = t.convergence_fix || t.divergence_fix || '';
      const ptCount = t.points ? t.points.length : 0;
      const delBtn = showDelTrans
        ? `<button class="proc-action-btn proc-delete-btn"
                  data-proc-id="${proc.id}" data-transition-idx="${tIdx}" data-action="delete-transition"
                  title="${i18n.t('sidebar.view.proc_item.delete_trans')}"
                >&#10005;</button>`
        : '';
      return `
             <div class="proc-transition-item">
               <span class="proc-transition-icon">${dirIcon}</span>
               <div class="proc-transition-body">
                 <span class="proc-transition-name">${_escapeHtml(t.name)}</span>
                 ${keyFix ? `<span class="proc-transition-fix"><span data-i18n="sidebar.view.proc_item.via">${i18n.t('sidebar.view.proc_item.via')}</span> ${_escapeHtml(keyFix)}</span>` : ''}
                 <span class="proc-transition-pts">${ptCount} <span data-i18n="${ptCount !== 1 ? 'sidebar.view.proc_item.pts' : 'sidebar.view.proc_item.pt'}">${i18n.t(ptCount !== 1 ? 'sidebar.view.proc_item.pts' : 'sidebar.view.proc_item.pt')}</span></span>
               </div>
               ${delBtn}
             </div>
           `;
    }).join('')}
       </div>`
    : '';

  return `
    <div class="saved-proc-item ${transitions.length > 0 ? 'has-transitions' : ''}">
      <div class="saved-proc-header">
        <span class="saved-proc-badge">${_escapeHtml(proc.type)}</span>
        <div class="saved-proc-info">
          <div class="saved-proc-name">${_escapeHtml(proc.name)}</div>
          ${subLabel ? `<div class="saved-proc-sub">${_escapeHtml(subLabel)}</div>` : ''}
        </div>
        <div class="saved-proc-actions">
          ${showEdit ? `<button
            class="proc-action-btn proc-edit-btn"
            data-proc-id="${proc.id}" data-action="edit"
            title="${i18n.t('sidebar.view.proc_item.edit')}"
          >&#9998;</button>` : ''}
          <button
            class="proc-action-btn proc-visibility-btn ${proc.visible ? '' : 'proc-hidden'}"
            data-proc-id="${proc.id}" data-action="toggle"
            title="${proc.visible ? i18n.t('sidebar.view.proc_item.hide') : i18n.t('sidebar.view.proc_item.show')}"
          >${eyeIcon}</button>
          ${showDelete ? `<button
            class="proc-action-btn proc-delete-btn"
            data-proc-id="${proc.id}" data-action="delete"
            title="${i18n.t('sidebar.view.proc_item.delete')}"
          >&#10005;</button>` : ''}
        </div>
      </div>
      ${commonPreview}
      ${transitionsHtml}
    </div>
  `;
};


// Updates the #builder-saved-list container with an accordion view of all saved procedures.
// Each procedure shows its common route preview and, if it has branches, lists them with
// a delete button per branch so the user can remove individual transitions.
//
// Phase 12: procStates now includes common_route and transitions arrays for rendering.
//
// 'procStates' — array of { id, name, type, airport, runway, visible, common_route, transitions }
// 'callbacks'  — { onToggle(id), onDelete(id), onEdit(id), onDeleteTransition(id, tIdx) }
const refreshBuilderSavedList = (procStates, callbacks) => {
  const listEl = document.getElementById('builder-saved-list');
  if (!listEl) return;  // Builder main menu is not currently visible — harmless no-op

  // Remove any existing listener from whichever element we were last watching.
  // This prevents duplicate handlers when the same element receives multiple
  // refresh calls (e.g., after a toggle flips visibility and re-renders the list).
  if (_builderSavedListEl && _builderSavedListHandler) {
    _builderSavedListEl.removeEventListener('click', _builderSavedListHandler);
  }
  _builderSavedListEl = listEl;

  if (!procStates || procStates.length === 0) {
    listEl.innerHTML = '';
    _builderSavedListHandler = null;
    return;
  }

  const rowsHtml = procStates.map(
    (proc) => _buildProcAccordionRow(proc, true, true, true)
  ).join('');

  listEl.innerHTML = `
    <div class="builder-saved-section">
      <div class="builder-saved-header">
        <span class="section-label" style="padding: 14px 0 6px;" data-i18n="sidebar.view.proc_label">Procedures</span>
        <span class="layer-count">${procStates.length}</span>
      </div>
      <div class="saved-proc-list">${rowsHtml}</div>
    </div>
  `;

  // Persistent delegated click handler — NOT { once: true }.
  // Dispatches to the correct callback based on the button's data-action attribute.
  _builderSavedListHandler = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { procId, action, transitionIdx } = btn.dataset;
    if (action === 'toggle' && callbacks?.onToggle) callbacks.onToggle(procId);
    if (action === 'delete' && callbacks?.onDelete) callbacks.onDelete(procId);
    if (action === 'edit' && callbacks?.onEdit) callbacks.onEdit(procId);
    if (action === 'delete-transition' && callbacks?.onDeleteTransition) {
      callbacks.onDeleteTransition(procId, parseInt(transitionIdx, 10));
    }
  };
  listEl.addEventListener('click', _builderSavedListHandler);
};


// Updates the #tab-content zone to show the View tab (saved procedures list).
// Viewer Mode rules: the user can Search/Filter and View/Hide only.
// Deleting is restricted to the Builder tab — no delete button appears here.
//
// Phase 9.8: The global search bar is ALWAYS rendered at the top of the View tab.
// Phase 12: rows now use the accordion layout showing common route preview and
// transition branches as sub-items (read-only in Viewer Mode — no delete buttons).
//
// 'procStates' — array of { id, name, type, airport, runway, visible, common_route, transitions }
// 'callbacks'  — { onToggle(id) }
// Phase 13: sort + group helper used by updateViewTab.
// Returns an HTML string representing the procedure list arranged per _viewerSortMode.
//
// Grouped modes (aerodrome-type, type-aerodrome) produce a two-level collapsible
// structure: top-level group headers → sub-group headers → accordion rows.
// Flat modes (alpha-asc, alpha-desc) produce a plain sorted list of accordion rows.
//
// Every accordion row is still wrapped in [data-search-name] so the text search
// filter can operate uniformly across all modes.
const _buildViewerList = (procStates) => {
  // Shared: build a single searchable accordion row.
  const rowHtml = (proc) => {
    const searchName = _escapeHtml(
      (proc.name + ' ' + proc.type + ' ' + (proc.airport || '') + ' ' + (proc.runway || '')).toLowerCase()
    );
    return `<div data-search-name="${searchName}">${_buildProcAccordionRow(proc, false, false, false)}</div>`;
  };

  // ── Flat sort modes ────────────────────────────────────────────────────────
  if (_viewerSortMode === 'alpha-asc' || _viewerSortMode === 'alpha-desc') {
    const sorted = [...procStates].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return _viewerSortMode === 'alpha-asc' ? cmp : -cmp;
    });
    return sorted.map(rowHtml).join('');
  }

  // ── Grouped modes ──────────────────────────────────────────────────────────
  // Determine the two grouping keys.
  const TYPE_ORDER = ['SID', 'STAR', 'IAC', 'CTR', 'FIS', 'TMA', 'ATZ'];
  const key1 = (p) => _viewerSortMode === 'aerodrome-type' ? (p.airport || '—') : (p.type || '—');
  const key2 = (p) => _viewerSortMode === 'aerodrome-type' ? (p.type || '—') : (p.airport || '—');

  // Group into Map<key1 → Map<key2 → proc[]>>
  const groups = new Map();
  procStates.forEach((p) => {
    const k1 = key1(p);
    const k2 = key2(p);
    if (!groups.has(k1)) groups.set(k1, new Map());
    const sub = groups.get(k1);
    if (!sub.has(k2)) sub.set(k2, []);
    sub.get(k2).push(p);
  });

  // Sort group keys: airport keys alphabetically; type keys by TYPE_ORDER.
  const sortKeys = (keys, isType) => {
    if (isType) return [...keys].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
  };

  const k1IsType = _viewerSortMode === 'type-aerodrome';
  const k1Keys = sortKeys([...groups.keys()], k1IsType);
  const k2IsType = !k1IsType;

  return k1Keys.map((k1) => {
    const subMap = groups.get(k1);
    const k2Keys = sortKeys([...subMap.keys()], k2IsType);
    const groupId = `vg-${k1.replace(/[^a-z0-9]/gi, '_')}`;

    const subGroupsHtml = k2Keys.map((k2) => {
      const procs = subMap.get(k2);
      const subId = `${groupId}-${k2.replace(/[^a-z0-9]/gi, '_')}`;
      const rowsHtml = procs.map(rowHtml).join('');
      return `
        <div class="viewer-subgroup" data-subgroup="${subId}">
          <div class="viewer-subgroup-header">${_escapeHtml(k2)}</div>
          <div class="viewer-subgroup-body">${rowsHtml}</div>
        </div>`;
    }).join('');

    return `
      <div class="viewer-group" data-group="${groupId}">
        <div class="viewer-group-header" data-action="toggle-group" data-group-id="${groupId}">
          <span class="viewer-group-chevron">&#9660;</span>
          <span class="viewer-group-name">${_escapeHtml(k1)}</span>
          <span class="viewer-group-count">${[...subMap.values()].reduce((s, a) => s + a.length, 0)}</span>
        </div>
        <div class="viewer-group-body" id="${groupId}">${subGroupsHtml}</div>
      </div>`;
  }).join('');
};


// Renders the full View tab content.
//
// Phase 13 additions:
//   • 'onToggleMeasurements' callback — fires when user clicks the Leg Measurements button
//   • 'measVisible' boolean — controls the button's active/inactive appearance
//   • Sort dropdown — Aerodrome›Type (default), Type›Aerodrome, A–Z, Z–A
//   • Grouped accordion layout for grouped sort modes
//
// 'procStates' — array of { id, name, type, airport, runway, visible, common_route, transitions }
// 'callbacks'  — { onToggle(id), onToggleMeasurements(), measVisible }
const updateViewTab = (procStates, callbacks) => {
  // Cache params so the sort dropdown can trigger a re-render without main.js.
  _lastViewProcStates = procStates;
  _lastViewCallbacks = callbacks;

  const content = document.getElementById('tab-content');
  if (!content) return;

  if (!procStates || procStates.length === 0) {
    content.innerHTML =
      _globalSearchHtml() +
      `<div class="view-placeholder">
        <div class="view-placeholder-icon">&#9992;</div>
        <div class="view-placeholder-title" data-i18n="sidebar.view.empty.title">${i18n.t('sidebar.view.empty.title')}</div>
        <div class="view-placeholder-text" data-i18n="sidebar.view.empty.text">
          ${i18n.t('sidebar.view.empty.text')}
        </div>
      </div>`;
    _wireGlobalSearch();
    i18n.updateDOM();
    return;
  }

  const measActive = callbacks?.measVisible !== false;
  const measBtnClass = measActive ? 'viewer-meas-btn active' : 'viewer-meas-btn';

  content.innerHTML =
    _globalSearchHtml() +
    `<div class="view-section">
      <div class="view-search-wrapper">
        <input
          type="text"
          id="view-search"
          class="view-search-input"
          placeholder="${i18n.t('sidebar.view.proc_search_placeholder')}"
          data-i18n-placeholder="sidebar.view.proc_search_placeholder"
          autocomplete="off"
          spellcheck="false"
        >
        <span class="search-icon">&#128269;</span>
      </div>
      <div class="view-section-header">
        <span class="section-label" style="padding: 8px 0 0;" data-i18n="sidebar.view.proc_label">${i18n.t('sidebar.view.proc_label')}</span>
        <span class="layer-count" id="view-proc-count">${procStates.length}</span>
        <button class="${measBtnClass}" data-action="toggle-measurements"
                title="${measActive ? i18n.t('sidebar.view.meas_hide') : i18n.t('sidebar.view.meas_show')}">
          &#8615; NM
        </button>
      </div>
      <div class="viewer-sort-row">
        <label class="viewer-sort-label" for="viewer-sort-select" data-i18n="sidebar.view.sort_label">${i18n.t('sidebar.view.sort_label')}</label>
        <select id="viewer-sort-select" class="viewer-sort-select">
          <option value="aerodrome-type"  ${_viewerSortMode === 'aerodrome-type' ? 'selected' : ''} data-i18n="sidebar.view.sort_options.ad_type">${i18n.t('sidebar.view.sort_options.ad_type')}</option>
          <option value="type-aerodrome"  ${_viewerSortMode === 'type-aerodrome' ? 'selected' : ''} data-i18n="sidebar.view.sort_options.type_ad">${i18n.t('sidebar.view.sort_options.type_ad')}</option>
          <option value="alpha-asc"       ${_viewerSortMode === 'alpha-asc' ? 'selected' : ''} data-i18n="sidebar.view.sort_options.alpha_asc">${i18n.t('sidebar.view.sort_options.alpha_asc')}</option>
          <option value="alpha-desc"      ${_viewerSortMode === 'alpha-desc' ? 'selected' : ''} data-i18n="sidebar.view.sort_options.alpha_desc">${i18n.t('sidebar.view.sort_options.alpha_desc')}</option>
        </select>
      </div>
      <div class="saved-proc-list" id="view-proc-list">${_buildViewerList(procStates)}</div>
    </div>`;

  _wireGlobalSearch();
  i18n.updateDOM();

  // ── Sort dropdown ──────────────────────────────────────────────────────────
  const sortSelect = document.getElementById('viewer-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      _viewerSortMode = sortSelect.value;
      // Re-render only the list div (not the entire tab) to preserve search input.
      const listEl = document.getElementById('view-proc-list');
      if (listEl) listEl.innerHTML = _buildViewerList(_lastViewProcStates || []);
      // Re-wire click handler for the newly injected group headers and toggle buttons.
      _wireViewClickHandler(content, _lastViewCallbacks);
      _wireGroupToggles(content);
    });
  }

  // ── Text search ────────────────────────────────────────────────────────────
  const searchInput = document.getElementById('view-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.trim().toLowerCase();
      const list = document.getElementById('view-proc-list');
      if (!list) return;
      let visCount = 0;

      // Hide/show individual rows.
      list.querySelectorAll('[data-search-name]').forEach((row) => {
        const match = !term || row.dataset.searchName.includes(term);
        row.style.display = match ? '' : 'none';
        if (match) visCount++;
      });

      // Hide any subgroup whose all children are hidden.
      list.querySelectorAll('.viewer-subgroup').forEach((sg) => {
        const anyVisible = [...sg.querySelectorAll('[data-search-name]')]
          .some((r) => r.style.display !== 'none');
        sg.style.display = anyVisible ? '' : 'none';
      });

      // Hide any group whose all subgroups (or rows) are hidden.
      list.querySelectorAll('.viewer-group').forEach((g) => {
        const anyVisible = [...g.querySelectorAll('[data-search-name]')]
          .some((r) => r.style.display !== 'none');
        g.style.display = anyVisible ? '' : 'none';
      });

      const countEl = document.getElementById('view-proc-count');
      if (countEl) countEl.textContent = term ? `${visCount}/${procStates.length}` : procStates.length;
    });
  }

  // ── Click delegation ───────────────────────────────────────────────────────
  _wireViewClickHandler(content, callbacks);
  _wireGroupToggles(content);
};


// Attaches the delegated click handler to the View tab content element.
// Extracted so it can be re-called after the list is re-rendered by the sort dropdown
// without reinstalling all other listeners.
const _wireViewClickHandler = (content, callbacks) => {
  if (_viewTabEl && _viewTabHandler) {
    _viewTabEl.removeEventListener('click', _viewTabHandler);
  }
  _viewTabEl = content;
  _viewTabHandler = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { procId, action } = btn.dataset;
    if (action === 'toggle' && callbacks?.onToggle) callbacks.onToggle(procId);
    if (action === 'toggle-measurements' && callbacks?.onToggleMeasurements) callbacks.onToggleMeasurements();
  };
  content.addEventListener('click', _viewTabHandler);
};


// Wires collapsible group header clicks so clicking a group header expands/collapses it.
const _wireGroupToggles = (content) => {
  content.querySelectorAll('[data-action="toggle-group"]').forEach((header) => {
    header.addEventListener('click', () => {
      const groupId = header.dataset.groupId;
      const body = document.getElementById(groupId);
      if (!body) return;
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      const chevron = header.querySelector('.viewer-group-chevron');
      if (chevron) chevron.textContent = collapsed ? '▾' : '▸';
    });
  });
};


// ── Phase 10: Transition UI ──────────────────────────────────────────────────


// Updates the #transition-section div inside the drawing panel to reflect the
// current Phase-12 transition state.
//
// Phase 12 redesign: the old form (name input + convergence dropdown + Start button)
// has been REPLACED by a right-click context menu on the map. The sidebar now only
// shows:
//   • The list of already-completed transition branches.
//   • An instruction to right-click a fix to start a new transition.
//   • When IN transition mode: a status indicator + "End Transition" button.
//
// 'drawingState' — the shared DrawingState singleton
// 'callbacks'    — object with: { onEndTransition() }
const updateTransitionUI = (drawingState, callbacks) => {
  const section = document.getElementById('transition-section');
  if (!section) return;  // only present for route types — no-op for area types

  if (drawingState._inTransitionMode) {
    // ── TRANSITION MODE: show status indicator + End button ──────────────────
    // The direction label tells the user whether they are drawing inbound or outbound.
    const dir = drawingState._transitionDirection;
    const keyFix = drawingState.convergencePointIdent || '?';
    const dirLabel = dir === 'inbound' ? 'Inbound → ' :
      dir === 'outbound' ? 'Outbound ← ' : '';
    const instruction = dir === 'inbound'
      ? `Click <strong>${_escapeHtml(keyFix)}</strong> on the map to auto-finish,<br>or press the button below.`
      : `Click "End Transition" when finished drawing the exit route.`;

    section.innerHTML = `
      <div class="transition-active-indicator">
        <div class="transition-active-row">
          <span class="transition-active-icon">&#8906;</span>
          <div class="transition-active-info">
            <div class="transition-active-label">
              ${dirLabel}Transition in progress
            </div>
            <div class="transition-active-convergence">${instruction}</div>
          </div>
        </div>
        <button class="builder-action-btn secondary" id="btn-end-transition" style="margin-top:8px;">
          &#10003; End Transition
        </button>
      </div>
    `;

    document.getElementById('btn-end-transition')?.addEventListener('click', () => {
      if (callbacks?.onEndTransition) callbacks.onEndTransition();
    });

  } else {
    // ── NORMAL MODE: show completed transitions + right-click instruction ─────
    const { transitions, points } = drawingState;

    // List of already-saved transitions.
    const savedTransitionsHtml = transitions.length > 0
      ? `<div class="transition-list-header">
           <span class="section-label" style="padding: 8px 0 4px;">Transitions</span>
           <span class="layer-count">${transitions.length}</span>
         </div>
         <div class="transition-list">
           ${transitions.map((t) => {
        const dirIcon = t.direction === 'inbound' ? '&#8594;' :  // →
          t.direction === 'outbound' ? '&#8592;' :  // ←
            '&#8906;';                                  // ⌦ (old format)
        const keyFix = t.convergence_fix || t.divergence_fix || '';
        const ptCount = t.points ? t.points.length : 0;
        return `
               <div class="transition-item">
                 <span class="transition-item-icon">${dirIcon}</span>
                 <div class="transition-item-body">
                   <span class="transition-item-name">${_escapeHtml(t.name)}</span>
                   ${keyFix ? `<span class="transition-item-fix">${_escapeHtml(keyFix)}</span>` : ''}
                 </div>
                 <span class="transition-item-pts">${ptCount} pt${ptCount !== 1 ? 's' : ''}</span>
               </div>
             `;
      }).join('')}
         </div>`
      : '';

    // Instruction panel — only shown when there are enough common-route fixes to branch from.
    const instructionHtml = points.length >= 2
      ? `<div class="transition-help">
           <span class="transition-help-icon">&#8594;</span>
           <span class="transition-help-text">
             Right-click any fix in the common route on the map to add a transition branch.
           </span>
         </div>`
      : `<div class="transition-prereq-hint">Add at least 2 points to the common route before adding transitions.</div>`;

    section.innerHTML = `
      ${savedTransitionsHtml}
      <div class="add-transition-section" style="padding-top: 6px;">
        ${instructionHtml}
      </div>
    `;
  }
};


// Registers the callback from main.js that is fired on every keystroke in the
// global search bar. main.js is responsible for debouncing and running the actual
// search against the in-memory index; Sidebar.js only handles the DOM events.
//
// 'fn' — function(term: string) called with the current input value on every change
const setViewGlobalSearchCallback = (fn) => {
  _onGlobalSearch = fn;
};


// ── Phase 14: Inline Restriction Panel ──────────────────────────────────────


// Reads the current values from the inline restriction form fields.
// Returns a complete restrictions object in the same shape as DrawingState.addPoint expects.
// Returns all-empty defaults when the panel is not in the active (pending) state.
const collectInlineRestrictions = () => {
  const altReq = document.getElementById('inline-alt-req')?.value || '';
  const altVal = document.getElementById('inline-alt-val')?.value || '';
  const altUnit = document.getElementById('inline-alt-unit')?.value || 'ft';

  // Map the UI symbol back to the existing levelCondition string format.
  const levelCondMap = { '@': 'At', '+': 'Above', '-': 'Below', '': '' };
  const levelCondition = levelCondMap[altReq] || '';
  // Combine value + unit into the existing 'FL100' / '5000ft' / '1500m' format.
  let levelValue = '';
  if (altVal && levelCondition) {
    levelValue = altUnit === 'FL' ? `FL${altVal}` : `${altVal}${altUnit}`;
  }

  const spdReq = document.getElementById('inline-spd-req')?.value || '';
  const spdVal = document.getElementById('inline-spd-val')?.value || '';
  const spdUnit = document.getElementById('inline-spd-unit')?.value || 'KT';

  // Map UI symbols to speedCondition strings. 'Less Than Or Equal' and 'Greater Than'
  // are new conditions added in Phase 14 beyond the original modal's options.
  const speedCondMap = { '@': 'At', '<': 'Less Than', '<=': 'Less Than Or Equal', '>': 'Greater Than', '>=': 'At Least', '': '' };
  const speedCondition = speedCondMap[spdReq] || '';
  let speedValue = '';
  if (spdVal && speedCondition) {
    speedValue = `${spdVal}${spdUnit}`;
  }

  const isHolding = document.getElementById('inline-hold-chk')?.checked ?? false;
  const holdingBearing = document.getElementById('inline-hold-bearing')?.value || '';
  const holdingSide = document.querySelector('#inline-turn-dir .inline-turn-btn.active')?.dataset.dir || 'RIGHT';
  const holdingOBS = document.getElementById('inline-hold-obs')?.value || '';

  return { levelCondition, levelValue, speedCondition, speedValue, isHolding, holdingBearing, holdingSide, holdingOBS };
};


// Renders the inline restriction form for a pending (just-selected) fix into
// the #inline-restriction-panel element. Called from main.js when a fix is clicked,
// a custom point is placed, or the pencil (edit) button is pressed.
//
// In ADD mode (default): shows "Add Point" and "Cancel Point" buttons.
//   "Add Point"    — commits the fix with collected restrictions.
//   "Cancel Point" — dismisses the pending selection, returns to idle.
//   "↺ Clear"      — resets ALT/SPD fields without dismissing the fix.
//
// In EDIT mode (options.isEdit = true): shows "Update Point" and "Cancel Edit" buttons.
//   "Update Point" — applies changes to the existing sequence point.
//   "Cancel Edit"  — discards changes, returns to idle.
//   Fields are pre-populated from options.initialValues.
//
// Global keyboard shortcuts while the panel is focused:
//   Enter  — triggers the primary action button (Add/Update).
//   Escape — triggers the cancel button (Cancel Point/Edit).
//   Tab after the last SPD unit dropdown → moves focus to the Holding checkbox.
//
// 'pendingPoint' — the raw fix/point object: { ident, lat, lon, isFix, ... }
// 'callbacks'    — { onAdd(restrictions), onErase() }
// 'options'      — optional: { isEdit: boolean, initialValues: { altReq, altVal, altUnit,
//                               spdReq, spdVal, spdUnit, isHolding, holdingBearing,
//                               holdingSide, holdingOBS } }
const showPendingPointRestrictions = (pendingPoint, callbacks, options = {}) => {
  const panel = document.getElementById('inline-restriction-panel');
  if (!panel) return;

  const isEdit = !!options.isEdit;

  const fixIcon = pendingPoint.isFix ? '&#9670;' : '&#9671;';   // ◆ or ◇
  const fixLabel = pendingPoint.isFix
    ? pendingPoint.ident
    : `Custom (${pendingPoint.lat != null ? pendingPoint.lat.toFixed(4) : '?'}, ${pendingPoint.lon != null ? pendingPoint.lon.toFixed(4) : '?'})`;

  const primaryLabel = isEdit ? '&#10003; Update Point' : '&#10003; Add Point';
  const cancelLabel  = isEdit ? '&#10005; Cancel Edit'  : '&#10005; Cancel Point';

  panel.className = 'inline-restriction-panel inline-panel-active';
  panel.innerHTML = `
    <div class="inline-fix-header">
      <span class="inline-fix-icon">${fixIcon}</span>
      <span class="inline-fix-name">${_escapeHtml(fixLabel)}</span>
    </div>

    <div class="inline-restr-rows">
      <div class="inline-restr-row">
        <label class="inline-restr-label">ALT</label>
        <select class="inline-restr-req" id="inline-alt-req">
          <option value="">—</option>
          <option value="@">@</option>
          <option value="+">+</option>
          <option value="-">−</option>
        </select>
        <input type="number" class="inline-restr-val" id="inline-alt-val" placeholder="value" min="0" step="1">
        <select class="inline-restr-unit" id="inline-alt-unit">
          <option value="ft">ft</option>
          <option value="FL">FL</option>
          <option value="m">m</option>
        </select>
      </div>
      <div class="inline-restr-row">
        <label class="inline-restr-label">SPD</label>
        <select class="inline-restr-req" id="inline-spd-req">
          <option value="">—</option>
          <option value="@">@</option>
          <option value="<">&lt;</option>
          <option value="<=">&le;</option>
          <option value=">">&gt;</option>
          <option value=">=">&ge;</option>
        </select>
        <input type="number" class="inline-restr-val" id="inline-spd-val" placeholder="value" min="0" step="1">
        <select class="inline-restr-unit" id="inline-spd-unit">
          <option value="KT">KT</option>
          <option value="KM/HR">KM/HR</option>
          <option value="MACH">MACH</option>
        </select>
      </div>
    </div>

    <div class="inline-hold-toggle-row">
      <label class="inline-hold-label">
        <span class="toggle-switch">
          <input type="checkbox" id="inline-hold-chk">
          <span class="toggle-slider"></span>
        </span>
        <span class="inline-hold-label-text">Holding Point</span>
      </label>
    </div>

    <div id="inline-hold-fields" class="inline-hold-fields" style="display:none;">
      <div class="inline-hold-field-row">
        <span class="inline-restr-label">BRG</span>
        <input type="number" class="inline-hold-input" id="inline-hold-bearing"
               placeholder="000" min="0" max="359" step="1">
        <span class="inline-hold-suffix">°M</span>
      </div>
      <div class="inline-hold-field-row">
        <span class="inline-restr-label">TURN</span>
        <div class="inline-turn-dir" id="inline-turn-dir" style="grid-column: 2 / -1;">
          <button type="button" class="inline-turn-btn active" data-dir="RIGHT">R</button>
          <button type="button" class="inline-turn-btn" data-dir="LEFT">L</button>
        </div>
      </div>
      <div class="inline-hold-field-row">
        <span class="inline-restr-label">OBS</span>
        <input type="text" class="inline-hold-input" id="inline-hold-obs"
               placeholder="Advisory" style="grid-column: 2 / -1;">
      </div>
    </div>

    <div class="inline-action-row pending-action-row">
      <button class="inline-action-btn primary" id="btn-add-point">${primaryLabel}</button>
      <button class="inline-action-btn secondary" id="btn-cancel-pending">${cancelLabel}</button>
    </div>
    ${!isEdit ? `<div class="inline-clear-row"><button class="inline-clear-link" id="btn-clear-restrictions">&#8634; Clear restrictions</button></div>` : ''}
  `;

  // ── Pre-populate fields from initialValues (edit mode or explicit pre-fill) ──
  if (options.initialValues) {
    const iv = options.initialValues;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    setVal('inline-alt-req',  iv.altReq  || '');
    setVal('inline-alt-val',  iv.altVal  || '');
    setVal('inline-alt-unit', iv.altUnit || 'ft');
    setVal('inline-spd-req',  iv.spdReq  || '');
    setVal('inline-spd-val',  iv.spdVal  || '');
    setVal('inline-spd-unit', iv.spdUnit || 'KT');
    const holdChkEl = document.getElementById('inline-hold-chk');
    if (holdChkEl) {
      holdChkEl.checked = !!iv.isHolding;
      const hf = document.getElementById('inline-hold-fields');
      if (hf) hf.style.display = iv.isHolding ? 'block' : 'none';
      const toggleRow = document.getElementById('inline-hold-toggle-row');
      if (toggleRow) toggleRow.classList.toggle('inline-hold-toggle-active', !!iv.isHolding);
    }
    setVal('inline-hold-bearing', iv.holdingBearing || '');
    setVal('inline-hold-obs',     iv.holdingOBS     || '');
    // Restore turn direction active state.
    const side = iv.holdingSide || 'RIGHT';
    document.querySelectorAll('#inline-turn-dir .inline-turn-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.dir === side);
    });
  }

  // ── Holding toggle: show/hide the bearing, direction, and OBS fields ─────────
  const holdChk = document.getElementById('inline-hold-chk');
  const holdFields = document.getElementById('inline-hold-fields');
  holdChk?.addEventListener('change', () => {
    holdFields.style.display = holdChk.checked ? 'block' : 'none';
    if (holdChk.checked) document.getElementById('inline-hold-bearing')?.focus();
    const toggleRow = document.getElementById('inline-hold-toggle-row');
    if (toggleRow) toggleRow.classList.toggle('inline-hold-toggle-active', holdChk.checked);
    if (callbacks?.onLiveChange) callbacks.onLiveChange(collectInlineRestrictions());
  });

  // ── Turn direction toggle buttons ─────────────────────────────────────────────
  document.getElementById('inline-turn-dir')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.inline-turn-btn');
    if (!btn) return;
    document.querySelectorAll('#inline-turn-dir .inline-turn-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    if (callbacks?.onLiveChange) callbacks.onLiveChange(collectInlineRestrictions());
  });

  // ── Live-change wiring: fire onLiveChange on every ALT/SPD/Holding input event ─
  // This powers the real-time map feedback while the user types or selects values,
  // so the glow dot, "H" badge, and restriction annotation update instantly.
  if (callbacks?.onLiveChange) {
    const live = () => callbacks.onLiveChange(collectInlineRestrictions());
    ['inline-alt-req', 'inline-alt-unit', 'inline-spd-req', 'inline-spd-unit'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', live);
    });
    ['inline-alt-val', 'inline-spd-val', 'inline-hold-bearing', 'inline-hold-obs'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', live);
    });
  }

  // ── Tab from SPD unit to Holding checkbox (keyboard navigation improvement) ───
  document.getElementById('inline-spd-unit')?.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('inline-hold-chk')?.focus();
    }
  });

  // ── Primary action button ────────────────────────────────────────────────────
  document.getElementById('btn-add-point')?.addEventListener('click', () => {
    if (callbacks?.onAdd) callbacks.onAdd(collectInlineRestrictions());
  });

  // ── Cancel button (Cancel Point / Cancel Edit) ───────────────────────────────
  document.getElementById('btn-cancel-pending')?.addEventListener('click', () => {
    if (callbacks?.onErase) callbacks.onErase();
  });

  // ── Clear restrictions link (add mode only) ──────────────────────────────────
  // Resets only the ALT and SPD fields without dismissing the pending fix.
  document.getElementById('btn-clear-restrictions')?.addEventListener('click', () => {
    const setDef = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setDef('inline-alt-req', '');
    setDef('inline-alt-val', '');
    setDef('inline-alt-unit', 'ft');
    setDef('inline-spd-req', '');
    setDef('inline-spd-val', '');
    setDef('inline-spd-unit', 'KT');
    document.getElementById('inline-alt-req')?.focus();
  });

  // ── Panel-level keyboard shortcuts: Enter = primary action, ESC = cancel ─────
  // The handler lives on the panel element so it only fires when focus is inside
  // the restriction form. Select elements handle their own Enter (dropdown close),
  // so we only intercept Enter for inputs and the holding checkbox.
  panel.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (e.key === 'Enter' && tag !== 'SELECT' && tag !== 'BUTTON') {
      e.preventDefault();
      document.getElementById('btn-add-point')?.click();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      document.getElementById('btn-cancel-pending')?.click();
    }
  });

  // Auto-focus the ALT requirement dropdown so the user can navigate by keyboard immediately.
  setTimeout(() => document.getElementById('inline-alt-req')?.focus(), 60);
};


// Resets the #inline-restriction-panel back to its idle state (just "Create Procedure"
// and "Cancel" buttons). Called by main.js after a pending point has been committed.
// Also returns keyboard focus to the waypoint search bar so the user can type the next fix.
const clearPendingPointRestrictions = (refocusSearch = true) => {
  const panel = document.getElementById('inline-restriction-panel');
  if (!panel) return;

  const finalizeBtnLabel = _isEditSession ? 'Save Procedure' : 'Create Procedure';
  panel.className = 'inline-restriction-panel inline-panel-idle';
  panel.innerHTML = `
    <div class="inline-action-row">
      <button class="builder-action-btn primary" id="btn-create-procedure">&#10003; ${finalizeBtnLabel}</button>
      <button class="builder-action-btn danger"  id="btn-cancel-drawing">&#10005; Cancel</button>
    </div>
  `;

  // Re-wire idle buttons using the cached drawing callbacks.
  document.getElementById('btn-create-procedure')?.addEventListener('click', () => {
    if (_drawingCallbacks?.onSave) _drawingCallbacks.onSave();
  });
  document.getElementById('btn-cancel-drawing')?.addEventListener('click', () => {
    if (_drawingCallbacks?.onCancel) _drawingCallbacks.onCancel();
  });

  if (refocusSearch) {
    setTimeout(() => document.getElementById('waypoint-search')?.focus(), 50);
  }
};


// Phase 13: registers the JSON import/export callbacks from main.js.
// Called once at startup so the "Save to JSON" and "Load from JSON" buttons in
// the Builder main menu know what to do when clicked.
//
// 'onSave' — function() called when the user clicks "Save to JSON"
// 'onLoad' — function() called when the user clicks "Load from JSON"
const setJSONCallbacks = (onSave, onLoad) => {
  _onSaveJSON = onSave;
  _onLoadJSON = onLoad;
};

const setBuilderUnlockCallback = (cb) => {
  _onBuilderUnlock = cb;
};


// Updates the result-count badge next to the global search input.
// Called by main.js after each search completes so the UI stays in sync with the
// highlight markers on the map without Sidebar.js needing to know about the map.
//
// 'count' — number of matching results (0 hides the badge)
const updateViewGlobalSearchCount = (count) => {
  const el = document.getElementById('global-search-count');
  if (!el) return;
  if (count > 0) {
    el.textContent = `${count} result${count !== 1 ? 's' : ''}`;
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
};


// Phase 8 (UX polish): updates the per-category count badge inside each
// chip in the global-search legend. Counts here reflect the FULL pre-slice
// match count for that layer (computed by SearchManager from `scoredResults`
// before the top-N cap is applied) so the user sees the true category total
// even when only a subset is plotted on the map.
//
// 'counts' — { aerodrome: number, fix: number, navaid: number } (any may be
//            omitted; missing keys are treated as 0). Pass null/undefined
//            (or call with no args) to hide every count badge — used when
//            the search input is cleared or no search is active.
const updateCategoryChipCounts = (counts) => {
  const cats = ['aerodrome', 'fix', 'navaid'];
  cats.forEach((cat) => {
    const el = document.querySelector(`.gsl-cat-count[data-cat-count="${cat}"]`);
    if (!el) return;
    const n = counts && typeof counts[cat] === 'number' ? counts[cat] : 0;
    if (counts && n > 0) {
      el.textContent = String(n);
      el.style.display = 'inline-block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  });
};


// Updates the lat/lon coordinate input fields in the "Drop Custom Point" section.
// Called from main.js on map mousemove while drop-custom mode is active, providing
// live geo-coordinate feedback. When mode is toggled off, call with (null, null)
// to clear the fields.
//
// The fields are only updated when they do not currently have user focus, so that
// a user who is manually typing coordinates is never interrupted by the live feed.
//
// 'lat' — decimal latitude to display (or null to clear)
// 'lon' — decimal longitude to display (or null to clear)
const updateDropCustomCoords = (lat, lon) => {
  const latEl = document.getElementById('drop-lat');
  const lonEl = document.getElementById('drop-lon');
  if (!latEl || !lonEl) return;
  if (lat === null || lon === null) {
    latEl.value = '';
    lonEl.value = '';
    return;
  }
  // Only update fields that the user is not currently focused on.
  if (document.activeElement !== latEl) latEl.value = lat.toFixed(4);
  if (document.activeElement !== lonEl) lonEl.value = lon.toFixed(4);
};


export {
  initSidebar,
  buildLayerControls,
  showViewTab,
  showBuilderTab,
  showMainMenu,
  showMetadataForm,
  showDrawingPanel,
  refreshSequenceList,
  showExportResult,
  clearSearch,
  showSequenceWarning,
  updateViewTab,
  refreshBuilderSavedList,
  setViewGlobalSearchCallback,
  updateViewGlobalSearchCount,
  updateCategoryChipCounts,
  getGlobalSearchCategoryFilter,
  updateTransitionUI,
  setJSONCallbacks,
  setBuilderUnlockCallback,
  showPendingPointRestrictions,
  clearPendingPointRestrictions,
  collectInlineRestrictions,
  updateDropCustomCoords
};
